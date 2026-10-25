// Node port of the planner's diag_patch.py (python is banned). Applied ONLY to a throwaway copy passed as argv[2].
// Each anchor must occur exactly `count` times or the patch aborts (same contract as the python original).
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
const root = join(process.argv[2], "packages", "engine", "tests");
function patch(name, anchor, insert, { after = true, count = 1 } = {}) {
  const p = join(root, name);
  const s = readFileSync(p, "utf8").split(String.fromCharCode(13, 10)).join(String.fromCharCode(10));
  const n = s.split(anchor).length - 1;
  if (n !== count) throw new Error(`${name}: anchor ${JSON.stringify(anchor.slice(0, 70))} occurs ${n}x, expected ${count}`);
  writeFileSync(p, s.split(anchor).join(after ? anchor + insert : insert + anchor));
}
const SRC = String.raw`/[\\/]src[\\/]/`;

// P-a: filtered src frames for every findOne on the target collection (as python DIAG-PA)
patch("scribe-persistence.test.ts",
  `        if (!once || !direct) return find(...args); once = false;`,
  `        try { console.error("DIAG-PA " + JSON.stringify({ origin, rejectRead, once, direct, filter: args[0], frames: frames.slice(0, 5).map(f => f.trim()) })); } catch {}\n`,
  { after: false });

// Row 128: class/name/message of the compiled-invoke rejection captured as \`produced\`
patch("scribe-persistence.test.ts",
  `assert.ok(produced instanceof FencedWriterDeadlineError, "actual compiled graph propagates its source-produced helper/node FWD root");`,
  `try { const pe = produced as any; console.error("DIAG-128 " + JSON.stringify({ ctor: pe?.constructor?.name, name: pe?.name, message: String(pe?.message), hasPregelTaskId: pe != null && Object.hasOwn(pe, "pregelTaskId"), causeCtor: pe?.cause?.constructor?.name, frames: String(pe?.stack ?? "").split("\\n").filter(l => ${SRC}.test(l) || /langgraph|langchain/.test(l)).slice(0, 8).map(l => l.trim()) })); } catch {}\n      `,
  { after: false });

// A-c: provider call stacks + msPastExpiry against the selected (original) writer deadline
patch("scribe-checkpointer.test.ts",
  `  const deps = { db, provider: mockProvider(), skillsDir: SKILLS_DIR };\n`,
  `  { const __g = deps.provider.generate.bind(deps.provider); (deps.provider as any).generate = (req: any) => { try { const d = (globalThis as any).__diagDeadline; console.error("DIAG-PROV " + JSON.stringify({ skill: req?.skillName, n: deps.provider.calls.length, signalAborted: req?.signal?.aborted ?? null, deadlineAborted: d?.signal?.aborted ?? null, msPastExpiry: d ? Date.now() - d.expiresAt : null, frames: (new Error().stack ?? "").split("\\n").filter(l => ${SRC}.test(l)).slice(0, 8).map(l => l.trim()) })); } catch {} return __g(req); }; }\n`);
patch("scribe-checkpointer.test.ts",
  `runHits++; selectedDeadline = this;`,
  ` (globalThis as any).__diagDeadline = this;`);
patch("scribe-checkpointer.test.ts",
  `          const providerAtHold = deps.provider.calls.length; const result = await attempt;\n`,
  `          try { console.error("DIAG-HOLD " + JSON.stringify({ providerAtHold: deps.provider.calls.length, msPastExpiry: selectedDeadline ? Date.now() - selectedDeadline.expiresAt : null })); } catch {}\n`,
  { after: false });

// N-b: the AssertionError wrapped as PartialApplyError cause at the postcheck reachability gate
patch("scribe-per-fact.test.ts",
  `        assert.equal(reached.reached, true, "SETUP/REACHABILITY: actual O-before-timer W then semantic postcheck must be reached");`,
  `        try { const r: any = failedFixtureDiagnostic?.root; console.error("DIAG-NB " + JSON.stringify({ row, reached: reached.reached, rootCtor: r?.constructor?.name, causeCtor: r?.cause?.constructor?.name, causeMessage: String(r?.cause?.message ?? ""), causeFrames: String(r?.cause?.stack ?? "").split("\\n").filter(l => /tests[\\\\/]|${"[\\\\/]src[\\\\/]"}/.test(l)).slice(0, 8).map(l => l.trim()), deadlineMsLeft: deadlineExpiresAt - Date.now() })); } catch {}\n`,
  { after: false });
console.log("patched");
