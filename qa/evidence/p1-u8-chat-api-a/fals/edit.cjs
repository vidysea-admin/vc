const fs = require("fs");
const [, , file, oldS, newS] = process.argv;
const src = fs.readFileSync(file, "utf8");
const n = src.split(oldS).length - 1;
if (n !== 1) { console.error("EDIT-ANCHOR-COUNT " + n + " in " + file); process.exit(3); }
fs.writeFileSync(file, src.replace(oldS, () => newS));
console.log("edited " + file);
