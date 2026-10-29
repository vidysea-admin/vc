import fs from "node:fs";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
const root = "D:/vc/.worktrees/vc-completion";
const SP = "D:/vc/.worktrees/vc-completion/qa/.delivery/local";
const h = (p) => crypto.createHash("sha256").update(fs.readFileSync(`${root}/${p}`)).digest("hex");
const lines = (p) => fs.readFileSync(`${root}/${p}`, "utf8").split(/\r?\n/).length;
const src = (path, ranges) => { const n = lines(path) - 1; return { path, sha256: h(path), ranges: (ranges ?? [[1, 220]]).map(([a, b]) => [a, Math.min(b, n)]) }; };
const SAFETY = [
  "HARD RULES (non-negotiable):",
  "- Secrets: NEVER print, echo, log or paste any secret value (API keys, passwords, partner keys, JWTs); report env key NAMES only; never commit any env file.",
  "- Production DBs (Pathlynks Postgres, Vidysea Postgres, Vidysea Mongo Vanced_new) are READ-ONLY. Mongo writes only to the virtual_counsellor database, never drop it.",
  "- Real student rows never go into git, logs you write, or your report: counts and field names only.",
  "- Do not edit anything under .claude/**, docs/DECISIONS.md, qa/contracts, ARCHITECTURE.md. Do not commit, push, or delete worktrees. Do not remove qa/.paused.",
  "- Other agents are working in parallel: edit ONLY the files your brief assigns you. Do not restart services unless your brief says so.",
  "- The test lock is shared: long waits on it are normal, keep waiting (do not give up).",
  "- Edit in place, minimal diffs, TDD (failing test first) for code; report every file changed with file:line.",
].join("\n");
const jobs = [];
function req(name, id, owner, briefFile, acceptance, checks, extra = []) {
  const briefRel = `qa/.delivery/briefs/${id}.md`;
  fs.mkdirSync(`${root}/qa/.delivery/briefs`, { recursive: true });
  fs.copyFileSync(`${SP}/${briefFile}`, `${root}/${briefRel}`);
  const r = { schema_version: "compact-handoff/1", shared_instructions: SAFETY,
    sources: [src(briefRel), src("docs/demo-contract.md", [[1, 80]]), ...extra],
    task: { id, owner, purpose: `Execute the brief in ${briefRel} (source 1) exactly; it is the full task.`, dependencies: [], acceptance, checks },
    bounds: { max_source_bytes: 65536, max_prompt_bytes: 98304 } };
  const p = `${SP}/handoff-${name}.json`;
  fs.writeFileSync(p, JSON.stringify(r, null, 2));
  const out = execFileSync("node", [`${process.env.USERPROFILE}/.claude/skills/maker/tools/tick.mjs`, "--delivery", "handoff", p, "--root", root], { encoding: "utf8" });
  console.log(name, out.trim().split("\n").slice(-2).join(" | "));
}
req("llm", "t057-llm-routing", "general-purpose", "b-llm.md", ["safety screen + fact extraction + any aux LLM role run on Gemini locally; live chat turns give real replies <30s; a fact is proposed"], ["Return: root cause with file:line, files/env keys changed (names only), the restart command used, before/after evidence (timings, event names), blockers."], [src("apps/api/src/main.ts", [[1, 400]])]);
req("rev", "t057-d126-review", "senior-software-engineer", "b-rev.md", ["Approve/Warning/Block with file:line evidence"], ["Return: verdict per file, each finding with file:line, severity, and the fix."]);
req("widget", "t057-widget-resize", "general-purpose", "b-widget.md", ["auto-grow input, expand/compact toggle, drag-resize desktop, fullscreen expanded on mobile; theme unchanged; widget tests green"], ["Return: files changed with file:line, test command + pass/fail counts, the falsification you ran (green-before/red-after/restored)."], [src("apps/widget/README.md")]);
req("pfwidget", "t057-pathlynks-widget-mode", "general-purpose", "b-pfwidget.md", ["env-gated mount of the VC widget on Pathlynks career-quest, default off = unchanged; compatibility with PB proxy routes proven or the gap reported"], ["Return: files changed with file:line, the flag + values to turn it on, compat evidence, blockers."], [src("docs/partner-integration.md"), src("apps/widget/README.md")]);
req("voice", "t057-voice-evidence", "general-purpose", "b-voice.md", ["voice readiness proven or gaps listed; qa/evidence/t057-demo.md written with C1-C11 table + manual voice script, no real data"], ["Return: voice env key names set/missing, smoke-check commands + results, path of evidence file, gaps."]);
