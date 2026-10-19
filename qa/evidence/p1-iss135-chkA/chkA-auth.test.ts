/** Checker A: the authenticated chat route keeps its own 256 KiB cap (chat.ts:111), untouched by ISS-135. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { adult, call, chatWorld, newThread, studentToken, turnsPath } from "./chat-fixtures.js";
import { MAX_CHAT_BODY_BYTES } from "../src/chat.js";

test("authenticated chat turn: 100 KiB and 255 KiB bodies are not a 413; 257 KiB and 300 KiB are", async () => {
  assert.equal(MAX_CHAT_BODY_BYTES, 256 * 1024);
  const w = chatWorld();
  try {
    const token = await studentToken(adult());
    const threadId = await newThread(w, token);
    const path = turnsPath("stu-1", threadId);
    const unit = "I am writing a very long message about my exams. ";
    const mk = (kib: number) => JSON.stringify({ text: `${unit.repeat(Math.ceil((kib * 1024) / unit.length))} I want to kill myself.` });
    for (const kib of [100, 255]) {
      const body = mk(kib);
      assert.ok(Buffer.byteLength(body) < MAX_CHAT_BODY_BYTES && Buffer.byteLength(body) > 64 * 1024);
      const res = await call(w, "POST", path, { token, body });
      assert.notEqual(res.status, 413, `${kib} KiB must not be refused as too large (got ${res.status} ${res.body.slice(0, 100)})`);
      assert.equal(res.status, 200, `${kib} KiB (${res.body.slice(0, 120)})`);
    }
    for (const kib of [257, 300]) {
      const res = await call(w, "POST", path, { token, body: mk(kib) });
      assert.ok(Buffer.byteLength(mk(kib)) > MAX_CHAT_BODY_BYTES);
      assert.equal(res.status, 413, `${kib} KiB`);
    }
  } finally {
    w.cleanup();
  }
});
