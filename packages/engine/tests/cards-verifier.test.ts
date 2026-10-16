/**
 * T-010: the Verifier and the B18 relevance rules as plain functions (no graph, no provider).
 * B1 hostile script outputs, B2 fabricated sources, B18 known / not-applicable / do-not-ask /
 * urgency, and the pre-brief.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildEvidenceIndex,
  buildPreBrief,
  buildRelevanceContext,
  cardId,
  liveScriptReason,
  verifyCards,
  type KnownFact,
} from "../src/cards/index.js";
import { GOOD_CARDS, NOW, SESSION_ID, UK_FACTS, UK_TURNS, turn } from "./cards-fixtures.js";
import type { ScribeTurn } from "../src/scribe/schemas.js";

const known = (facts = UK_FACTS): KnownFact[] => facts.map(({ _id, studentId: _s, active: _a, ...f }) => ({ ...f, id: _id }) as KnownFact);

function verify(candidates: unknown[], opts: { facts?: KnownFact[]; turns?: ScribeTurn[]; kbIds?: string[]; checkIns?: never[] } = {}) {
  const facts = opts.facts ?? known();
  const turns = opts.turns ?? UK_TURNS;
  return verifyCards({
    sessionId: SESSION_ID,
    candidates,
    evidence: buildEvidenceIndex(facts, turns, opts.kbIds ?? ["kb-node-1", "https://example.edu/fees"]),
    relevance: buildRelevanceContext(facts, turns, NOW()),
  });
}

const cite = [{ type: "profile", id: "f-dest" }];
const card = (type: string, prompt: string, sources: unknown[] = cite) => ({ type, prompt, sources, confidence: 0.5 });

test("T-010 B2: every good, cited card is kept with a stable id", () => {
  const out = verify(GOOD_CARDS);
  assert.equal(out.dropped.length, 0, JSON.stringify(out.dropped));
  assert.equal(out.kept.length, 4);
  for (const c of out.kept) assert.equal(c.id, cardId(SESSION_ID, c.type, c.prompt));
  assert.equal(cardId(SESSION_ID, "widen", "A?"), cardId(SESSION_ID, "widen", "  a? "));
});

const HOSTILE_SCRIPTS: [string, string][] = [
  ["widen", "Tell the student the UK is the best choice."],
  ["evidence", "Say: the deadline is next week."],
  ["compare", "Dear student, the UK has better universities than Canada."],
  ["widen", "I think Canada suits the student better?"],
  ["challenge", "You should apply to the UK now."],
  ["evidence", "Don't worry, everything will be fine."],
  ["compare", "Your line: University A is better."],
  ["evidence", "Explain to the student why the fees are high."],
  ["widen", "The UK is definitely better, right?"],
  ["compare", "We recommend Leeds over Manchester for computer science."],
  ["evidence", "Fees are 20 lakh. Rent is 8 lakh. Food is 2 lakh."],
  ["widen", "Consider Germany too."],
  ["clarify", "Hello! Could the student share their marks?"],
  ["challenge", "Student ko bolo ki UK sabse accha hai."],
  ["evidence", "In my experience the UK is the safest choice."],
  ["challenge", "Trust me, this course is right for them."],
  ["evidence", "x".repeat(301)],
];

test("T-010 B1: hostile script-like planner outputs are all dropped as script_like, none shown", () => {
  const out = verify(HOSTILE_SCRIPTS.map(([type, prompt]) => card(type, prompt)));
  assert.equal(out.kept.length, 0, `kept: ${out.kept.map((c) => c.prompt).join(" | ")}`);
  assert.deepEqual(
    out.dropped.map((d) => d.reason),
    HOSTILE_SCRIPTS.map(() => "script_like"),
  );
});

// ISS-t-010-c0-1 (cycle 0 FAIL, B1): an INSTRUCTION to the counsellor stays an instruction when a
// "?" is appended. A question mark is not what makes something a question, and the north star
// ("never a script") must not be defeatable by one character — in Devanagari as much as in English.
const INSTRUCTIONS_WEARING_A_QUESTION_MARK: [string, string][] = [
  // the two rows the checker demonstrated
  ["widen", "Explain the tuition difference to the student?"],
  ["clarify", "छात्रा को समझाइए कि वीज़ा में देर लगती है?"],
  // English imperatives with words between the verb and "the student" (the shared cue needs them adjacent)
  ["widen", "Remind the parents about the scholarship deadline?"],
  ["clarify", "Walk the student through the visa steps once more?"],
  ["evidence", "Explain the tuition difference to the student?"],
  ["compare", "Mention the cheaper Canadian option to the family?"],
  // Devanagari recital verbs, with and without "?"
  ["clarify", "छात्र को बताइए कि यूके महँगा है?"],
  ["widen", "छात्रा से कहिए कि वह कनाडा पर विचार करे?"],
  ["challenge", "परिवार को समझाओ कि बजट कम है।"],
  // Hinglish polite imperative forms the cycle-0 lexicon did not carry
  ["widen", "Unhe samjhaiye ki Canada sasta hai?"],
  ["clarify", "Student ko bataiye ki deadline January mein hai?"],
  // a plain declarative with a "?" bolted on: a statement, not a question
  ["widen", "The tuition in Canada is lower than in the UK for computer science?"],
];

test("T-010 B1 / ISS-t-010-c0-1: an instruction or statement with a trailing '?' is still dropped", () => {
  const out = verify(INSTRUCTIONS_WEARING_A_QUESTION_MARK.map(([type, prompt]) => card(type, prompt)));
  assert.equal(out.kept.length, 0, `B1 leak - shown as cards: ${out.kept.map((c) => c.prompt).join(" | ")}`);
  assert.deepEqual(
    out.dropped.map((d) => d.reason),
    INSTRUCTIONS_WEARING_A_QUESTION_MARK.map(() => "script_like"),
  );
  // and it is the FORM, not the punctuation: the same lines without "?" are equally script-like
  for (const [type, prompt] of INSTRUCTIONS_WEARING_A_QUESTION_MARK) {
    assert.notEqual(liveScriptReason(prompt.replace(/\?$/, "."), type as never), null, prompt);
  }
});

test("T-010 B1 / ISS-t-010-c0-1: genuine questions (incl. elliptical and Devanagari) are NOT flagged", () => {
  const genuine: [string, string][] = [
    ["widen", "Besides the UK, has the student looked at Ireland?"],
    ["clarify", "Is the 20 lakh budget per year or for the whole course?"],
    ["clarify", "Is there a note anywhere on the subject the student wants to study?"],
    ["widen", "Which other Indian cities has the student considered?"],
    ["check-in", "Would it help to pause and check how the student is feeling?"],
    // elliptical topic questions (the pre-brief's own open questions)
    ["clarify", "Intake year?"],
    ["clarify", "Course or field of study?"],
    ["clarify", "Visa route for the chosen country?"],
    // a real Devanagari / Hinglish question, not an instruction
    ["clarify", "क्या छात्रा ने किसी और देश के बारे में सोचा है?"],
    ["widen", "Kya student ne kisi aur desh ke baare mein socha hai?"],
  ];
  for (const [type, prompt] of genuine) assert.equal(liveScriptReason(prompt, type as never), null, prompt);
});

// ISS-t-010-c1-1 (cycle 1 FAIL, B1): the cycle-1 rules were a 26-verb allow-list, a <= 6 WORD
// COUNT and a comma. These are the checker's own hostile rows (chk-attack.mts / chk-attack2.mts),
// verbatim: 25 of its 28 were shown as verified cards. None of them needs the implementation to
// invent - each is ordinary English or Hindi a planner would produce.
const CHECKER_C1_HOSTILE: [string, string][] = [
  // (a) the word-count hatch: plain declaratives short enough to be "questions" by fiat
  ["widen", "Canada is cheaper than the UK?"],
  ["widen", "The UK is too expensive?"],
  ["widen", "Germany suits her budget better?"],
  // (a) imperatives whose verb is outside the 26-item list
  ["widen", "Recommend Canada over the UK?"],
  ["clarify", "Suggest a cheaper country?"],
  ["widen", "Urge her to apply early?"],
  ["clarify", "Propose Ireland as a backup?"],
  ["widen", "Nudge the family towards Canada?"],
  ["widen", "Steer her away from the UK?"],
  ["clarify", "Point out the cheaper option?"],
  ["widen", "Suggest Canada instead of the UK?"],
  ["widen", "Recommend a cheaper country than UK?"],
  ["clarify", "Push her towards Canada, not UK?"],
  // (b) an auxiliary after a comma is not subject-auxiliary inversion
  ["clarify", "The student's intended major, computer science, is a strong fit for Canada?"],
  ["widen", "Her plan, as recorded, is to leave in 2027?"],
  // (c) imperatives on STATEMENT card types, where rule (c) never applies
  ["evidence", "Suggest to the student that Canada is cheaper than the UK."],
  ["challenge", "Point out to the family that the UK fees are higher."],
  ["evidence", "Urge the student to finalise the course this week."],
  ["compare", "Recommend Canada over the UK to the family."],
  // (d) Devanagari recitals with a stem outside the eight-stem lexicon, on statement types
  ["evidence", "छात्रा को यह जानकारी दीजिए कि वीज़ा में देर लगती है।"],
  ["compare", "छात्रा को यह लाइन पढ़कर सुनाइए कि कनाडा सस्ता है।"],
  ["clarify", "छात्रा को यह जानकारी दीजिए कि वीज़ा में देर लगती है?"],
  ["clarify", "छात्रा को यह पूरी बात अच्छे से बता दीजिएगा कि वीज़ा में देर लगती है?"],
];

test("T-010 B1 / ISS-t-010-c1-1: the checker's hostile rows (verb list, word count, comma, Devanagari) all drop", () => {
  const out = verify(CHECKER_C1_HOSTILE.map(([type, prompt]) => card(type, prompt)));
  assert.equal(out.kept.length, 0, `B1 leak - shown as cards: ${out.kept.map((c) => c.prompt).join(" | ")}`);
  assert.deepEqual(
    out.dropped.map((d) => d.reason),
    CHECKER_C1_HOSTILE.map(() => "script_like"),
  );
  // FORM, not punctuation: the same lines with the "?" swapped for a "." are equally script-like
  for (const [type, prompt] of CHECKER_C1_HOSTILE) {
    assert.notEqual(liveScriptReason(prompt.replace(/\?$/, "."), type as never), null, prompt);
  }
});

test("T-010 B1: a quoted student sentence and the I-20 form are not the counsellor's own voice", () => {
  assert.equal(liveScriptReason('The student said "I will manage" — is that about money or grades?', "challenge"), null);
  assert.equal(liveScriptReason("Would the I-20 timeline affect the student's plan?", "widen"), null);
  assert.equal(liveScriptReason("Would I recommend this?", "widen"), "speaks in the counsellor's own voice");
});

test("T-010 B1: a planner may not make a check-in card (only a concern flag does)", () => {
  const out = verify([card("check-in", "Would it help to check how the student is feeling?")]);
  assert.equal(out.kept.length, 0);
  assert.equal(out.dropped[0]?.reason, "invalid_shape");
});

const FABRICATED: [string, unknown[]][] = [
  ["no sources", []],
  ["invented profile id", [{ type: "profile", id: "f-nope" }]],
  ["turn not in the window", [{ type: "transcript", id: "t9", quote: "computer science" }]],
  ["quote not in the turn", [{ type: "transcript", id: "t3", quote: "around 30 lakh rupees" }]],
  ["quote too short", [{ type: "transcript", id: "t3", quote: "a" }]],
  ["transcript with no quote", [{ type: "transcript", id: "t3" }]],
  ["kb id the KB never returned", [{ type: "kb", id: "kb-invented" }]],
  ["unknown source type", [{ type: "web", id: "https://example.edu/fees" }]],
  ["one real + one fabricated", [{ type: "profile", id: "f-dest" }, { type: "kb", id: "kb-invented" }]],
];

test("T-010 B2: uncited or fabricated-source cards are dropped, never shown as verified", () => {
  const out = verify(FABRICATED.map(([, sources]) => card("widen", "Besides the UK, has the student looked at Ireland?", sources)));
  assert.equal(out.kept.length, 0);
  assert.deepEqual(
    out.dropped.map((d) => d.reason),
    FABRICATED.map(([name]) => (name === "no sources" ? "uncited" : "unresolved_source")),
  );
});

test("T-010 B2: a kb source resolves only against THIS run's KB citations (no KB -> dropped)", () => {
  const evidenceCard = GOOD_CARDS[2]!;
  assert.equal(verify([evidenceCard]).kept.length, 1);
  const noKb = verify([evidenceCard], { kbIds: [] });
  assert.equal(noKb.kept.length, 0);
  assert.equal(noKb.dropped[0]?.reason, "unresolved_source");
});

test("T-010 B2: a transcript quote resolves against the turn text (case/space-insensitive)", () => {
  const out = verify([
    card("challenge", "Does the 20 lakh figure include living costs as well as tuition?", [
      { type: "transcript", id: "t3", quote: "AROUND 20   lakh rupees" },
    ]),
  ]);
  assert.equal(out.kept.length, 1, JSON.stringify(out.dropped));
});

test("T-010 B18: an approved fact is not asked again as if unknown", () => {
  const out = verify([
    card("clarify", "What is the student's budget?", [{ type: "transcript", id: "t3", quote: "20 lakh rupees" }]),
    card("widen", "Which country does the student want to study in?", [{ type: "transcript", id: "t1", quote: "in the UK" }]),
    card("clarify", "How much can the family spend each year?", [{ type: "transcript", id: "t3", quote: "20 lakh rupees" }]),
    card("clarify", "Which course is the student interested in?", [{ type: "transcript", id: "t1", quote: "computer science" }]),
    card("clarify", "Is the budget fixed?", [{ type: "transcript", id: "t3", quote: "20 lakh rupees" }]),
  ]);
  assert.equal(out.kept.length, 0, out.kept.map((c) => c.prompt).join(" | "));
  assert.deepEqual(
    out.dropped.map((d) => d.reason),
    ["already_known", "already_known", "already_known", "already_known", "already_known"],
  );
});

test("T-010 B18: building on a known fact (cited clarify, widen) is kept", () => {
  const out = verify([GOOD_CARDS[0], GOOD_CARDS[1]]);
  assert.equal(out.kept.length, 2, JSON.stringify(out.dropped));
});

test("T-010 B18 / ISS-t-010-c0-2: citing an UNRELATED known fact does not license re-asking a known topic", () => {
  // The checker's row: a clarify that escapes DIRECT_ASK (no what/which/when/do-you stem) and
  // re-asks intended_major = "computer science", while citing an unrelated DESTINATION fact.
  const prompt = "Is there a note anywhere on the subject the student wants to study?";
  const unrelated = verify([card("clarify", prompt, [{ type: "profile", id: "f-dest" }])]);
  assert.equal(unrelated.kept.length, 0, `B18 leak - shown: ${unrelated.kept.map((c) => c.prompt).join(" | ")}`);
  assert.equal(unrelated.dropped[0]?.reason, "already_known");
  // the same prompt with a non-profile citation was already dropped; the profile citation must not rescue it
  const noProfile = verify([card("clarify", prompt, [{ type: "transcript", id: "t1", quote: "computer science" }])]);
  assert.equal(noProfile.dropped[0]?.reason, "already_known");
  // control 1: a clarify that cites the very fact it builds on is still kept, even when it mentions
  // a second known topic in passing ("...or for the whole course?" mentions course, cites budget).
  assert.equal(verify([GOOD_CARDS[1]]).kept.length, 1, JSON.stringify(verify([GOOD_CARDS[1]]).dropped));
  // control 2: a clarify citing the destination fact and actually ABOUT the destination is kept
  assert.equal(
    verify([card("clarify", "Is the UK the only destination on the table, or a first preference?", [{ type: "profile", id: "f-dest" }])]).kept.length,
    1,
  );
});

// ISS-t-010-c1-2 (cycle 1 FAIL, B18): cycle 1 replaced `|| citedTopics.size > 0` with a SINGLE
// GLOBAL boolean computed outside the knownTopics loop, so name-dropping any cited topic's keyword
// switched the clarify guard off for every OTHER known topic. These are the checker's own five
// rows, verbatim; the shipped cycle-1 code dropped only the first.
const CHECKER_C1_B18: [string, string, string][] = [
  ["A1 the cycle-0 row", "Is there a note anywhere on the subject the student wants to study?", "f-dest"],
  ["A2 + five words, cites budget", "Is there a note anywhere on the subject the student wants to study, given the 20 lakh budget?", "f-budget"],
  ["A2b cited topic first", "Is the budget the reason there is no note on the subject the student wants to study?", "f-budget"],
  ["A2c cites destination", "Is the country choice settled before the subject the student wants to study?", "f-dest"],
  ["A2d re-asks destination", "Is the fees estimate ready for the country the student is going to?", "f-budget"],
];

test("T-010 B18 / ISS-t-010-c1-2: naming a cited topic in passing does not license re-asking another known topic", () => {
  for (const [label, prompt, factId] of CHECKER_C1_B18) {
    const out = verify([card("clarify", prompt, [{ type: "profile", id: factId }])]);
    assert.equal(out.kept.length, 0, `B18 leak (${label}) - shown: ${out.kept.map((c) => c.prompt).join(" | ")}`);
    assert.equal(out.dropped[0]?.reason, "already_known", label);
  }
  // The other direction, which the cycle-0 verdict's literal `citedTopics.has(topic)` fix broke:
  // a clarify that NAMES a second known topic while asking about the one it cites stays kept.
  // (CE-054 in qa/evals/cards-eval.jsonl: cites budget, names "course".)
  assert.equal(verify([GOOD_CARDS[1]]).kept.length, 1, JSON.stringify(verify([GOOD_CARDS[1]]).dropped));
  assert.equal(
    verify([card("clarify", "Is the 20 lakh budget the yearly figure, or the whole four-year course?", [{ type: "profile", id: "f-budget" }])]).kept.length,
    1,
  );
  // and the guard is PER TOPIC, not global: the same prompt with no citation at all still drops
  assert.equal(
    verify([card("clarify", CHECKER_C1_B18[0]![1], [{ type: "transcript", id: "t1", quote: "computer science" }])]).dropped[0]?.reason,
    "already_known",
  );
});

test("T-010 B18: an India-only student gets no visa card (facts or what they said)", () => {
  const indiaFacts = known([UK_FACTS[1]!, { ...UK_FACTS[0]!, value: "India" }]);
  const turns = [turn("t1", "student", "I only want to study in India, maybe Pune or Delhi.")];
  const visa = [
    card("widen", "Has the student started the student visa paperwork?", [{ type: "profile", id: "f-dest" }]),
    card("evidence", "Post-study work rules differ by country.", [{ type: "profile", id: "f-dest" }]),
    card("clarify", "Does the student know about the study permit timeline?", [{ type: "profile", id: "f-dest" }]),
  ];
  const out = verify(visa, { facts: indiaFacts, turns });
  assert.equal(out.kept.length, 0);
  assert.deepEqual(out.dropped.map((d) => d.reason), ["not_applicable", "not_applicable", "not_applicable"]);
  // Hostile variant: no destination FACT, the student only SAYS India in the live window.
  const saidCite = [{ type: "transcript", id: "t1", quote: "study in India" }];
  const saidOnly = verify(
    visa.map((c) => ({ ...c, sources: saidCite })),
    { facts: known([UK_FACTS[1]!]), turns },
  );
  assert.equal(saidOnly.kept.length, 0);
  assert.deepEqual(saidOnly.dropped.map((d) => d.reason), ["not_applicable", "not_applicable", "not_applicable"]);
  // Control: a UK student does get the visa card.
  assert.equal(verify([visa[0]]).kept.length, 1);
});

test("T-010 B18: anything on the approved do-not-ask list is never raised", () => {
  const facts = known([...UK_FACTS, { ...UK_FACTS[0]!, _id: "f-dna", key: "do_not_ask", value: ["father's job"] }]);
  const out = verify(
    [
      card("challenge", "Could the father's job change the funding plan?", [{ type: "profile", id: "f-budget" }]),
      card("widen", "Would a scholarship widen the options?", [{ type: "profile", id: "f-budget" }]),
    ],
    { facts },
  );
  assert.deepEqual(out.dropped.map((d) => d.reason), ["do_not_ask"]);
  assert.equal(out.kept.length, 1);
});

test("T-010 B18 / SC-038: a student leaving two or more years out gets no urgency card", () => {
  const facts = known([...UK_FACTS, { ...UK_FACTS[0]!, _id: "f-intake", key: "intake_year", value: "2029" }]);
  const urgent = card("evidence", "Applications for this intake close this week.", [{ type: "kb", id: "kb-node-1" }]);
  assert.equal(verify([urgent], { facts }).dropped[0]?.reason, "urgency_mismatch");
  // Said in the window, no intake fact.
  const turns = [...UK_TURNS, turn("t4", "student", "I will only go after two years, once I finish my diploma.")];
  assert.equal(verify([urgent], { turns }).dropped[0]?.reason, "urgency_mismatch");
  // Control: an intake next year keeps it.
  const soon = known([...UK_FACTS, { ...UK_FACTS[0]!, _id: "f-intake", key: "intake_year", value: "2027" }]);
  assert.equal(verify([urgent], { facts: soon }).kept.length, 1);
});

test("T-010: duplicate prompts are dropped as duplicate", () => {
  const out = verify([GOOD_CARDS[0], { ...GOOD_CARDS[0], prompt: `  ${GOOD_CARDS[0]!.prompt}` }]);
  assert.equal(out.kept.length, 1);
  assert.equal(out.dropped[0]?.reason, "duplicate");
});

test("T-010 B5: a malformed planner item is dropped (invalid_shape), not a crash", () => {
  const out = verify([null, 42, { type: "widen" }, { ...GOOD_CARDS[0], confidence: 7 }, { ...GOOD_CARDS[0], type: "script" }]);
  assert.equal(out.kept.length, 0);
  assert.equal(out.dropped.every((d) => d.reason === "invalid_shape"), true);
  assert.equal(out.dropped.length, 5);
});

test("T-010 pre-brief: known facts, open questions (never a known topic), do-not-ask", () => {
  const facts = known([...UK_FACTS, { ...UK_FACTS[0]!, _id: "f-dna", key: "do_not_ask", value: ["father's job"] }]);
  const brief = buildPreBrief(facts, buildRelevanceContext(facts, [], NOW()));
  assert.equal(brief.knownFacts.length, 3);
  assert.ok(brief.knownFacts.every((f) => !("id" in f)));
  assert.ok(!brief.openQuestions.some((q) => /budget|destination|course/i.test(q)), brief.openQuestions.join(" | "));
  assert.ok(brief.openQuestions.includes("Visa route for the chosen country?"));
  assert.ok(brief.doNotAsk.includes("budget") && brief.doNotAsk.includes("father's job"));
  for (const q of brief.openQuestions) assert.equal(liveScriptReason(q, "clarify"), null, q);
  // India-only: no visa open question.
  const india = known([{ ...UK_FACTS[0]!, value: "India" }]);
  assert.ok(!buildPreBrief(india, buildRelevanceContext(india, [], NOW())).openQuestions.some((q) => /visa/i.test(q)));
});

// --- cycle 3 ----------------------------------------------------------------------------------
// The cycle-2 checker's own rows, preserved here so a future cycle cannot re-open these three
// issues silently. Every row below was authored by the checker (K*, I*, D*, O*) or by me against
// the new mechanisms (N*); the comment on each block says which.

/** ISS-t-010-c2-2 (checker cycle 2): re-asks an approved fact in phrasings outside any frame list. */
const CHECKER_C2_B18_REASK: [string, string, string][] = [
  ["K1", "Is the course something we should pin down first?", "f-budget"],
  ["K2", "Could we confirm the course before the budget conversation?", "f-budget"],
  ["K3", "Any idea what the course looks like for her?", "f-budget"],
  ["K5", "Is the course on the record anywhere in the file?", "f-budget"],
  ["K6", "Shall we nail down the course she is after?", "f-budget"],
  ["K7", "Is her course a blank in the profile?", "f-budget"],
  ["K8", "Is the destination country a question mark for the family?", "f-budget"],
  ["K9", "Would it help to establish the budget figure?", "f-dest"],
  ["K10", "Is the budget a mystery at this point?", "f-dest"],
];
/** Mine: attacks on the ONE carve-out, each satisfying some of namedInPassing's four conditions. */
const MAKER_C3_CARVEOUT_ATTACKS: [string, string][] = [
  ["N2a state adjective in the tail", "Is the 20 lakh budget per year or unclear for the course?"],
  ["N2b participle in the tail", "Is the 20 lakh budget the only fixed thing, unlike the course?"],
  ["N2c bare adjective in the tail", "Is the 20 lakh budget known but not the course?"],
  ["N2d anchor after the mention", "Should we pin the course down before the 20 lakh budget?"],
  ["N2e two mentions", "Is the 20 lakh budget per course or for the whole course?"],
  ["N2f finite verb in the tail", "Is the 20 lakh budget per year or has she settled the course?"],
  ["N2g wh-word in the tail", "Is the 20 lakh budget per year and what about the course?"],
  ["N2i mention not final", "Is the 20 lakh budget per year, or the course still open?"],
];

