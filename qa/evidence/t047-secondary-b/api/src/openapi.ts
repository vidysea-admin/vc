/**
 * T-025 (B21): the static OpenAPI 3.1 document for the VC API, served at GET /v1/openapi.json.
 *
 * Static on purpose (a reviewer reads the contract here, not in handler code). It cannot drift from
 * the route table silently: apps/api/tests/server.test.ts compares every (method, path, x-roles)
 * here with API_ROUTES in server.ts, in both directions.
 *
 * Every route except this document itself needs `Authorization: Bearer <JWT>` (see auth.ts). The
 * tenant comes from the token's `tenant` claim, never from the path, the query or the body.
 */

const ID = { type: "string", pattern: "^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$" } as const;
const REQUEST_ID = { type: "string", pattern: "^[0-9a-f]{24}$" } as const;

const studentId = { name: "studentId", in: "path", required: true, schema: ID } as const;
const sessionId = { name: "sessionId", in: "path", required: true, schema: ID } as const;
const requestId = { name: "requestId", in: "path", required: true, schema: REQUEST_ID } as const;

const errors = {
  "400": { $ref: "#/components/responses/BadRequest" },
  "401": { $ref: "#/components/responses/Unauthorized" },
  "403": { $ref: "#/components/responses/Forbidden" },
  "404": { $ref: "#/components/responses/NotFound" },
  "409": { $ref: "#/components/responses/Conflict" },
} as const;

const json = (schema: object) => ({ content: { "application/json": { schema } } });
const ok = (description: string, schema: object = { type: "object" }) => ({ description, ...json(schema) });

