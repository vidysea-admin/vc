/**
 * route-fix-1 item 8: the tool-first routing probe (qa/evidence/tool-first/routing-probe.ts, the ai-engineer review's 48 phrasings) frozen as a regression
 * table, plus the phrasings added by route-fix-1. `classifyIntent` is stateless, so "what next" routes the same after a KB answer (review finding 6, by design).
 *
 * Pass line (review recommendation): 0 KB near-misses stolen by a tool, and >= 90% of the tool asks routed to the expected tool. Every row is also
 * asserted exactly, so a regression names the phrase.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyIntent } from "../src/student/classify.js";
import { navigateSteps, type NavCatalogue } from "../src/tools/navigate.js";

const HUB = "/student/journey-details";
const FINDER = "/ai-university-finder-study-abroad";
const CATALOGUE: NavCatalogue = { routes: [HUB, FINDER, "/country/canada", "/search", "/services/education-loan"].map((path) => ({ path, file: "x" })) };

type Row = readonly [phrase: string, want: string];

/** Tool asks: the phrase must reach exactly this tool. */
const TOOL_ASKS: readonly Row[] = [
  ["best universities in Canada", "navigate_steps"],
  ["best universities in Canada with 20 lakh budget", "navigate_steps"],
  ["best universities in Canada under 20 lakhs", "navigate_steps"],
  ["top universities for MBA in Germany", "navigate_steps"],
  ["top universities for data science in the UK under 30 lakhs", "navigate_steps"],
  ["find universities in Australia with 40k budget", "navigate_steps"],
  ["which are the best colleges in Australia?", "navigate_steps"],
  ["Canada ki best universities dikhao", "navigate_steps"],
  ["mujhe Canada mein achi university chahiye", "navigate_steps"],
  ["make my full journey", "navigate_steps"],
  ["create my journey map", "navigate_steps"],
  ["can you make a roadmap for me", "navigate_steps"],
  ["meri journey banao", "navigate_steps"],
  ["what should I do next", "vidysea_progress"],
  ["what's next", "vidysea_progress"],
  ["what next", "vidysea_progress"], // asked right after a KB answer: still the progress tool (context-free by design)
  ["next steps?", "vidysea_progress"],
  ["ab aage kya karu", "vidysea_progress"],
  ["aage kya karna hai", "vidysea_progress"],
  ["mera visa kahan tak pahuncha", "vidysea_visa"],
  ["mera visa status batao", "vidysea_visa"],
  ["track my visa", "vidysea_visa"],
  ["how is my visa going", "vidysea_visa"],
  ["meri application ka status kya hai", "vidysea_applications"],
  ["what is my application status", "vidysea_applications"],
  ["did I apply to anything yet", "vidysea_applications"],
  ["have I applied to anything?", "vidysea_applications"],
  ["how many applications do I have", "vidysea_applications"],
  ["track my applications", "vidysea_applications"],
  ["where do I stand", "vidysea_progress"],
  ["meri journey kahan tak pahunchi", "vidysea_journey_maps"],
  ["show my journey", "vidysea_journey_maps"],
  ["my shortlisted universities", "vidysea_shortlisted_programmes"],
  ["mere scholarships dikhao", "vidysea_saved_scholarships"],
  ["mere favourites batao", "vidysea_favourites"],
  ["how do I compare two universities", "navigate_steps"],
  ["where can I upload my documents", "navigate_steps"],
  ["I want to study abroad", "navigate_steps"],
  ["which country should I choose", "navigate_steps"],
];

// Known gap (not in route-fix-1 scope, reported): "I want to see my journey" still reaches search_kb; "show my journey" routes.

/** KB near-misses: share words with a tool but ask for knowledge or carry another qualifier. None may be taken by a tool. */
const KB_NEAR_MISSES: readonly Row[] = [
  ["what is the visa processing time for Canada", "search_kb"],
  ["what should I do next if my visa is rejected", "search_kb"],
  ["what are the IELTS requirements for Australia", "search_kb"],
  ["what is the tuition fee at University of Toronto", "search_kb"],
  ["how can I apply for a scholarship in Germany", "search_kb"],
  ["how to shortlist universities for MBA in USA with GRE 320", "search_kb"],
  ["tell me about the best universities for computer science in the UK with scholarships", "search_kb"],
  ["is Canada better than Australia for study", "search_kb"],
  ["what documents do I need for a Canadian student visa", "search_kb"],
  ["how long does a journey map take to build", "search_kb"],
  ["mera visa reject ho gaya ab kya karu", "search_kb"],
  ["mujhe Canada ka visa kab milega", "search_kb"],
  // route-fix-1: the new budget / subject / colloquial rules must not widen into these
  ["best universities in Canada with 20 lakh budget and scholarships", "search_kb"],
  ["best universities in Canada with GRE 320", "search_kb"],
  ["best universities for MBA in the UK with scholarships and a GRE of 320", "search_kb"],
  ["visa kahan tak pahuncha", "search_kb"], // no "my/mera": not an own-data ask
  ["my application is stuck what to do", "search_kb"],
  ["next steps after getting an offer letter", "search_kb"],
  ["did I apply to the right university for a 6.5 IELTS", "search_kb"],
  ["track my visa fee for Germany", "search_kb"],
  ["mere dost ke scholarships dikhao", "search_kb"],
  ["did my friend apply to anything yet", "search_kb"],
];

test("routing probe: 0 KB near-misses are stolen by a tool", () => {
  const stolen = KB_NEAR_MISSES.filter(([q]) => classifyIntent(q) !== "search_kb").map(([q]) => `${q} -> ${classifyIntent(q)}`);
  assert.deepEqual(stolen, []);
});

test("routing probe: at least 90% of the tool asks are routed to the expected tool (hit rate is printed)", () => {
  const missed = TOOL_ASKS.filter(([q, want]) => classifyIntent(q) !== want).map(([q, want]) => `${q} -> ${classifyIntent(q)} (want ${want})`);
  const rate = (TOOL_ASKS.length - missed.length) / TOOL_ASKS.length;
  console.log(`routing probe: ${TOOL_ASKS.length - missed.length}/${TOOL_ASKS.length} tool asks routed (${(rate * 100).toFixed(1)}%), ${KB_NEAR_MISSES.length} KB near-misses, ${KB_NEAR_MISSES.filter(([q]) => classifyIntent(q) !== "search_kb").length} stolen`);
  assert.ok(rate >= 0.9, `hit rate ${(rate * 100).toFixed(1)}%: ${missed.join("; ")}`);
  assert.deepEqual(missed, [], "every row is also exact");
});

test("routing probe: every navigate_steps ask resolves to exactly one catalogue link and never echoes a budget or subject", () => {
  for (const [q] of [...TOOL_ASKS, ...KB_NEAR_MISSES].filter(([q, want]) => want === "navigate_steps" && classifyIntent(q) === "navigate_steps")) {
    const out = navigateSteps(CATALOGUE, q);
    const text = [...out.steps, ...out.routes].join("\n");
    if (out.routes.length === 0) continue; // an unknown page is the fixed text; the graph hands it to the KB
    assert.equal(out.routes.length, 1, q);
    assert.match(out.routes[0]!, /^\/(?:student\/journey-details(?:\?section=[a-z]+)?|ai-university-finder-study-abroad|search|services\/education-loan)$/, q);
    assert.doesNotMatch(text, /lakh|\bcrore\b|\b20\b|\b30\b|\b40k\b|MBA|data science/i, q);
  }
});
