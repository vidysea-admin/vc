import { CallbackHandler } from "@langfuse/langchain";
import type { TracingConfig } from "./config.js";

/**
 * Thin adapter: turns a resolved TracingConfig into the LangChain callback array a LangGraph
 * `config.callbacks` (or any LangChain `.invoke(..., { callbacks })`) expects. Callers can always
 * spread this in unconditionally — it's `[]` when tracing is disabled, never `undefined`.
 *
 * Why this sets three env vars: `@langfuse/langchain`'s `CallbackHandler` constructor (verified
 * against the published `@langfuse/langchain@5.11.1` `.d.ts` — its `ConstructorParams` is only
 * `{ userId?, sessionId?, tags?, version?, traceMetadata? }`) has no `baseUrl`/`publicKey`/
 * `secretKey` fields. Connection details are read by the underlying `@langfuse/core` client
 * exclusively from `LANGFUSE_BASE_URL` / `LANGFUSE_PUBLIC_KEY` / `LANGFUSE_SECRET_KEY` env vars
 * (`@langfuse/core`'s `getEnv()`). `loadTracingConfig()` is the single source of truth for those
 * three values (and the place that refuses Langfuse Cloud), so this adapter applies them to
 * `process.env` immediately before constructing the handler rather than making every call site
 * set three raw env vars itself. It never overwrites a var with an empty/undefined value.
 */
export function createLangfuseCallbacks(config: TracingConfig): CallbackHandler[] {
  if (!config.enabled) return [];

  if (config.baseUrl) process.env.LANGFUSE_BASE_URL = config.baseUrl;
  if (config.publicKey) process.env.LANGFUSE_PUBLIC_KEY = config.publicKey;
  if (config.secretKey) process.env.LANGFUSE_SECRET_KEY = config.secretKey;

  return [new CallbackHandler({})];
}
