"use strict";
// pc-voice V3 (D-111) and ISS-pc-widget-1: the widget mic. Everything runs against fakes (fetch, WebSocket, getUserMedia, audio);
// no network, no microphone, no browser. The live-browser smoke is a separate step (see the manifest).
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const W = require("../src/vc-widget.js");
const V = require("../src/voice.js");

const SRC = "https://vc.example.org/widget/vc-widget.v1.js";
const KEY = "vck_pub_acme_" + "A".repeat(43);
const keyCfg = () => W.parseConfig({ vcKey: KEY, vcVoice: "on" }, SRC);
const WS_URL = "wss://vc.example.org/v1/public/voice/stream";

// ---- fakes ------------------------------------------------------------------------------------------------

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
const session = (over) => Object.assign({ token: "tok.en.sig", wsUrl: WS_URL, expiresAt: "2026-10-22T10:00:00.000Z", sessionMaxMinutes: 20, audio: { format: "pcm16", inputSampleRateHz: 16000, outputSampleRateHz: 24000 } }, over || {});

function fakeFetch(res) {
  const calls = [];
  const f = async (url, init) => {
    calls.push({ url, init });
    if (res instanceof Error) throw res;
    return typeof res === "function" ? res() : res;
  };
  f.calls = calls;
  return f;
}

class FakeWS {
  constructor(url, protocols) {
    this.url = url;
    this.protocols = protocols;
    this.readyState = 0;
    this.sent = [];
    this.closeCode = null;
    FakeWS.all.push(this);
  }
  send(d) {
    if (this.readyState !== 1) throw new Error("send on a socket that is not open");
    this.sent.push(d);
  }
  close(code) {
    if (this.readyState === 3) return;
    this.closeCode = code === undefined ? 1005 : code;
    this.readyState = 3;
    if (this.onclose) this.onclose({ code: this.closeCode });
  }
  // test side
  open() { this.readyState = 1; if (this.onopen) this.onopen({}); }
  say(obj) { this.onmessage({ data: JSON.stringify(obj) }); }
  audio(bytes) { this.onmessage({ data: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) }); }
  serverClose(code) { this.readyState = 3; if (this.onclose) this.onclose({ code: code || 1000 }); }
  json() { return this.sent.filter((s) => typeof s === "string").map((s) => JSON.parse(s)); }
  frames() { return this.sent.filter((s) => typeof s !== "string"); }
}
FakeWS.all = [];

function fakeMic(err) {
  const md = {
    asked: [],
    stopped: 0,
    getUserMedia: async (c) => {
      md.asked.push(c);
      if (err) throw err;
      return { getTracks: () => [{ stop: () => { md.stopped++; } }] };
    },
  };
  return md;
}
function fakeAudio() {
  const a = { captured: 0, captureStops: 0, played: [], closed: 0, push: null };
  a.capture = (stream, onChunk) => { a.captured++; a.push = onChunk; return () => { a.captureStops++; }; };
  a.play = (buf) => a.played.push(buf);
  a.close = () => { a.closed++; };
  return a;
}
function setup(over) {
  FakeWS.all = [];
  const o = Object.assign({ cfg: keyCfg(), fetch: fakeFetch(resp(201, session())), WebSocket: FakeWS, mediaDevices: fakeMic(), audio: fakeAudio() }, over || {});
  const ev = [];
  o.on = {};
  ["state", "transcript", "crisis", "error", "fallback", "ended", "sources"].forEach((n) => { o.on[n] = (a) => ev.push([n, a]); });
  const vc = V.create(o);
  return { vc, o, ev, of: (n) => ev.filter((e) => e[0] === n).map((e) => e[1]), ws: () => FakeWS.all[FakeWS.all.length - 1] };
}
const tick = () => new Promise((r) => setImmediate(r));

async function started(over) {
  const s = setup(over);
  await s.vc.start();
  const ws = s.ws();
  ws.open();
  return Object.assign(s, { wsk: ws });
}

// ---- start: the visitor taps the mic ------------------------------------------------------------------------

