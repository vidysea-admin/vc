import { test } from "node:test";
import assert from "node:assert/strict";
import { redactPii } from "../src/redact.js";

const r = (s: string, o = {}) => redactPii(s, o);
test("A names redacted", () => {
  for (const [s, gone] of [
    ["my name is devika nair", ["devika", "nair"]],
    ["i am kabir", ["kabir"]],
    ["call me aarav", ["aarav"]],
    ["MY NAME IS ROHAN", ["ROHAN"]],
    ["naam hai priya", ["priya"]],
    ["mera naam priya hai", ["priya"]],
    ["My name is Dr. Anita Verma", ["Anita", "Verma"]],
    ["I am Mr. Rao from Pune", ["Rao"]],
    ["my name is prof. sharma", ["sharma"]],
    ["I'm Dr. A. P. J. Abdul Kalam", ["Abdul", "Kalam", "A.", "P.", "J."]],
    ["My name is Prof. Dr. Anita Rao Verma", ["Anita", "Rao", "Verma"]],
    ["my name is dr. anita rao verma and I want to study", ["anita", "rao", "verma"]],
    ["I am Shri Ram Prasad Bismil Sharma", ["Ram", "Prasad", "Bismil", "Sharma"]],
    ["my name is MRS. LAKSHMI IYER", ["LAKSHMI", "IYER"]],
    ["my name is Dr Anita Verma", ["Anita", "Verma"]],
  ] as const) {
    const out = r(s).text;
    const left = gone.filter((g) => out.includes(g));
    console.log("REDACT", JSON.stringify(s), "=>", JSON.stringify(out), left.length ? "LEAK:" + left.join(",") : "ok");
  }
});
test("A precision", () => {
  for (const s of ["i am tired", "i am from delhi", "i am a student", "i am going to apply", "I am Mr. Rao from Pune", "i am studying engineering", "i am 17 years old", "i am really worried"]) {
    console.log("PRECISION", JSON.stringify(s), "=>", JSON.stringify(r(s).text));
  }
});
test("A hard: from Pune survives; Kalam", () => {
  assert.match(r("I am Mr. Rao from Pune").text, /from Pune/);
  assert.match(r("I'm Dr. A. P. J. Abdul Kalam").text, /^I'm \[NAME\]$/);
  assert.match(r("my name is dr. anita rao verma from pune").text, /from pune/);
});
test("A perf", () => {
  const cases: Record<string, string> = {
    noat2M: "a.".repeat(1_000_000),
    noat2Mx: "a".repeat(2_000_000),
    at200k: "a.".repeat(100_000) + "@",
    atlead: "@" + "a.".repeat(100_000),
    dr50k: "my name is " + "Dr. ".repeat(50_000),
    dr50kUp: "I am " + "Dr. ".repeat(50_000) + "x",
    init50k: "I am " + "A. ".repeat(50_000),
    mixed: "I am " + "Dr. A. ".repeat(30_000) + "Kalam",
    spaces: "my name is" + " ".repeat(200_000) + "x",
    apos: "I am " + "a'".repeat(100_000),
    tokens: "I am " + "Abc ".repeat(100_000),
    ph: "1 ".repeat(100_000),
    phd: "(" + "1-".repeat(100_000),
    lead: "i am ".repeat(100_000),
  };
  for (const [k, v] of Object.entries(cases)) {
    const t0 = performance.now();
    redactPii(v);
    console.log("PERF", k, v.length, Math.round(performance.now() - t0), "ms");
  }
});
