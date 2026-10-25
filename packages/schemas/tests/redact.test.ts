/**
 * P1 U8 (D-093 6A): redacted persistence. Names, phone numbers and emails are replaced by placeholders before storage.
 * All text here is invented (B13). Each test names the real scenario that reaches it.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { PII_PLACEHOLDERS, redactPii } from "../src/redact.js";

test("a student who types an email address into a chat turn has it replaced by [EMAIL]", () => {
  const out = redactPii("write to me at riya.sharma99@example.com or riya@mail.co.in please");
  assert.equal(out.text, "write to me at [EMAIL] or [EMAIL] please");
  assert.equal(out.counts.email, 2);
});

test("a student who gives an Indian mobile number in any common format has it replaced by [PHONE]", () => {
  for (const raw of ["9876543210", "+91 98765 43210", "+91-9876543210", "098765 43210", "(+91) 98765-43210", "98765 43210"]) {
    const out = redactPii(`call me on ${raw} after school`);
    assert.equal(out.text, "call me on [PHONE] after school", raw);
  }
});

test("a student who types a phone number in Devanagari digits has it replaced", () => {
  assert.equal(redactPii("मेरा नंबर ९८७६५४३२१० है").text.includes("९८७६५"), false);
});

test("an international number and a 12-digit national id are replaced; scores, years and fees are not", () => {
  assert.equal(redactPii("my uncle is at +44 7700 900123 in London").text, "my uncle is at [PHONE] in London");
  assert.equal(redactPii("id 1234 5678 9012 ok").text, "id [PHONE] ok");
  const keep = "I scored 98.5 percent in 2025, fees are 1,20,000 rupees and the cutoff is 650";
  assert.equal(redactPii(keep).text, keep);
});

test("an English self-introduction has the name replaced by [NAME]", () => {
  assert.equal(redactPii("Hi, my name is Riya Sharma and I want to study in Germany").text, "Hi, my name is [NAME] and I want to study in Germany");
  assert.equal(redactPii("I am Arjun Mehta, 17 years old").text, "I am [NAME], 17 years old");
  assert.equal(redactPii("this is Priya from Pune").text, "this is [NAME] from Pune");
});

test("a lower-case clause after I am is not a name", () => {
  const keep = "I am worried about the fees and I am not sure which course to pick";
  assert.equal(redactPii(keep).text, keep);
});

test("a Hinglish self-introduction has the name replaced", () => {
  assert.equal(redactPii("mera naam Rahul Verma hai aur mujhe Germany jaana hai").text, "mera naam [NAME] hai aur mujhe Germany jaana hai");
  assert.equal(redactPii("Mera naam sneha hai").text, "Mera naam [NAME] hai");
});

test("a Devanagari self-introduction has the name replaced", () => {
  const out = redactPii("मेरा नाम राहुल वर्मा है और मुझे जर्मनी जाना है");
  assert.equal(out.text, "मेरा नाम [NAME] है और मुझे जर्मनी जाना है");
});

test("known names (for example from the supplied profile) are replaced wherever they appear, whole word, any case", () => {
  const out = redactPii("Riya told me that RIYA Sharma and sharmaji are fine; Riyadh is a city", { knownNames: ["Riya Sharma"] });
  assert.equal(out.text, "[NAME] told me that [NAME] and sharmaji are fine; Riyadh is a city");
});

test("redaction is idempotent and placeholders are stable", () => {
  const once = redactPii("my name is Riya Sharma, riya@example.com, 9876543210").text;
  assert.equal(once, `my name is ${PII_PLACEHOLDERS.name}, ${PII_PLACEHOLDERS.email}, ${PII_PLACEHOLDERS.phone}`);
  assert.equal(redactPii(once).text, once);
});

test("an over-long or empty input is handled without throwing", () => {
  assert.equal(redactPii("").text, "");
  const long = "a ".repeat(50_000) + "9876543210";
  assert.ok(redactPii(long).text.endsWith("[PHONE]"));
});

// ---------------------------------------------------------------------------
// p1-u8r A1: lower-case self-introductions (typed on a phone, no capital letters)
// ---------------------------------------------------------------------------

test("A1: a student who types a self-introduction in lower case has the name replaced by [NAME]", () => {
  assert.equal(redactPii("my name is devika nair").text, "my name is [NAME]");
  assert.equal(redactPii("i am kabir").text, "i am [NAME]");
  assert.equal(redactPii("hi i'm kabir singh and i want to study in germany").text, "hi i'm [NAME] and i want to study in germany");
  assert.equal(redactPii("hello i\u2019m aarav, 17 years old").text, "hello i\u2019m [NAME], 17 years old");
  assert.equal(redactPii("call me aarav").text, "call me [NAME]");
  assert.equal(redactPii("MY NAME IS DEVIKA NAIR").text, "MY NAME IS [NAME]");
});

test("A1: the names redact reports are the names the student stated, so a model reply can be redacted with them", () => {
  assert.deepEqual(redactPii("my name is devika nair, mail d@example.com").names, ["devika nair"]);
  assert.deepEqual(redactPii("I am Arjun Mehta, 17 years old").names, ["Arjun Mehta"]);
  assert.deepEqual(redactPii("what are the fees in germany").names, []);
});

test("A1: lower-case sentences that follow I am / I'm are not names (no over-redaction)", () => {
  for (const keep of [
    "i am tired",
    "i am from delhi",
    "i am in class 12 and i am from delhi",
    "i am interested in engineering",
    "i am a student",
    "i am studying in class 12",
    "i am looking for a course in germany",
    "i am not sure what to pick",
    "i am 17 years old",
    "i am really worried about fees",
    "i'm very confused",
    "i'm happy with the results",
    "i am an engineering student",
    "i am applying for a masters",
    "i am planning to study abroad",
    "i am here to ask about visas",
    "i'm sorry, i am stressed",
    "i am tired.",
    "honestly i am confused. what now",
  ]) {
    assert.equal(redactPii(keep).text, keep, keep);
    assert.deepEqual(redactPii(keep).names, [], keep);
  }
});

test("A1: a trailing full stop is not part of a stated name", () => {
  assert.deepEqual(redactPii("my name is kabir.").names, ["kabir"]);
  assert.deepEqual(redactPii("My name is Riya.").names, ["Riya"]);
});

test("A2: a name that ends a sentence does not take the next sentence's first word with it, and the full stop is kept", () => {
  const out = redactPii("My name is Anita Verma. What are the fees in Germany?");
  assert.equal(out.text, "My name is [NAME]. What are the fees in Germany?");
  assert.deepEqual(out.names, ["Anita Verma"]);
  assert.equal(redactPii("my name is anita verma. What are the fees").text, "my name is [NAME]. What are the fees");
  assert.equal(redactPii("I am A. Verma and I want to study").text, "I am [NAME] and I want to study");
});

// ---- p1-u8r cycle 1 ----------------------------------------------------------------------------------------------------------
test("p1-u8r cycle 1: a title before a name does not end the name ('Dr. Anita Verma' is wholly redacted)", () => {
  for (const [input, leaked] of [
    ["My name is Dr. Anita Verma", ["Anita", "Verma"]],
    ["I am Mr. Rao from Pune", ["Rao"]],
    ["my name is prof. sharma", ["sharma"]],
    ["My name is Mrs. Priya Nair and I want to study abroad", ["Priya", "Nair"]],
    ["This is SMT. Lakshmi Devi", ["Lakshmi", "Devi"]],
    ["I am Shri Ramesh Kumar", ["Ramesh", "Kumar"]],
    ["I am Km. Sita Rani", ["Sita", "Rani"]],
  ] as const) {
    const out = redactPii(input).text;
    for (const word of leaked) assert.equal(out.includes(word), false, `${input} -> ${out}`);
  }
  assert.equal(redactPii("I am Mr. Rao from Pune").text.includes("Pune"), true, "the place after the name survives");
});

test("p1-u8r cycle 1: the email pass is skipped without an at-sign and the local part is bounded, so 200k characters of 'a.' redact quickly", () => {
  for (const input of ["a.".repeat(100_000), "a".repeat(200_000), "a.".repeat(50_000) + "@", "a.@".repeat(60_000)]) {
    const t0 = performance.now();
    redactPii(input);
    const ms = performance.now() - t0;
    assert.ok(ms < 200, `${input.length} chars took ${ms.toFixed(0)} ms`);
  }
  // Text with no at-sign never reaches the email pass: 2M characters still take well under 100 ms (the bounded pass alone would need ~400 ms).
  const big = "a.".repeat(1_000_000);
  const t1 = performance.now();
  redactPii(big);
  assert.ok(performance.now() - t1 < 100, "no-at-sign text skips the email pass");
  assert.equal(redactPii("write to priya.sharma@example.com now").text, "write to [EMAIL] now");
});

test("p1-u8r cycle 2 item 4: a title and initials do not use up the name-token budget, so 'I'm Dr. A. P. J. Abdul Kalam' keeps no part of the name", () => {
  for (const input of ["I'm Dr. A. P. J. Abdul Kalam", "My name is Prof. Dr. Anita Rao Verma", "my name is dr. anita rao verma and i want to study", "I am Shri Ram Prasad Bismil Sharma"]) {
    const out = redactPii(input).text;
    for (const word of ["Abdul", "Kalam", "Anita", "anita", "Verma", "verma", "Rao", "rao", "Bismil", "Sharma"]) assert.equal(out.includes(word), false, `${input} -> ${out}`);
  }
  assert.equal(redactPii("I'm Dr. A. P. J. Abdul Kalam from Pune").text.includes("Pune"), true, "the place after the name survives");
  // A long run of titles is still linear.
  const t0 = performance.now();
  redactPii("My name is " + "Dr. ".repeat(50_000));
  assert.ok(performance.now() - t0 < 500, "a run of titles redacts quickly");
});

test("w1 ISS-198: a lower-case one-letter initial before a surname is part of the name, so 'my name is s. kumar' keeps no part of it", () => {
  const cases: Array<[string, string[]]> = [
    ["my name is s. kumar", ["kumar"]],
    ["i am a. kumar", ["kumar"]],
    ["i am j. r. d. tata", ["tata"]],
    ["call me k. v. rao please", ["rao"]],
    ["my name is a. p. j. abdul kalam", ["abdul", "kalam"]],
    ["my name is dr. s. kumar", ["kumar"]],
  ];
  for (const [input, gone] of cases) {
    const out = redactPii(input);
    for (const word of gone) assert.equal(new RegExp(`\b${word}\b`).test(out.text), false, `${input} -> ${out.text}`);
    assert.ok(out.text.includes("[NAME]"), `${input} -> ${out.text}`);
    assert.ok(out.names.length === 1, "the stated name is returned for the reply redaction");
  }
  assert.equal(redactPii("please call me k. v. rao tomorrow").text.includes("tomorrow"), true, "text after the name survives");
});

test("w1 ISS-198: a lone lower-case initial that is not followed by a name is not redacted (no over-redaction of ordinary sentences)", () => {
  for (const keep of ["i am a student", "i am a. i want to study in germany", "i am s. and i want to study", "i am 17 years old", "my name is a."]) {
    assert.equal(redactPii(keep).text, keep, keep);
  }
});
