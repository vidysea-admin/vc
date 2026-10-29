// Tool-first routing probe (ai-engineer review, 2026-10-29) as updated by route-fix-1. FROZEN as an engine test table in
// packages/engine/tests/routing-probe.test.ts (the test is the regression guard; this script prints the per-phrase routing for the evidence file).
// Run (repo root): npx tsx qa/evidence/tool-first/routing-probe.ts
// Pass line: 0 KB near-misses stolen and >= 90% of the tool asks routed.
import { classifyIntent } from "../../../packages/engine/src/student/classify.ts";
import { navigateSteps } from "../../../packages/engine/src/tools/navigate.ts";
const cat: any = { routes: ["/student/journey-details", "/ai-university-finder-study-abroad", "/country/canada", "/search", "/services/education-loan"].map((path) => ({ path })) };
// [phrase, expected tool]; "search_kb" rows are KB near-misses
const T: [string, string][] = [
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
  ["what next", "vidysea_progress"], // right after a KB answer: still the progress tool (stateless by design)
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
  ["best universities in Canada with 20 lakh budget and scholarships", "search_kb"],
  ["best universities in Canada with GRE 320", "search_kb"],
  ["best universities for MBA in the UK with scholarships and a GRE of 320", "search_kb"],
  ["visa kahan tak pahuncha", "search_kb"],
  ["my application is stuck what to do", "search_kb"],
  ["next steps after getting an offer letter", "search_kb"],
  ["did I apply to the right university for a 6.5 IELTS", "search_kb"],
  ["track my visa fee for Germany", "search_kb"],
  ["mere dost ke scholarships dikhao", "search_kb"],
  ["did my friend apply to anything yet", "search_kb"],
  // known gap, not in route-fix-1 scope: "I want to see my journey" reaches search_kb
];
let hit = 0, tools = 0, stolen = 0, kb = 0;
const bad: string[] = [];
for (const [p, e] of T) {
  const g = classifyIntent(p);
  const nav = g === "navigate_steps" ? navigateSteps(cat, p) : null;
  const pass = g === e;
  if (e === "search_kb") { kb++; if (!pass) stolen++; } else { tools++; if (pass) hit++; }
  if (!pass) bad.push(`MISS "${p}" expected ${e} got ${g}`);
  console.log(`${pass ? "ok  " : "MISS"} | ${p} => ${g}${nav ? " | " + nav.routes.join(",") : ""}`);
}
console.log(`tool asks routed ${hit}/${tools} (${((100 * hit) / tools).toFixed(1)}%); KB near-misses stolen ${stolen}/${kb}`);
console.log(bad.join("\n"));
