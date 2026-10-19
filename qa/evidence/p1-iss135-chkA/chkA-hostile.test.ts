/** Checker A hostile-variant probe for ISS-135 (p1-iss135-anon-crisis-budget): real node:http server, raw sockets on 127.0.0.1 only. */
import { test } from "node:test";
import assert from "node:assert/strict";
import net from "node:net";
import { gzipSync } from "node:zlib";
import type { AddressInfo } from "node:net";
import { TELE_MANAS_LINE, crisisGuard } from "@vc/engine";
import { AnonymousRateLimiter, MAX_ANONYMOUS_BODY_BYTES } from "../src/anonymous.js";
import { createApiServer } from "../src/server.js";
import { anonWorld, nonEmptyCollections } from "./anonymous-fixtures.js";

const CAP = MAX_ANONYMOUS_BODY_BYTES;
const CRISIS = " I want to kill myself.";
const GENERIC = "What are the tuition fees for public universities in Germany?";

async function serve(w: ReturnType<typeof anonWorld>) {
  const server = createApiServer(w.handler);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  return {
    port: (server.address() as AddressInfo).port,
    close: () =>
      new Promise<void>((r) => {
        server.closeAllConnections?.();
        server.close(() => r());
      }),
  };
}

interface Raw {
  status: number;
  headers: string;
  body: string;
  json: any;
}
function parse(buf: Buffer): Raw {
  const i = buf.indexOf(Buffer.from([13, 10, 13, 10]));
  const head = buf.subarray(0, i).toString("utf8");
  let bodyB = buf.subarray(i + 4);
  if (/transfer-encoding: chunked/i.test(head)) {
    const parts: Buffer[] = [];
    let rest = bodyB;
    for (;;) {
      const nl = rest.indexOf(Buffer.from([13, 10]));
      if (nl < 0) break;
      const n = parseInt(rest.subarray(0, nl).toString("ascii"), 16);
      if (!n) break;
      parts.push(rest.subarray(nl + 2, nl + 2 + n));
      rest = rest.subarray(nl + 2 + n + 2);
    }
    bodyB = Buffer.concat(parts);
  }
  const body = bodyB.toString("utf8");
  let json: any;
  try {
    json = JSON.parse(body);
  } catch {
    json = undefined;
  }
  return { status: Number(/^HTTP\/1\.1 (\d+)/.exec(head)?.[1] ?? 0), headers: head, body, json };
}
/** Sends `parts` over a raw socket; resolves with the first complete response (status 0 on close/timeout with nothing). */
function rawOnce(port: number, parts: (string | Buffer)[], { waitMs = 4000 }: { waitMs?: number } = {}): Promise<Raw> {
  return new Promise((resolve) => {
    const sock = net.connect(port, "127.0.0.1");
    const chunks: Buffer[] = [];
    let done = false;
    let reset = false;
    const fin = () => {
      if (done) return;
      done = true;
      clearTimeout(t);
      sock.destroy();
      resolve(chunks.length ? parse(Buffer.concat(chunks)) : { status: reset ? -1 : 0, headers: "", body: "", json: undefined });
    };
    const t = setTimeout(fin, waitMs);
    sock.on("data", (c) => {
      chunks.push(c);
      const s = Buffer.concat(chunks).toString("utf8");
      const i = s.indexOf("\r\n\r\n");
      if (i >= 0) {
        const head = s.slice(0, i);
        const m = /content-length: (\d+)/i.exec(head);
        if (m && Buffer.concat(chunks).length - Buffer.byteLength(s.slice(0, i + 4)) >= Number(m[1])) fin();
        else if (/transfer-encoding: chunked/i.test(head) && Buffer.concat(chunks).subarray(-5).toString("ascii") === "0\r\n\r\n") fin();
      }
    });
    sock.on("close", fin);
    sock.on("error", (e) => { if (!chunks.length && (e as NodeJS.ErrnoException).code === "ECONNRESET") reset = true; fin(); });
    sock.on("connect", async () => {
      for (const p of parts) {
        if (sock.destroyed) return;
        sock.write(p);
        await new Promise((r) => setTimeout(r, 2));
      }
    });
  });
}
const reqHead = (extra: string) => `POST /v1/public/chat/turns HTTP/1.1\r\nHost: x\r\nContent-Type: application/json\r\nConnection: close\r\n${extra}\r\n`;
const withCL = (b: Buffer, claimed = b.length): (string | Buffer)[] => [reqHead(`Content-Length: ${claimed}\r\n`), b];
function chunked(b: Buffer, size = 8192): (string | Buffer)[] {
  const out: (string | Buffer)[] = [reqHead("Transfer-Encoding: chunked\r\n")];
  for (let o = 0; o < b.length; o += size) {
    const c = b.subarray(o, o + size);
    out.push(`${c.length.toString(16)}\r\n`, c, "\r\n");
  }
  out.push("0\r\n\r\n");
  return out;
}
/** A JSON body of exactly `bytes` bytes ending with `tail`, with an optional multibyte char right before the tail. */
function body(bytes: number, tail: string, mb?: string): Buffer {
  const tailB = Buffer.byteLength(tail);
  const mbB = mb ? Buffer.byteLength(mb) : 0;
  const need = bytes - 11 - tailB - mbB; // 11 = {"text":" + "}
  assert.ok(need >= 0);
  const b = Buffer.from(`{"text":"${"a".repeat(need)}${mb ?? ""}${tail}"}`, "utf8");
  assert.equal(b.length, bytes);
  return b;
}
function zero(w: ReturnType<typeof anonWorld>, label: string) {
  assert.equal(w.provider.calls.length, 0, `${label}: model calls`);
  assert.equal(w.kb.calls.length, 0, `${label}: kb calls`);
  assert.deepEqual(w.counterCalls, [], `${label}: counter writes`);
  assert.deepEqual(nonEmptyCollections(w.fakeDb), {}, `${label}: collections`);
}
const over = (r: Raw, label: string) => {
  assert.equal(r.status, 413, `${label}: status (got ${r.status} ${r.body.slice(0, 80)})`);
  assert.equal(r.json?.error, "body_too_large", label);
  assert.equal(r.json?.helpline, TELE_MANAS_LINE, `${label}: helpline`);
  assert.match(r.json.helpline, /14416/);
};
const escalated = (r: Raw, label: string) => {
  if (!r.json) console.log("DEBUG", label, r.status, JSON.stringify(r.headers), JSON.stringify(r.body.slice(0, 300)), r.body.length);
  assert.equal(r.status, 200, `${label}: status (got ${r.status} ${r.body.slice(0, 80)})`);
  assert.equal(r.json.state, "escalated", label);
  assert.match(r.json.message, /14416/, label);
};