test("visitor taps the mic: the browser is asked for the microphone, a session is minted with the page key and no cookies, the socket offers the vc-voice-v1 and token protocols, and start names the anonymous thread", async () => {
  const s = setup();
  await s.vc.start();
  assert.equal(s.o.mediaDevices.asked.length, 1);
  assert.ok(s.o.mediaDevices.asked[0].audio, "audio only");
  assert.ok(!s.o.mediaDevices.asked[0].video);
  const call = s.o.fetch.calls[0];
  assert.equal(call.url, "https://vc.example.org/v1/public/voice/sessions");
  assert.equal(call.init.method, "POST");
  assert.equal(call.init.headers["X-VC-Key"], KEY);
  assert.equal(call.init.credentials, "omit");
  assert.equal(call.init.body, undefined, "the session route takes an empty body");
  const ws = s.ws();
  assert.equal(ws.url, WS_URL);
  assert.deepEqual(ws.protocols, ["vc-voice-v1", "vc-token.tok.en.sig"]);
  assert.ok(!ws.url.includes("tok.en"), "the token is never in the URL");
  ws.open();
  assert.deepEqual(ws.json(), [{ type: "start", threadId: "anonymous" }]);
  assert.equal(s.vc.state(), "listening");
});

test("mic audio goes out as binary frames once the socket is open, and not before", async () => {
  const s = setup();
  await s.vc.start();
  const ws = s.ws();
  assert.equal(s.o.audio.captured, 0, "nothing is captured while the socket is still connecting");
  ws.open();
  assert.equal(s.o.audio.captured, 1);
  s.o.audio.push(new Uint8Array([1, 2, 3, 4]).buffer);
  assert.equal(ws.frames().length, 1);
  assert.equal(ws.frames()[0].byteLength, 4);
  ws.serverClose(1000);
  s.o.audio.push(new Uint8Array([5, 6]).buffer); // a late chunk after the close must be dropped, not thrown
  assert.equal(ws.frames().length, 1);
});

test("the visitor's page key sits in a header only: the session URL carries no key and the cookie jar is not used", async () => {
  const s = setup();
  await s.vc.start();
  assert.ok(!s.o.fetch.calls[0].url.includes("vck_"));
  assert.equal(V.sessionUrl(W.parseConfig({ vcKey: KEY, vcApi: "https://api.partner.example/vc/", vcVoice: "on" }, SRC)), "https://api.partner.example/vc/v1/public/voice/sessions");
});

// ---- the conversation ---------------------------------------------------------------------------------------

test("live transcript: partial words grow in place, a final line closes them, for the visitor and for the counsellor's reply", async () => {
  const s = await started();
  const ws = s.wsk;
  ws.say({ type: "transcript.partial", eventId: "e1", role: "user", text: "which" });
  ws.say({ type: "transcript.partial", eventId: "e2", role: "user", text: "which course" });
  ws.say({ type: "transcript.final", eventId: "e3", role: "user", text: "Which course suits me?", turnId: "t1" });
  ws.say({ type: "transcript.partial", eventId: "e4", role: "assistant", text: "Computer" });
  ws.say({ type: "transcript.final", eventId: "e5", role: "assistant", text: "Computer Science is a strong option.", turnId: "t1" });
  assert.deepEqual(s.of("transcript").map((t) => [t.role, t.text, t.final]), [
    ["user", "which", false],
    ["user", "which course", false],
    ["user", "Which course suits me?", true],
    ["assistant", "Computer", false],
    ["assistant", "Computer Science is a strong option.", true],
  ]);
});

test("the counsellor's audio frames are played; sources arrive as data for the log, never as markup", async () => {
  const s = await started();
  s.wsk.audio(new Uint8Array([9, 9, 9, 9]));
  assert.equal(s.o.audio.played.length, 1);
  assert.equal(new Uint8Array(s.o.audio.played[0]).length, 4);
  s.wsk.say({ type: "answer.sources", eventId: "e9", sources: [{ id: "a", kind: "web", title: "AICTE", url: "https://www.aicte-india.org/" }, { id: "b", kind: "web", title: "bad", url: "javascript:alert(1)" }], claims: [] });
  const src = s.of("sources")[0];
  assert.deepEqual(src, [{ title: "AICTE", href: "https://www.aicte-india.org/" }, { title: "bad", href: null }]);
});

