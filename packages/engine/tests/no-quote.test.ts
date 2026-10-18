/**
 * P1 U6, spec A3 / contract B24.3 (no-quote guard, written permission, default-deny) and the A22
 * detector (verbatim run >= 8 words, phone numbers, speaker names/aliases, WhatsApp speakerLabels).
 * Exhaustive over tests/fixtures/speakers.json: every alias of every speaker WITHOUT a written-
 * permission record is removed in every surface form we generate; a speaker WITH a record survives.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  SpeakersFileSchema,
  noQuoteGuard,
  findPersonalIdentifiers,
  hasVerbatimRun,
  redactPersonalIdentifiers,
  VERBATIM_RUN_WORDS,
  type SpeakersFile,
} from "../src/guards/no-quote.js";

const here = dirname(fileURLToPath(import.meta.url));
const speakers: SpeakersFile = SpeakersFileSchema.parse(JSON.parse(readFileSync(join(here, "fixtures", "speakers.json"), "utf8")));
const denied = speakers.speakers.filter((s) => !s.permission);
const permitted = speakers.speakers.filter((s) => s.permission);

function surfaceForms(alias: string): string[] {
  return [
    `${alias} said the deadline is in October.`,
    `As ${alias} explained, apply early.`,
    `according to ${alias.toLowerCase()}, apply early`,
    `ACCORDING TO ${alias.toUpperCase()}: APPLY EARLY`,
    `${alias}'s advice was to apply early.`,
    `"${alias}" — apply early.`,
    `(${alias}) apply early`,
    `${alias}, ${alias} and others agreed.`,
    `Seminar by ${alias}.`,
    `${alias}ने कहा कि जल्दी आवेदन करें।`.replace(`${alias}ने`, `${alias} ने`),
    `line one\n${alias}\nline three`,
  ];
}

test("A3: the fixture has both denied and permitted speakers, including external seminar speakers on both sides", () => {
  assert.ok(denied.length >= 3);
  assert.ok(permitted.length >= 1);
  assert.ok(denied.some((s) => s.external));
  assert.ok(permitted.some((s) => s.external));
  assert.ok(denied.some((s) => s.aliases.some((a) => /[ऀ-ॿ]/.test(a))), "Devanagari aliases are covered");
});

test("A3: exhaustive - no alias of a speaker without a written-permission record survives the guard in any surface form", () => {
  let checked = 0;
  for (const speaker of denied) {
    for (const alias of speaker.aliases) {
      for (const form of surfaceForms(alias)) {
        const out = noQuoteGuard(form, speakers);
        for (const other of speaker.aliases) {
          const hit = out.text.toLowerCase().includes(other.toLowerCase());
          assert.equal(hit, false, `alias "${other}" of ${speaker.id} survived in: ${JSON.stringify(out.text)} (input ${JSON.stringify(form)})`);
        }
        assert.ok(out.removed.some((r) => r.speakerId === speaker.id), `removal of ${speaker.id} recorded for ${JSON.stringify(form)}`);
        checked++;
      }
    }
  }
  assert.ok(checked >= 200, `checked ${checked} forms`);
});

test("A3: a speaker WITH a written-permission record may be named (default-deny is per speaker, not blanket)", () => {
  for (const speaker of permitted) {
    for (const alias of speaker.aliases) {
      const text = `${alias} said the deadline is in October.`;
      const out = noQuoteGuard(text, speakers);
      assert.equal(out.text, text);
      assert.deepEqual(out.removed, []);
    }
  }
});

test("A3: a denied name embedded inside a longer word is not mangled, but a standalone one is removed", () => {
  const out = noQuoteGuard("Kavyanjali is a different word; Kavya is the speaker.", speakers);
  assert.match(out.text, /Kavyanjali/);
  assert.doesNotMatch(out.text, /\bKavya\b/);
});

test("A3: zero-width characters and NBSP inside a denied name do not let it through", () => {
  const sneaky = ["Arjun​Mehrotra said so", "Arjun Mehrotra said so", "Kav‍ya said so"];
  for (const text of sneaky) {
    const out = noQuoteGuard(text, speakers);
    assert.doesNotMatch(out.text.replace(/[​-‍⁠﻿]/g, ""), /Arjun|Mehrotra|Kavya/i, JSON.stringify(out.text));
  }
});

test("R8: normalisation is for matching only - ZWJ/ZWNJ in Hindi text survive the guard unchanged; a removed name loses its zero-width chars", () => {
  const hindi = "क्‍ष और ‌में";
  assert.equal(noQuoteGuard(hindi, speakers).text, hindi);
  assert.equal(redactPersonalIdentifiers(hindi, speakers, []), hindi);
  assert.equal(noQuoteGuard("क्‍ष: Arjun​Mehrotra ने कहा", speakers).text, "क्‍ष: a speaker ने कहा");
});

test("R8: a title before a removed name goes with it (no 'Dr. a speaker' / 'Prof. a speaker')", () => {
  for (const text of ["Dr. Kavya said apply early.", "Prof Arjun said apply early.", "Mr. Arjun Mehrotra said apply early.", "Shri Arjun said apply early."]) {
    const out = noQuoteGuard(text, speakers).text;
    assert.equal(out, "a speaker said apply early.", text);
  }
  assert.equal(redactPersonalIdentifiers("Dr. Rohit Q. said so.", speakers, ["Rohit Q."]), "a speaker said so.");
});

test("A3: extra names (e.g. WhatsApp speakerLabels of this turn's hits) are removed too", () => {
  const out = noQuoteGuard("Rohit Q. said apply by October.", speakers, ["Rohit Q."]);
  assert.doesNotMatch(out.text, /Rohit/);
});

test("A22 detector: phone numbers, listed names/aliases and speakerLabels are personal identifiers; plain advice is not", () => {
  assert.deepEqual(findPersonalIdentifiers("Apply early and keep your documents ready.", speakers, []), []);
  const kinds = (t: string, labels: string[] = []) => findPersonalIdentifiers(t, speakers, labels).map((f) => f.kind).sort();
  assert.deepEqual(kinds("call me on +91 98765 43210"), ["phone"]);
  assert.deepEqual(kinds("call 9876543210 today"), ["phone"]);
  assert.deepEqual(kinds("ask Kavya ma'am"), ["speaker"]);
  assert.deepEqual(kinds("ask Rohit Q. about it", ["Rohit Q."]), ["speaker-label"]);
  assert.deepEqual(kinds("Seminar date 2026-03-04 and 11,000 euros"), [], "dates and amounts are not phone numbers");
});

test(`A22 detector: a verbatim run of >= ${VERBATIM_RUN_WORDS} consecutive source words is detected; 7 words or a paraphrase is not`, () => {
  const source = "my cousin got the DAAD one last year, apply by October and keep the bank letter ready";
  assert.equal(hasVerbatimRun("Someone said: my cousin got the DAAD one last year, apply by October.", source), true);
  assert.equal(hasVerbatimRun("MY COUSIN GOT THE DAAD ONE LAST YEAR!", source), true, "case and punctuation do not hide a run");
  assert.equal(hasVerbatimRun("my cousin got the DAAD one last", source), false, "7 words is under the bar");
  assert.equal(hasVerbatimRun("Past applicants report that DAAD applications are due around October.", source), false);
});

// ---------------------------------------------------------------------------
// U6h P5 (post-PASS hardening of U6): a WhatsApp / unknown speakerLabel is redacted in every variant
// the evidence may carry - first name, last name, reversed order, initials, diacritic-folded forms.
// Each test below was recorded RED first.
// ---------------------------------------------------------------------------

const LABEL = "Sanjay Kulkarni";
const LABEL_VARIANTS = [
  "Sanjay",
  "Kulkarni",
  "SANJAY KULKARNI",
  "kulkarni sanjay",
  "Kulkarni Sanjay",
  "Kulkarni, Sanjay",
  "S. Kulkarni",
  "S Kulkarni",
  "Sanjay K.",
  "Sanjay K",
  "S. K.",
  "S.K.",
  "Sanjáy Kulkarni",
  "Sanjay Kulkárni",
  "Sánjay",
  "Dr. Sanjay Kulkarni",
  "Sanjay​Kulkarni",
  "Sanjay Kulkarni",
];
const LEFTOVER = /sanjay|sanj[aá]y|kulkarni|kulk[aá]rni|\bS\.\s*K\b|\bS\.K\b|\bS\.\s*(?:a speaker|Kulkarni)|\bK\.(?!\w)/i;

test("U6h P5: redactPersonalIdentifiers removes every variant of a speakerLabel (first, last, reversed, initials, diacritic-folded)", () => {
  for (const v of LABEL_VARIANTS) {
    const out = redactPersonalIdentifiers(`As ${v} said, apply early. Then ${v} added the deadline.`, speakers, [LABEL]);
    assert.doesNotMatch(out, LEFTOVER, `${JSON.stringify(v)} -> ${JSON.stringify(out)}`);
    assert.match(out, /apply early/, "the rest of the sentence survives");
  }
});

test("U6h P5: noQuoteGuard (extraNames) and the A22 detector cover the same variants", () => {
  for (const v of LABEL_VARIANTS) {
    const text = `As ${v} said, apply early.`;
    assert.doesNotMatch(noQuoteGuard(text, speakers, [LABEL]).text, LEFTOVER, v);
    assert.ok(findPersonalIdentifiers(text, speakers, [LABEL]).some((f) => f.kind === "speaker-label"), `detector: ${v}`);
  }
});

test("U6h P5: a label with a diacritic matches its plain spelling too, and non-label look-alikes are not mangled", () => {
  assert.doesNotMatch(redactPersonalIdentifiers("Sanjay Kulkarni said apply early.", speakers, ["Sanjáy Kulkárni"]), /Sanjay|Kulkarni/);
  const keep = "Sanjayan Rao and Kulkarnia Road are unrelated, and so is a student called Sanj.";
  assert.equal(redactPersonalIdentifiers(keep, speakers, [LABEL]), keep);
  assert.equal(findPersonalIdentifiers("Apply early, the deadline is in October.", speakers, [LABEL]).length, 0);
});

test("U6h P5: a common word used as a name token ('Will') does not blank ordinary sentences", () => {
  const out = redactPersonalIdentifiers("The visa will be issued in two weeks. Will Mehra said so.", speakers, ["Will Mehra"]);
  assert.match(out, /The visa will be issued in two weeks\./);
  assert.doesNotMatch(out, /Mehra|Will Mehra/);
});

// U6h fix cycle 1 M3b. Scenario: a WhatsApp / unknown hit (restricted) carries a phone number in a shape the old detector
// missed; redactPersonalIdentifiers runs on it BEFORE the model sees it (graph.ts modelText) and on every shown claim.
test("U6h fix1 M3b: phone shapes the old detector missed are found and redacted (parenthesised area code, dots, Devanagari digits)", () => {
  const phones = [
    "(98765) 43210",
    "+91 (98765) 43210",
    "(415) 555-0132",
    "(415)555-0132",
    "+1 (415) 555-0132",
    "98765.43210",
    "98765/43210",
    "415.555.0132",
    "९८७६५ ४३२१०",
    "९८७६५४३२१०",
    "+९१ ९८७६५ ४३२१०",
  ];
  for (const p of phones) {
    const text = `Call me on ${p} tonight`;
    assert.deepEqual(findPersonalIdentifiers(text, speakers, []).map((f) => f.kind), ["phone"], `detect ${p}`);
    const out = redactPersonalIdentifiers(text, speakers, []);
    assert.doesNotMatch(out, /\d|[०-९]/, `redact ${p} -> ${out}`);
    assert.match(out, /\[number removed\]/, p);
  }
});

test("U6h fix1 M3b: years, fees, dates and ordinary numbers are not phone numbers", () => {
  const benign = [
    "The intake is in 2026.",
    "Fees are 5000 euros.",
    "Fees are 5,000 euros and living costs 11,000 euros.",
    "Seminar date 2026-03-04 and 11,000 euros",
    "Deadline 04.03.2026.",
    "Deadline 04/03/2026 for the 2026-27 intake.",
    "Version 3.11.4 of the guide.",
    "About 1.5 lakh per year or 120 ECTS credits.",
    "Call the office (open 9 to 5) for 2 weeks.",
    "Scores: IELTS 6.5, GRE 320.",
    "In (2026) the fee is 5000 euros.",
    "१०१० रुपये और २०२६ का सत्र",
  ];
  for (const t of benign) assert.deepEqual(findPersonalIdentifiers(t, speakers, []), [], t);
});

// P1 W3 (C4, U6h leftover 4): a parenthesised country code, "(+91) 98765 43210", is one phone number: no prefix is left behind.
test("P1 W3 U6h leftover 4: a parenthesised country code is redacted with its number, leaving no digit", () => {
  for (const p of ["(+91) 98765 43210", "(+91)98765 43210", "(+1) 415 555 0132", "(+44) 7911 123456"]) {
    const text = `Call me on ${p} tonight`;
    assert.deepEqual(findPersonalIdentifiers(text, speakers, []).map((f) => f.kind), ["phone"], `detect ${p}`);
    const out = redactPersonalIdentifiers(text, speakers, []);
    assert.doesNotMatch(out, /\d|\+/, `redact ${p} -> ${out}`);
    assert.equal(out, "Call me on [number removed] tonight", p);
  }
  assert.deepEqual(findPersonalIdentifiers("In (+5) points the fee is 5000 euros.", speakers, []), []);
});