test("boundary: 65535/65536 with trailing crisis escalate; 65537+ (incl. multibyte next to the cap) is 413 + helpline + zero side effects", async () => {
  for (const mb of [undefined, "é", "€", "😀"]) {
    for (const n of [CAP - 1, CAP]) {
      const w = anonWorld();
      const s = await serve(w);
      try {
        escalated(await raw(s.port, withCL(body(n, CRISIS, mb))), `${n} bytes mb=${mb}`);
      } finally {
        await s.close();
        w.cleanup();
      }
    }
    for (const n of [CAP + 1, CAP + 2, CAP + 4, 100 * 1024, 300 * 1024]) {
      const w = anonWorld();
      const s = await serve(w);
      try {
        over(await raw(s.port, withCL(body(n, CRISIS, mb))), `${n} bytes mb=${mb}`);
        zero(w, `${n} mb=${mb}`);
      } finally {
        await s.close();
        w.cleanup();
      }
    }
  }
});

test("a multibyte char straddling byte 65536: first byte inside the cap, rest outside, is 413", async () => {
  for (const mb of ["€", "😀"]) {
    const w = anonWorld();
    const s = await serve(w);
    try {
      // prefix of exactly CAP-1 bytes then the multibyte char (its first byte is byte CAP, so it crosses the cap), then the crisis tail
      const prefix = `{"text":"${"a".repeat(CAP - 1 - 9)}`;
      assert.equal(Buffer.byteLength(prefix), CAP - 1);
      const b = Buffer.from(`${prefix}${mb}${CRISIS}"}`, "utf8");
      assert.ok(b.length > CAP);
      over(await raw(s.port, withCL(b)), `straddle ${mb}`);
      zero(w, `straddle ${mb}`);
    } finally {
      await s.close();
      w.cleanup();
    }
  }
});