test("a crisis turn shows the helpline (14416 and 112) once, whether the flag, the state or both arrive, and nothing else: no paraphrase of the server's fixed wording", async () => {
  const s = await started();
  s.wsk.say({ type: "flag", eventId: "e1", reason: "crisis_detected", detail: "x" });
  s.wsk.say({ type: "state", eventId: "e2", state: "escalated" });
  const c = s.of("crisis");
  assert.equal(c.length, 1, "one crisis notice per crisis, not one per event");
  assert.deepEqual(Object.keys(c[0]), ["help"], "the crisis notice carries the helpline only (LK10 wording stays the server's, spoken)");
  assert.equal(c[0].help, V.HELP);
  assert.equal(V.CRISIS_TEXT, undefined, "voice.js owns no crisis wording of its own");
  assert.match(V.HELP, /14416/);
  assert.match(V.HELP, /112/);
  assert.equal(V.HELP, W.HELP, "the voice helpline is the text widget's helpline");
  s.wsk.audio(new Uint8Array([7, 7])); // the fixed crisis audio still plays
  assert.equal(s.o.audio.played.length, 1);
});

test("the widget renders the voice crisis notice as the helpline line only, exactly like the text chat's escalated reply (14416 and 112 shown, no free text)", () => {
  const strip = (t) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const widget = strip(fs.readFileSync(path.join(__dirname, "..", "src", "vc-widget.js"), "utf8"));
  const m = /crisis: function \(c\) \{([^}]*)\}/.exec(widget);
  assert.ok(m, "vc-widget.js has a voice crisis handler");
  assert.equal(m[1].trim(), 'add("crisis", c.help);');
  assert.match(V.HELP, /14416/);
  assert.match(V.HELP, /112/);
  const voiceSrc = strip(fs.readFileSync(path.join(__dirname, "..", "src", "voice.js"), "utf8"));
  assert.ok(!/hard time|not alone|help is available/i.test(voiceSrc), "no free-text crisis paraphrase in voice.js");
});

test("a state escalated on its own (no flag) is also a crisis; an ordinary ok state is not", async () => {
  const s = await started();
  s.wsk.say({ type: "state", eventId: "e1", state: "ok" });
  s.wsk.say({ type: "state", eventId: "e2", state: "concern" });
  assert.equal(s.of("crisis").length, 0);
  s.wsk.say({ type: "state", eventId: "e3", state: "escalated" });
  assert.equal(s.of("crisis").length, 1);
});

test("other flags (uncited number, named speaker) do not raise the crisis notice", async () => {
  const s = await started();
  s.wsk.say({ type: "flag", eventId: "e1", reason: "uncited_number" });
  s.wsk.say({ type: "flag", eventId: "e2", reason: "named_speaker" });
  assert.equal(s.of("crisis").length, 0);
});

test("a confirm event is never answered by the widget: an anonymous visitor has no profile to confirm into", async () => {
  const s = await started();
  s.wsk.say({ type: "confirm", eventId: "e1", fact: { key: "k", value: "v" } });
  assert.deepEqual(s.wsk.json(), [{ type: "start", threadId: "anonymous" }]);
});

// ---- permission denied and refusals fall back to text ---------------------------------------------------------

test("mic permission denied: no session is minted, no socket is opened, and the widget falls back to text with the reason", async () => {
  for (const name of ["NotAllowedError", "SecurityError", "PermissionDeniedError"]) {
    const err = Object.assign(new Error("denied"), { name });
    const s = setup({ mediaDevices: fakeMic(err) });
    const ok = await s.vc.start();
    assert.equal(ok, false, name);
    assert.equal(s.o.fetch.calls.length, 0, name + ": the denied mic must not spend a token");
    assert.equal(FakeWS.all.length, 0, name);
    assert.deepEqual(s.of("fallback"), [{ reason: "permission" }], name);
    assert.equal(s.vc.state(), "idle", name);
  }
});