test("T-010 B18 / ISS-t-010-c2-2: the clarify branch defaults to SUPPRESSING; only a passing mention survives", () => {
  // (1) the checker's cycle-2 rows: 9/10 of these were SHOWN by cycle 2 and 1/10 by cycle 1.
  for (const [label, prompt, factId] of CHECKER_C2_B18_REASK) {
    const out = verify([card("clarify", prompt, [{ type: "profile", id: factId }])]);
    assert.equal(out.kept.length, 0, `B18 leak (${label}) - shown: ${out.kept.map((c) => c.prompt).join(" | ")}`);
    assert.equal(out.dropped[0]?.reason, "already_known", label);
  }
  // (2) the confound the checker removed: with NO profile citation at all the same rows must drop.
  for (const [label, prompt] of CHECKER_C2_B18_REASK) {
    const out = verify([card("clarify", prompt, [{ type: "transcript", id: "t1", quote: "computer science" }])]);
    assert.equal(out.dropped[0]?.reason, "already_known", `no-citation ${label}`);
  }
  // (3) my own attacks on the carve-out itself: each one breaks exactly one of its four conditions.
  for (const [label, prompt] of MAKER_C3_CARVEOUT_ATTACKS) {
    const out = verify([card("clarify", prompt, [{ type: "profile", id: "f-budget" }])]);
    assert.equal(out.kept.length, 0, `carve-out leak (${label}) - shown: ${out.kept.map((c) => c.prompt).join(" | ")}`);
  }
  // (4) and the carve-out still does its one job: CE-054's shape is kept.
  assert.equal(
    verify([card("clarify", "Is the 20 lakh budget per year or for the whole course?", [{ type: "profile", id: "f-budget" }])]).kept.length,
    1,
  );
});