test("chars under cap but bytes over: 25000 euro signs (75000 bytes, 25000 chars) is 413, not scanned", async () => {
  const w = anonWorld();
  const s = await serve(w);
  try {
    const b = Buffer.from(JSON.stringify({ text: "€".repeat(25000) + CRISIS }));
    assert.ok(b.length > CAP && b.toString("utf8").length < CAP);
    over(await raw(s.port, withCL(b)), "multibyte");
    zero(w, "multibyte");
  } finally {
    await s.close();
    w.cleanup();
  }
});

test("chunked transfer without Content-Length: over cap 413 (zero effects), within cap crisis escalates, any chunk size", async () => {
  for (const n of [CAP + 1, 100 * 1024, 300 * 1024]) {
    const w = anonWorld();
    const s = await serve(w);
    try {
      over(await raw(s.port, chunked(body(n, CRISIS))), `chunked ${n}`);
      zero(w, `chunked ${n}`);
    } finally {
      await s.close();
      w.cleanup();
    }
  }
  for (const n of [60 * 1024, CAP]) {
    const w = anonWorld();
    const s = await serve(w);
    try {
      escalated(await raw(s.port, chunked(body(n, CRISIS))), `chunked ${n}`);
    } finally {
      await s.close();
      w.cleanup();
    }
  }
  for (const size of [4096, CAP - 1, CAP, CAP + 1]) {
    const w = anonWorld();
    const s = await serve(w);
    try {
      over(await raw(s.port, chunked(body(CAP + 1, CRISIS), size)), `chunk size ${size}`);
      zero(w, `chunk size ${size}`);
    } finally {
      await s.close();
      w.cleanup();
    }
  }
});

test("Content-Length lies never get an over-cap payload scanned", async () => {
  const cases: [string, number, number][] = [
    ["CL 100, 200 KiB sent", 200 * 1024, 100],
    ["CL 40000 (under cap), 200 KiB sent", 200 * 1024, 40000],
    ["CL 10 MB, 300 KiB sent", 300 * 1024, 10 * 1024 * 1024],
  ];
  for (const [label, actual, claimed] of cases) {
    const w = anonWorld();
    const s = await serve(w);
    try {
      const r = await raw(s.port, withCL(body(actual, CRISIS), claimed), { waitMs: 2500 });
      if (claimed >= 10 * 1024 * 1024) over(r, label);
      else {
        assert.ok([400, 0, -1].includes(r.status), `${label}: status ${r.status}`);
        if (r.status === 400 && r.json) assert.equal(r.json.helpline, TELE_MANAS_LINE); else if (r.status === 400) assert.match(r.headers, /400 Bad Request/); /* node http parser rejected the surplus bytes as a malformed next request */
      }
      zero(w, label);
    } finally {
      await s.close();
      w.cleanup();
    }
  }
  // header claims 10 MB, 300 bytes sent, then the client stalls: no hang past the harness wait, no effects
  {
    const w = anonWorld();
    const s = await serve(w);
    try {
      const r = await raw(s.port, withCL(body(300, "x"), 10 * 1024 * 1024), { waitMs: 1200 });
      assert.equal(r.status, 0, "server waits for the body, answers nothing, does not crash");
      zero(w, "CL huge stalled");
    } finally {
      await s.close();
      w.cleanup();
    }
  }
  // honest header, over cap
  {
    const w = anonWorld();
    const s = await serve(w);
    try {
      over(await raw(s.port, withCL(body(70000, CRISIS))), "CL honest 70000");
      zero(w, "CL honest");
    } finally {
      await s.close();
      w.cleanup();
    }
  }
});

