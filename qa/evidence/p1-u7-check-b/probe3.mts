import { pathToFileURL } from "node:url";
const WT = "C:/Users/Lenovo/AppData/Local/Temp/claude/d--vc/2b04f90e-6b56-4682-a76c-d8515b93405c/scratchpad/p1-u7/apps/api";
const fx: any = await import(pathToFileURL(`${WT}/tests/anonymous-fixtures.ts`).href);
const w = fx.anonWorld();
const GENERIC = "What are the tuition fees for public universities in Germany?";
for (let i = 0; i < 10; i++) await fx.ask(w, GENERIC, { ip: "198.51.100.1" });
const shapes: Record<string, string> = { letterspaced: "a ".repeat(125000), nonascii: "é".repeat(125000), mixed: "AbCd ".repeat(50000) };
for (const [n, body] of Object.entries(shapes)) {
  const ts: number[] = [];
  let st = 0;
  for (let i = 0; i < 5; i++) {
    const t0 = performance.now();
    const r = await w.handler(fx.anonRequest({ text: body }, { ip: "198.51.100.1" }));
    ts.push(performance.now() - t0);
    st = r.status;
  }
  console.log(`rate-limited client (status ${st}), ${Math.round(body.length / 1024)} KiB ${n}: ms per request`, ts.map((x) => x.toFixed(0)).join(","));
}
w.cleanup();
// verify a fresh generic 4 KB question on a limited client is cheap
const t0 = performance.now();
const r = await w.handler(fx.anonRequest({ text: GENERIC }, { ip: "198.51.100.1" }));
console.log("small request on limited client", r.status, (performance.now() - t0).toFixed(1), "ms");
