import { pathToFileURL } from "node:url";
const WT = "C:/Users/Lenovo/AppData/Local/Temp/claude/d--vc/2b04f90e-6b56-4682-a76c-d8515b93405c/scratchpad/p1-u7/apps/api";
const imp = (rel: string) => import(pathToFileURL(`${WT}/${rel}`).href);
const fx: any = await imp("tests/anonymous-fixtures.ts");
const MARK = "ZQXMARKER7731";
const Q = `What is the tuition for public universities in Germany? ${MARK}`;
const out: string[] = [];
let bad = 0;
const chk = (n: string, ok: boolean, d = "") => { if (!ok) bad++; out.push(`${ok ? "OK  " : "FAIL"} ${n} :: ${d}`); };
// answered path
{
  const w = fx.anonWorld();
  const cap = await fx.captureOutput(async () => fx.ask(w, Q));
  chk("P4c generic question with marker is routed to the model (state ok)", cap.result.json.state === "ok", cap.result.json.state);
  chk("P4c no marker in DB/log/console", !JSON.stringify(w.fakeDb.collection("anonymous_counters").all()).includes(MARK) && !JSON.stringify(w.logs).includes(MARK) && !cap.output.includes(MARK) && !cap.result.body.includes(MARK));
  chk("P4c KB got exactly 1 call with only q", w.kb.calls.length === 1 && w.kb.calls[0].tool === "search_kb" && w.kb.calls[0].arg.length === 1, JSON.stringify(w.kb.calls.map((c: any) => [c.tool, c.arg.length])));
  w.cleanup();
}
// provider throws
{
  const prov = fx.kbAnswerProvider();
  (prov as any).complete = async () => { throw new Error("prov boom " + MARK); };
  const w = fx.anonWorld({ provider: prov });
  const cap = await fx.captureOutput(async () => fx.ask(w, Q));
  chk("P4d provider throws -> response/log/console free of marker", !cap.result.body.includes(MARK) && !JSON.stringify(w.logs).includes(MARK) && !cap.output.includes(MARK), `${cap.result.status} ${cap.result.body.slice(0, 160)}`);
  w.cleanup();
}
// KB throws
{
  const w = fx.anonWorld({ kb: { searchKb: async (q: string) => { throw new Error("kb boom " + q); } } as any });
  const cap = await fx.captureOutput(async () => fx.ask(w, Q));
  chk("P4e KB throws -> fixed no-answer, free of marker", cap.result.json.state === "no_sourced_answer" && !cap.result.body.includes(MARK) && !JSON.stringify(w.logs).includes(MARK) && !cap.output.includes(MARK), `${cap.result.status} ${cap.result.body.slice(0, 160)}`);
  w.cleanup();
}
// force 500 inside handler
{
  const limiter = { check: () => { throw new Error("limiter boom " + MARK); } };
  const w = fx.anonWorld({ deps: { limiter } });
  const cap = await fx.captureOutput(async () => fx.ask(w, Q));
  chk("P4f internal 500: bare body + helpline, no marker in body/log/console", cap.result.status === 500 && Object.keys(cap.result.json).sort().join() === "error,helpline" && !cap.result.body.includes(MARK) && !JSON.stringify(w.logs).includes(MARK) && !cap.output.includes(MARK), `${cap.result.status} ${JSON.stringify(w.logs)}`);
  w.cleanup();
}
console.log(out.join("\n"));
process.exit(bad ? 1 : 0);
