// usage: node mutate.mjs <scratch voice.ts> <mutant.json>  -> applies exact one-occurrence replacements (CRLF-aware)
import fs from "node:fs";
const [file, mj] = process.argv.slice(2);
let src = fs.readFileSync(file, "utf8");
const crlf = src.includes("\r\n");
const fx = (s) => (crlf ? s.replace(/\r?\n/g, "\r\n") : s);
for (const e of JSON.parse(fs.readFileSync(mj, "utf8"))) {
  const old = fx(e.old);
  const nw = fx(e.new);
  const n = src.split(old).length - 1;
  if (n !== 1) {
    console.error(`old text matched ${n} times: ${old}`);
    process.exit(2);
  }
  src = src.replace(old, () => nw);
}
fs.writeFileSync(file, src);