test("no microphone at all (NotFoundError) or no getUserMedia in the browser also falls back to text", async () => {
  const s1 = setup({ mediaDevices: fakeMic(Object.assign(new Error("x"), { name: "NotFoundError" })) });
  await s1.vc.start();
  assert.deepEqual(s1.of("fallback"), [{ reason: "no_mic" }]);
  const s2 = setup({ mediaDevices: null });
  await s2.vc.start();
  assert.deepEqual(s2.of("fallback"), [{ reason: "unsupported" }]);
  assert.equal(s2.o.fetch.calls.length, 0);
});

test("a refused mint falls back to text and frees the mic: 401/403 unavailable, 429 waits as told, 5xx and offline are errors", async () => {
  const cases = [
    [resp(401, { error: "unauthorized", helpline: "Tele-MANAS 14416" }), { reason: "unavailable" }],
    [resp(403, { error: "forbidden" }), { reason: "unavailable" }],
    [resp(429, { error: "rate_limited" }, { "retry-after": "7" }), { reason: "rate", wait: 7 }],
    [resp(429, { error: "rate_limited" }), { reason: "rate", wait: 60 }],
    [resp(503, { error: "internal", helpline: "Tele-MANAS 14416 (24x7) · Emergency 112" }), { reason: "error", status: 503, helpline: "Tele-MANAS 14416 (24x7) · Emergency 112" }],
    [resp(500, undefined), { reason: "error", status: 500 }],
    [new Error("offline"), { reason: "network" }],
  ];
  for (const [res, want] of cases) {
    const mic = fakeMic();
    const s = setup({ fetch: fakeFetch(res), mediaDevices: mic });
    assert.equal(await s.vc.start(), false);
    assert.deepEqual(s.of("fallback"), [want]);
    assert.equal(mic.stopped, 1, "the mic is released when the session cannot start");
    assert.equal(FakeWS.all.length, 0);
    assert.equal(s.vc.state(), "idle");
  }
});

test("a malformed mint answer is refused before any socket: no token, a non-ws URL, a javascript: URL, a plain http URL", async () => {
  const bad = [
    session({ token: "" }),
    session({ token: undefined }),
    session({ wsUrl: "https://vc.example.org/v1/public/voice/stream" }),
    session({ wsUrl: "javascript:alert(1)" }),
    session({ wsUrl: "//evil.example/x" }),
    session({ wsUrl: 5 }),
    null,
    "text",
  ];
  for (const body of bad) {
    const mic = fakeMic();
    const s = setup({ fetch: fakeFetch(resp(201, body)), mediaDevices: mic });
    assert.equal(await s.vc.start(), false);
    assert.equal(FakeWS.all.length, 0, JSON.stringify(body));
    assert.equal(s.of("fallback")[0].reason, "error");
    assert.equal(mic.stopped, 1);
  }
});

test("a socket that never opens (error before open) falls back to text and frees the mic", async () => {
  const mic = fakeMic();
  const s = setup({ mediaDevices: mic });
  await s.vc.start();
  const ws = s.ws();
  ws.readyState = 3;
  ws.onerror({});
  ws.onclose({ code: 1006 });
  assert.equal(mic.stopped, 1);
  assert.equal(s.vc.state(), "idle");
  assert.equal(s.of("fallback").length, 1);
  assert.equal(s.of("fallback")[0].reason, "network");
  assert.equal(s.of("ended").length, 0, "a session that never began did not end");
});

// ---- errors, stop, close ------------------------------------------------------------------------------------

test("the not_started error for the first frames before the provider is ready is ignored; real errors are shown with the helpline", async () => {
  const s = await started();
  s.wsk.say({ type: "error", eventId: "e1", code: "not_started", message: "Send start first." });
  assert.equal(s.of("error").length, 0);
  s.wsk.say({ type: "error", eventId: "e2", code: "live_unavailable", message: "Voice is unavailable." });
  s.wsk.say({ type: "error", eventId: "e3", code: "voice_quota_exceeded", message: "Voice limit reached." });
  const errs = s.of("error");
  assert.deepEqual(errs.map((e) => e.code), ["live_unavailable", "voice_quota_exceeded"]);
  assert.ok(errs.every((e) => e.help === V.HELP), "every shown error carries the helpline");
});

