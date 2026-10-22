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

import {
  ANONYMOUS_STATES,
  CLAIM_KINDS,
  CLAIM_STATUSES,
  DEFAULT_LIMITS,
  FACT_DECISION_ACTIONS,
  MAX_TURN_TEXT_LENGTH,
  PROFILE_FACT_SOURCES,
  SOURCE_KINDS,
  SYNTHETIC_STUDENT_ID_PREFIX,
  TURN_CHANNELS,
  TURN_STATES,
  VOICE_FLAG_REASONS,
} from "@vc/schemas";

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

/**
 * P1 U5a: the DRAFT student-facing contract (spec v8 scope items 1-4, 10-12). Deliberately NOT part of
 * OPENAPI_DOCUMENT: no route below is implemented or enabled, and the served document must keep matching
 * API_ROUTES exactly. It moves into the served document only when the routes exist AND the A20 go-live gate
 * (go-live-gate.ts) passes. Enum values come from @vc/schemas so they cannot drift; tests/student-openapi.test.ts
 * keeps property names, required lists and strictness in step with the Zod schemas.
 *
 * Identity is the JWT (student claim per the B21 student-JWT amendment, U0): no body carries a tenant or
 * student id. `POST /v1/public/chat/turns` is the anonymous exception to B21 (text only, search-only, no
 * persistence beyond a text-free counter). The voice WebSocket is described under `x-websocket`; audio frames
 * are binary PCM16 and are not JSON events.
 */
const factId = { name: "factId", in: "path", required: true, schema: ID } as const;
const threadId = { name: "threadId", in: "path", required: true, schema: ID } as const;
const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const str = (extra: object = {}) => ({ type: "string", ...extra });
const idStr = { type: "string", minLength: 1, maxLength: 128 } as const;
const dateTime = { type: "string", format: "date-time" } as const;

const studentErrors = { ...errors, "429": { $ref: "#/components/responses/TooManyRequests" } } as const;
const draftOp = (roles: readonly string[], op: object) => ({ "x-roles": roles, "x-enabled": false, ...op });

const eventId = { type: "string", minLength: 1, maxLength: 128 } as const;
const role = { enum: ["user", "assistant"] } as const;
const eventDoc = (required: string[], properties: Record<string, object>) => ({
  type: "object",
  additionalProperties: false,
  required: ["type", ...required],
  properties: { type: { type: "string" }, ...properties },
});