export const OPENAPI_DOCUMENT = {
  openapi: "3.1.0",
  info: {
    title: "Virtual Counsellor API",
    version: "0.1.0",
    description:
      "Counsellor-facing API over the VC engine (contract B21, D-021). Every request carries a JWT " +
      "issued by the client backend; its `tenant` claim scopes every read and write.",
  },
  servers: [{ url: "/" }],
  security: [{ bearerAuth: [] }],
  components: {
    securitySchemes: {
      bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
    },
    schemas: {
      Error: {
        type: "object",
        required: ["error"],
        properties: { error: { type: "string" }, issues: { type: "array", items: { type: "object" } } },
      },
      ScribeOutcome: {
        type: "object",
        required: ["kind"],
        properties: {
          kind: { enum: ["awaiting_approval", "done", "already_resolved", "fenced", "in_progress"] },
          result: { oneOf: [
            { type: "object", required: ["status", "reason"], properties: { status: { const: "refused" }, reason: { type: "string" } } },
            { type: "object", required: ["status", "escalation"], properties: {
              status: { const: "escalated" }, escalation: { oneOf: [
                { type: "object", additionalProperties: false,
                  required: ["type", "level", "reason", "studentId", "sessionId", "turnIds", "flaggedAt", "channel", "status"],
                  properties: { type: { const: "guard_only" }, level: { const: "crisis" }, reason: { const: "guard_crisis" },
                    studentId: { type: "string", minLength: 1 }, sessionId: { type: "string", minLength: 1 },
                    turnIds: { type: "array", minItems: 1, uniqueItems: true, items: { type: "string", minLength: 1 } },
                    flaggedAt: { type: "string", format: "date-time" }, channel: { const: "record_only" }, status: { const: "queued" } },
                },
                { type: "object", required: ["type", "level", "message", "matched", "turnId"],
                  properties: { type: { const: "escalation" }, level: { enum: ["concern", "crisis"] },
                    message: { type: "string" }, matched: { type: "array", items: { type: "string" } }, turnId: { type: "string" } } },
              ] },
            } },
            { type: "object", required: ["status"], properties: { status: { enum: ["rejected", "written", "conflict", "partial_conflict", "extraction_failed", "summary_failed"] } } },
          ] },
        },
      },
    },
    responses: {
      BadRequest: { description: "Invalid path id, query or body", ...json({ $ref: "#/components/schemas/Error" }) },
      Unauthorized: {
        description: "Missing or invalid bearer token (one identical response for every cause)",
        ...json({ $ref: "#/components/schemas/Error" }),
      },
      Forbidden: { description: "The token's role may not call this route, or consent is missing", ...json({ $ref: "#/components/schemas/Error" }) },
      NotFound: { description: "Nothing with this id in the caller's tenant", ...json({ $ref: "#/components/schemas/Error" }) },
      Conflict: { description: "The request conflicts with the current state", ...json({ $ref: "#/components/schemas/Error" }) },
    },
  },
  paths: {
    "/v1/openapi.json": {
      get: {
        operationId: "getOpenApi",
        summary: "This document",
        security: [],
        "x-roles": [],
        responses: { "200": ok("The OpenAPI document") },
      },
    },
    "/v1/students/{studentId}/sessions/{sessionId}/scribe": {
      post: {
        operationId: "startScribe",
        summary: "Run the post-session scribe; consented sessions pause for approval, absent consent refuses or returns minimal guard-only crisis records (record_only, not delivered)",
        "x-roles": ["counsellor", "admin"],
        parameters: [studentId, sessionId],
        requestBody: {
          required: true,
          ...json({
            type: "object",
            required: ["sessionEndedAt", "turns"],
            additionalProperties: false,
            properties: { sessionEndedAt: { type: "string", format: "date-time" }, turns: { type: "array", minItems: 1 } },
          }),
        },
        responses: { "200": ok("The scribe outcome", { $ref: "#/components/schemas/ScribeOutcome" }), ...errors },
      },
    },
    "/v1/students/{studentId}/sessions/{sessionId}/scribe/resume": {
      post: {
        operationId: "resumeScribe",
        summary: "Recover an interrupted scribe run (no new decision)",
        "x-roles": ["counsellor", "admin"],
        parameters: [studentId, sessionId],
        responses: { "200": ok("The scribe outcome", { $ref: "#/components/schemas/ScribeOutcome" }), ...errors },
      },
    },
    "/v1/students/{studentId}/sessions/{sessionId}/approval": {
      get: {
        operationId: "getApproval",
        summary: "The pending approval diff, or the recorded decision",
        "x-roles": ["counsellor", "admin"],
        parameters: [studentId, sessionId],
        responses: { "200": ok("The scribe inspection"), ...errors },
      },
      post: {
        operationId: "decideApproval",
        summary: "Record the counsellor's decision on the proposed facts",
        "x-roles": ["counsellor", "admin"],
        parameters: [studentId, sessionId],
        requestBody: {
          required: true,
          ...json({
            type: "object",
            required: ["action"],
            properties: { action: { enum: ["approve", "edit", "reject", "per_fact"] } },
          }),
        },
        responses: { "200": ok("The scribe outcome", { $ref: "#/components/schemas/ScribeOutcome" }), ...errors },
      },
    },
    "/v1/students/{studentId}/sessions/{sessionId}/transcript": {
      get: {
        operationId: "getTranscript",
        summary: "The stored session transcript",
        "x-roles": ["counsellor", "admin"],
        parameters: [studentId, sessionId],
        responses: { "200": ok("The transcript turns"), ...errors },
      },
    },
    "/v1/students/{studentId}/profile": {
      get: {
        operationId: "getProfile",
        summary: "The student's active facts for one consented purpose",
        "x-roles": ["counsellor", "admin"],
        parameters: [
          studentId,
          { name: "purpose", in: "query", required: true, schema: { type: "string", pattern: "^[a-z][a-z_]{0,63}$" } },
        ],
        responses: { "200": ok("The active facts, sorted by key"), ...errors },
      },
    },
    "/v1/students/{studentId}/erasure-requests": {
      post: {
        operationId: "requestErasure",
        summary: "Open an erasure request (then: confirm, reconfirm with the token, approver approves)",
        "x-roles": ["counsellor", "admin"],
        parameters: [studentId],
        requestBody: {
          required: true,
          ...json({
            type: "object",
            required: ["reason"],
            additionalProperties: false,
            properties: { reason: { enum: ["student_request", "guardian_request", "account_closure", "legal_order"] } },
          }),
        },
        responses: { "201": ok("The new request id", { type: "object", properties: { requestId: REQUEST_ID } }), ...errors },
      },
    },
    "/v1/erasure-requests/{requestId}/confirm": {
      post: {
        operationId: "confirmErasure",
        summary:
          "First confirmation (T-029 step 1): fences the student, deletes nothing, returns a single-use token for the second confirmation",
        "x-roles": ["counsellor", "admin"],
        parameters: [requestId],
        responses: {
          "200": ok("Confirmed once", {
            type: "object",
            properties: {
              requestId: REQUEST_ID,
              status: { const: "confirmed" },
              confirmToken: { type: "string" },
              confirmTokenExpiresAt: { type: "string", format: "date-time" },
            },
          }),
          ...errors,
        },
      },
    },
    "/v1/erasure-requests/{requestId}/reconfirm": {
      post: {
        operationId: "reconfirmErasure",
        summary:
          "Second confirmation (T-029 step 2) by the same counsellor with the token: queues the approval request in the email outbox (202, nothing deleted), or under autoDelete runs the erasure (200)",
        "x-roles": ["counsellor", "admin"],
        parameters: [requestId],
        requestBody: {
          required: true,
          ...json({
            type: "object",
            required: ["confirmToken"],
            additionalProperties: false,
            properties: { confirmToken: { type: "string", minLength: 1, maxLength: 256 } },
          }),
        },
        responses: {
          "200": ok("autoDelete: the erasure outcome (counts-only receipt)"),
          "202": ok("Waiting for the approver", {
            type: "object",
            properties: { requestId: REQUEST_ID, status: { const: "awaiting_approval" }, approvalExpiresAt: { type: "string", format: "date-time" } },
          }),
          "410": ok("The confirm token expired; the request is closed and nothing was deleted", { $ref: "#/components/schemas/Error" }),
          "503": ok("The erasure workflow is not configured (VC_AUDIT_HMAC_KEY / VC_ERASURE_APPROVER_EMAIL)", { $ref: "#/components/schemas/Error" }),
          ...errors,
        },
      },
    },
    "/v1/erasure-requests/{requestId}/approve": {
      post: {
        operationId: "approveErasure",
        summary: "The approver approves a double-confirmed request (never the requester or confirmer); the erasure runs and returns its receipt",
        "x-roles": ["approver"],
        parameters: [requestId],
        responses: {
          "200": ok("The erasure outcome"),
          "410": ok("The approval request expired; nothing was deleted", { $ref: "#/components/schemas/Error" }),
          ...errors,
        },
      },
    },
    "/v1/erasure-requests/{requestId}/reject": {
      post: {
        operationId: "rejectErasure",
        summary: "The approver rejects a double-confirmed request; nothing is deleted and the write fence is released",
        "x-roles": ["approver"],
        parameters: [requestId],
        responses: { "200": ok("Rejected", { type: "object", properties: { requestId: REQUEST_ID, status: { const: "rejected" } } }), ...errors },
      },
    },
    "/v1/erasure-requests/{requestId}/execute": {
      post: {
        operationId: "executeErasure",
        summary: "Retry an approved erasure whose purge failed; returns the counts-only receipt (refuses anything not double-confirmed and approved)",
        "x-roles": ["admin"],
        parameters: [requestId],
        responses: { "200": ok("The erasure outcome"), ...errors },
      },
    },
    "/v1/students/{studentId}/export": {
      get: {
        operationId: "exportStudent",
        summary: "Everything VC holds on the student (data-principal access)",
        "x-roles": ["admin"],
        parameters: [studentId],
        responses: { "200": ok("The student export, including projected escalations and crisisReviews in deterministic record order; excludes Mongo IDs, staff recipient/acknowledger identities, provider/debug and write-ownership fields"), ...errors },
      },
    },
  },
} as const;
