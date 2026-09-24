# @vc/observability

Self-hosted Langfuse tracing config + LangChain callback adapter (T-004, D-004,
ARCHITECTURE.md H4/§5, `agentic-architecture-standard.md` rule 5). Two pure, independently
testable pieces:

- `loadTracingConfig(env)` → `{ enabled, baseUrl?, publicKey?, secretKey? }`. Reads
  `LANGFUSE_BASE_URL` (or the legacy `LANGFUSE_HOST` alias) / `LANGFUSE_PUBLIC_KEY` /
  `LANGFUSE_SECRET_KEY` from whatever env-like object you pass it (call with `process.env`).
  **Throws, unconditionally, if the base URL resolves to a Langfuse Cloud host** (any region —
  `cloud.langfuse.com`, `us.cloud.langfuse.com`, `eu.cloud.langfuse.com`, `jp.cloud.langfuse.com`,
  `hipaa.cloud.langfuse.com`). Missing keys never throw — tracing is optional, so
  `enabled: false` and the app keeps running.
- `createLangfuseCallbacks(config)` → `CallbackHandler[]` for a LangChain/LangGraph
  `config.callbacks` array. `[]` when disabled. When enabled, it's a **thin adapter**: it sets
  `LANGFUSE_BASE_URL`/`LANGFUSE_PUBLIC_KEY`/`LANGFUSE_SECRET_KEY` on `process.env` from the
  resolved config (the underlying `@langfuse/core` client has no other way to receive them — see
  the comment in `src/callbacks.ts`) and constructs one `@langfuse/langchain` `CallbackHandler`.

## One-line wiring (for T-007, the graph unit — NOT done in this unit)

```ts
import { loadTracingConfig, createLangfuseCallbacks } from "@vc/observability";

const tracing = loadTracingConfig(process.env);
const callbacks = createLangfuseCallbacks(tracing);

// Anywhere the graph runs:
await graph.invoke(input, { callbacks /* + whatever else config already holds */ });
```

That's the entire integration surface. T-004 deliberately stops here — `packages/engine` is still
a stub (`packages/engine/package.json`: "the LangGraph.js StateGraph (H1/D-002) lands here in a
later unit"), so there is no graph to wire this into yet.

## Package versions (verified 2026-09-25)

- `@langfuse/langchain@5.11.1` — `npm view @langfuse/langchain version`. Docs:
  https://langfuse.com/integrations/frameworks/langchain
- `@langchain/core@^1.2.12` (peer dep of `@langfuse/langchain`, requires `>=0.3.8`) and
  `@opentelemetry/api@^1.9.1` (its other peer dep) — devDependencies here only, so
  `createLangfuseCallbacks`'s enabled-path test can construct a real `CallbackHandler` offline.
- `yaml@^2.9.1` — devDependency, used only by the `docker-compose.yml` guard test.

`CallbackHandler`'s constructor (`@langfuse/langchain@5.11.1`'s published `.d.ts`) takes only
`{ userId?, sessionId?, tags?, version?, traceMetadata? }` — no `baseUrl`/`publicKey`/`secretKey`
fields. That's why `createLangfuseCallbacks` sets env vars instead of passing options through.
