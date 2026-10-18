/** H1 area 5: flag and gate. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { tenantScopedDb } from "@vc/db";
import { createFakeDb } from "@vc/db/testing";
import { CHAT_FLAG_ENV, ChatConfigError, chatEnabledFromEnv, createChatApi, withChatRoutes } from "../../p1-u8/apps/api/src/chat.js";
import { createApiHandler } from "../../p1-u8/apps/api/src/server.js";
import { createJwtVerifier, jwtConfigFromEnv } from "../../p1-u8/apps/api/src/auth.js";
import { APPROVER, NOW, chatRequest, cleanupGates, gatesFixture, kbAnswerProvider, recordingKb, studentToken, studentVerifier, adult, SKILLS_DIR, SPEAKERS } from "../../p1-u8/apps/api/tests/chat-fixtures.js";

test("5a chatEnabledFromEnv: off for unset / empty / false (trimmed); on only for exactly 'true' (trimmed); every other spelling throws ChatConfigError without echoing the value", () => {
  const out: Record<string, string> = {};
  const cases: [string, Record<string, string | undefined>][] = [
    ["unset", {}], ["undefined", { VC_CHAT_ENABLED: undefined }], ["empty", { VC_CHAT_ENABLED: "" }], ["spaces", { VC_CHAT_ENABLED: "   " }],
    ["false", { VC_CHAT_ENABLED: "false" }], ["' false '", { VC_CHAT_ENABLED: " false " }], ["true", { VC_CHAT_ENABLED: "true" }], ["' true '", { VC_CHAT_ENABLED: " true " }],
    ["TRUE", { VC_CHAT_ENABLED: "TRUE" }], ["True", { VC_CHAT_ENABLED: "True" }], ["FALSE", { VC_CHAT_ENABLED: "FALSE" }], ["1", { VC_CHAT_ENABLED: "1" }], ["0", { VC_CHAT_ENABLED: "0" }],
    ["yes", { VC_CHAT_ENABLED: "yes" }], ["on", { VC_CHAT_ENABLED: "on" }], ["tab-true", { VC_CHAT_ENABLED: "\ttrue\n" }], ["lookalike", { VC_CHAT_ENABLED: "truе" }],
    ["wrong-name lowercase", { vc_chat_enabled: "true" }], ["wrong-name VC_CHAT_ENABLE", { VC_CHAT_ENABLE: "true" }],
  ];
  for (const [label, env] of cases) {
    try { out[label] = String(chatEnabledFromEnv(env)); }
    catch (e) {
      out[label] = "THROWS " + (e as Error).name;
      assert.ok(e instanceof ChatConfigError);
      const v = (env as any).VC_CHAT_ENABLED;
      if (typeof v === "string" && v.trim().length > 1) assert.ok(!(e as Error).message.includes(v.trim()), "error message echoes the raw value");
    }
  }
  console.log("OBS 5a", JSON.stringify(out));
  assert.equal(out["unset"], "false"); assert.equal(out["true"], "true"); assert.equal(out["' true '"], "true");
  for (const k of ["TRUE", "True", "FALSE", "1", "0", "yes", "on", "lookalike"]) assert.equal(out[k], "THROWS ChatConfigError", k);
  assert.equal(out["wrong-name lowercase"], "false"); // case-sensitive env name: stays OFF (safe default)
  assert.equal(CHAT_FLAG_ENV, "VC_CHAT_ENABLED");
});

test("5b flag off: every chat path/method, with and without a valid student token, answers byte-for-byte like a truly unknown /v1 path (status, headers, body)", async () => {
  const gates = gatesFixture();
  try {
    const keys = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const deps = { verifier: studentVerifier(), dbForTenant: (t: string) => tenantScopedDb(createFakeDb().db, t), kb: recordingKb(), provider: kbAnswerProvider(), skillsDir: SKILLS_DIR, speakers: SPEAKERS };
    const off = createChatApi(deps as any, { enabled: false, gatesDir: gates.gates, now: NOW, approver: APPROVER });
    assert.equal(off, undefined);
    const main = createApiHandler({
      verifier: createJwtVerifier(jwtConfigFromEnv({ VC_JWT_ISSUER: "https://x.test", VC_JWT_PUBLIC_KEY: keys.publicKey.export({ type: "spki", format: "pem" }).toString() })),
      dbForTenant: () => { throw new Error("no db"); },
      graphForTenant: () => { throw new Error("no graph"); },
    } as any);
    const composed = withChatRoutes(main, off);
    const token = await studentToken(adult("stu-1"));
    const shape = (r: any) => JSON.stringify({ s: r.status, b: r.body, h: Object.fromEntries(Object.entries(r.headers).sort()) });
    const chatPaths = [
      "/v1/students/stu-1/chat/threads",
      "/v1/students/stu-1/chat/threads/th-1",
      "/v1/students/stu-1/chat/threads/th-1/turns",
      "/v1/students/stu-1/chat/profile",
      "/v1/students/stu-1/chat/profile/facts/f1/decision",
      "/v1/students/stu-1/chat",
      "/v1/students/stu-1/chat/",
      "/v1/students/stu-1/chat/threads?x=1",
    ];
    for (const method of ["POST", "GET", "PUT", "DELETE", "PATCH", "OPTIONS", "HEAD"]) {
      const unknown = await composed(chatRequest(method, "/v1/students/x/nothing", { body: "{}" }));
      const unknownAuth = await composed(chatRequest(method, "/v1/students/x/nothing", { token, body: "{}" }));
      for (const p of chatPaths) {
        for (const withToken of [false, true]) {
          const r = await composed(chatRequest(method, p, { ...(withToken ? { token } : {}), body: "{}" }));
          assert.equal(shape(r), shape(withToken ? unknownAuth : unknown), `${method} ${p} token=${withToken} differs from an unknown path`);
        }
      }
    }
  } finally { cleanupGates(gates); }
});

test("5c flag on: unknown chat sub-paths, wrong methods, and the exact prefix boundary behave (404 / 405, no 500), and non-chat /v1 paths still reach the main handler", async () => {
  const { chatWorld, call } = await import("../../p1-u8/apps/api/tests/chat-fixtures.js");
  const w = chatWorld();
  try {
    const t = await studentToken(adult("stu-1"));
    const probes: [string, string, number[]][] = [
      ["GET", "/v1/students/stu-1/chat", [404]],
      ["GET", "/v1/students/stu-1/chat/", [404]],
      ["GET", "/v1/students/stu-1/chat/threads", [405]],
      ["DELETE", "/v1/students/stu-1/chat/threads/th-1", [405]],
      ["PUT", "/v1/students/stu-1/chat/profile", [405]],
      ["GET", "/v1/students/stu-1/chat/profile/facts/f1/decision", [405]],
      ["GET", "/v1/students/stu-1/chat/unknown", [404]],
      ["GET", "/v1/students/stu-1/chat/threads/th-1/turns/extra", [404]],
      ["GET", "/v1/students/stu-1/chat/threads/th-1/", [404]],
    ];
    for (const [m, p, want] of probes) {
      const r = await call(w, m, p, { token: t });
      assert.ok(want.includes(r.status), `${m} ${p} -> ${r.status} ${r.body}`);
    }
  } finally { w.cleanup(); }
});
