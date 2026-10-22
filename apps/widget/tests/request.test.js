"use strict";
// W2/W3: request headers per mode, 401 / 429 handling, reply normalising, link sanitising.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const W = require("../src/vc-widget.js");

const SRC = "https://vc.example.org/widget/vc-widget.js";
const keyCfg = () => W.parseConfig({ vcKey: "vck_p1_secret" }, SRC);
const proxyCfg = () => W.parseConfig({ vcProxy: "/api/vc" }, SRC);

function fakeFetch(res) {
  const calls = [];
  const f = async (url, init) => {
    calls.push({ url, init });
    if (res instanceof Error) throw res;
    return res;
  };
  f.calls = calls;
  return f;
}
function resp(status, body, headers) {
  const h = new Map(Object.entries(headers || {}).map(([k, v]) => [k.toLowerCase(), v]));
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: { get: (k) => (h.has(k.toLowerCase()) ? h.get(k.toLowerCase()) : null) },
    json: async () => {
      if (body === undefined) throw new Error("no json");
      return body;
    },
  };
}
const okBody = { state: "ok", message: "hi", claims: [], sources: [] };

test("key mode: POST to <api>/v1/public/chat/turns with X-VC-Key and body exactly {text}", async () => {
  const f = fakeFetch(resp(200, okBody));
  await W.send(keyCfg(), "which course?", f);
  assert.equal(f.calls.length, 1);
  const { url, init } = f.calls[0];
  assert.equal(url, "https://vc.example.org/v1/public/chat/turns");
  assert.equal(init.method, "POST");
  assert.equal(init.headers["X-VC-Key"], "vck_p1_secret");
  assert.equal(init.headers["content-type"], "application/json");
  assert.deepEqual(JSON.parse(init.body), { text: "which course?" });
  assert.equal(init.credentials, "omit", "key mode sends no cookies cross-origin");
});

test("proxy mode: POST to the proxy URL with the same body and NO X-VC-Key", async () => {
  const f = fakeFetch(resp(200, okBody));
  await W.send(proxyCfg(), "hello", f);
  const { url, init } = f.calls[0];
  assert.equal(url, "/api/vc");
  assert.deepEqual(JSON.parse(init.body), { text: "hello" });
  for (const k of Object.keys(init.headers)) assert.notEqual(k.toLowerCase(), "x-vc-key");
  assert.equal(init.credentials, "same-origin", "the host session cookie reaches its own backend");
});

test("a proxy config that also carries a key never sends the key", async () => {
  const f = fakeFetch(resp(200, okBody));
  await W.send(W.parseConfig({ vcProxy: "/api/vc", vcKey: "vck_leak" }, SRC), "x", f);
  assert.equal(JSON.stringify(f.calls[0]).includes("vck_leak"), false);
});

test("open mode sends no key header", async () => {
  const f = fakeFetch(resp(200, okBody));
  await W.send(W.parseConfig({}, SRC), "x", f);
  assert.equal(Object.keys(f.calls[0].init.headers).some((k) => k.toLowerCase() === "x-vc-key"), false);
});

test("401 -> unavailable (chat unavailable)", async () => {
  const r = await W.send(keyCfg(), "x", fakeFetch(resp(401, { error: "unauthorized" })));
  assert.equal(r.kind, "unavailable");
  assert.equal(W.UNAVAILABLE_TEXT.toLowerCase().startsWith("chat unavailable"), true);
});

test("429 -> rate with the Retry-After seconds", async () => {
  const r = await W.send(keyCfg(), "x", fakeFetch(resp(429, {}, { "Retry-After": "17" })));
  assert.deepEqual({ kind: r.kind, wait: r.wait }, { kind: "rate", wait: 17 });
});

test("Retry-After parsing: seconds, clamping, HTTP-date, junk and missing", () => {
  assert.equal(W.parseRetryAfter("5"), 5);
  assert.equal(W.parseRetryAfter("0"), 1);
  assert.equal(W.parseRetryAfter("99999"), 300);
  assert.equal(W.parseRetryAfter("-3"), 60);
  assert.equal(W.parseRetryAfter("abc"), 60);
  assert.equal(W.parseRetryAfter(null), 60);
  const now = Date.parse("2026-10-22T10:00:00Z");
  assert.equal(W.parseRetryAfter("Thu, 22 Oct 2026 10:00:30 GMT", now), 30);
  assert.equal(W.parseRetryAfter("Thu, 22 Oct 2026 09:00:00 GMT", now), 1);
});

