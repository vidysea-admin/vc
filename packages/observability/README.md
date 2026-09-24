# @vc/observability

Self-hosted Langfuse tracing config + LangChain callback adapter + OTel span export (T-004,
D-004, ARCHITECTURE.md H4/§5, `agentic-architecture-standard.md` rule 5). Three pure,
independently testable pieces:

- `loadTracingConfig(env)` → `{ enabled, baseUrl?, publicKey?, secretKey? }`. Reads
  `LANGFUSE_BASE_URL` (or the legacy `LANGFUSE_HOST` alias) / `LANGFUSE_PUBLIC_KEY` /
  `LANGFUSE_SECRET_KEY` from whatever env-like object you pass it (call with `process.env`).
  **Throws, unconditionally, if the base URL resolves to a Langfuse Cloud host** (any region —
  `cloud.langfuse.com`, `us.cloud.langfuse.com`, `eu.cloud.langfuse.com`, `jp.cloud.langfuse.com`,
  `hipaa.cloud.langfuse.com` — plus a catch-all for the bare apex `langfuse.com` and any
  `*.langfuse.com` subdomain). The host is normalised (lowercase, all trailing dots stripped)
  before comparison, so a trailing-dot FQDN or an uppercase host can't bypass the refusal
  (ISS-016). Missing keys never throw — tracing is optional, so `enabled: false` and the app keeps
  running.
- `initTracing(config)` → `{ shutdown() }`. **Does the actual OTel span export wiring.**
  Idempotent (safe to call more than once per process; only the first call registers anything).
  When `config.enabled`, constructs exactly one `@langfuse/otel` `LangfuseSpanProcessor`
  — configured **explicitly** from `config` (`publicKey`/`secretKey`/`baseUrl`), never left to its
  own env-var/`https://cloud.langfuse.com` default — and registers it on a
  `@opentelemetry/sdk-trace-node` `NodeTracerProvider`. When disabled, registers nothing and
  returns a no-op handle. Call `shutdown()` on process exit to flush pending spans.
- `createLangfuseCallbacks(config)` → `CallbackHandler[]` for a LangChain/LangGraph
  `config.callbacks` array. `[]` when disabled. When enabled, it calls `initTracing(config)` (so a
  call site that only wires callbacks, without an explicit startup `initTracing` call, still gets
  span export) and constructs one `@langfuse/langchain` `CallbackHandler` with **no** Langfuse
  config passed to it — see "Why no env vars" below.

## ISS-017 (2026-09-25): tracing used to be a silent no-op — fixed

`@langfuse/langchain@5.11.1`'s `CallbackHandler` creates OpenTelemetry spans internally but never
exports them anywhere on its own (verified against its published `.d.ts`: no Langfuse-credential
constructor fields, no network client — its private methods are named
`startAndRegisterOtelSpan`/`handleOtelSpanEnd`). Exporting requires a `LangfuseSpanProcessor`
(`@langfuse/otel`) registered on an OTel tracer provider. Before this fix, neither
`@langfuse/otel` nor `@opentelemetry/sdk-trace-node` was installed or registered anywhere in this
package, so every trace silently went nowhere — no error, no network call, nothing in Langfuse.
`initTracing` (above) is the fix; `tests/outcome.test.ts` proves it end to end (contract B7/B14,
"emit must be proven, not assumed" — a real span reaching an in-memory exporter, not just a
handler/client being constructed).

### Why no env vars

`createLangfuseCallbacks` used to set `LANGFUSE_BASE_URL`/`LANGFUSE_PUBLIC_KEY`/
`LANGFUSE_SECRET_KEY` on `process.env`, on the assumption that the underlying `@langfuse/core`
client read connection details that way. That was never true for `CallbackHandler` (see above) —
so as of this fix cycle, this adapter touches `process.env` for nothing (`tests/callbacks.test.ts`
pins this down). The processor is the only thing that needs credentials, and `initTracing` passes
them to it explicitly from `config`.

## Wiring (for T-007, the graph unit — NOT done in this unit)

```ts
import { loadTracingConfig, initTracing, createLangfuseCallbacks } from "@vc/observability";

// Once, at startup:
const tracing = loadTracingConfig(process.env);
const tracingHandle = initTracing(tracing); // no-op if `tracing.enabled` is false

// Per graph invocation:
const callbacks = createLangfuseCallbacks(tracing); // [] if disabled
await graph.invoke(input, { callbacks /* + whatever else config already holds */ });

// On shutdown:
await tracingHandle.shutdown(); // flushes any pending spans; no-op if disabled
```

Calling `initTracing` at startup is optional but recommended — it registers the tracer provider
before the first graph run instead of on first callback construction, and gives you a `shutdown()`
handle to flush on process exit. `createLangfuseCallbacks` calls `initTracing` itself either way
(idempotent — the singleton means only the first call actually registers anything), so a call site
that skips the startup step still gets a correctly wired `CallbackHandler`.

T-004 deliberately stops here — `packages/engine` is still a stub (`packages/engine/package.json`:
"the LangGraph.js StateGraph (H1/D-002) lands here in a later unit"), so there is no graph to wire
this into yet.

## Package versions (verified 2026-09-25)

- `@langfuse/langchain@5.11.1`, `@langfuse/otel@5.11.1` — `npm view @langfuse/<pkg> version`.
  Docs: https://langfuse.com/integrations/frameworks/langchain. Install line matches the
  `@langfuse/langchain@5.11.1` README verbatim: `npm install @langfuse/langchain @langfuse/otel
  @opentelemetry/sdk-trace-node`.
- `@opentelemetry/sdk-trace-node@2.11.0` — `NodeTracerProvider`. Its `constructor(config?:
  NodeTracerConfig)` accepts `spanProcessors: SpanProcessor[]` (from
  `@opentelemetry/sdk-trace`'s `TracerProviderOptions`, verified in its published `.d.ts`); the
  Quickstart shape is `new NodeTracerProvider({ spanProcessors: [...] }).register()`.
- `LangfuseSpanProcessorParams` (`@langfuse/otel@5.11.1`'s published `.d.ts`) takes `publicKey?`,
  `secretKey?`, `baseUrl?` (**defaults to `"https://cloud.langfuse.com"` when omitted** — this is
  exactly why `initTracing` always passes `config.baseUrl` explicitly rather than letting the
  processor fall back to its own default or to env vars), plus `exporter?`, `mask?`,
  `shouldExportSpan?`, `environment?`, `flushAt?`, `flushInterval?`, `exportMode?`
  (`"batched" | "immediate"`, default `"batched"`), and more.
- `@langchain/core@^1.2.12` (peer dep of `@langfuse/langchain`, requires `>=0.3.8`),
  `@opentelemetry/api@^1.9.1`, `@opentelemetry/core@^2.11.0` and
  `@opentelemetry/sdk-trace-base@^2.11.0` — devDependencies here only, used by tests
  (constructing a real `CallbackHandler`/`RunnableLambda` offline, and typing the injectable
  in-memory span exporter in `tests/outcome.test.ts`).
- `yaml@^2.9.1` — devDependency, used only by the `docker-compose.yml` guard test.

`CallbackHandler`'s constructor (`@langfuse/langchain@5.11.1`'s published `.d.ts`) takes only
`{ userId?, sessionId?, tags?, version?, traceMetadata? }` — no `baseUrl`/`publicKey`/`secretKey`
fields, confirming it needs no Langfuse credentials of its own (see "Why no env vars" above).
