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
