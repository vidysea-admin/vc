/**
 * pc-docs-openapi D1: PARTNER_OPENAPI (served at GET /v1/partner/openapi.json) is a structurally valid OpenAPI 3.1 document, lists every partner route the code
 * serves (and no voice route), documents both key kinds, the student headers, the 400/401/404/429 errors with Retry-After and the limits, and its schemas are the Zod
 * schemas of @vc/schemas (property names, required lists, strictness, enums), not a hand-written copy.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import * as S from "@vc/schemas";
import { OPENAPI_DOCUMENT, PARTNER_OPENAPI, STUDENT_API_DRAFT } from "../src/openapi.js";
import { CHAT_ROUTES } from "../src/chat.js";
import { ANONYMOUS_ROUTES, ANONYMOUS_WINDOW_MS } from "../src/anonymous.js";
import { VOICE_ROUTES } from "../src/voice.js";
import { API_ROUTES, type ApiRequest } from "../src/server.js";
import {
  GUARDIAN_CONSENT_HEADER,
  PARTNER_KEY_HEADER,
  PARTNER_OPENAPI_PATH,
  STUDENT_AGE_HEADER,
  STUDENT_ID_HEADER,
  withPartnerRoutes,
} from "../src/partners.js";

type Json = Record<string, any>;
const doc = PARTNER_OPENAPI as unknown as Json;
const schemas = doc.components.schemas as Json;
const METHODS = ["get", "put", "post", "delete", "options", "head", "patch", "trace"];

function operations(): Array<{ method: string; path: string; op: Json }> {
  const out: Array<{ method: string; path: string; op: Json }> = [];
  for (const [path, item] of Object.entries(doc.paths as Json)) {
    for (const [method, op] of Object.entries(item as Json)) out.push({ method, path, op: op as Json });
  }
  return out;
}
const find = (method: string, path: string): Json => {
  const hit = operations().find((o) => o.method === method && o.path === path);
  assert.ok(hit, `${method.toUpperCase()} ${path} is documented`);
  return hit!.op;
};
const resolve = (node: Json): Json => {
  if (typeof node.$ref !== "string") return node;
  let cur: any = doc;
  for (const part of node.$ref.slice(2).split("/")) cur = cur?.[part];
  assert.ok(cur, `unresolved ${node.$ref}`);
  return cur;
};

// ---------------------------------------------------------------------------
// Structure (OpenAPI 3.1)
// ---------------------------------------------------------------------------

test("D1: PARTNER_OPENAPI is its own OpenAPI 3.1 document, not the student draft and not the JWT document", () => {
  assert.notEqual(PARTNER_OPENAPI, STUDENT_API_DRAFT);
  assert.notEqual(PARTNER_OPENAPI as unknown, OPENAPI_DOCUMENT);
  assert.equal(doc.openapi, "3.1.0");
  assert.equal(typeof doc.info.title, "string");
  assert.match(String(doc.info.version), /^\d+\.\d+\.\d+/);
  assert.equal(doc["x-status"], undefined, "it is not marked draft-not-enabled: the routes it describes are served");
  assert.ok(Array.isArray(doc.servers) && doc.servers.length >= 1);
  assert.equal(typeof doc.paths, "object");
  assert.ok(operations().length >= 7);
});

test("D1: valid 3.1 shape: unique operationIds, every operation has a 2xx, path templates are declared, no 3.0-only keywords, plain JSON", () => {
  const text = JSON.stringify(doc);
  assert.deepEqual(JSON.parse(text), doc, "plain JSON (nothing that JSON.stringify drops)");
  assert.equal(/"nullable"|"exclusiveMinimum":true|"exclusiveMaximum":true/.test(text), false, "3.0 keywords are not valid in 3.1");
  const ids = new Set<string>();
  for (const { method, path, op } of operations()) {
    const label = `${method.toUpperCase()} ${path}`;
    assert.ok(METHODS.includes(method), `${label}: a real HTTP method`);
    assert.ok(path.startsWith("/"), label);
    assert.equal(typeof op.operationId, "string", `${label} operationId`);
    assert.equal(ids.has(op.operationId), false, `${label}: operationId ${op.operationId} is unique`);
    ids.add(op.operationId);
    assert.equal(typeof op.summary, "string", `${label} summary`);
    assert.ok(op.responses && Object.keys(op.responses).some((c) => /^2\d\d$/.test(c)), `${label} has a 2xx response`);
    for (const code of Object.keys(op.responses)) assert.match(code, /^[1-5]\d\d$/, `${label}: ${code} is a status code`);
    const declared = new Set((op.parameters ?? []).filter((p: Json) => p.in === "path").map((p: Json) => p.name));
    const templated = [...path.matchAll(/\{([^}]+)\}/g)].map((m) => m[1]);
    assert.deepEqual([...declared].sort(), templated.sort(), `${label}: every {template} is a declared path parameter and vice versa`);
    for (const p of op.parameters ?? []) {
      assert.ok(["path", "header", "query", "cookie"].includes(p.in), label);
      if (p.in === "path") assert.equal(p.required, true, `${label}: path parameter ${p.name} is required`);
      assert.ok(p.schema, `${label}: parameter ${p.name} has a schema`);
    }
    if (op.requestBody) assert.ok(op.requestBody.content["application/json"].schema, `${label} request schema`);
    for (const [code, res] of Object.entries(op.responses as Json)) {
      const r = resolve(res as Json);
      assert.equal(typeof r.description, "string", `${label} ${code} description`);
    }
  }
});

test("D1: every $ref resolves, and every document component is used", () => {
  const text = JSON.stringify(doc);
  const refs = [...text.matchAll(/"\$ref":"(#[^"]+)"/g)].map((m) => m[1]!);
  assert.ok(refs.length > 20);
  for (const ref of refs) {
    let node: any = doc;
    for (const part of ref.slice(2).split("/")) node = node?.[part];
    assert.ok(node, `unresolved ${ref}`);
  }
  const used = new Set(refs);
  for (const group of ["schemas", "responses"] as const) {
    for (const name of Object.keys(doc.components[group])) assert.ok(used.has(`#/components/${group}/${name}`), `components.${group}.${name} is referenced`);
  }
});

// ---------------------------------------------------------------------------
// Routes: the document and the code agree, both directions
// ---------------------------------------------------------------------------

test("D1: every partner route in the partner, anonymous and chat code is documented, and nothing else is (no voice, no JWT routes)", () => {
  const key = (m: string, p: string) => `${m.toUpperCase()} ${p}`;
  const code = new Set<string>([
    ...CHAT_ROUTES.map((r) => key(r.method, r.path)),
    ...ANONYMOUS_ROUTES.map((r) => key(r.method, r.path)),
    key("GET", PARTNER_OPENAPI_PATH),
  ]);
  assert.equal(code.size, 7, "5 chat routes + the public turn + the openapi route");
  const documented = new Set(operations().map((o) => key(o.method, o.path)));
  assert.deepEqual([...documented].sort(), [...code].sort());
  for (const v of VOICE_ROUTES) assert.equal(documented.has(key(v.method, v.path)), false, `${v.path} (voice) arrives with pc-voice`);
  const jwtOnly = new Set(API_ROUTES.map((r) => key(r.method, r.path)));
  for (const d of documented) assert.equal(jwtOnly.has(d), false, `${d} belongs to the partner document, not the JWT one`);
  assert.equal(doc.paths["/v1/students/{studentId}/chat/threads/{threadId}/voice/sessions"], undefined);
  assert.equal(doc["x-voice"].status, "coming with pc-voice");
  assert.deepEqual(Object.keys(doc["x-voice"]).sort(), ["description", "status"], "no voice field is invented");
});

test("D1: the served route returns this document (GET), and refuses other methods", async () => {
  const req = (method: string): ApiRequest => ({ method, url: PARTNER_OPENAPI_PATH, headers: {}, remoteAddress: "203.0.113.9", readBody: async () => "" });
  const inner = async () => {
    throw new Error("the inner handler must not see the partner openapi route");
  };
  const h = withPartnerRoutes(inner as never, undefined);
  const res = await h(req("GET"));
  assert.equal(res.status, 200);
  assert.deepEqual(JSON.parse(res.body), JSON.parse(JSON.stringify(PARTNER_OPENAPI)));
  assert.equal((await h(req("POST"))).status, 405);
});

// ---------------------------------------------------------------------------
// Keys, headers, scope
// ---------------------------------------------------------------------------

test("D1: two security schemes, one per key kind; the page key is the X-VC-Key header, the server key is a bearer", () => {
  const sch = doc.components.securitySchemes as Json;
  assert.deepEqual(Object.keys(sch).sort(), ["pageKey", "serverKey"]);
  assert.equal(sch.pageKey.type, "apiKey");
  assert.equal(sch.pageKey.in, "header");
  assert.equal(String(sch.pageKey.name).toLowerCase(), PARTNER_KEY_HEADER);
  assert.match(sch.pageKey.description, /vck_pub_<partnerId>_<43 characters>/);
  assert.equal(sch.serverKey.type, "http");
  assert.equal(sch.serverKey.scheme, "bearer");
  assert.match(sch.serverKey.bearerFormat, /^vck_srv_/);
  assert.match(sch.serverKey.description, /never in a browser/);
  assert.deepEqual(doc.security, [], "no route is authenticated by default: each operation names its own scheme");
});

test("D1: scope rule: the page key opens only the public turn; the server key opens only the five student routes; the openapi route needs no key", () => {
  const pub = find("post", "/v1/public/chat/turns");
  assert.deepEqual(pub.security, [{ pageKey: [] }, {}], "page key optional (VC_PARTNER_KEY_REQUIRED decides), and never the server key");
  const openapi = find("get", PARTNER_OPENAPI_PATH);
  assert.deepEqual(openapi.security, []);
  const studentOps = operations().filter((o) => o.path.startsWith("/v1/students/"));
  assert.equal(studentOps.length, 5);
  for (const { method, path, op } of studentOps) assert.deepEqual(op.security, [{ serverKey: [] }], `${method} ${path}: server key only`);
  const onlyPage = operations().filter((o) => JSON.stringify(o.op.security ?? []).includes("pageKey"));
  assert.deepEqual(onlyPage.map((o) => o.path), ["/v1/public/chat/turns"]);
});

test("D1: every student route documents the three student headers exactly as the code reads them (age and consent optional, id required)", () => {
  for (const { method, path, op } of operations().filter((o) => o.path.startsWith("/v1/students/"))) {
    const headers = new Map<string, Json>((op.parameters as Json[]).filter((p) => p.in === "header").map((p) => [String(p.name).toLowerCase(), p]));
    assert.deepEqual([...headers.keys()].sort(), [GUARDIAN_CONSENT_HEADER, STUDENT_AGE_HEADER, STUDENT_ID_HEADER].sort(), `${method} ${path}`);
    assert.equal(headers.get(STUDENT_ID_HEADER)!.required, true);
    assert.equal(headers.get(STUDENT_AGE_HEADER)!.required, false);
    assert.equal(headers.get(GUARDIAN_CONSENT_HEADER)!.required, false);
    assert.match(headers.get(STUDENT_AGE_HEADER)!.description, /minor/);
    assert.deepEqual(headers.get(GUARDIAN_CONSENT_HEADER)!.schema.enum, ["true"]);
  }
  const pub = find("post", "/v1/public/chat/turns");
  assert.deepEqual((pub.parameters as Json[]).map((p) => p.name), ["Origin"]);
});

// ---------------------------------------------------------------------------
// Errors and limits
// ---------------------------------------------------------------------------

test("D1: the public turn and every student route document 400, 401, 429 (with a required Retry-After) and 5xx; student routes also 404", () => {
  for (const { method, path, op } of operations().filter((o) => o.path !== PARTNER_OPENAPI_PATH)) {
    const label = `${method.toUpperCase()} ${path}`;
    for (const code of ["400", "401", "429", "500", "503"]) assert.ok(op.responses[code], `${label} ${code}`);
    if (path.startsWith("/v1/students/")) assert.ok(op.responses["404"], `${label} 404`);
    const tooMany = resolve(op.responses["429"]);
    const ra = tooMany.headers["Retry-After"];
    assert.ok(ra, `${label}: 429 carries Retry-After`);
    assert.equal(ra.required, true);
    assert.equal(ra.schema.type, "integer");
    assert.ok(resolve(op.responses["401"]).headers["WWW-Authenticate"], `${label}: 401 carries WWW-Authenticate`);
  }
});

test("D1: error bodies: the public route's errors carry the static Tele-MANAS line (AnonymousError); student errors are {error}", () => {
  const pub = find("post", "/v1/public/chat/turns");
  for (const code of ["400", "401", "405", "413", "429", "500", "503"]) {
    assert.deepEqual(resolve(pub.responses[code]).content["application/json"].schema, { $ref: "#/components/schemas/AnonymousError" }, `public ${code}`);
  }
  const turn = find("post", "/v1/students/{studentId}/chat/threads/{threadId}/turns");
  assert.deepEqual(resolve(turn.responses["401"]).content["application/json"].schema, { $ref: "#/components/schemas/Error" });
  assert.deepEqual(resolve(turn.responses["413"]).content["application/json"].schema, { $ref: "#/components/schemas/AnonymousError" }, "a too-large turn carries the helpline (ISS-303)");
  assert.ok(turn.responses["409"], "turn_in_progress / turn_id_conflict");
  assert.deepEqual(schemas.AnonymousError.required, ["error", "helpline"]);
});

test("D1: published limits are the D-088 defaults in the code (anonymous 10/min per partner+client, student 30/min), 60 s windows", () => {
  assert.equal(S.DEFAULT_LIMITS.anonymousRequestsPerMinute, 10);
  assert.equal(S.DEFAULT_LIMITS.requestsPerMinute, 30);
  assert.equal(ANONYMOUS_WINDOW_MS, 60_000);
  assert.deepEqual(find("post", "/v1/public/chat/turns")["x-rate-limit"], { requests: S.DEFAULT_LIMITS.anonymousRequestsPerMinute, windowSeconds: 60, per: "partner + client", crisisExempt: true });
  for (const { op } of operations().filter((o) => o.path.startsWith("/v1/students/"))) {
    assert.deepEqual(op["x-rate-limit"], { requests: S.DEFAULT_LIMITS.requestsPerMinute, windowSeconds: 60, per: "partner + student" });
  }
  assert.match(doc.info.description, /10 anonymous turns per partner and client/);
  assert.match(doc.info.description, /30 student requests/);
  assert.match(doc.info.description, /within 60 seconds/, "rotate and revoke take effect within 60 s");
  assert.match(doc.info.description, /14416/);
});

// ---------------------------------------------------------------------------
// Schemas are the Zod schemas
// ---------------------------------------------------------------------------

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

test("D1: component schemas match the Zod shapes (names, required, strictness) and are the very objects of the student draft", () => {
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
  const draft = STUDENT_API_DRAFT.components.schemas as unknown as Json;
  for (const name of Object.keys(schemas).filter((n) => n !== "Error")) assert.equal(schemas[name], draft[name], `${name} is derived from the draft, not copied`);
  assert.deepEqual(schemas.Error, OPENAPI_DOCUMENT.components.schemas.Error);
  assert.deepEqual(Object.keys(schemas).sort(), ["AnonymousError", "AnonymousTurnRequest", "AnonymousTurnResponse", "Claim", "Error", "FactDecisionRequest", "ProfileFact", "ProfileResponse", "ProposedFact", "Source", "Thread", "ThreadCreated", "ThreadTurn", "TurnRequest", "TurnResponse"]);
});

test("D1: enums and bounds are the exact Zod values", () => {
  assert.deepEqual(schemas.Claim.properties.status.enum, ["verified", "attributed", "unverified"]);
  assert.deepEqual(schemas.Claim.properties.kind.enum, [...S.CLAIM_KINDS]);
  assert.deepEqual(schemas.TurnResponse.properties.state.enum, [...S.TURN_STATES]);
  assert.deepEqual(schemas.AnonymousTurnResponse.properties.state.enum, [...S.ANONYMOUS_STATES]);
  assert.deepEqual(schemas.Source.properties.kind.enum, [...S.SOURCE_KINDS]);
  assert.deepEqual(schemas.ProfileFact.properties.source.enum, [...S.PROFILE_FACT_SOURCES]);
  assert.deepEqual(schemas.FactDecisionRequest.properties.action.enum, [...S.FACT_DECISION_ACTIONS]);
  assert.deepEqual(schemas.ThreadTurn.properties.channel.enum, [...S.TURN_CHANNELS]);
  assert.equal(schemas.TurnRequest.properties.text.maxLength, S.MAX_TURN_TEXT_LENGTH);
  assert.equal(schemas.AnonymousTurnRequest.properties.text.maxLength, S.MAX_TURN_TEXT_LENGTH);
});

test("D1: the request/response schemas wired to each operation are the right ones", () => {
  const body = (op: Json) => op.requestBody.content["application/json"].schema;
  const okSchema = (op: Json, code: string) => resolve(op.responses[code]).content["application/json"].schema;
  assert.deepEqual(body(find("post", "/v1/public/chat/turns")), { $ref: "#/components/schemas/AnonymousTurnRequest" });
  assert.deepEqual(okSchema(find("post", "/v1/public/chat/turns"), "200"), { $ref: "#/components/schemas/AnonymousTurnResponse" });
  assert.deepEqual(okSchema(find("post", "/v1/students/{studentId}/chat/threads"), "201"), { $ref: "#/components/schemas/ThreadCreated" });
  assert.deepEqual(okSchema(find("get", "/v1/students/{studentId}/chat/threads/{threadId}"), "200"), { $ref: "#/components/schemas/Thread" });
  const turn = find("post", "/v1/students/{studentId}/chat/threads/{threadId}/turns");
  assert.deepEqual(body(turn), { $ref: "#/components/schemas/TurnRequest" });
  assert.deepEqual(okSchema(turn, "200"), { $ref: "#/components/schemas/TurnResponse" });
  assert.deepEqual(okSchema(find("get", "/v1/students/{studentId}/chat/profile"), "200"), { $ref: "#/components/schemas/ProfileResponse" });
  const decision = find("post", "/v1/students/{studentId}/chat/profile/facts/{factId}/decision");
  assert.deepEqual(body(decision), { $ref: "#/components/schemas/FactDecisionRequest" });
  assert.deepEqual(okSchema(decision, "200"), { $ref: "#/components/schemas/ProfileResponse" });
});

test("D1: no request body carries a tenant, student, partner or role (identity is the key and the headers)", () => {
  for (const name of ["TurnRequest", "AnonymousTurnRequest", "FactDecisionRequest"]) {
    const props = Object.keys(schemas[name].properties);
    for (const forbidden of ["tenant", "tenantId", "studentId", "partnerId", "counsellorId", "role", "key"]) assert.equal(props.includes(forbidden), false, `${name}.${forbidden}`);
  }
});