/** ISS-t-010-c2-1 (checker cycle 2): imperatives with a bare-NP object, on every card type. */
const CHECKER_C2_B1_IMPERATIVE: [string, string][] = [
  ["evidence", "Recommend affordable options to the family."],
  ["evidence", "Suggest cheaper destinations for her."],
  ["evidence", "Address tuition worries with the parents."],
  ["challenge", "Press upon the family that Canada is cheaper."],
  ["evidence", "Push scholarships as the realistic answer."],
  ["evidence", "Urge early applications for the January intake."],
  ["compare", "Nudge parents towards Canada this week."],
  ["evidence", "Frame affordability as the deciding factor."],
  ["widen", "Recommend affordable options to the family?"],
  ["evidence", "Avoid mentioning the visa backlog to her."],
  ["evidence", "Offer 20 lakh as the working figure."],
];
/** ISS-t-010-c2-1 (checker cycle 2): the addressee-free Devanagari imperative, on five card types. */
const CHECKER_C2_B1_DEVANAGARI: [string, string][] = [
  ["evidence", "यह लाइन पढ़कर सुनाइए कि कनाडा सस्ता है।"],
  ["compare", "यह लाइन पढ़कर सुनाइए कि कनाडा सस्ता है।"],
  ["challenge", "यह लाइन पढ़कर सुनाइए कि कनाडा सस्ता है।"],
  ["evidence", "यह जानकारी दीजिए कि वीज़ा में देर लगती है।"],
  ["evidence", "यह पंक्ति पढ़िए कि कनाडा सस्ता है।"],
  ["compare", "यह बात दोहराइए कि यूके महँगा है।"],
  ["clarify", "यह लाइन सुनाइए कि कनाडा सस्ता है?"],
  ["clarify", "कनाडा सस्ता सुनाइए?"],
];

