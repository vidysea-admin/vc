import { pathToFileURL } from "node:url";
const WT = "C:/Users/Lenovo/AppData/Local/Temp/claude/d--vc/2b04f90e-6b56-4682-a76c-d8515b93405c/scratchpad/p1-u7/apps/api";
const fx: any = await import(pathToFileURL(`${WT}/tests/anonymous-fixtures.ts`).href);
for (const q of ["Which countries do you cover?", "Germany versus France: what is the tuition for public universities?", "Is the information in the Germany tuition answer outdated?", "How do I switch to voice chat for Germany questions?"]) {
  const w = fx.anonWorld();
  const r = await fx.ask(w, q);
  console.log(JSON.stringify(q), "->", r.json.state, "kbcalls", w.kb.calls.map((c: any) => c.tool).join(","), "|", String(r.json.message).slice(0, 70));
  w.cleanup();
}