test("encoded bodies: gzip is not decoded, so neither a tiny gzip of a huge crisis text nor a big gzip-labelled stream is a bypass", async () => {
  const gz = gzipSync(body(300 * 1024, CRISIS));
  assert.ok(gz.length < 2000, `gz ${gz.length}`);
  {
    const w = anonWorld();
    const s = await serve(w);
    try {
      const r = await raw(s.port, [reqHead(`Content-Encoding: gzip\r\nContent-Length: ${gz.length}\r\n`), gz]);
      assert.equal(r.status, 400, "undecoded gzip bytes are not JSON");
      assert.equal(r.json.helpline, TELE_MANAS_LINE);
      zero(w, "gzip small");
    } finally {
      await s.close();
      w.cleanup();
    }
  }
  {
    const w = anonWorld();
    const s = await serve(w);
    try {
      over(await raw(s.port, [reqHead(`Content-Encoding: gzip\r\nContent-Length: ${CAP + 10}\r\n`), Buffer.alloc(CAP + 10, 7)]), "gzip-labelled over-cap");
      zero(w, "gzip big");
    } finally {
      await s.close();
      w.cleanup();
    }
  }
});

test("invalid UTF-8 at the cap: 65536 raw bytes of 0xFF are refused (400 or 413 with helpline), never scanned", async () => {
  const w = anonWorld();
  const s = await serve(w);
  try {
    const b = Buffer.concat([Buffer.from('{"text":"'), Buffer.alloc(CAP - 11, 0xff), Buffer.from('"}')]);
    assert.equal(b.length, CAP);
    const r = await raw(s.port, withCL(b));
    assert.ok([400, 413].includes(r.status), `status ${r.status}`);
    assert.equal(r.json?.helpline, TELE_MANAS_LINE);
    zero(w, "bad utf8");
  } finally {
    await s.close();
    w.cleanup();
  }
});

test("limiter: a 413 does not consume the limiter; a within-cap crisis from a 429-limited client still escalates", async () => {
  const limiter = new AnonymousRateLimiter({ limit: 1, windowMs: 60_000, maxKeys: 100, nowMs: () => 5_000 });
  const w = anonWorld({ deps: { limiter } });
  const s = await serve(w);
  try {
    over(await raw(s.port, withCL(body(CAP + 1, CRISIS))), "pre");
    over(await raw(s.port, withCL(body(300 * 1024, " hello"))), "pre non-crisis");
    const g = () => withCL(Buffer.from(JSON.stringify({ text: GENERIC })));
    assert.equal((await raw(s.port, g())).status, 200, "first generic still has its slot, so the 413s did not consume it");
    assert.equal((await raw(s.port, g())).status, 429, "now limited");
    escalated(await raw(s.port, withCL(body(CAP, CRISIS))), "at-cap crisis while 429");
    escalated(await raw(s.port, chunked(body(50 * 1024, CRISIS))), "50 KiB chunked crisis while 429");
    over(await raw(s.port, withCL(body(CAP + 1, CRISIS))), "over-cap crisis while 429 is 413 not 429");
    const r = await raw(s.port, g());
    assert.equal(r.status, 429);
    assert.equal(r.json.helpline, TELE_MANAS_LINE);
  } finally {
    await s.close();
    w.cleanup();
  }
});

test("CPU: crisisGuard on 64 KiB texts of several shapes (informational timing)", () => {
  const shapes: Record<string, string> = {
    ascii: "I am writing a very long message about my exams. ".repeat(1300),
    punct: "a. ".repeat(21000),
    spaces: " ".repeat(65000),
    hindi: "मैं ".repeat(5000),
    spaced: "k i l l   m y s e l f ".repeat(2900),
    near: "i want to ".repeat(6500),
    euro: "€".repeat(21000),
  };
  const out: string[] = [];
  for (const [k, t] of Object.entries(shapes)) {
    const t0 = performance.now();
    crisisGuard(t);
    out.push(`${k}:${(performance.now() - t0).toFixed(1)}ms`);
  }
  console.log("CPU64K " + out.join(" "));
  const big = "I am writing a very long message about my exams. ".repeat(5400);
  const t0 = performance.now();
  crisisGuard(big);
  console.log(`CPU256K ascii:${(performance.now() - t0).toFixed(1)}ms`);
});

/** A server that answers 413 and closes while the client is still sending can RST the client before it reads the reply (TCP race, same on the old 256 KiB cap). Retry only that reset, up to 8 times. */
async function raw(port: number, parts: (string | Buffer)[], opts: { waitMs?: number } = {}): Promise<Raw> {
  let r = await rawOnce(port, parts, opts);
  for (let k = 0; k < 8 && r.status === -1; k++) r = await rawOnce(port, parts, opts);
  return r;
}
