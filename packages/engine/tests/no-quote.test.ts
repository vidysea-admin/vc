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
