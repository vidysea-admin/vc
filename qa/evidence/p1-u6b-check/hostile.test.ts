import { test } from "node:test";
import assert from "node:assert/strict";
import { ClaimSchema, SourceSchema } from "@vc/schemas";
import { rankOptions, type OptionData, type OptionDataPort } from "../src/index.js";

const src = (id: string) => ({ id, kind: "toc", title: id }) as any;
const mk = (id: string, o: Partial<OptionData> = {}): OptionData => ({
  optionId: id,
  attributes: { country: { value: "germany", sourceId: "s-" + id }, field: { value: "eng", sourceId: "s-" + id } },
  cost: { value: 0.5, sourceId: "s-" + id },
  scholarshipChance: { value: 0.5, sourceId: "s-" + id },
  visaEase: { value: 0.5, sourceId: "s-" + id },
  sources: [src("s-" + id)],
  ...o,
});
const portOf = (m: Record<string, OptionData>): OptionDataPort => ({ get: (id) => m[id] });
const F = (key: string, value: string, source = "pathlynks", status?: string) => ({ key, value, source, ...(status ? { status } : {}) });

test("H1 ties/equal scores stable, order independent", () => {
  const ids = ["b", "a", "d", "c", "e"];
  const m: any = {};
  for (const i of ids) m[i] = mk(i);
  const out = new Set<string>();
  for (let k = 0; k < 20; k++) {
    const sh = [...ids].sort(() => Math.random() - 0.5);
    const r: any = rankOptions({ studentId: "syn-1", optionIds: sh, facts: [F("target-country", "Germany")] }, portOf(m));
    out.add(JSON.stringify(r));
  }
  assert.equal(out.size, 1);
  const r: any = rankOptions({ studentId: "syn-1", optionIds: ids, facts: [F("target-country", "Germany")] }, portOf(m));
  assert.deepEqual(r.options.map((o: any) => o.optionId), ["a", "b", "c", "d", "e"]);
});

test("H2 NaN/neg/Infinity/missing/string numbers from port => insufficient, last", () => {
  const m: any = {
    ok: mk("ok"),
    nan: mk("nan", { cost: { value: NaN, sourceId: "s-nan" } }),
    neg: mk("neg", { cost: { value: -0.1, sourceId: "s-neg" } }),
    inf: mk("inf", { visaEase: { value: Infinity, sourceId: "s-inf" } }),
    str: mk("str", { cost: { value: "0.9" as any, sourceId: "s-str" } }),
    gt: mk("gt", { scholarshipChance: { value: 1.0001, sourceId: "s-gt" } }),
    nul: mk("nul", { cost: null as any }),
    und: mk("und", { cost: undefined }),
    boundary0: mk("boundary0", { cost: { value: 0, sourceId: "s-boundary0" } }),
    boundary1: mk("boundary1", { cost: { value: 1, sourceId: "s-boundary1" } }),
    negzero: mk("negzero", { cost: { value: -0, sourceId: "s-negzero" } }),
  };
  const ids = Object.keys(m).concat(["unknown"]);
  const r: any = rankOptions({ studentId: "syn-1", optionIds: ids, facts: [F("target-country", "Germany")] }, portOf(m));
  const st = Object.fromEntries(r.options.map((o: any) => [o.optionId, o.status]));
  for (const k of ["nan", "neg", "inf", "str", "gt", "nul", "und", "unknown"]) assert.equal(st[k], "insufficient_data", k);
  for (const k of ["ok", "boundary0", "boundary1", "negzero"]) assert.equal(st[k], "ranked", k);
  const firstInsuff = r.options.findIndex((o: any) => o.status !== "ranked");
  assert.ok(r.options.slice(firstInsuff).every((o: any) => o.status !== "ranked"));
  for (const o of r.options) if (o.status !== "ranked") { assert.equal(o.score, null); assert.equal(o.rank, null); }
  assert.ok(r.options.every((o: any) => o.score === null || Number.isFinite(o.score)));
  ClaimSchema.array().parse(r.claims);
  SourceSchema.array().parse(r.sources);
});

