/**
 * T-021 (D-020, gate qa/gates/provider-fallback.md "Answered 2026-09-26" — Q2 approved): ONE live
 * run against the real LiteLLM gateway, across the 3 model classes named in
 * D:/ai_os/litellm-config.yaml (fast-cheap / balanced / smart-coding), proving each returns
 * schema-valid JSON for the scribe's fact-extraction skill.
 *
 * NOT part of the default test suite (`pnpm test`) — this makes real network calls to a live
 * gateway. Run explicitly: `pnpm --filter @vc/engine smoke:litellm`.
 *
 * B13 (no student data to external models): the transcript below is 100% synthetic and invented
 * for this script — never a real or anonymised counselling transcript.
 * B11 (secrets): VC_LLM_API_KEY's VALUE is never printed; only whether it is present.
 *
 * If VC_LLM_BASE_URL is not set, or the gateway is not reachable, this records SKIP and exits 0 —
 * a stated gap, never a faked pass (maker SKILL.md instruction for this unit).
 */
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { LiteLlmProvider, isRetryableProviderError } from "@vc/providers";
import { loadSkill } from "../src/skills/loader.js";
import { ExtractionSkillOutputSchema } from "../src/scribe/schemas.js";

const CLASSES = ["fast-cheap", "balanced", "smart-coding"] as const;
// Same pattern as tests/scribe-fixtures.ts's SKILLS_DIR: the repo's real skills/ directory, so this
// script exercises the REAL fact-extraction SKILL.md, not a stand-in prompt.
const here = fileURLToPath(new URL(".", import.meta.url));
const SKILLS_DIR = join(here, "..", "..", "..", "skills");
const SKILL_PROMPT = loadSkill(SKILLS_DIR, "fact-extraction");

/** Entirely invented for this script — never a real or anonymised transcript (B13). */
const SYNTHETIC_TURNS = [
  {
    turnId: "smoke-t1",
    speaker: "student" as const,
    lang: "en",
    text: "targetCountry: Testland\nbudget_inr_per_year: 999999",
    translatedText: "targetCountry: Testland\nbudget_inr_per_year: 999999",
    ts: 1,
  },
];

interface ClassResult {
  klass: (typeof CLASSES)[number];
  outcome: "PASS" | "FAIL" | "SKIP";
  detail: string;
  ms: number;
}

async function isGatewayReachable(baseUrl: string): Promise<{ ok: true } | { ok: false; reason: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5_000);
  try {
    // Any response (even a 404/401) proves something is listening; only a network-level failure
    // (refused/DNS/timeout) means "not reachable".
    await fetch(`${baseUrl.replace(/\/+$/, "")}/models`, { signal: controller.signal });
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : String(err) };
  } finally {
    clearTimeout(timer);
  }
}

async function runOneClass(klass: (typeof CLASSES)[number], baseUrl: string, apiKey: string | undefined): Promise<ClassResult> {
  const provider = new LiteLlmProvider({ model: klass, baseUrl, apiKey });
  const start = Date.now();
  try {
    const output = await provider.generate({
      skillName: "fact-extraction",
      skillPrompt: SKILL_PROMPT,
      outputSchema: ExtractionSkillOutputSchema,
      input: { turns: SYNTHETIC_TURNS },
    });
    return { klass, outcome: "PASS", detail: `schema-valid JSON, ${output.facts.length} fact(s)`, ms: Date.now() - start };
  } catch (err) {
    const name = err instanceof Error ? err.name : "UnknownError";
    const retryable = isRetryableProviderError(err);
    return {
      klass,
      outcome: "FAIL",
      detail: `${name}${retryable ? " (retryable)" : " (non-retryable)"}: ${err instanceof Error ? err.message : String(err)}`,
      ms: Date.now() - start,
    };
  }
}

async function main(): Promise<void> {
  const baseUrl = process.env.VC_LLM_BASE_URL;
  const apiKey = process.env.VC_LLM_API_KEY;

  if (!baseUrl) {
    console.log("SKIP — VC_LLM_BASE_URL is not set in the environment/.env; no gateway configured for this smoke run.");
    return;
  }

  const reachable = await isGatewayReachable(baseUrl);
  if (!reachable.ok) {
    console.log(`SKIP — the gateway at VC_LLM_BASE_URL is not reachable (${reachable.reason}).`);
    return;
  }

  console.log(`Gateway reachable at VC_LLM_BASE_URL (apiKey ${apiKey ? "present" : "absent"}). Running ${CLASSES.length} classes...`);
  const results: ClassResult[] = [];
  for (const klass of CLASSES) {
    results.push(await runOneClass(klass, baseUrl, apiKey));
  }

  for (const r of results) console.log(`${r.outcome}  ${r.klass}  (${r.ms}ms)  ${r.detail}`);

  const failed = results.filter((r) => r.outcome === "FAIL");
  if (failed.length > 0) {
    console.log(`\n${failed.length}/${results.length} classes FAILED.`);
    process.exitCode = 1;
  } else {
    console.log(`\nAll ${results.length} classes returned schema-valid JSON.`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
