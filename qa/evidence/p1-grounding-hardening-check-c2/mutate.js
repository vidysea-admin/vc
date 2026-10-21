// usage: node mutate.js file old new   (exact string, must occur exactly once; prints applied or error)
const fs = require("fs");
const [file, oldS, newS] = process.argv.slice(2);
const src = fs.readFileSync(file, "utf8");
const n = src.split(oldS).length - 1;
if (n !== 1) { console.log(`MUTATION ERROR: ${n} occurrences of ${JSON.stringify(oldS)}`); process.exit(2); }
fs.writeFileSync(file, src.split(oldS).join(newS));
console.log(`MUTATION APPLIED: ${JSON.stringify(oldS)} -> ${JSON.stringify(newS)}`);