test("H3 weights invalid", () => {
  const bad: any[] = [
    { fit: -0.1, cost: 0.6, scholarshipChance: 0.3, visaEase: 0.2 },
    { fit: 0.5, cost: 0.5, scholarshipChance: 0.5, visaEase: -1e-12 },
    { fit: NaN, cost: 1, scholarshipChance: 0, visaEase: 0 },
    { fit: Infinity, cost: 0, scholarshipChance: 0, visaEase: 0 },
    { fit: 1e308, cost: 1e308, scholarshipChance: 1e308, visaEase: 1e308 },
    { fit: 0, cost: 0, scholarshipChance: 0, visaEase: 0 },
    { fit: 0.4, cost: 0.25, scholarshipChance: 0.2 },
    { fit: 0.4, cost: 0.25, scholarshipChance: 0.2, visaEase: 0.15, extra: 1 },
    JSON.parse('{"fit":0.4,"cost":0.25,"scholarshipChance":0.2,"visaEase":0.15,"__proto__":{"fit":1}}'),
    null, [], "x", 5, true,
    { fit: "0.4", cost: 0.25, scholarshipChance: 0.2, visaEase: 0.15 },
    { fit: 0.4, cost: 0.25, scholarshipChance: 0.2, visaEase: null },
  ];
  for (const w of bad) {
    const r: any = rankOptions({ studentId: "s", optionIds: ["a"], facts: [], weights: w }, portOf({ a: mk("a") }));
    assert.equal(r.status, "refused", JSON.stringify(w));
    assert.equal(r.reason, "invalid_weights");
  }
  const r: any = rankOptions({ studentId: "s", optionIds: ["a"], facts: [], weights: { fit: 4, cost: 2.5, scholarshipChance: 2, visaEase: 1.5 } }, portOf({ a: mk("a") }));
  assert.equal(r.status, "ranked");
  assert.equal(r.weightsNormalised, true);
  assert.equal(r.rankingProfile, "student-success");
});

test("H4 fact sources: only pathlynks / only confirmed / both conflicting", () => {
  const m: any = {
    de: mk("de", { attributes: { country: { value: "germany", sourceId: "s-de" } } }),
    ca: mk("ca", { attributes: { country: { value: "canada", sourceId: "s-ca" } } }),
  };
  const run = (facts: any[]) => rankOptions({ studentId: "s", optionIds: ["de", "ca"], facts }, portOf(m)) as any;
  const p = run([F("target-country", "Germany", "pathlynks")]);
  assert.equal(p.options[0].optionId, "de");
  assert.deepEqual(p.profileFactsUsed, [{ key: "target-country", value: "Germany", source: "pathlynks" }]);
  const c = run([F("target-country", "Canada", "student-confirmed", "confirmed")]);
  assert.equal(c.options[0].optionId, "ca");
  assert.equal(c.profileFactsUsed[0].source, "student-confirmed");
  for (const order of [0, 1]) {
    const arr = [F("target-country", "Germany", "pathlynks"), F("target-country", "Canada", "student-confirmed", "confirmed")];
    if (order) arr.reverse();
    const b = run(arr);
    assert.equal(b.options[0].optionId, "ca", "conflict order " + order);
    assert.equal(b.profileFactsUsed.length, 1);
    assert.equal(b.profileFactsUsed[0].source, "student-confirmed");
  }
  const pp = run([F("target-country", "Canada", "pathlynks", "proposed")]);
  assert.ok(pp.options.every((o: any) => o.status === "insufficient_data"));
  assert.equal(pp.profileFactsUsed.length, 0);
  assert.equal(pp.ignoredFactCount, 1);
  const ce = run([
    F("target-country", "Canada", "chat-extracted"),
    F("target-country", "Canada", "student-confirmed", "proposed"),
    F("target-country", "Canada", "student-confirmed", "rejected"),
    F("target-country", "Canada", "student-confirmed", "erased"),
  ]);
  assert.equal(ce.profileFactsUsed.length, 0);
  assert.equal(ce.ignoredFactCount, 4);
  const a = run([F("target-country", "Germany", "student-confirmed", "confirmed"), F("target-country", "Canada", "student-confirmed", "confirmed")]);
  const b = run([F("target-country", "Canada", "student-confirmed", "confirmed"), F("target-country", "Germany", "student-confirmed", "confirmed")]);
  console.log("H4 same-source conflict order-dependent?", JSON.stringify(a.profileFactsUsed) !== JSON.stringify(b.profileFactsUsed));
  const pr = run([F("__proto__", "x"), F("constructor", "x"), F("hasOwnProperty", "x")]);
  assert.equal(pr.status, "ranked");
});

