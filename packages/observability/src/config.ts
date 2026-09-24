/**
 * Langfuse tracing config (T-004, D-004, ARCHITECTURE.md H4/§5, standard rule 5:
 * D:/ai_os/umesh/operating-brain/wiki/patterns/agentic-architecture-standard.md).
 *
 * This module does ONE thing: turn env vars into a TracingConfig, refusing Langfuse Cloud
 * unconditionally. It never imports `@langfuse/*` and never touches the network, so it stays
 * fully unit-testable offline. The LangChain wiring lives in callbacks.ts.
 */

export interface TracingConfig {
  enabled: boolean;
  baseUrl?: string;
  publicKey?: string;
  secretKey?: string;
}

export interface TracingEnv {
  LANGFUSE_BASE_URL?: string;
  /** Legacy alias some Langfuse SDK versions/examples use in place of LANGFUSE_BASE_URL. */
  LANGFUSE_HOST?: string;
  LANGFUSE_PUBLIC_KEY?: string;
  LANGFUSE_SECRET_KEY?: string;
  [key: string]: string | undefined;
}

/**
 * Langfuse Cloud hostnames, every region. Verified 2026-09-25 against
 * https://langfuse.com/security/data-regions and https://langfuse.com/faq/all/cloud-data-regions.
 * `cloud.langfuse.com` is the EU region's own (unprefixed) hostname; `eu.cloud.langfuse.com` is
 * kept in this list defensively in case Langfuse starts routing that alias too — the MUST here is
 * "never Langfuse Cloud", not "never this exact string". This exact-match Set is the first line
 * of defense; `loadTracingConfig` below also refuses `langfuse.com` and any `*.langfuse.com`
 * suffix as a catch-all, so a Cloud region/alias not yet in this list still gets refused
 * (ISS-016, 2026-09-25: a trailing-dot FQDN bypassed a Set-only check).
 */
const LANGFUSE_CLOUD_HOSTS: ReadonlySet<string> = new Set([
  "cloud.langfuse.com",
  "us.cloud.langfuse.com",
  "eu.cloud.langfuse.com",
  "jp.cloud.langfuse.com",
  "hipaa.cloud.langfuse.com",
]);

/**
 * Reads Langfuse tracing config from an env-like object (call with `process.env` — this module
 * never reads `process.env` itself, so it stays a pure function under test).
 *
 * - Throws if `LANGFUSE_BASE_URL`/`LANGFUSE_HOST` resolves to a Langfuse Cloud host, in ANY
 *   region. No exceptions, ever (standard rule 5 MUST c) — traces carry full prompts and student
 *   transcripts, so a hosted tracer is an external service under the hard boundary.
 * - Never throws for missing keys: tracing is optional in dev/tests. When the base URL or either
 *   key is missing, tracing is simply `enabled: false` and the app must still run.
 */
export function loadTracingConfig(env: TracingEnv): TracingConfig {
  const baseUrl = env.LANGFUSE_BASE_URL ?? env.LANGFUSE_HOST;
  const publicKey = env.LANGFUSE_PUBLIC_KEY;
  const secretKey = env.LANGFUSE_SECRET_KEY;

  if (baseUrl) {
    let rawHost: string;
    try {
      rawHost = new URL(baseUrl).hostname;
    } catch {
      throw new Error(
        `loadTracingConfig: LANGFUSE_BASE_URL/LANGFUSE_HOST "${baseUrl}" is not a valid URL`,
      );
    }
    // ISS-016: normalise before comparing. `new URL(...).hostname` already lowercases per the
    // WHATWG URL spec, but does NOT strip a trailing DNS root dot ("cloud.langfuse.com." and
    // "cloud.langfuse.com.." both resolve to the exact same host as "cloud.langfuse.com" -- an
    // exact-match Set lookup on the raw hostname let that FQDN form bypass the refusal entirely.
    // .toLowerCase() is kept explicit anyway (belt and suspenders, not relying on URL's behavior).
    const host = rawHost.toLowerCase().replace(/\.+$/, "");
    const isLangfuseCloudHost =
      LANGFUSE_CLOUD_HOSTS.has(host) || host === "langfuse.com" || host.endsWith(".langfuse.com");
    if (isLangfuseCloudHost) {
      throw new Error(
        `loadTracingConfig: refusing Langfuse Cloud host "${host}". Standard rule 5 (D-004): ` +
          "tracing must stay on our own self-hosted Langfuse (infra/langfuse/docker-compose.yml), " +
          "never Langfuse Cloud, in any region — no exceptions.",
      );
    }
  }

  if (baseUrl && publicKey && secretKey) {
    return { enabled: true, baseUrl, publicKey, secretKey };
  }
  return { enabled: false };
}
