// usage: node mutate.mjs <file> <oldTextFile> <newTextFile>  -- exact single replacement or fail
import { readFileSync, writeFileSync } from "node:fs";
const [file, oldF, newF] = process.argv.slice(2);
const s = readFileSync(file, "utf8");
const crlf = s.includes("\r\n");
const fix = (t) => (crlf ? t.replace(/\r?\n/g, "\r\n") : t.replace(/\r\n/g, "\n"));
const o = fix(readFileSync(oldF, "utf8")).replace(/\r?\n$/, "");
const n = fix(readFileSync(newF, "utf8")).replace(/\r?\n$/, "");
const i = s.indexOf(o);
if (i < 0 || s.indexOf(o, i + 1) >= 0) { console.error("MUTATE FAIL: old text not found exactly once in " + file); process.exit(2); }
writeFileSync(file, s.slice(0, i) + n + s.slice(i + o.length));
console.log("mutated " + file);