export const STUDENT_API_DRAFT = {
  openapi: "3.1.0",
  "x-status": "draft-not-enabled",
  "x-gate": "A20 go-live gate (apps/api/src/go-live-gate.ts): signed B13 amendment, G-PUBLISH, G-PROD, Nights mode; voice also A10",
  "x-syntheticStudentIdPrefix": SYNTHETIC_STUDENT_ID_PREFIX,
  info: {
    title: "Virtual Counsellor student API (draft, not enabled)",
    version: "0.0.1-draft",
    description:
      "Student-facing text chat, live voice, anonymous mode, profile and fact confirmation (P1, D-089). " +
      "Internal contract only until the A20 gate passes. Authenticated routes need a Pathlynks-issued student JWT.",
  },
  servers: [{ url: "/" }],
  security: [{ bearerAuth: [] }],
  components: {
    securitySchemes: { bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" } },
    responses: {
      ...OPENAPI_DOCUMENT.components.responses,
      TooManyRequests: {
        description: "Rate or voice-minute limit reached (limits are per tenant, defaults in LimitsConfig)",
        headers: { "Retry-After": { description: "Seconds until the next request is accepted", schema: { type: "integer", minimum: 1 } } },
        ...json({ $ref: "#/components/schemas/Error" }),
      },
    },
    schemas: {
      Error: OPENAPI_DOCUMENT.components.schemas.Error,
      Claim: {
        type: "object",
        additionalProperties: false,
        required: ["text", "kind", "sourceIds", "status"],
        description: "verified: source text supports it. attributed: source present, text not proven. unverified: shown flagged. verified and attributed need at least one sourceId.",
        properties: {
          text: str({ minLength: 1, maxLength: 2000 }),
          kind: { enum: [...CLAIM_KINDS] },
          sourceIds: { type: "array", maxItems: 20, items: str({ minLength: 1, maxLength: 256 }) },
          status: { enum: [...CLAIM_STATUSES] },
        },
      },
      Source: {
        type: "object",
        additionalProperties: false,
        required: ["id", "kind"],
        properties: {
          id: str({ minLength: 1, maxLength: 256 }),
          kind: { enum: [...SOURCE_KINDS] },
          title: str({ maxLength: 500 }),
          url: str({ maxLength: 2048, pattern: "^https://" }),
          stale: { type: "boolean" },
          dateUnknown: { type: "boolean" },
        },
      },
      ProfileFact: {
        type: "object",
        additionalProperties: false,
        required: ["key", "value", "source"],
        properties: {
          key: str({ minLength: 1, maxLength: 128 }),
          value: str({ minLength: 1, maxLength: 1000 }),
          source: { enum: [...PROFILE_FACT_SOURCES] },
        },
      },
      ProposedFact: {
        type: "object",
        additionalProperties: false,
        required: ["factId", "key", "value", "status"],
        properties: {
          factId: idStr,
          key: str({ minLength: 1, maxLength: 128 }),
          value: str({ minLength: 1, maxLength: 1000 }),
          status: { enum: ["proposed", "confirmed"] },
        },
      },
      ProfileResponse: {
        type: "object",
        additionalProperties: false,
        required: ["facts", "proposed"],
        properties: { facts: { type: "array", items: ref("ProfileFact") }, proposed: { type: "array", items: ref("ProposedFact") } },
      },
      FactDecisionRequest: {
        type: "object",
        additionalProperties: false,
        required: ["action"],
        properties: { action: { enum: [...FACT_DECISION_ACTIONS] }, value: str({ minLength: 1, maxLength: 1000, description: "Required for correct" }) },
      },
      TurnRequest: {
        type: "object",
        additionalProperties: false,
        required: ["text"],
        properties: {
          text: str({ minLength: 1, maxLength: MAX_TURN_TEXT_LENGTH }),
          clientTurnId: str({ minLength: 1, maxLength: 128, description: "Idempotency key: a retry returns the same turn" }),
        },
      },
      TurnResponse: {
        type: "object",
        additionalProperties: false,
        required: ["state", "claims", "sources", "profileFactsUsed"],
        properties: {
          turnId: idStr,
          state: { enum: [...TURN_STATES] },
          message: str({ maxLength: 8000 }),
          claims: { type: "array", items: ref("Claim") },
          sources: { type: "array", items: ref("Source") },
          profileFactsUsed: { type: "array", items: ref("ProfileFact") },
          rankingProfile: str({ minLength: 1, maxLength: 64 }),
        },
      },
      ThreadCreated: { type: "object", additionalProperties: false, required: ["threadId"], properties: { threadId: idStr } },
      ThreadTurn: {
        type: "object",
        additionalProperties: false,
        required: ["turnId", "role", "channel", "text", "at"],
        properties: {
          turnId: idStr,
          role,
          channel: { enum: [...TURN_CHANNELS] },
          text: str({ maxLength: 8000 }),
          at: dateTime,
          claims: { type: "array", items: ref("Claim") },
          sources: { type: "array", items: ref("Source") },
        },
      },
      Thread: {
        type: "object",
        additionalProperties: false,
        required: ["threadId", "turns"],
        description: "One history of text and voice turns in order",
        properties: {
          threadId: idStr,
          turns: { type: "array", items: ref("ThreadTurn") },
          textStored: { type: "boolean", description: "false when a turn was answered without storing its text (under-18 student with no guardian-consent signal; D-093 4A); such turns have empty text" },
        },
      },
      AnonymousTurnRequest: {
        type: "object",
        additionalProperties: false,
        required: ["text"],
        properties: { text: str({ minLength: 1, maxLength: MAX_TURN_TEXT_LENGTH }) },
      },
      AnonymousError: {
        type: "object",
        additionalProperties: false,
        required: ["error", "helpline"],
        description: "Every non-200 answer from the anonymous route carries the static Tele-MANAS line, so a refusal never leaves a student in distress without it.",
        properties: { error: { type: "string" }, helpline: { type: "string" } },
      },
      AnonymousTurnResponse: {
        type: "object",
        additionalProperties: false,
        required: ["state", "claims", "sources"],
        properties: {
          state: { enum: [...ANONYMOUS_STATES] },
          message: str({ maxLength: 8000 }),
          claims: { type: "array", items: ref("Claim") },
          sources: { type: "array", items: ref("Source") },
        },
      },
      AudioFormat: {
        type: "object",
        additionalProperties: false,
        required: ["format", "inputSampleRateHz", "outputSampleRateHz"],
        properties: { format: { const: "pcm16" }, inputSampleRateHz: { const: 16000 }, outputSampleRateHz: { const: 24000 } },
      },
      LimitsConfig: {
        type: "object",
        additionalProperties: false,
        description: "Per-tenant configurable; the defaults are the D-088 numbers",
        default: DEFAULT_LIMITS,
        required: ["requestsPerMinute", "anonymousRequestsPerMinute", "voiceMinutesPerMonth", "voiceSessionMaxMinutes", "crisisMaxAudioMsAfterTrigger", "audio"],
        properties: {
          requestsPerMinute: { type: "integer", minimum: 1 },
          anonymousRequestsPerMinute: { type: "integer", minimum: 1 },
          voiceMinutesPerMonth: { type: "integer", minimum: 1 },
          voiceSessionMaxMinutes: { type: "integer", minimum: 1 },
          crisisMaxAudioMsAfterTrigger: { type: "integer", minimum: 1 },
          audio: ref("AudioFormat"),
        },
      },
      VoiceSessionResponse: {
        type: "object",
        additionalProperties: false,
        required: ["token", "wsUrl", "expiresAt", "sessionMaxMinutes", "audio"],
        properties: {
          token: str({ minLength: 1, maxLength: 4096 }),
          wsUrl: str({ pattern: "^wss?://\\S+$" }),
          expiresAt: dateTime,
          sessionMaxMinutes: { type: "integer", minimum: 1 },
          audio: ref("AudioFormat"),
        },
      },
      VoiceFlagReason: { enum: [...VOICE_FLAG_REASONS] },
    },
  },
  "x-websocket": {
    description:
      "Connect to wsUrl with the voice-session token. Client sends JSON control messages and binary PCM16 frames; server sends JSON events " +
      "and binary PCM16 frames. Every server event has an eventId; reconnect with start.lastEventId to resume. Spoken output is audited after the fact (A9b), not enforced pre-send.",
    audio: { format: "pcm16", inputSampleRateHz: 16000, outputSampleRateHz: 24000, framing: "binary" },
    clientEvents: {
      start: eventDoc(["threadId"], { threadId: idStr, lastEventId: eventId }),
      interrupt: eventDoc([], {}),
      end: eventDoc([], {}),
      confirm: eventDoc(["key", "accepted"], { key: str({ minLength: 1, maxLength: 128 }), accepted: { type: "boolean" } }),
    },
    serverEvents: {
      "transcript.partial": eventDoc(["eventId", "role", "text"], { eventId, role, text: str({ maxLength: 8000 }) }),
      "transcript.final": eventDoc(["eventId", "role", "text"], { eventId, role, text: str({ maxLength: 8000 }), turnId: idStr }),
      "answer.sources": eventDoc(["eventId", "sources", "claims"], {
        eventId,
        sources: { type: "array", items: ref("Source") },
        claims: { type: "array", items: ref("Claim") },
      }),
      state: eventDoc(["eventId", "state"], { eventId, state: { enum: [...TURN_STATES] } }),
      flag: eventDoc(["eventId", "reason"], { eventId, reason: ref("VoiceFlagReason"), detail: str({ maxLength: 500 }) }),
      confirm: eventDoc(["eventId", "fact"], {
        eventId,
        fact: {
          type: "object",
          additionalProperties: false,
          required: ["key", "value"],
          properties: { key: str({ minLength: 1, maxLength: 128 }), value: str({ minLength: 1, maxLength: 1000 }) },
        },
      }),
      error: eventDoc(["eventId", "code", "message"], { eventId, code: str({ minLength: 1, maxLength: 64 }), message: str({ maxLength: 500 }) }),
    },
  },
  paths: {
    "/v1/students/{studentId}/chat/threads": {
      post: draftOp(["student"], {
        operationId: "createChatThread",
        summary: "Start a thread for the authenticated student (the JWT student must equal studentId)",
        parameters: [studentId],
        responses: { "201": ok("The new thread", ref("ThreadCreated")), ...studentErrors },
      }),
    },
    "/v1/students/{studentId}/chat/threads/{threadId}": {
      get: draftOp(["student"], {
        operationId: "getChatThread",
        summary: "One history of text and voice turns, in order",
        parameters: [studentId, threadId],
        responses: { "200": ok("The thread", ref("Thread")), ...studentErrors },
      }),
    },
    "/v1/students/{studentId}/chat/threads/{threadId}/turns": {
      post: draftOp(["student"], {
        operationId: "postChatTurn",
        summary: "Send a text turn; idempotent on clientTurnId. Sourced answers come from the knowledge base; with no servable source the state is no_sourced_answer (no claims) and the message is a short disclaimer plus general expert guidance (with VC_GROUNDING=gemini, an answer grounded in Google Search whose links come back as sources of kind web, never inside the message), or the fixed refusal text if the model chain fails",
        parameters: [studentId, threadId],
        requestBody: { required: true, ...json(ref("TurnRequest")) },
        responses: { "200": ok("The answer", ref("TurnResponse")), ...studentErrors, "413": { description: "Body larger than 64 KiB (never scanned; carries the static Tele-MANAS line)", ...json(ref("AnonymousError")) } },
      }),
    },
    "/v1/students/{studentId}/chat/threads/{threadId}/voice/sessions": {
      post: draftOp(["student"], {
        operationId: "createVoiceSession",
        summary: "Open a live voice session; returns a short-lived token and the WebSocket URL (see x-websocket). Disabled until A10 passes",
        parameters: [studentId, threadId],
        responses: { "201": ok("The voice session", ref("VoiceSessionResponse")), ...studentErrors },
      }),
    },
    "/v1/students/{studentId}/chat/profile": {
      get: draftOp(["student"], {
        operationId: "getChatProfile",
        summary: "Facts in use (Pathlynks-supplied or student-confirmed) and chat-extracted facts proposed for confirmation",
        parameters: [studentId],
        responses: { "200": ok("The profile", ref("ProfileResponse")), ...studentErrors },
      }),
    },
    "/v1/students/{studentId}/chat/profile/facts/{factId}/decision": {
      post: draftOp(["student"], {
        operationId: "decideProfileFact",
        summary: "Confirm, correct or erase a proposed or stored fact; an unconfirmed chat-extracted fact is never used",
        parameters: [studentId, factId],
        requestBody: { required: true, ...json(ref("FactDecisionRequest")) },
        responses: { "200": ok("The updated profile", ref("ProfileResponse")), ...studentErrors },
      }),
    },
    "/v1/public/chat/turns": {
      post: draftOp([], {
        operationId: "postAnonymousTurn",
        summary:
          "Anonymous text turn (B21 exception): generic knowledge-base questions only; personal or ambiguous questions return sign_in_required; crisis returns the fixed message with Tele-MANAS. Nothing is stored except a text-free daily counter",
        security: [],
        requestBody: { required: true, ...json(ref("AnonymousTurnRequest")) },
        responses: {
          "200": ok("The answer", ref("AnonymousTurnResponse")),
          "400": { description: "Malformed body, unknown field or over-long text", ...json(ref("AnonymousError")) },
          "405": { description: "Only POST is served", headers: { Allow: { schema: { type: "string" } } }, ...json(ref("AnonymousError")) },
          "413": { description: "Body larger than 64 KiB", ...json(ref("AnonymousError")) },
          "429": { description: "More than the anonymous requests-per-minute limit from this client (crisis messages are never limited)", headers: { "Retry-After": { schema: { type: "integer", minimum: 1 } } }, ...json(ref("AnonymousError")) },
          "500": { description: "Unexpected failure; the body never carries the cause", ...json(ref("AnonymousError")) },
        },
      }),
    },
  },
} as const;

/**
 * pc-docs-openapi D1 (D-111; K5 serves it at GET /v1/partner/openapi.json): the OpenAPI 3.1 document for the PARTNER routes: the public chat turn (page key),
 * the student chat routes (server key + student headers) and this document itself. Voice sessions are not described: they arrive with pc-voice.
 *
 * Schemas are NOT copied: each one is the very object STUDENT_API_DRAFT already keeps in step with the Zod schemas of @vc/schemas, so the two documents cannot
 * diverge, and apps/api/tests/partner-openapi.test.ts re-checks every one against Zod. What is written here is only what the draft does not say: the two key kinds,
 * the headers, the errors the partner routes really return, and the limits (the D-088 defaults, checked against DEFAULT_LIMITS in the test).
 *
 * The auth facts (partners.ts, anonymous.ts, chat.ts): a PAGE key `vck_pub_<partnerId>_<43>` opens only POST /v1/public/chat/turns (header X-VC-Key; from a browser the
 * Origin must be one of the partner's allowed origins); a SERVER key `vck_srv_<partnerId>_<43>` opens only the student chat routes (Authorization: Bearer, plus the
 * X-VC-Student-* headers; never CORS, never in a browser). A key of the wrong scope, a malformed, unknown, revoked or rotated-out key, or a page key from a foreign
 * origin is one uniform 401. A rotate or revoke reaches a running server within 60 s.
 */
const PD = STUDENT_API_DRAFT.components.schemas;
const PARTNER_SCHEMA_NAMES = [
  "Claim",
  "Source",
  "ProfileFact",
  "ProposedFact",
  "ProfileResponse",
  "FactDecisionRequest",
  "TurnRequest",
  "TurnResponse",
  "ThreadCreated",
  "ThreadTurn",
  "Thread",
  "AnonymousTurnRequest",
  "AnonymousTurnResponse",
  "AnonymousError",
] as const;
const partnerSchemas = Object.fromEntries(PARTNER_SCHEMA_NAMES.map((n) => [n, PD[n]])) as { [K in (typeof PARTNER_SCHEMA_NAMES)[number]]: (typeof PD)[K] };

const hdrParam = (name: string, required: boolean, schema: object, description: string) => ({ name, in: "header", required, schema, description });
const originParam = hdrParam(
  "Origin",
  false,
  { type: "string" },
  "Sent by every browser. With a page key it must be one of the partner's allowed origins (otherwise 401). A call with no Origin header (a script, curl) is not a browser and is not origin-checked.",
);
const studentHeaders = [
  hdrParam("X-VC-Student-Id", true, { type: "string", pattern: ID.pattern }, "The student, as your backend knows them. Must equal the {studentId} in the path, otherwise 404. Missing or invalid: 400."),
  hdrParam("X-VC-Student-Age", false, { type: "integer", minimum: 0, maximum: 120 }, "Whole years. Missing or invalid means the student is treated as a minor (fail closed)."),
  hdrParam("X-VC-Guardian-Consent", false, { type: "string", enum: ["true"] }, "Only the exact value `true` counts as guardian consent; anything else is no consent. A minor without consent has no text stored."),
] as const;

const retryAfter = { description: "Seconds until the next request is accepted", schema: { type: "integer", minimum: 1 }, required: true } as const;
const wwwAuth = { description: 'Always `Bearer realm="vc-api"`', schema: { type: "string" } } as const;
const errorRes = (description: string, schema: "Error" | "AnonymousError", headers?: object) => ({ description, ...(headers ? { headers } : {}), ...json(ref(schema)) });

const partnerResponses = {
  StudentBadRequest: errorRes("Invalid path id, body or X-VC-Student-Id (`invalid_request`)", "Error"),
  StudentUnauthorized: errorRes("One identical answer for a missing bearer, a malformed, unknown, revoked or rotated-out key, or a PAGE key (wrong scope)", "Error", { "WWW-Authenticate": wwwAuth }),
  StudentNotFound: errorRes("No such thread or fact for this student of this partner, or X-VC-Student-Id is not the {studentId} of the path. A partner can never see another partner's students", "Error"),
  StudentConflict: errorRes("`turn_in_progress` (retry after 2 s), `turn_id_conflict`, `student_fenced` or `conflict`", "Error"),
  StudentTooLarge: errorRes("Body larger than 64 KiB (never scanned; carries the static Tele-MANAS line)", "AnonymousError"),
  StudentTooMany: errorRes("More than 30 requests a minute for this partner's student (the D-088 default)", "Error", { "Retry-After": retryAfter }),
  StudentUnavailable: errorRes("`partner_registry_unavailable`, `profile_unavailable` or `writer_deadline`: nothing was changed, retry", "Error"),
  StudentInternal: errorRes("Unexpected failure; the body never carries the cause", "Error"),
  PublicBadRequest: errorRes("Malformed JSON, an unknown field, a missing `text`, or over-long text (`invalid_request`)", "AnonymousError"),
  PublicUnauthorized: errorRes(
    "One identical answer for a malformed, blank, repeated, unknown, revoked or rotated-out key, a SERVER key (wrong scope), a page key sent from an Origin that is not the partner's, or no key when the server requires one. Carries the static Tele-MANAS line",
    "AnonymousError",
    { "WWW-Authenticate": wwwAuth },
  ),
  PublicMethod: errorRes("Only POST is served", "AnonymousError", { Allow: { schema: { type: "string" } } }),
  PublicTooLarge: errorRes("Body larger than 64 KiB", "AnonymousError"),
  PublicTooMany: errorRes("More than 10 requests a minute from this client for this partner (the D-088 default). A crisis message is never limited", "AnonymousError", { "Retry-After": retryAfter }),
  PublicUnavailable: errorRes("`partner_registry_unavailable`: the key store could not be read (fail closed)", "AnonymousError"),
  PublicInternal: errorRes("Unexpected failure; the body never carries the cause", "AnonymousError"),
} as const;
const pr = (name: keyof typeof partnerResponses) => ({ $ref: `#/components/responses/${name}` });

const studentCommon = {
  "400": pr("StudentBadRequest"),
  "401": pr("StudentUnauthorized"),
  "404": pr("StudentNotFound"),
  "409": pr("StudentConflict"),
  "429": pr("StudentTooMany"),
  "500": pr("StudentInternal"),
  "503": pr("StudentUnavailable"),
} as const;
const studentOp = (op: object) => ({ security: [{ serverKey: [] }], "x-rate-limit": { requests: DEFAULT_LIMITS.requestsPerMinute, windowSeconds: 60, per: "partner + student" }, ...op });

export const PARTNER_OPENAPI = {
  openapi: "3.1.0",
  info: {
    title: "Virtual Counsellor partner API",
    version: "1.0.0",
    description:
      "Chat with the Virtual Counsellor from your own site or backend. Every partner has two keys. " +
      "The PAGE key (`vck_pub_<partnerId>_<43 characters>`) may sit in public HTML: it opens only POST /v1/public/chat/turns, sent as the X-VC-Key header, and from a browser only for the partner's own origins. " +
      "The SERVER key (`vck_srv_<partnerId>_<43 characters>`) stays on your backend, never in a browser: it opens only the student chat routes, sent as `Authorization: Bearer`, together with the X-VC-Student-Id, X-VC-Student-Age and X-VC-Guardian-Consent headers (a missing age means a minor). " +
      "A key used on the wrong route, a malformed, unknown, revoked or rotated-out key, and a page key from a foreign origin all get the same 401. " +
      "A rotate or revoke takes effect within 60 seconds. Limits (per minute, with a Retry-After on 429): 10 anonymous turns per partner and client, 30 student requests per partner's student. " +
      "A crisis message always gets the fixed crisis answer (state `escalated`) with Tele-MANAS 14416 (112 in immediate danger), and is never rate limited on the anonymous route.",
  },
  servers: [{ url: "/" }],
  "x-voice": { status: "coming with pc-voice", description: "Voice sessions for partner keys are not part of this document yet; their routes and fields will be added when pc-voice ships." },
  security: [],
  components: {
    securitySchemes: {
      pageKey: {
        type: "apiKey",
        in: "header",
        name: "X-VC-Key",
        description: "The PAGE key, `vck_pub_<partnerId>_<43 characters>`. Public by design; works only on POST /v1/public/chat/turns and, from a browser, only from the partner's allowed origins.",
      },
      serverKey: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "vck_srv_<partnerId>_<43 characters>",
        description: "The SERVER key, sent as `Authorization: Bearer vck_srv_...`. Secret: keep it on your backend, never in a browser (it gets no CORS headers). Works only on the student chat routes, which also need the X-VC-Student-* headers. The tenant is your partner id.",
      },
    },
    responses: partnerResponses,
    schemas: { Error: OPENAPI_DOCUMENT.components.schemas.Error, ...partnerSchemas },
  },
  paths: {
    "/v1/partner/openapi.json": {
      get: {
        operationId: "getPartnerOpenApi",
        summary: "This document. No key needed; CORS is granted to a partner's page key from its allowed origins",
        security: [],
        responses: {
          "200": ok("The OpenAPI 3.1 document"),
          "405": { description: "Only GET and OPTIONS are served", headers: { Allow: { schema: { type: "string" } } }, ...json({ type: "object", properties: { error: { type: "string" } } }) },
        },
      },
    },
    "/v1/public/chat/turns": {
      post: {
        operationId: "postPartnerPublicTurn",
        summary:
          "Anonymous text turn from a web page (page key). Generic knowledge-base questions only; personal or ambiguous questions return `sign_in_required`; a crisis returns the fixed message with Tele-MANAS. Nothing is stored except a text-free daily counter",
        description:
          "Send X-VC-Key with the PAGE key. Without a key the route still answers unless the server runs with VC_PARTNER_KEY_REQUIRED=true (then 401). With a key, the limit is per partner and client and your partner id is counted in usage (never the text). A browser needs the Origin to be in the partner's allowed list; the answer then carries Access-Control-Allow-Origin for exactly that origin (never `*`) and exposes Retry-After.",
        security: [{ pageKey: [] }, {}],
        "x-rate-limit": { requests: DEFAULT_LIMITS.anonymousRequestsPerMinute, windowSeconds: 60, per: "partner + client", crisisExempt: true },
        parameters: [originParam],
        requestBody: { required: true, ...json(ref("AnonymousTurnRequest")) },
        responses: {
          "200": ok("The answer", ref("AnonymousTurnResponse")),
          "400": pr("PublicBadRequest"),
          "401": pr("PublicUnauthorized"),
          "405": pr("PublicMethod"),
          "413": pr("PublicTooLarge"),
          "429": pr("PublicTooMany"),
          "500": pr("PublicInternal"),
          "503": pr("PublicUnavailable"),
        },
      },
    },
    "/v1/students/{studentId}/chat/threads": {
      post: studentOp({
        operationId: "createPartnerChatThread",
        summary: "Start a thread for one of your students (server key)",
        parameters: [studentId, ...studentHeaders],
        responses: { "201": ok("The new thread", ref("ThreadCreated")), ...studentCommon },
      }),
    },
    "/v1/students/{studentId}/chat/threads/{threadId}": {
      get: studentOp({
        operationId: "getPartnerChatThread",
        summary: "One history of turns, in order",
        parameters: [studentId, threadId, ...studentHeaders],
        responses: { "200": ok("The thread", ref("Thread")), ...studentCommon },
      }),
    },
    "/v1/students/{studentId}/chat/threads/{threadId}/turns": {
      post: studentOp({
        operationId: "postPartnerChatTurn",
        summary:
          "Send a text turn; idempotent on clientTurnId. The answer is personalised to the student's profile. A crisis returns state `escalated` with the fixed crisis message and Tele-MANAS 14416 (112 in immediate danger)",
        parameters: [studentId, threadId, ...studentHeaders],
        requestBody: { required: true, ...json(ref("TurnRequest")) },
        responses: { "200": ok("The answer", ref("TurnResponse")), ...studentCommon, "413": pr("StudentTooLarge") },
      }),
    },
    "/v1/students/{studentId}/chat/profile": {
      get: studentOp({
        operationId: "getPartnerChatProfile",
        summary: "Facts in use (supplied by your backend or confirmed by the student) and chat-extracted facts proposed for confirmation",
        parameters: [studentId, ...studentHeaders],
        responses: { "200": ok("The profile", ref("ProfileResponse")), ...studentCommon },
      }),
    },
    "/v1/students/{studentId}/chat/profile/facts/{factId}/decision": {
      post: studentOp({
        operationId: "decidePartnerProfileFact",
        summary: "Confirm, correct or erase a proposed or stored fact; an unconfirmed chat-extracted fact is never used",
        parameters: [studentId, factId, ...studentHeaders],
        requestBody: { required: true, ...json(ref("FactDecisionRequest")) },
        responses: { "200": ok("The updated profile", ref("ProfileResponse")), ...studentCommon, "413": errorRes("Body larger than 64 KiB", "Error") },
      }),
    },
  },
} as const;