test("a network failure and a non-JSON 200 are distinct, safe results", async () => {
  assert.equal((await W.send(keyCfg(), "x", fakeFetch(new TypeError("fetch failed")))).kind, "network");
  assert.equal((await W.send(keyCfg(), "x", fakeFetch(resp(200, undefined)))).kind, "error");
});

test("other errors carry the status and the helpline from the body", async () => {
  const r = await W.send(keyCfg(), "x", fakeFetch(resp(500, { error: "boom", helpline: "Tele-MANAS 14416" })));
  assert.equal(r.kind, "error");
  assert.equal(r.status, 500);
  assert.equal(r.helpline, "Tele-MANAS 14416");
  assert.equal((await W.send(keyCfg(), "x", fakeFetch(resp(413, {})))).status, 413);
});

test("a reply is normalised: message, claims, sources; unknown shapes are dropped", async () => {
  const body = {
    state: "ok",
    message: "Pick CS.",
    turnId: "t1",
    claims: [{ text: "Fees are 2 lakh", kind: "number", sourceIds: ["a"], status: "verified" }, { text: "x", status: "unverified" }, 7, null, { nope: 1 }],
    sources: [
      { id: "a", kind: "toc", title: "TOC page" },
      { id: "w", kind: "web", title: "Gov", url: "https://gov.test/p" },
      { id: "j", kind: "web", title: "Bad", url: "javascript:alert(1)" },
      5,
    ],
  };
  const r = await W.send(keyCfg(), "x", fakeFetch(resp(200, body)));
  assert.equal(r.kind, "reply");
  assert.equal(r.state, "ok");
  assert.equal(r.message, "Pick CS.");
  assert.deepEqual(r.claims, [{ text: "Fees are 2 lakh", unverified: false }, { text: "x", unverified: true }]);
  assert.deepEqual(r.sources, [{ title: "TOC page", href: null }, { title: "Gov", href: "https://gov.test/p" }, { title: "Bad", href: null }]);
});

test("an unknown state is treated as ok and a missing message becomes empty text", () => {
  const r = W.normalizeReply({ state: "weird", claims: [], sources: [] });
  assert.equal(r.state, "ok");
  assert.equal(r.message, "");
});

test("sanitizeUrl allows only http and https absolute URLs", () => {
  assert.equal(W.sanitizeUrl("https://a.test/x?q=1"), "https://a.test/x?q=1");
  assert.equal(W.sanitizeUrl("http://a.test/"), "http://a.test/");
  const bad = ["javascript:alert(1)", " JaVaScRiPt:alert(1)", "data:text/html,<script>", "vbscript:x", "file:///etc/passwd", "//evil.test/x", "/relative", "mailto:a@b.c", "blob:https://a.test/1", "", null, undefined, 5, "https://", "java\nscript:alert(1)"];
  for (const b of bad) assert.equal(W.sanitizeUrl(b), null, String(b));
  assert.equal(W.sanitizeUrl("https://a.test/" + "x".repeat(3000)), null, "overlong URLs are dropped");
});

test("the source never uses storage, cookies, eval or HTML injection", () => {
  const raw = fs.readFileSync(path.join(__dirname, "..", "src", "vc-widget.js"), "utf8");
  // Code only: comments may name the banned APIs (to say they are not used).
  const src = raw.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\s)\/\/[^\n]*/g, "$1");
  const banned = [/localStorage/, /sessionStorage/, /indexedDB/, /document\.cookie/, /innerHTML/, /outerHTML/, /insertAdjacentHTML/, /\beval\s*\(/, /new\s+Function/, /document\.write/, /https?:\/\/(?!www\.w3\.org\/2000\/svg)/];
  for (const re of banned) assert.equal(re.test(src), false, String(re));
});