test("tapping stop sends end, closes the socket, releases the mic and the audio, and a second stop is harmless", async () => {
  const mic = fakeMic();
  const s = await started({ mediaDevices: mic });
  await s.vc.stop();
  assert.deepEqual(s.wsk.json(), [{ type: "start", threadId: "anonymous" }, { type: "end" }]);
  assert.equal(s.wsk.closeCode, 1000);
  assert.equal(mic.stopped, 1);
  assert.equal(s.o.audio.captureStops, 1);
  assert.equal(s.o.audio.closed, 1);
  assert.equal(s.vc.state(), "idle");
  await s.vc.stop();
  assert.equal(mic.stopped, 1);
  assert.equal(s.wsk.json().length, 2);
  assert.equal(s.of("ended").length, 1);
});

test("the server ending the session (time cap, idle, superseded) releases the mic and reports it once", async () => {
  const mic = fakeMic();
  const s = await started({ mediaDevices: mic });
  s.wsk.serverClose(1000);
  assert.equal(mic.stopped, 1);
  assert.equal(s.o.audio.closed, 1);
  assert.equal(s.vc.state(), "idle");
  assert.deepEqual(s.of("ended"), [{ reason: "closed" }]);
});

test("tapping stop while still connecting cancels cleanly: the mic is released and no socket is left open", async () => {
  let release;
  const gate = new Promise((r) => { release = r; });
  const mic = fakeMic();
  const f = fakeFetch(async () => { await gate; return resp(201, session()); });
  const s = setup({ fetch: f, mediaDevices: mic });
  const starting = s.vc.start();
  await tick();
  await s.vc.stop();
  release();
  await starting;
  assert.equal(mic.stopped, 1);
  assert.ok(FakeWS.all.every((w) => w.readyState === 3), "no socket is left open");
  assert.equal(s.vc.state(), "idle");
});

// A getUserMedia prompt that resolves after the visitor cancelled must not leave a live microphone (P3), whichever order two prompts resolve in.
function pendingMic() {
  const calls = [];
  const md = {
    calls,
    live: () => calls.filter((c) => !c.stopped).length,
    getUserMedia: () => new Promise((resolve) => {
      const c = { stopped: false, resolve: null };
      const stream = { getTracks: () => [{ stop: () => { c.stopped = true; } }] };
      c.resolve = () => resolve(stream);
      calls.push(c);
    }),
  };
  return md;
}

test("cancel then restart while the first mic prompt is pending: the stale prompt's stream is stopped when it resolves, in either resolve order", async () => {
  for (const order of ["newer-first", "older-first"]) {
    const mic = pendingMic();
    const s = setup({ mediaDevices: mic });
    const first = s.vc.start();
    await tick();
    await s.vc.stop(); // cancel while the browser prompt is still open
    const second = s.vc.start();
    await tick();
    assert.equal(mic.calls.length, 2, order);
    if (order === "newer-first") { mic.calls[1].resolve(); await tick(); mic.calls[0].resolve(); } else { mic.calls[0].resolve(); await tick(); mic.calls[1].resolve(); }
    await tick();
    await tick();
    await s.vc.stop();
    await Promise.all([first, second]);
    assert.equal(mic.live(), 0, order + ": no microphone stream is left live after stop");
  }
});

test("a stale start never stops the newer start's microphone", async () => {
  const mic = pendingMic();
  const s = setup({ mediaDevices: mic });
  const first = s.vc.start();
  await tick();
  await s.vc.stop();
  const second = s.vc.start();
  await tick();
  mic.calls[1].resolve();
  await tick();
  mic.calls[0].resolve();
  await tick();
  await tick();
  assert.equal(mic.calls[0].stopped, true, "the stale stream is stopped");
  assert.equal(mic.calls[1].stopped, false, "the live session's stream keeps running");
  await s.vc.stop();
  await Promise.all([first, second]);
  assert.equal(mic.live(), 0);
});

