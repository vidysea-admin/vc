/**
 * T-021 (D-020, contract B6 "runtime failover"): POST /api/sessions over the demo runtime's
 * dedicated "new session" graph (demo/seed.ts FlakyOnceProvider) — the first submit hits the same
 * typed AiUnavailableError a real exhausted FailoverProvider chain throws, the second (identical)
 * submit succeeds and reaches the normal awaiting_approval outcome.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createDemoRuntime, DEMO_NEW_SESSION_STUDENT_ID, type DemoRuntime } from "../demo/seed";
import { submitSession } from "../src/server/session-service";
import { StartSessionResultSchema, type StartSessionRequest } from "../src/server/contracts";

async function fresh(): Promise<DemoRuntime> {
  return createDemoRuntime();
}

function submission(sessionId: string): StartSessionRequest {
  return {
    sessionId,
    studentId: DEMO_NEW_SESSION_STUDENT_ID,
    sessionEndedAt: "2026-09-26T11:30:00.000Z",
    turns: [
      { turnId: "t1", speaker: "student", lang: "en", text: "I am thinking about computer science in Canada.", translatedText: "I am thinking about computer science in Canada.", ts: 1 },
      { turnId: "t2", speaker: "counsellor", lang: "en", text: "Which intake are you aiming for?", translatedText: "Which intake are you aiming for?", ts: 2 },
    ],
  };
}

test("T-021: the first submit hits the exhausted failover chain and returns 503 ai_unavailable, with no key/transcript leak", async () => {
  const rt = await fresh();
  const body = submission("t-021-demo-session-1");
  const { status, body: resBody } = await submitSession(rt, body);
  const parsed = StartSessionResultSchema.parse(resBody);
  assert.equal(status, 503);
  assert.equal(parsed.state, "ai_unavailable");
  if (parsed.state !== "ai_unavailable") return;
  assert.equal(parsed.sessionId, "t-021-demo-session-1");
  assert.ok(parsed.attempts > 0);
  assert.ok(parsed.modelsAttempted.length > 0);
  const serialized = JSON.stringify(parsed);
  assert.doesNotMatch(serialized, /computer science in Canada/, "no transcript content in the ai_unavailable reply (B13)");
});

test("T-021: Retry — resubmitting the SAME body after an ai_unavailable reply succeeds and reaches the normal awaiting_approval flow", async () => {
  const rt = await fresh();
  const body = submission("t-021-demo-session-2");

  const first = await submitSession(rt, body);
  assert.equal(first.status, 503);

  // Retry = the identical body, unchanged (no retype) — proven by reusing the same `body` object.
  const second = await submitSession(rt, body);
  const parsed = StartSessionResultSchema.parse(second.body);
  assert.equal(second.status, 200);
  assert.equal(parsed.state, "started");
  if (parsed.state !== "started") return;
  assert.equal(parsed.sessionId, "t-021-demo-session-2");
  assert.equal(parsed.threadId, "scribe:t-021-demo-session-2");
});

test("T-021: an invalid body (missing turns) is refused 400 before anything runs", async () => {
  const rt = await fresh();
  const { status, body } = await submitSession(rt, { sessionId: "x", studentId: "y", sessionEndedAt: "2026-09-26T11:30:00.000Z", turns: [] });
  assert.equal(status, 400);
  const parsed = StartSessionResultSchema.parse(body);
  assert.equal(parsed.state, "invalid");
});