test("T-010 B1 / ISS-t-010-c2-1: an imperative with a bare-NP object fails CLOSED, in both scripts", () => {
  for (const [type, prompt] of CHECKER_C2_B1_IMPERATIVE) {
    assert.notEqual(liveScriptReason(prompt, type as never), null, `B1 leak: ${type} | ${prompt}`);
  }
  // the same rows with the "?" swapped for a "." and back: the rule is punctuation-blind
  for (const [type, prompt] of CHECKER_C2_B1_IMPERATIVE) {
    assert.notEqual(liveScriptReason(prompt.replace(/[.?]$/, "?"), type as never), null, prompt);
  }
  // Devanagari: no addressee required, and a question card type is not a way past it
  for (const [type, prompt] of CHECKER_C2_B1_DEVANAGARI) {
    assert.equal(liveScriptReason(prompt, type as never), "a line to deliver (Devanagari)", `${type} | ${prompt}`);
  }
  // the Romanised mirror (my own row: the polite auxiliary "dijiye", not a listed main verb)
  assert.notEqual(liveScriptReason("Family ko bata dijiye ki Canada sasta hai.", "evidence"), null);
  // and the ASCII fragment hatch no longer admits a leading bare verb or ANY Devanagari prompt
  assert.equal(liveScriptReason("Recommend affordable options to the family?", "widen"), "an instruction to the counsellor, not a card");
});