test("a second tap on start while a session is running does nothing", async () => {
  const s = await started();
  assert.equal(await s.vc.start(), false);
  assert.equal(s.o.fetch.calls.length, 1);
  assert.equal(FakeWS.all.length, 1);
});

test("bad frames from the server (not JSON, not an object) are ignored, not thrown", async () => {
  const s = await started();
  s.wsk.onmessage({ data: "not json" });
  s.wsk.onmessage({ data: "[1,2]" });
  s.wsk.onmessage({ data: "null" });
  s.wsk.say({ type: "mystery", eventId: "x" });
  assert.equal(s.vc.state(), "listening");
});

// ---- helpers ------------------------------------------------------------------------------------------------

test("voice needs key mode: proxy and open mode have no session URL, so the mic is not offered there", () => {
  assert.equal(V.sessionUrl(W.parseConfig({ vcProxy: "/api/vc", vcVoice: "on" }, SRC)), "");
  assert.equal(V.sessionUrl(W.parseConfig({ vcVoice: "on" }, SRC)), "");
  assert.equal(W.voiceAvailable(W.parseConfig({ vcProxy: "/api/vc", vcVoice: "on" }, SRC)), false);
  assert.equal(W.voiceAvailable(W.parseConfig({ vcKey: KEY }, SRC)), false, "key mode without data-vc-voice=on shows no mic");
  assert.equal(W.voiceAvailable(W.parseConfig({ vcKey: KEY, vcVoice: "off" }, SRC)), false);
  assert.equal(W.voiceAvailable(W.parseConfig({ vcKey: KEY, vcVoice: "on" }, SRC)), true);
});

test("the mic add-on is fetched from the folder the widget was loaded from, under the versioned name", () => {
  assert.equal(W.voiceScriptUrl("https://vc.example.org/widget/vc-widget.v1.js"), "https://vc.example.org/widget/vc-widget-voice.v1.js");
  assert.equal(W.voiceScriptUrl("https://vc.example.org/widget/vc-widget.js"), "https://vc.example.org/widget/vc-widget-voice.v1.js");
  assert.equal(W.voiceScriptUrl("https://cdn.partner.example/x/vc-widget.js?cb=1"), "https://cdn.partner.example/x/vc-widget-voice.v1.js");
  assert.equal(W.voiceScriptUrl(""), "");
  assert.equal(W.voiceScriptUrl("javascript:alert(1)"), "");
  assert.equal(W.VOICE_RENDERED, true);
});

test("mic samples are downsampled to 16 kHz PCM16 little-endian, clamped, with no NaN leaking through", () => {
  const out = new Int16Array(V.downsampleToPcm16(new Float32Array([0, 0, 0.5, 0.5, 1, 1, -1, -1, 2, 2, -2, -2]), 2));
  assert.deepEqual(Array.from(out), [0, 16384, 32767, -32768, 32767, -32768]);
  assert.equal(new Int16Array(V.downsampleToPcm16(new Float32Array(480), 3)).length, 160);
  assert.deepEqual(Array.from(new Int16Array(V.downsampleToPcm16(new Float32Array([NaN, NaN]), 1))), [0, 0]);
  assert.equal(V.downsampleToPcm16(new Float32Array(0), 3).byteLength, 0);
});

test("counsellor PCM16 is decoded to floats, an odd trailing byte is dropped", () => {
  const f = V.pcm16ToFloat32(new Int16Array([0, 16384, -32768]).buffer.slice(0));
  assert.deepEqual(Array.from(f), [0, 0.5, -1]);
  assert.equal(V.pcm16ToFloat32(new Uint8Array([1, 2, 3]).buffer).length, 1);
});