test("H5 all insufficient, empty, blank student", () => {
  const r: any = rankOptions({ studentId: "s", optionIds: ["x", "y"], facts: [] }, portOf({}));
  assert.equal(r.status, "ranked");
  assert.ok(r.options.every((o: any) => o.status === "insufficient_data"));
  assert.equal(r.profileFactsUsed.length, 0);
  assert.equal(r.options.map((o: any) => o.optionId).join(), "x,y");
  const e: any = rankOptions({ studentId: "s", optionIds: [], facts: [] }, portOf({}));
  assert.equal(e.status, "refused");
  const e2: any = rankOptions({ studentId: "s", optionIds: ["", 5 as any, null as any], facts: [] }, portOf({}));
  assert.equal(e2.status, "refused");
  for (const sid of [undefined, "", "   ", null, 0, {}, "\n\t"]) {
    const x: any = rankOptions({ studentId: sid as any, optionIds: ["a"], facts: [] }, { get() { throw new Error("port touched"); } });
    assert.equal(x.reason, "sign_in_required");
  }
});

test("H6 large list 1000", () => {
  const ids = Array.from({ length: 1000 }, (_, i) => "o" + String(i).padStart(4, "0"));
  const m: any = {};
  for (const i of ids) m[i] = mk(i);
  const t = Date.now();
  const r: any = rankOptions({ studentId: "s", optionIds: ids, facts: [F("target-country", "Germany")] }, portOf(m));
  console.log("H6 1000 distinct ->", r.status, r.reason, Date.now() - t, "ms");
  const dup = Array.from({ length: 1000 }, (_, i) => ids[i % 10]!);
  const t2 = Date.now();
  const r2: any = rankOptions({ studentId: "s", optionIds: dup, facts: [] }, portOf(m));
  console.log("H6 1000 w/ 10 distinct ->", r2.status, r2.options?.length, Date.now() - t2, "ms");
  const r3: any = rankOptions({ studentId: "s", optionIds: ids.slice(0, 25), facts: [F("target-country", "Germany")] }, portOf(m));
  assert.equal(r3.status, "ranked");
  console.log("H6 25 -> claims", r3.claims.length, "sources", r3.sources.length);
  const r4: any = rankOptions({ studentId: "s", optionIds: ids.slice(0, 26), facts: [] }, portOf(m));
  console.log("H6 26 ->", r4.status, r4.reason);
});

test("H7 wording and NOT PROVEN visibility", () => {
  const m: any = { a: mk("a", { label: "Munich" }), b: mk("b", { cost: undefined }) };
  const r: any = rankOptions({ studentId: "s", optionIds: ["a", "b"], facts: [F("target-country", "Germany")] }, portOf(m));
  const text = JSON.stringify(r);
  console.log("H7 claims:", r.claims.map((c: any) => c.text + " | " + c.kind + "/" + c.status));
  console.log("H7 mentions NOT PROVEN/synthetic/mock/unproven in output:", /not proven|synthetic|mock|unproven/i.test(text));
  assert.ok(!/you should|we recommend|best choice|choose/i.test(text));
});

test("H8 weights change -> order & name", () => {
  const m: any = {
    a: mk("a", { scholarshipChance: { value: 0.9, sourceId: "s-a" }, cost: { value: 0.1, sourceId: "s-a" } }),
    b: mk("b", { scholarshipChance: { value: 0.1, sourceId: "s-b" }, cost: { value: 0.9, sourceId: "s-b" } }),
  };
  const run = (w?: any) => rankOptions({ studentId: "s", optionIds: ["a", "b"], facts: [], weights: w }, portOf(m)) as any;
  const d = run();
  const w1 = run({ fit: 0, cost: 0, scholarshipChance: 1, visaEase: 0 });
  const w2 = run({ fit: 0, cost: 0, scholarshipChance: 1, visaEase: 0 });
  console.log("H8 default insufficient (no facts, fit missing weight>0):", d.options.map((o: any) => o.optionId + ":" + o.status), "custom:", w1.options.map((o: any) => o.optionId + ":" + o.status), w1.rankingProfile);
  assert.notEqual(w1.rankingProfile, d.rankingProfile);
  assert.equal(w1.rankingProfile, w2.rankingProfile);
  assert.ok(w1.rankingProfile.length <= 64);
  const s = run({ fit: 0.41, cost: 0.24, scholarshipChance: 0.2, visaEase: 0.15 });
  assert.match(s.rankingProfile, /^custom-[0-9a-f]{8}$/);
  // weight config mutation after call must not leak into defaults
  const r = run({ fit: 0, cost: 1, scholarshipChance: 0, visaEase: 0 });
  assert.equal(r.options[0].optionId, "b");
  assert.equal(run().rankingProfile, "student-success");
});