/** ISS-t-010-c2-3 (checker cycle 2): legitimate elliptical cards cycle 1 kept and cycle 2 dropped. */
const CHECKER_C2_ELLIPTICAL_KEEP: [string, string][] = [
  ["widen", "Other countries within her budget?"],
  ["widen", "Backup countries besides the UK?"],
  ["widen", "Cheaper options than the UK?"],
  ["clarify", "Living costs in Canada?"],
  ["clarify", "Funding options for the family?"],
  ["widen", "More affordable countries?"],
  ["clarify", "Her intake year?"],
  ["widen", "Ireland as a backup?"],
];

test("T-010 B1 / ISS-t-010-c2-3: legitimate elliptical cards are not over-suppressed", () => {
  for (const [type, prompt] of CHECKER_C2_ELLIPTICAL_KEEP) {
    assert.equal(liveScriptReason(prompt, type as never), null, `over-suppressed: ${type} | ${prompt}`);
  }
  // the specific bug inside that list: the preposition "as" was read as a third-person verb
  assert.equal(liveScriptReason("Ireland as a backup?", "widen"), null);
  // and the declaratives the over-broad rules were meant to catch are STILL caught, by their verb
  assert.notEqual(liveScriptReason("Canada is cheaper than the UK?", "widen"), null);
  assert.notEqual(liveScriptReason("Germany suits her budget better?", "widen"), null);
  assert.notEqual(liveScriptReason("The UK is too expensive?", "widen"), null);
});
