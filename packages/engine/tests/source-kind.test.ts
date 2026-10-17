/**
 * P1 U6, spec A22 / contract B24.4 (source kind; D-088 Q9) at the claim layer: every answer claim is
 * tagged internal-seminar | toc | whatsapp | unknown; for whatsapp and unknown the answer carries no
 * verbatim run of >= 8 consecutive source words and no personal identifiers (phone regex, speakers.json
 * names/aliases, WhatsApp speakerLabels of the turn); seminar/TOC may be paraphrased. Fixtures: a
 * WhatsApp session, a listed seminar session, an unlisted recording, a session with no determinable kind
 * (a served /ask answer is restricted "unknown" by default).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { guardClaims } from "../src/student/claims.js";
import { hasVerbatimRun } from "../src/guards/no-quote.js";
import { ASK_ANSWERED, HIT_SEMINAR, HIT_TOC_OLD, HIT_UNLISTED_RECORDING, HIT_WHATSAPP, NOW, SPEAKERS, fakeKb } from "./student-fixtures.js";

const hits = [HIT_SEMINAR, HIT_WHATSAPP, HIT_UNLISTED_RECORDING, HIT_TOC_OLD];
const ctx = { hits, now: NOW, speakers: SPEAKERS };

test("A22: every claim is tagged with the source kind of its source (seminar, toc, whatsapp, unlisted recording = unknown)", async () => {
  const out = await guardClaims(
    [
      { text: "German public universities charge no tuition for most programmes.", kind: "fact", sourceIds: ["t-sem-1"] },
      { text: "Canada requires proof of funds for the study permit.", kind: "country", sourceIds: ["t-toc-1"] },
      { text: "Past applicants report the DAAD scholarship deadline falls in October.", kind: "fact", sourceIds: ["t-wa-1"] },
      { text: "A German student visa needs a blocked account of about 11,904 euros.", kind: "number", sourceIds: ["t-rec-9"] },
    ],
    ctx,
  );
  assert.deepEqual(out.claims.map((c) => c.sourceKind), ["internal-seminar", "toc", "whatsapp", "unknown"]);
  for (const s of out.sources) assert.ok(["internal-seminar", "toc", "whatsapp", "unknown"].includes(s.kind));
});

test("A22: a claim with no determinable kind (served /ask, unresolvable source) is restricted 'unknown'", async () => {
  const kb = fakeKb();
  const out = await guardClaims(
    [
      { text: "Public universities there mostly charge no tuition.", kind: "fact", sourceIds: ["session:sess-sem-2"] },
      { text: "Something with no source at all.", kind: "fact", sourceIds: [] },
    ],
    { hits: [], ask: ASK_ANSWERED, getSession: kb.getSession, now: NOW, speakers: SPEAKERS },
  );
  assert.deepEqual(out.claims.map((c) => c.sourceKind), ["unknown", "unknown"]);
});

test("A22: a WhatsApp or unknown claim quoting >= 8 consecutive source words is removed from the answer (never verbatim)", async () => {
  const verbatimWa = "my cousin got the DAAD scholarship last year, apply by October";
  const verbatimRec = "Blocked accounts of about 11,904 euros are required for the German student visa.";
  const out = await guardClaims(
    [
      { text: verbatimWa, kind: "fact", sourceIds: ["t-wa-1"] },
      { text: verbatimRec, kind: "number", sourceIds: ["t-rec-9"] },
    ],
    ctx,
  );
  assert.equal(out.claims.length, 0);
  assert.deepEqual(out.dropped.map((d) => d.reason).sort(), ["verbatim_restricted_source", "verbatim_restricted_source"]);
});

test("A22: a WhatsApp claim mixing a seminar source still counts as restricted (most restrictive kind wins)", async () => {
  const out = await guardClaims([{ text: "my cousin got the DAAD scholarship last year, apply by October", kind: "fact", sourceIds: ["t-sem-1", "t-wa-1"] }], ctx);
  assert.equal(out.claims.length, 0);
});

test("A22: seminar and TOC material may be cited as a close paraphrase (no verbatim drop)", async () => {
  const out = await guardClaims([{ text: "German public universities charge no tuition for most programmes, but expect a semester contribution.", kind: "fact", sourceIds: ["t-sem-1"] }], ctx);
  assert.equal(out.claims.length, 1);
  assert.equal(out.claims[0]!.sourceKind, "internal-seminar");
  assert.equal(hasVerbatimRun(out.claims[0]!.text, HIT_SEMINAR.text), true, "the seminar paraphrase kept its overlap");
});

test("A22: personal identifiers (phone, listed names, WhatsApp speakerLabels of the turn) never survive in a restricted claim", async () => {
  const waWithLabel = { ...HIT_WHATSAPP, speakerLabel: "Rohit Q." };
  const out = await guardClaims(
    [{ text: "Rohit Q. and Kavya ma'am say an agent on 98765 43210 helps with the DAAD scholarship by October.", kind: "fact", sourceIds: ["t-wa-1"] }],
    { hits: [HIT_SEMINAR, waWithLabel], now: NOW, speakers: SPEAKERS },
  );
  assert.equal(out.claims.length, 1);
  const text = out.claims[0]!.text;
  assert.doesNotMatch(text, /98765|43210/);
  assert.doesNotMatch(text, /Rohit|Kavya/);
});

test("A3 at the claim layer: a denied speaker name is removed even from a seminar claim; a permitted one stays", async () => {
  const out = await guardClaims(
    [
      { text: "As Arjun sir explained, German public universities charge no tuition for most programmes.", kind: "fact", sourceIds: ["t-sem-1"] },
      { text: "Nisha Varadkar explained that German public universities charge no tuition.", kind: "fact", sourceIds: ["t-sem-1"] },
    ],
    ctx,
  );
  assert.doesNotMatch(out.claims[0]!.text, /Arjun/);
  assert.match(out.claims[1]!.text, /Nisha Varadkar/);
});
