/**
 * P1 U5a: the DRAFT student OpenAPI contract (chat, voice-session, WS events, anonymous, profile, fact-confirm).
 * It is a separate export, not part of the served OPENAPI_DOCUMENT: no route is implemented or enabled, and the
 * existing both-directions route-table test (server.test.ts) must keep holding. These tests pin that separation
 * and keep the hand-written JSON Schemas in step with the Zod source of truth in @vc/schemas.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import * as S from "@vc/schemas";
import { OPENAPI_DOCUMENT, STUDENT_API_DRAFT } from "../src/openapi.js";
import { API_ROUTES } from "../src/server.js";

type Json = Record<string, any>;
const draft = STUDENT_API_DRAFT as unknown as Json;
const schemas = draft.components.schemas as Json;

test("the draft is a separate OpenAPI 3.1 document marked not enabled", () => {
  assert.equal(draft.openapi, "3.1.0");
  assert.equal(draft["x-status"], "draft-not-enabled");
  assert.match(String(draft["x-gate"]), /A20/);
});

test("U5a: no draft path is in the served document or the route table (routes are not implemented or enabled)", () => {
  const draftPaths = Object.keys(draft.paths);
  assert.ok(draftPaths.length >= 7);
  const served = new Set(Object.keys(OPENAPI_DOCUMENT.paths));
  const table = new Set(API_ROUTES.map((r) => r.path));
  for (const p of draftPaths) {
    assert.equal(served.has(p), false, `${p} must not be in OPENAPI_DOCUMENT`);
    assert.equal(table.has(p), false, `${p} must not be in API_ROUTES`);
  }
  for (const p of served) assert.equal(p.includes("/chat/") || p.startsWith("/v1/public"), false, p);
});

test("the draft covers chat, voice-session, anonymous, profile and fact-confirm with the expected roles", () => {
  const ops = new Map<string, Json>();
  for (const [path, item] of Object.entries(draft.paths as Json)) {
    for (const [method, op] of Object.entries(item as Json)) ops.set(`${method.toUpperCase()} ${path}`, op as Json);
  }
  const expected: Record<string, string[]> = {
    "POST /v1/students/{studentId}/chat/threads": ["student"],
    "GET /v1/students/{studentId}/chat/threads/{threadId}": ["student"],
    "POST /v1/students/{studentId}/chat/threads/{threadId}/turns": ["student"],
    "POST /v1/students/{studentId}/chat/threads/{threadId}/voice/sessions": ["student"],
    "GET /v1/students/{studentId}/chat/profile": ["student"],
    "POST /v1/students/{studentId}/chat/profile/facts/{factId}/decision": ["student"],
    "POST /v1/public/chat/turns": [],
  };
  assert.deepEqual([...ops.keys()].sort(), Object.keys(expected).sort());
  for (const [key, roles] of Object.entries(expected)) {
    const op = ops.get(key)!;
    assert.deepEqual(op["x-roles"], roles, key);
    assert.equal(op["x-enabled"], false, key);
    assert.ok(op.operationId, key);
  }
  assert.deepEqual(ops.get("POST /v1/public/chat/turns")!.security, [], "anonymous is the only B21 exception");
  assert.equal(ops.get("POST /v1/students/{studentId}/chat/threads")!.security, undefined, "student routes inherit bearer auth");
});

test("turn and voice-session and anonymous routes document 429 with Retry-After (A23)", () => {
  for (const [path, method] of [
    ["/v1/students/{studentId}/chat/threads/{threadId}/turns", "post"],
    ["/v1/students/{studentId}/chat/threads/{threadId}/voice/sessions", "post"],
    ["/v1/public/chat/turns", "post"],
  ] as const) {
    assert.ok(draft.paths[path][method].responses["429"], `${method} ${path}`);
  }
  assert.ok(draft.components.responses.TooManyRequests.headers["Retry-After"]);
});

function shapeOf(schema: z.ZodTypeAny): Record<string, z.ZodTypeAny> {
  let s: any = schema;
  while (s._def?.schema) s = s._def.schema; // ZodEffects (refine)
  return s.shape;
}

function parity(name: string, zod: z.ZodTypeAny) {
  const js = schemas[name];
  assert.ok(js, `component ${name} exists`);
  const shape = shapeOf(zod);
  assert.deepEqual(Object.keys(js.properties).sort(), Object.keys(shape).sort(), `${name} property names`);
  const required = Object.entries(shape)
    .filter(([, v]) => !v.isOptional())
    .map(([k]) => k)
    .sort();
  assert.deepEqual([...(js.required ?? [])].sort(), required, `${name} required`);
  assert.equal(js.additionalProperties, false, `${name} is strict`);
}

test("component schemas match the Zod shapes (names, required, strictness)", () => {
  parity("Claim", S.ClaimSchema);
  parity("Source", S.SourceSchema);
  parity("ProfileFact", S.ProfileFactSchema);
  parity("ProposedFact", S.ProposedFactSchema);
  parity("ProfileResponse", S.ProfileResponseSchema);
  parity("FactDecisionRequest", S.FactDecisionRequestSchema);
  parity("TurnRequest", S.TurnRequestSchema);
  parity("TurnResponse", S.TurnResponseSchema);
  parity("ThreadCreated", S.ThreadCreatedSchema);
  parity("ThreadTurn", S.ThreadTurnSchema);
  parity("Thread", S.ThreadSchema);
  parity("AnonymousTurnRequest", S.AnonymousTurnRequestSchema);
  parity("AnonymousTurnResponse", S.AnonymousTurnResponseSchema);
  parity("VoiceSessionResponse", S.VoiceSessionResponseSchema);
  parity("LimitsConfig", S.LimitsConfigSchema);
  parity("AudioFormat", S.AudioFormatSchema);
});

test("enums in the draft are the exact Zod values (claim status, kind, state, source kind, fact source)", () => {
  assert.deepEqual(schemas.Claim.properties.status.enum, ["verified", "attributed", "unverified"]);
  assert.deepEqual(schemas.Claim.properties.kind.enum, [...S.CLAIM_KINDS]);
  assert.deepEqual(schemas.TurnResponse.properties.state.enum, [...S.TURN_STATES]);
  assert.deepEqual(schemas.AnonymousTurnResponse.properties.state.enum, [...S.ANONYMOUS_STATES]);
  assert.deepEqual(schemas.Source.properties.kind.enum, [...S.SOURCE_KINDS]);
  assert.deepEqual(schemas.ProfileFact.properties.source.enum, [...S.PROFILE_FACT_SOURCES]);
  assert.deepEqual(schemas.FactDecisionRequest.properties.action.enum, [...S.FACT_DECISION_ACTIONS]);
  assert.deepEqual(schemas.ThreadTurn.properties.channel.enum, [...S.TURN_CHANNELS]);
});

test("limits and audio defaults are published as the D-088 numbers", () => {
  const lim = schemas.LimitsConfig;
  assert.deepEqual(lim.default, S.DEFAULT_LIMITS);
  assert.equal(schemas.AudioFormat.properties.inputSampleRateHz.const, 16000);
  assert.equal(schemas.AudioFormat.properties.outputSampleRateHz.const, 24000);
  assert.equal(schemas.AudioFormat.properties.format.const, "pcm16");
  assert.equal(draft["x-syntheticStudentIdPrefix"], "syn-");
});

test("WebSocket events: every Zod event type is documented with matching fields, client and server", () => {
  const ws = draft["x-websocket"] as Json;
  assert.ok(ws, "x-websocket section");
  const check = (docName: "serverEvents" | "clientEvents", options: readonly z.ZodObject<any>[], types: readonly string[]) => {
    const docs = ws[docName] as Json;
    assert.deepEqual(Object.keys(docs).sort(), [...types].sort(), docName);
    for (const opt of options) {
      const type = (opt.shape.type as z.ZodLiteral<string>).value;
      const doc = docs[type];
      assert.deepEqual(Object.keys(doc.properties).sort(), Object.keys(opt.shape).sort(), `${docName}.${type} fields`);
      const required = Object.entries(opt.shape).filter(([, v]) => !(v as z.ZodTypeAny).isOptional()).map(([k]) => k).sort();
      assert.deepEqual([...doc.required].sort(), required, `${docName}.${type} required`);
    }
  };
  check("serverEvents", S.VoiceServerEventSchema.options, S.VOICE_SERVER_EVENT_TYPES);
  check("clientEvents", S.VoiceClientEventSchema.options, S.VOICE_CLIENT_EVENT_TYPES);
  assert.deepEqual(ws.audio, { format: "pcm16", inputSampleRateHz: 16000, outputSampleRateHz: 24000, framing: "binary" });
  assert.deepEqual(schemas.VoiceFlagReason.enum, [...S.VOICE_FLAG_REASONS]);
});

test("every $ref in the draft resolves and the document is plain JSON", () => {
  const text = JSON.stringify(draft);
  assert.deepEqual(JSON.parse(text), draft);
  const refs = [...text.matchAll(/"\$ref":"(#[^"]+)"/g)].map((m) => m[1]);
  assert.ok(refs.length > 10);
  for (const ref of refs) {
    let node: any = draft;
    for (const part of ref.slice(2).split("/")) node = node?.[part];
    assert.ok(node, `unresolved ${ref}`);
  }
});

test("the draft carries no tenant or student identity in any request body (identity is the JWT)", () => {
  for (const name of ["TurnRequest", "AnonymousTurnRequest", "FactDecisionRequest"]) {
    const props = Object.keys(schemas[name].properties);
    for (const forbidden of ["tenant", "studentId", "counsellorId", "role"]) assert.equal(props.includes(forbidden), false, `${name}.${forbidden}`);
  }
});