test("voice.js keeps nothing: no storage, cookie, IndexedDB or innerHTML, and no eval", () => {
  const src = fs.readFileSync(path.join(__dirname, "..", "src", "voice.js"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  for (const bad of ["localStorage", "sessionStorage", "indexedDB", "document.cookie", "innerHTML", "eval(", "new Function"]) {
    assert.ok(!src.includes(bad), "voice.js must not use " + bad);
  }
});

test("the shared constants: the exported helpline matches the footer's helpline, and the version has a major for the file name", () => {
  assert.equal(V.HELP, W.HELP);
  assert.match(V.VERSION, /^1\./);
});

// ---- ISS-pc-widget-1: the nginx wiring ------------------------------------------------------------------------

const nginx = fs.readFileSync(path.join(__dirname, "..", "..", "..", "infra", "ubuntu", "nginx-vc.conf"), "utf8").replace(/^\s*#.*$/gm, "");
function nginxBlock(header) {
  const i = nginx.indexOf(header);
  assert.ok(i >= 0, "nginx-vc.conf is missing: " + header);
  return nginx.slice(i, nginx.indexOf("\n    }", i));
}

test("nginx-vc.conf serves the widget script under its versioned name and the vc-widget.js alias, ahead of the /widget/ 404 and the /v1/ 404", () => {
  const v1 = nginxBlock("location = /widget/vc-widget.v1.js");
  assert.match(v1, /alias \/opt\/vc\/apps\/widget\/src\/vc-widget\.js;/);
  assert.match(v1, /Cache-Control "public, max-age=31536000, immutable"/);
  const al = nginxBlock("location = /widget/vc-widget.js");
  assert.match(al, /alias \/opt\/vc\/apps\/widget\/src\/vc-widget\.js;/);
  assert.match(al, /Cache-Control "public, max-age=300"/);
  const voice = nginxBlock("location = /widget/vc-widget-voice.v1.js");
  assert.match(voice, /alias \/opt\/vc\/apps\/widget\/src\/voice\.js;/);
  assert.match(voice, /immutable/);
  const fallback = nginx.indexOf("location /widget/ {");
  assert.ok(fallback > nginx.indexOf("location = /widget/vc-widget.v1.js"));
  assert.ok(fallback > nginx.indexOf("location = /widget/vc-widget.js"));
  assert.ok(fallback > nginx.indexOf("location = /widget/vc-widget-voice.v1.js"));
  assert.ok(nginx.indexOf("location /v1/ {") > fallback, "the /v1/ 404 stays last");
  for (const b of [v1, al, voice]) assert.match(b, /X-Content-Type-Options "nosniff"/);
});

test("nginx-vc.conf proxies the anonymous voice session route and the voice stream with the WebSocket upgrade, and sets the client address itself", () => {
  const sess = nginxBlock("location = /v1/public/voice/sessions");
  assert.match(sess, /proxy_pass http:\/\/127\.0\.0\.1:8080;/);
  assert.match(sess, /proxy_set_header X-Real-IP \$remote_addr;/);
  assert.match(sess, /limit_req zone=vcchat/);
  const stream = nginxBlock("location = /v1/public/voice/stream");
  assert.match(stream, /proxy_set_header Upgrade \$http_upgrade;/);
  assert.match(stream, /proxy_set_header Connection "upgrade";/);
  assert.match(stream, /proxy_set_header X-Real-IP \$remote_addr;/);
  assert.match(stream, /proxy_http_version 1\.1;/);
  for (const b of [sess, stream]) {
    assert.ok(!/Access-Control/i.test(b), "CORS is decided by the API per partner key");
    assert.ok(!/proxy_set_header (Origin|X-VC-Key)/i.test(b), "Origin and X-VC-Key pass through unchanged");
  }
});

test("the snippet and nginx-vc.conf agree on the widget locations", () => {
  const snippet = fs.readFileSync(path.join(__dirname, "..", "nginx-widget.conf.snippet"), "utf8").replace(/^\s*#.*$/gm, "");
  for (const loc of ["location = /widget/vc-widget.v1.js", "location = /widget/vc-widget.js", "location = /widget/vc-widget-voice.v1.js"]) {
    assert.ok(snippet.includes(loc), "snippet: " + loc);
    assert.ok(nginx.includes(loc), "nginx-vc.conf: " + loc);
  }
});

// ---- pc-hardening H3 (ISS-pc-voice-6): a busy voice service gets its own message, not the generic network fallback --------------------------------
// Signal used: the SESSION-MINT response. A refused WebSocket upgrade (429) is not readable from onclose (no status, no Retry-After), so the API now answers the mint itself
// with 429 {"error":"voice_busy"} when the visitor's or the partner's active-session cap is reached. The other server signal is the "voice_busy" error frame sent just before a
// 1008 close at start. The crisis and helpline paths are not touched.

test("H3: a 429 voice_busy from the session mint is a busy fallback (not rate, not network) that waits as told, frees the mic and opens no socket", async () => {
  const mic = fakeMic();
  const s = setup({ fetch: fakeFetch(resp(429, { error: "voice_busy", helpline: "Tele-MANAS 14416" }, { "retry-after": "30" })), mediaDevices: mic });
  assert.equal(await s.vc.start(), false);
  assert.deepEqual(s.of("fallback"), [{ reason: "busy", wait: 30 }]);
  assert.equal(mic.stopped, 1);
  assert.equal(FakeWS.all.length, 0);
  assert.equal(s.vc.state(), "idle");
  // busy without a Retry-After uses a short default; an unreadable 429 body stays the generic rate fallback
  const s2 = setup({ fetch: fakeFetch(resp(429, { error: "voice_busy" })) });
  await s2.vc.start();
  assert.deepEqual(s2.of("fallback"), [{ reason: "busy", wait: 30 }]);
  const s3 = setup({ fetch: fakeFetch(resp(429, undefined, { "retry-after": "5" })) });
  await s3.vc.start();
  assert.deepEqual(s3.of("fallback"), [{ reason: "rate", wait: 5 }]);
});

test("H3: the widget words the busy state in English and Hindi (page language), keeps the other voice fallback texts, and a voice_busy error frame gets the same busy note instead of the raw server text", () => {
  const en = W.voiceFallbackText({ reason: "busy", wait: 30 }, "en");
  assert.match(en, /busy/i);
  assert.match(en, /try again/i);
  assert.doesNotMatch(en, /network|could not start/i);
  for (const lang of ["hi", "hi-IN", "HI"]) {
    const hi = W.voiceFallbackText({ reason: "busy", wait: 30 }, lang);
    assert.match(hi, /[ऀ-ॿ]/, lang);
    assert.notEqual(hi, en);
  }
  assert.equal(W.voiceFallbackText({ reason: "busy" }, undefined), en, "no language: English");
  assert.equal(W.voiceFallbackText({ reason: "busy" }, "fr"), en, "an unsupported language: English");
  // unchanged texts
  assert.match(W.voiceFallbackText({ reason: "permission" }, "en"), /Microphone access is blocked/);
  assert.equal(W.voiceFallbackText({ reason: "rate", wait: 7 }, "en"), "Too many voice requests. Please wait 7 seconds, or type your question.");
  assert.match(W.voiceFallbackText({ reason: "network" }, "en"), /Voice could not start\. You can keep typing here\./);
  assert.match(W.voiceFallbackText({ reason: "error", helpline: "Tele-MANAS 14416" }, "en"), /Tele-MANAS 14416/);
  // a voice_busy error frame (the 1008 path) is the same note; any other error frame keeps the server message and the helpline
  const busyFrame = W.voiceErrorNotice({ code: "voice_busy", message: "Voice is busy right now. You can keep typing.", help: V.HELP }, "hi");
  assert.deepEqual(busyFrame, { kind: "note", text: W.voiceFallbackText({ reason: "busy" }, "hi") });
  assert.deepEqual(W.voiceErrorNotice({ code: "live_unavailable", message: "Voice is unavailable.", help: V.HELP }, "en"), { kind: "err", text: "Voice is unavailable.\n" + V.HELP });
});

test("H3: the busy/ended frames keep the crisis path intact: a crisis flag still shows the helpline only, and the helpline text is unchanged", async () => {
  const s = await started();
  s.wsk.say({ type: "flag", eventId: "f1", reason: "crisis_detected" });
  assert.deepEqual(s.of("crisis"), [{ help: V.HELP }]);
  assert.equal(V.HELP, W.HELP);
});
