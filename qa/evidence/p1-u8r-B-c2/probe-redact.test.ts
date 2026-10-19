import { test } from "node:test";
import assert from "node:assert/strict";
import { redactPii } from "./redact.js";
const gone = (t: string, leaks: string[], keeps: string[] = []) => { const r = redactPii(t).text; for (const l of leaks) assert.ok(!new RegExp(`\b${l}\b`, "i").test(r), `${t} -> ${r} leaks ${l}`); for (const k of keeps) assert.ok(r.includes(k), `${t} -> ${r} lost ${k}`); };
test("B-C3 lower-case intros", () => { gone("my name is devika nair", ["devika", "nair"]); gone("i am kabir", ["kabir"]); gone("call me aarav", ["aarav"]); gone("MY NAME IS ROHAN", ["rohan"]); gone("i'm kabir singh", ["kabir", "singh"]); });
test("B-C3 precision", () => { for (const t of ["i am tired", "i am from delhi", "i am a student", "i am going to apply", "i am 17 years old"]) assert.equal(redactPii(t).text, t); });
test("B-C9 titles", () => { gone("My name is Dr. Anita Verma", ["anita", "verma"]); gone("I am Mr. Rao from Pune", ["rao"], ["from Pune"]); gone("my name is prof. sharma", ["sharma"]); gone("My name is Mrs. Priya Nair", ["priya", "nair"]); gone("I am Smt. Lakshmi Devi", ["lakshmi", "devi"]); });
test("B-C10 linear email scan", () => { for (const s of ["a".repeat(2_000_000), "a.".repeat(1_000_000), "a.".repeat(100_000), "a@" + "a.".repeat(100_000)]) { const t0 = performance.now(); redactPii(s); const ms = performance.now() - t0; assert.ok(ms < 200, `took ${ms}`); } assert.equal(redactPii("mail priya@example.com now").text, "mail [EMAIL] now"); });
test("B-C14 titles/initials outside the name cap", () => {
  gone("I'm Dr. A. P. J. Abdul Kalam", ["abdul", "kalam"]); gone("My name is Prof. Dr. Anita Rao Verma", ["anita", "rao", "verma"]);
  gone("my name is dr. anita rao verma from pune", ["anita", "rao", "verma"], ["from pune"]); gone("I am Shri Ram Prasad Bismil Sharma", ["ram", "prasad", "bismil", "sharma"]);
  const t0 = performance.now(); redactPii("my name is " + "Dr. ".repeat(50_000)); assert.ok(performance.now() - t0 < 500);
});
