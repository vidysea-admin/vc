import { test } from "node:test";
import { rankOptions } from "../src/index.js";
test("perf", () => {
  for (const n of [1000, 10000]) {
    const m: any = {}; const ids: string[] = [];
    for (let i = 0; i < n; i++) { const id = "o" + i; ids.push(id); m[id] = { optionId: id, attributes: { country: { value: i % 2 ? "germany" : "canada", sourceId: "s" + id } }, cost: { value: (i % 97) / 97, sourceId: "s" + id }, scholarshipChance: { value: (i % 13) / 13, sourceId: "s" + id }, visaEase: { value: 0.5, sourceId: "s" + id }, sources: [{ id: "s" + id, kind: "toc" }] }; }
    const t = Date.now(); const r: any = rankOptions({ studentId: "s", optionIds: ids, facts: [{ key: "target-country", value: "Germany", source: "pathlynks" }] }, { get: (id) => m[id] });
    console.log("n=" + n, r.status, r.options?.length, (Date.now() - t) + "ms");
  }
});
