/**
 * P1 U6b: profile-aware option ranking (spec A16, A16b engine side, contract B24.8; gate answers D-086 Q3,
 * D-087 Q15, signature sheet P-8). Deterministic code, no LLM, no network, no provider. Synthetic profiles
 * (`syn-...`) only. Each test name says which real scenario reaches the behaviour.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ClaimSchema, SourceSchema, ProfileFactSchema, TurnResponseSchema } from "@vc/schemas";
import {
  rankOptions,
  DEFAULT_RANK_WEIGHTS,
  DEFAULT_RANKING_PROFILE,
  validateRankWeights,
  MAX_RANK_OPTIONS,
  type OptionData,
  type OptionDataPort,
  type RankInput,
  type RankResult,
} from "../src/index.js";

const here = dirname(fileURLToPath(import.meta.url));
const FIX = JSON.parse(readFileSync(join(here, "fixtures", "ranking-profiles.json"), "utf8")) as {
  profiles: Record<string, { studentId: string; facts: { key: string; value: string; source: string; status?: string }[] }>;
  optionIds: string[];
  options: Record<string, OptionData>;
};

type Ranked = Extract<RankResult, { status: "ranked" }>;
const portOf = (options: Record<string, OptionData>): OptionDataPort => ({ get: (id) => options[id] });
const PORT = portOf(FIX.options);
const A = FIX.profiles["syn-rank-a"]!;
const B = FIX.profiles["syn-rank-b"]!;

const rank = (over: Partial<RankInput> = {}, port: OptionDataPort = PORT): Ranked => {
  const r = rankOptions({ studentId: A.studentId, optionIds: FIX.optionIds, facts: A.facts, ...over }, port);
  assert.equal(r.status, "ranked", JSON.stringify(r));
  return r as Ranked;
};
const order = (r: Ranked) => r.options.map((o) => o.optionId);
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

// ---------------------------------------------------------------------------------------------------------
// C1 deterministic, profile-dependent order
// ---------------------------------------------------------------------------------------------------------
test("C1 A16: a Germany/engineering student and a Canada/business student asking about the same four options get different orders", () => {
  assert.deepEqual(order(rank({ studentId: A.studentId, facts: A.facts })), ["opt-munich", "opt-leeds", "opt-toronto", "opt-sydney"]);
  assert.deepEqual(order(rank({ studentId: B.studentId, facts: B.facts })), ["opt-toronto", "opt-sydney", "opt-munich", "opt-leeds"]);
});

test("C1 A16: the same student, same options and same weights ranked twice (and with the option list reversed or duplicated) give a byte-identical result", () => {
  const first = rank();
  const second = rank();
  assert.equal(JSON.stringify(first), JSON.stringify(second));
  const reversed = rank({ optionIds: [...FIX.optionIds].reverse() });
  assert.equal(JSON.stringify(reversed), JSON.stringify(first));
  const dup = rank({ optionIds: [...FIX.optionIds, "opt-munich", "opt-leeds"] });
  assert.equal(JSON.stringify(dup), JSON.stringify(first));
});

test("C1 A16: scores are the weighted sum of the four components, fit comes from the confirmed facts matching the option attributes", () => {
  const r = rank();
  const munich = r.options[0]!;
  assert.equal(munich.optionId, "opt-munich");
  assert.equal(munich.components.fit, 1);
  assert.equal(munich.score, 0.775);
  const leeds = r.options[1]!;
  assert.equal(leeds.components.fit, 0.5); // engineering matches, UK is not Germany
  assert.equal(leeds.score, 0.49);
  assert.equal(r.options.map((o) => o.rank).join(","), "1,2,3,4");
});

// ---------------------------------------------------------------------------------------------------------
// C2 citations
// ---------------------------------------------------------------------------------------------------------
test("C2 A16: every ranked option names its KB source ids and the profile facts that moved its score", () => {
  const r = rank();
  for (const o of r.options) {
    assert.equal(o.status, "ranked");
    assert.ok(o.sourceIds.length >= 1, `${o.optionId} cites a source`);
    assert.ok(o.sourceIds.every((id) => r.sources.some((s) => s.id === id)), "every cited id is a returned source");
    assert.deepEqual(o.profileFactsUsed.map((f) => f.key).sort(), ["field-of-study", "target-country"]);
  }
  assert.deepEqual(r.options[0]!.sourceIds, ["kb-node-munich"]);
});

test("C2 A16: the claims, sources and profileFactsUsed it returns fit the TurnResponse schema, one claim per option in rank order", () => {
  const r = rank();
  assert.equal(r.claims.length, 4);
  for (const c of r.claims) ClaimSchema.parse(c);
  for (const s of r.sources) SourceSchema.parse(s);
  for (const f of r.profileFactsUsed) ProfileFactSchema.parse(f);
  TurnResponseSchema.parse({ state: "ok", claims: r.claims, sources: r.sources, profileFactsUsed: r.profileFactsUsed, rankingProfile: r.rankingProfile });
  assert.match(r.claims[0]!.text, /^#1 Munich engineering \(synthetic\)/);
  assert.match(r.claims[3]!.text, /^#4 Sydney business \(synthetic\)/);
  assert.deepEqual(r.claims[0]!.sourceIds, ["kb-node-munich"]);
  assert.equal(r.claims[0]!.status, "attributed");
  assert.deepEqual(r.sources.map((s) => s.id), ["kb-node-leeds", "kb-node-munich", "kb-node-sydney", "kb-node-toronto"]);
});

test("C2 A16: the top-level profileFactsUsed lists each fact once, with the exact source label it came with", () => {
  const r = rank();
  assert.deepEqual(r.profileFactsUsed, [
    { key: "field-of-study", value: "engineering", source: "student-confirmed" },
    { key: "target-country", value: "Germany", source: "pathlynks" },
  ]);
});

// ---------------------------------------------------------------------------------------------------------
// C3 default weights
// ---------------------------------------------------------------------------------------------------------
test("C3 P-8: a student who sets no weights is ranked with 0.40 / 0.25 / 0.20 / 0.15 and told rankingProfile is student-success", () => {
  const r = rank();
  assert.equal(r.rankingProfile, "student-success");
  assert.equal(DEFAULT_RANKING_PROFILE, "student-success");
  assert.deepEqual(r.weights, { fit: 0.4, cost: 0.25, scholarshipChance: 0.2, visaEase: 0.15 });
  assert.deepEqual(DEFAULT_RANK_WEIGHTS, r.weights);
  assert.equal(r.weightsNormalised, false);
});

test("C3 P-8: explicitly passing the default vector, or a multiple of it, is still student-success (the name follows the numbers)", () => {
  assert.equal(rank({ weights: { fit: 0.4, cost: 0.25, scholarshipChance: 0.2, visaEase: 0.15 } }).rankingProfile, "student-success");
  const scaled = rank({ weights: { fit: 4, cost: 2.5, scholarshipChance: 2, visaEase: 1.5 } });
  assert.equal(scaled.rankingProfile, "student-success");
  assert.equal(scaled.weightsNormalised, true);
});

// ---------------------------------------------------------------------------------------------------------
// C4 changed weights
// ---------------------------------------------------------------------------------------------------------
test("C4 D-086 Q3: a tenant that weights scholarship chance at 0.8 and fit at 0 changes the order, deterministically, and the response says so", () => {
  const w = { fit: 0, cost: 0.1, scholarshipChance: 0.8, visaEase: 0.1 };
  const r = rank({ weights: w });
  assert.deepEqual(order(r), ["opt-toronto", "opt-sydney", "opt-munich", "opt-leeds"]);
  assert.notDeepEqual(order(r), order(rank()));
  assert.notEqual(r.rankingProfile, "student-success");
  assert.match(r.rankingProfile, /^custom-[0-9a-f]{8}$/);
  assert.ok(r.rankingProfile.length <= 64);
  assert.deepEqual(r.weights, w);
  assert.equal(JSON.stringify(rank({ weights: w })), JSON.stringify(r));
  // the profile name follows the vector: another vector, another name; key order does not matter
  const other = rank({ weights: { fit: 0, cost: 0.2, scholarshipChance: 0.7, visaEase: 0.1 } });
  assert.notEqual(other.rankingProfile, r.rankingProfile);
  assert.equal(rank({ weights: { visaEase: 0.1, scholarshipChance: 0.8, cost: 0.1, fit: 0 } }).rankingProfile, r.rankingProfile);
});

test("C4 D-086 Q3: a fit weight of zero means the profile facts moved nothing, so none are reported as used", () => {
  const r = rank({ weights: { fit: 0, cost: 0.1, scholarshipChance: 0.8, visaEase: 0.1 } });
  assert.deepEqual(r.profileFactsUsed, []);
  for (const o of r.options) assert.deepEqual(o.profileFactsUsed, []);
});

test("C4 D-086 Q3: with a zero fit weight two different students get the same order (only the weights decide)", () => {
  const w = { fit: 0, cost: 0.1, scholarshipChance: 0.8, visaEase: 0.1 };
  assert.deepEqual(order(rank({ weights: w, facts: A.facts })), order(rank({ weights: w, studentId: B.studentId, facts: B.facts })));
});

// ---------------------------------------------------------------------------------------------------------
// C5 unauthenticated
// ---------------------------------------------------------------------------------------------------------
test("C5 B24.8: a request with no authenticated student gets no ranking, whatever facts or options come with it", () => {
  for (const studentId of [undefined, "", "   "]) {
    const r = rankOptions({ studentId, optionIds: FIX.optionIds, facts: A.facts }, PORT);
    assert.deepEqual(r, { status: "refused", reason: "sign_in_required" });
  }
});

test("C5 B24.8: the refusal happens before the option-data port is asked anything", () => {
  let calls = 0;
  const spy: OptionDataPort = { get: (id) => { calls++; return FIX.options[id]; } };
  rankOptions({ studentId: undefined, optionIds: FIX.optionIds, facts: A.facts }, spy);
  assert.equal(calls, 0);
});

// ---------------------------------------------------------------------------------------------------------
// C6 fact sources (A16b engine side)
// ---------------------------------------------------------------------------------------------------------
test("C6 A16b: a fact the student has not confirmed (a chat-extracted proposal) never moves a score or appears in profileFactsUsed", () => {
  const withProposal = [
    ...A.facts,
    { key: "target-country", value: "Canada", source: "chat-extracted", status: "proposed" },
    { key: "target-country", value: "Canada", source: "student-confirmed", status: "proposed" },
  ];
  const plain = rank({ facts: A.facts });
  const noisy = rank({ facts: withProposal });
  assert.equal(JSON.stringify(noisy.options), JSON.stringify(plain.options));
  assert.deepEqual(noisy.profileFactsUsed, plain.profileFactsUsed);
  assert.equal(noisy.ignoredFactCount, 2);
  assert.equal(plain.ignoredFactCount, 0);
});

test("C6 A16b: a student who has only proposed facts (nothing confirmed, nothing from Pathlynks) gets every option marked insufficient, not ranked on guesses", () => {
  const r = rank({ facts: [{ key: "target-country", value: "Germany", source: "chat-extracted", status: "proposed" }] });
  assert.ok(r.options.every((o) => o.status === "insufficient_data" && o.missing.includes("fit")));
  assert.deepEqual(r.profileFactsUsed, []);
});

test("C6 A16b: a Pathlynks fact is labelled pathlynks and a confirmed chat fact is labelled student-confirmed, exactly", () => {
  const r = rank();
  const by = Object.fromEntries(r.profileFactsUsed.map((f) => [f.key, f.source]));
  assert.deepEqual(by, { "target-country": "pathlynks", "field-of-study": "student-confirmed" });
  const confirmed = rank({ facts: [{ key: "target-country", value: "Germany", source: "student-confirmed", status: "confirmed" }] });
  assert.deepEqual(confirmed.profileFactsUsed, [{ key: "target-country", value: "Germany", source: "student-confirmed" }]);
  assert.ok(!("status" in confirmed.profileFactsUsed[0]!), "status does not leak into the ProfileFact");
});

test("C6 A16b: a fact with an unknown source label is ignored and counted, never relabelled", () => {
  const r = rank({ facts: [...A.facts, { key: "field-of-study", value: "business", source: "crm-import" }] });
  assert.equal(r.ignoredFactCount, 1);
  assert.deepEqual(r.profileFactsUsed.map((f) => f.source).sort(), ["pathlynks", "student-confirmed"]);
});

test("C6 A16b: when Pathlynks and the student give different values for one key, the student's confirmed value is the one ranked on", () => {
  const r = rank({
    facts: [
      { key: "target-country", value: "Germany", source: "pathlynks" },
      { key: "target-country", value: "Canada", source: "student-confirmed", status: "confirmed" },
    ],
  });
  assert.equal(r.options[0]!.optionId, "opt-toronto");
  assert.deepEqual(r.profileFactsUsed, [{ key: "target-country", value: "Canada", source: "student-confirmed" }]);
});

test("C6 A16b: an erased fact (absent from the list) stops moving the ranking", () => {
  const without = rank({ facts: A.facts.filter((f) => f.key !== "target-country") });
  assert.deepEqual(without.profileFactsUsed.map((f) => f.key), ["field-of-study"]);
  assert.notEqual(JSON.stringify(without.options), JSON.stringify(rank().options));
  assert.equal(without.options.find((o) => o.optionId === "opt-leeds")!.components.fit, 1);
});

test("C6 A16b: a corrected value (Germany -> Canada) re-ranks the options", () => {
  const corrected = rank({ facts: [{ key: "target-country", value: "Canada", source: "student-confirmed", status: "confirmed" }, A.facts[1]!] });
  assert.deepEqual(order(corrected), ["opt-munich", "opt-toronto", "opt-leeds", "opt-sydney"]);
  assert.notDeepEqual(order(corrected), order(rank()));
});

// ---------------------------------------------------------------------------------------------------------
// C7 numbers only from the port
// ---------------------------------------------------------------------------------------------------------
test("C7 B24.8: an option whose cost the data port does not have is marked insufficient_data, listed last, with no invented score", () => {
  const opts = clone(FIX.options);
  delete (opts["opt-munich"] as Partial<OptionData>).cost;
  const r = rank({}, portOf(opts));
  const last = r.options[3]!;
  assert.equal(last.optionId, "opt-munich");
  assert.equal(last.status, "insufficient_data");
  assert.equal(last.score, null);
  assert.equal(last.rank, null);
  assert.deepEqual(last.missing, ["cost"]);
  assert.equal(last.components.cost, null);
  const claim = r.claims[3]!;
  assert.equal(claim.status, "unverified");
  assert.match(claim.text, /not ranked/);
  assert.match(claim.text, /cost/);
  assert.deepEqual(r.options.slice(0, 3).map((o) => o.rank), [1, 2, 3]);
  ClaimSchema.parse(claim);
});

test("C7 B24.8: an option the port has never heard of is insufficient_data on every component", () => {
  const r = rank({ optionIds: [...FIX.optionIds, "opt-unknown"] });
  const u = r.options.at(-1)!;
  assert.equal(u.optionId, "opt-unknown");
  assert.equal(u.status, "insufficient_data");
  assert.deepEqual(u.missing, ["fit", "cost", "scholarshipChance", "visaEase"]);
  assert.deepEqual(u.sourceIds, []);
  assert.equal(r.options.filter((o) => o.status === "ranked").length, 4);
});

test("C7 B24.8: an option with missing data whose id sorts FIRST is still listed after every ranked option", () => {
  const r = rank({ optionIds: ["opt-0-unknown", "opt-0-also-unknown", ...FIX.optionIds] });
  assert.deepEqual(order(r), ["opt-munich", "opt-leeds", "opt-toronto", "opt-sydney", "opt-0-also-unknown", "opt-0-unknown"]);
  assert.deepEqual(r.options.map((o) => o.rank), [1, 2, 3, 4, null, null]);
});

test("C7 B24.8: a number with no cited source, outside 0..1 or not finite is treated as missing, never clamped or guessed", () => {
  const opts = clone(FIX.options);
  (opts["opt-munich"] as OptionData).cost = { value: 0.7, sourceId: "kb-not-in-sources" };
  (opts["opt-toronto"] as OptionData).visaEase = { value: 1.4, sourceId: "kb-node-toronto" };
  (opts["opt-leeds"] as OptionData).scholarshipChance = { value: Number.NaN, sourceId: "kb-node-leeds" };
  (opts["opt-sydney"] as OptionData).cost = { value: 0.3, sourceId: "" };
  const r = rank({}, portOf(opts));
  const miss = Object.fromEntries(r.options.map((o) => [o.optionId, o.missing]));
  assert.deepEqual(miss, { "opt-munich": ["cost"], "opt-toronto": ["visaEase"], "opt-leeds": ["scholarshipChance"], "opt-sydney": ["cost"] });
  assert.ok(r.options.every((o) => o.status === "insufficient_data" && o.score === null));
});

test("C7 B24.8: a component whose weight is zero does not block ranking when its data is missing", () => {
  const opts = clone(FIX.options);
  delete (opts["opt-munich"] as Partial<OptionData>).visaEase;
  const r = rank({ weights: { fit: 0.5, cost: 0.3, scholarshipChance: 0.2, visaEase: 0 } }, portOf(opts));
  assert.equal(r.options.find((o) => o.optionId === "opt-munich")!.status, "ranked");
  const blocked = rank({}, portOf(opts));
  assert.equal(blocked.options.at(-1)!.optionId, "opt-munich");
  assert.equal(blocked.options.at(-1)!.status, "insufficient_data");
});

test("C7 B24.8: tied scores break by option id, whatever order the options arrived in", () => {
  const twin = (id: string): OptionData => ({
    ...clone(FIX.options["opt-munich"]!),
    optionId: id,
    label: id,
  });
  const opts = { "opt-z": twin("opt-z"), "opt-b": twin("opt-b"), "opt-m": twin("opt-m") };
  const forward = rank({ optionIds: ["opt-z", "opt-b", "opt-m"] }, portOf(opts));
  const backward = rank({ optionIds: ["opt-m", "opt-b", "opt-z"] }, portOf(opts));
  assert.deepEqual(order(forward), ["opt-b", "opt-m", "opt-z"]);
  assert.deepEqual(order(backward), ["opt-b", "opt-m", "opt-z"]);
  assert.deepEqual(forward.options.map((o) => o.rank), [1, 2, 3]);
});

test("C7 B24.8: the function takes no provider, clock or network input (a port stub that throws on anything but get proves no other call is made)", () => {
  const strict = new Proxy({ get: (id: string) => FIX.options[id] }, {
    get(t, p) { if (p === "get") return t.get; throw new Error(`unexpected port access ${String(p)}`); },
  }) as OptionDataPort;
  assert.equal(rank({}, strict).options.length, 4);
});

test("C7 B24.8: more options than the cap, or none, is refused rather than truncated", () => {
  const many = Array.from({ length: MAX_RANK_OPTIONS + 1 }, (_, i) => `opt-${i}`);
  assert.deepEqual(rankOptions({ studentId: A.studentId, optionIds: many, facts: A.facts }, PORT), { status: "refused", reason: "too_many_options" });
  assert.deepEqual(rankOptions({ studentId: A.studentId, optionIds: [], facts: A.facts }, PORT), { status: "refused", reason: "no_options" });
});

// ---------------------------------------------------------------------------------------------------------
// C8 weight validation
// ---------------------------------------------------------------------------------------------------------
test("C8 D-086 Q3: a weight vector with a negative, NaN, Infinity, string or missing component is rejected and nothing is ranked", () => {
  const good = { fit: 0.4, cost: 0.25, scholarshipChance: 0.2, visaEase: 0.15 };
  const bad: unknown[] = [
    { ...good, fit: -0.1 },
    { ...good, cost: Number.NaN },
    { ...good, visaEase: Number.POSITIVE_INFINITY },
    { ...good, fit: "0.4" },
    { fit: 0.5, cost: 0.5, scholarshipChance: 0 },
    "student-success",
    [0.4, 0.25, 0.2, 0.15],
    null,
  ];
  for (const w of bad) {
    const v = validateRankWeights(w);
    assert.equal(v.ok, false, JSON.stringify(w));
    const r = rankOptions({ studentId: A.studentId, optionIds: FIX.optionIds, facts: A.facts, weights: w }, PORT);
    assert.equal(r.status, "refused", JSON.stringify(w));
    assert.equal((r as { reason: string }).reason, "invalid_weights");
  }
});

test("C8 D-086 Q3: an unknown weight key (a typo, or a smuggled extra) is rejected", () => {
  const v = validateRankWeights({ fit: 0.4, cost: 0.25, scholarshipChance: 0.2, visaEase: 0.15, prestige: 0.5 });
  assert.equal(v.ok, false);
  assert.match((v as { detail: string }).detail, /prestige/);
});

test("C8 D-086 Q3: an all-zero vector is rejected (it would rank everything equal)", () => {
  const v = validateRankWeights({ fit: 0, cost: 0, scholarshipChance: 0, visaEase: 0 });
  assert.equal(v.ok, false);
  assert.match((v as { detail: string }).detail, /zero/);
});

test("C8 D-086 Q3: a vector that does not sum to 1 is scaled to sum 1 and the response says it was", () => {
  const v = validateRankWeights({ fit: 2, cost: 1, scholarshipChance: 1, visaEase: 0 });
  assert.ok(v.ok);
  assert.deepEqual(v.weights, { fit: 0.5, cost: 0.25, scholarshipChance: 0.25, visaEase: 0 });
  assert.equal(v.normalised, true);
  const r = rank({ weights: { fit: 2, cost: 1, scholarshipChance: 1, visaEase: 0 } });
  assert.equal(r.weightsNormalised, true);
  assert.deepEqual(r.weights, { fit: 0.5, cost: 0.25, scholarshipChance: 0.25, visaEase: 0 });
  const already = validateRankWeights({ fit: 0.5, cost: 0.25, scholarshipChance: 0.25, visaEase: 0 });
  assert.ok(already.ok);
  assert.equal(already.normalised, false);
});

test("C8 D-086 Q3: an invalid-weights refusal names the problem and carries no student data", () => {
  const r = rankOptions({ studentId: A.studentId, optionIds: FIX.optionIds, facts: A.facts, weights: { fit: -1, cost: 1, scholarshipChance: 1, visaEase: 1 } }, PORT);
  assert.equal(r.status, "refused");
  const text = JSON.stringify(r);
  assert.match(text, /fit/);
  assert.ok(!text.includes("Germany") && !text.includes(A.studentId));
});
