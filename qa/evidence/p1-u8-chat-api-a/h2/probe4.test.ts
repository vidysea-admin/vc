import { test } from "node:test";
import assert from "node:assert/strict";
import { B } from "./lib.ts";
const { redactPii } = await import(`${B}/packages/schemas/src/redact.ts`);
const N = 4000;
const inputs: Record<string, string> = {
  digitspace: "1 ".repeat(N / 2),
  digitrun9: "9".repeat(N),
  dots: "1.".repeat(N / 2),
  "1.1.1.1": "1.1.1.1.".repeat(N / 8),
  iamAAA: "i am " + "A ".repeat(N / 2),
  "I am A (caps)": "I am " + "A ".repeat(N / 2),
  meraNaam: "mera naam ".repeat(N / 10),
  meraNaamHai: "mera naam hai ".repeat(N / 14),
  devaNaam: "मेरा नाम ".repeat(N / 8),
  parens: "(".repeat(N),
  plus: "+".repeat(N),
  plusParens: "+(".repeat(N / 2),
  spacesDigit: " ".repeat(N - 1) + "9",
  digitSpaces: "9" + " ".repeat(N - 1),
  altDigitHyphen: "1-".repeat(N / 2),
  altDigitHyphen2: "1 -".repeat(N / 3),
  digitparen: "1(".repeat(N / 2),
  emailish: "a".repeat(N - 5) + "@b.c",
  emailish2: "a.".repeat(N / 2) + "@",
  emailish3: "a@b".repeat(N / 3),
  emailish4: "a@" + "b.".repeat(N / 2),
  nameTokens: "my name is " + "Ab ".repeat(N / 3),
  nameTokensNoSpace: "my name is " + "A".repeat(N),
  nameTok2: "my name is " + "A-".repeat(N / 2),
  nameTok3: "my name is " + "a'".repeat(N / 2),
  callme: "call me ".repeat(N / 8),
  thisis: "this is ".repeat(N / 8),
  deva: "मेरा नाम है ".repeat(N / 12),
  combining: "é".repeat(N / 2),
  zw: "​".repeat(N),
  digitsThenLetter: "1 ".repeat(N / 2 - 1) + "x",
  digitsThenLetter2: "12 ".repeat(N / 3 - 1) + "x",
};
test("area4 timing and idempotence on adversarial 4000-char inputs", () => {
  let max = 0;
  let maxName = "";
  for (const [k, v] of Object.entries(inputs)) {
    const s = v.slice(0, N);
    const t0 = performance.now();
    const r1 = redactPii(s);
    const ms = performance.now() - t0;
    const r2 = redactPii(r1.text);
    if (ms > max) {
      max = ms;
      maxName = k;
    }
    console.log(`  ${k.padEnd(18)} ${ms.toFixed(1)} ms len=${s.length} idempotent=${r2.text === r1.text}`);
    assert.equal(r2.text, r1.text, `idempotent on ${k}`);
  }
  const t0 = performance.now();
  redactPii("a ".repeat(2000), { knownNames: ["a a a a", "Riya Sharma", "a"] });
  console.log(`  knownNames repeated-token ${(performance.now() - t0).toFixed(1)} ms`);
  console.log(`MAX=${max.toFixed(1)} ms (${maxName})`);
});
test("area4 never throws on lone surrogates / NUL; idempotent on PII samples", () => {
  const odd = ["\ud800", "a\udfff b", "my name is \ud800", "\u0000", "my name is Priya\u0000 Sharma", "9876\ud800543210", "x@\ud800y.com", "मेरा नाम \udc00", "\u0000".repeat(4000), "I am \ud83d", "😀 98765 43210"];
  for (const s of odd) {
    const r = redactPii(s, { knownNames: ["\ud800", "Priya"] });
    const r2 = redactPii(r.text, { knownNames: ["\ud800", "Priya"] });
    assert.equal(r2.text, r.text, `idempotent ${JSON.stringify(s)}`);
  }
  const samples = ["My name is Priya Sharma, call 9876543210 mail a@b.com", "I am Rahul from Pune", "mera naam rahul hai aur main Delhi se hoon", "मेरा नाम राहुल है"];
  for (const s of samples) {
    const r = redactPii(s);
    assert.equal(redactPii(r.text).text, r.text, s);
    console.log("  " + JSON.stringify(r.text));
  }
});
