/**
 * P1 U6, spec A15b (classifier part; the anonymous limiter is U7) / contract B24.6: the personal-vs-
 * generic classifier is rule-based (no LLM sees the text) and fails closed: ambiguous = personal. A
 * fixture of >= 40 borderline cases incl. Hindi/Hinglish; 0 personal questions classified generic.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { classifyIntent, classifyQuestion } from "../src/student/classify.js";

const PERSONAL: string[] = [
  "Can I get into TU Munich with 72% in 12th?",
  "My IELTS is 6.5, which country should I pick?",
  "Should I take a gap year?",
  "What are my chances at Toronto?",
  "Am I eligible for the DAAD scholarship?",
  "I scored 1250 in SAT, what next?",
  "Which university suits me best?",
  "Is Canada better for someone like me?",
  "Help me choose between Germany and Ireland",
  "mera percentage 68 hai, Canada mil jayega?",
  "mujhe kaunsa course lena chahiye?",
  "main engineering karna chahta hoon, kahan jaun?",
  "meri family ka budget 20 lakh hai, kaunsa country?",
  "kya mujhe scholarship milegi?",
  "hum log Australia soch rahe hain, sahi rahega?",
  "मेरे 12वीं में 80% हैं, क्या मुझे जर्मनी में दाखिला मिलेगा?",
  "मुझे कौन सा देश चुनना चाहिए?",
  "मैं MBBS करना चाहता हूँ",
  "Rahul Sharma from DPS Noida here, what should I do?",
  "my school is DPS Vasant Kunj, is that a good profile?",
  "Review my SOP please",
  "Is my profile strong enough?",
  "What do you know about me?",
  "Delete my data",
  "for me, is the UK or the US cheaper?",
  "in my case is a blocked account needed?",
  "can you recommend a university?",
  "suggest a course",
  "UK?",
  "hmm",
  "show my saved careers",
  "Germany",
  "what about mine?",
  "apne liye best option batao",
  "my brother studies in Canada, can I join him?",
  "I have a backlog, will that be a problem?",
  "We are moving to Dubai next year, which board is best?",
  "Tell me what I should do after 12th",
  "Is 6.5 bands enough for me?",
  "call me at 9876543210 about admissions",
];

const GENERIC: string[] = [
  "help",
  "hi",
  "Tell me about studying in Germany",
  "What can you tell me about studying in Germany?",
  "What is the tuition at German public universities?",
  "How much is the blocked account for a German student visa?",
  "Which countries offer post-study work visas?",
  "What is the DAAD scholarship?",
  "When is the application deadline for UCAS?",
  "Do Canadian universities accept IELTS 6.5 for undergraduate courses?",
  "Germany mein public university ki fees kitni hai?",
  "Canada ka student visa kaise milta hai?",
  "जर्मनी में पढ़ाई का खर्च कितना है?",
  "What documents are needed for a UK student visa?",
];

test("A15b: the personal fixture has >= 40 borderline cases incl. Hindi/Hinglish, and 0 of them are classified generic", () => {
  assert.ok(PERSONAL.length >= 40, `${PERSONAL.length} cases`);
  assert.ok(PERSONAL.some((q) => /[ऀ-ॿ]/.test(q)) && PERSONAL.some((q) => /\b(mera|mujhe|meri)\b/.test(q)));
  const leaked = PERSONAL.filter((q) => classifyQuestion(q).class !== "personal");
  assert.deepEqual(leaked, []);
});

test("A15b: clear generic factual questions (English, Hinglish, Hindi) are generic", () => {
  const wrong = GENERIC.filter((q) => classifyQuestion(q).class !== "generic");
  assert.deepEqual(wrong, []);
});

test("A15b: fails closed - empty, whitespace, very long or unrecognised input is personal", () => {
  for (const q of ["", "   ", "x".repeat(5000), "asdf qwer", "🙂"]) assert.equal(classifyQuestion(q).class, "personal", JSON.stringify(q.slice(0, 20)));
});

test("A15b: rule-based - classify.ts imports no provider and makes no model call", () => {
  const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "src", "student", "classify.ts"), "utf8");
  assert.doesNotMatch(src, /@vc\/providers|generate\(|fetch\(/);
});

test("U7 repair F: an email address is personal data like a phone number - personal -> sign_in_required, never generic", () => {
  for (const t of ["What are the fees in Germany? mail me at priya.nair@example.test", "Which universities in Canada accept IELTS? write to a_b+c@mail.example.co.in", "मुझे यह बताओ: क्या फीस है? riya@example.test"]) {
    const c = classifyQuestion(t);
    assert.equal(c.class, "personal", t);
  }
  assert.equal(classifyQuestion("What are the tuition fees at public universities in Germany?").class, "generic");
});

// ---------------------------------------------------------------------------
// tool-first T1 (spec S3, TF-5): tight anchored intent rules for the Vidysea tools; KB questions still reach search_kb.
// ---------------------------------------------------------------------------
const TOOL_ASKS: [string, string][] = [
  // university search / AI finder
  ["best universities in Canada", "navigate_steps"],
  ["What are the top universities in Germany?", "navigate_steps"],
  ["which are the best universities in the UK", "navigate_steps"],
  ["hi, best universities in australia please", "navigate_steps"],
  ["find universities in Ireland", "navigate_steps"],
  ["can you help me find universities in Canada?", "navigate_steps"],
  ["show me colleges", "navigate_steps"],
  ["suggest universities for my budget", "navigate_steps"],
  ["which country should I choose", "navigate_steps"],
  ["help me choose a country", "navigate_steps"],
  ["I want to study in Canada", "navigate_steps"],
  ["Canada ki best universities batao", "navigate_steps"],
  ["mujhe achi universities chahiye", "navigate_steps"],
  ["universities dhundo", "navigate_steps"],
  ["mere budget me universities batao", "navigate_steps"],
  ["कनाडा की सबसे अच्छी यूनिवर्सिटी", "navigate_steps"],
  ["यूनिवर्सिटी खोजो", "navigate_steps"],
  // shortlist, compare, journey, applications, visa, favourites, scholarships, documents, tests, tools
  ["how do I shortlist a university", "navigate_steps"],
  ["compare universities", "navigate_steps"],
  ["how do I compare two colleges?", "navigate_steps"],
  ["universities compare karna hai", "navigate_steps"],
  ["make my full journey", "navigate_steps"],
  ["create my journey map", "navigate_steps"],
  ["generate my roadmap please", "navigate_steps"],
  ["meri journey bana do", "navigate_steps"],
  ["mujhe journey map chahiye", "navigate_steps"],
  ["मेरी जर्नी मैप बनाओ", "navigate_steps"],
  ["how do I start an application", "navigate_steps"],
  ["where do I track my application status", "navigate_steps"],
  ["visa checklist", "navigate_steps"],
  ["where do I track my visa", "navigate_steps"],
  ["where are my favourites", "navigate_steps"],
  ["my scholarships", "navigate_steps"],
  ["find scholarships for me", "navigate_steps"],
  ["how do I upload my documents", "navigate_steps"],
  ["upload documents", "navigate_steps"],
  ["which tests do I need for my shortlisted programmes", "navigate_steps"],
  ["open the tools library", "navigate_steps"],
  ["where is the GPA calculator", "navigate_steps"],
  // services list
  ["what services are available", "navigate_steps"],
  ["which services do you have?", "navigate_steps"],
  ["what services are available on vidysea", "navigate_steps"],
];

test("TF-5: the new tool phrases (English, Hindi, Hinglish) route to navigate_steps", () => {
  const bad = TOOL_ASKS.filter(([q, want]) => classifyIntent(q) !== want).map(([q]) => `${q} -> ${classifyIntent(q)}`);
  assert.deepEqual(bad, []);
  assert.ok(TOOL_ASKS.length >= 40);
});

const KB_STAYS: [string, string][] = [
  ["how can I find universities in Germany", "search_kb"],
  ["What is the tuition at German public universities?", "search_kb"],
  ["best universities in Canada for computer science masters", "search_kb"],
  ["best universities for MBA in the UK with scholarships and a GRE of 320", "search_kb"], // route-fix-1: the bare "best universities for MBA in the UK" now routes to University Explorer (finding 1)
  ["What are the top universities in Germany for engineering with low fees?", "search_kb"],
  ["Which universities offer scholarships for IELTS 6.5?", "search_kb"],
  ["find universities in Germany that accept 6 IELTS and have no application fee", "search_kb"],
  ["Which country has the cheapest tuition fees?", "search_kb"],
  ["which country is good for nursing jobs after study", "search_kb"],
  ["I want to study in Canada but what is the visa fee and the processing time", "search_kb"],
  ["How do I compare IELTS and PTE scores?", "search_kb"],
  ["compare these two universities", "rank_options"],
  ["compare universities in Germany and France on tuition and living cost", "search_kb"],
  ["How do I apply for a student visa for Canada?", "search_kb"],
  ["how do I start an application for Germany with a 6.5 IELTS", "search_kb"],
  ["What documents are needed for a UK student visa?", "search_kb"],
  ["Which scholarships exist for Indian students in Canada?", "search_kb"],
  ["how long does it take to make a study plan for GRE", "search_kb"],
  ["How do I prepare a plan for the IELTS in one month?", "search_kb"],
  ["Can you help me with the IELTS preparation timeline?", "search_kb"],
  ["What is a good timeline for applying to US universities?", "search_kb"],
  ["Which test do I need for studying in Canada, IELTS or TOEFL?", "search_kb"],
  ["how do I upload a file to the portal", "search_kb"],
  ["show my shortlisted programmes", "vidysea_shortlisted_programmes"],
  ["shortlist these", "rank_options"],
  ["what do you know about me", "profile_view"],
  ["Germany mein universities ki fees kitni hai", "search_kb"],
  ["canada ke baare mein batao", "search_kb"],
];

test("TF-5: KB questions that share words with the tools still reach search_kb (or their existing tool)", () => {
  const bad = KB_STAYS.filter(([q, want]) => classifyIntent(q) !== want).map(([q, want]) => `${q} -> ${classifyIntent(q)} (want ${want})`);
  assert.deepEqual(bad, []);
  assert.ok(KB_STAYS.length >= 25);
});

test("TF-5: the Pathlynks quest and service rules are unchanged", () => {
  for (const q of ["how do I compare careers", "career selection", "do you help with loans", "where is the journey map", "what services do you offer"]) assert.equal(classifyIntent(q), "navigate_steps", q);
  assert.equal(classifyIntent("What careers did I save?"), "pathlynks_saved_careers");
});

test("TF-5 (ReDoS): classifyIntent stays linear on hostile input built from the new rule vocabulary", () => {
  const units = ["best universities ", "find universities ", "in canada ", "me ", "the ", "full journey ", "journey map ", "compare ", "universities ", "my ", "how do i ", "karo ", "a ", " ", ",", "बेस्ट ", "यूनिवर्सिटी "];
  const heads = ["", "best ", "find ", "how do i ", "compare ", "make my ", "mujhe ", "where do i ", "help me "];
  for (const head of heads) for (const unit of units) for (const tail of ["!", "?", "x", ""]) {
    // route-fix-1 item 5: a relative bound, not a wall-clock one. Time the same input at 200 and 600 repeats (best of 3 each, so a busy machine slows both):
    // linear growth is ~3x, quadratic ~9x, cubic ~27x. The 2 ms floor keeps a sub-millisecond baseline from turning timer noise into a ratio.
    const best = (reps: number): number => {
      const text = head + unit.repeat(reps) + tail;
      let min = Infinity;
      for (let i = 0; i < 3; i++) {
        const t0 = performance.now();
        classifyIntent(text);
        min = Math.min(min, performance.now() - t0);
      }
      return min;
    };
    const short = best(200);
    const long = best(600);
    assert.ok(long <= 6 * Math.max(short, 2), `${JSON.stringify(head + unit)}+${JSON.stringify(tail)}: 200 reps ${short.toFixed(2)} ms, 600 reps ${long.toFixed(2)} ms`);
  }
});

// tool-first T4 (S8): the student's OWN tracking asks route to the read tools; anything with another qualifier stays with the KB or its existing tool.
const T4_ASKS: [string, string][] = [
  ["what is my journey map status", "vidysea_journey_maps"],
  ["how is my journey map going", "vidysea_journey_maps"],
  ["my journey map progress", "vidysea_journey_maps"],
  ["status of my journey map", "vidysea_journey_maps"],
  ["how many journey maps do I have", "vidysea_journey_maps"],
  ["what is my application status", "vidysea_applications"],
  ["my application status", "vidysea_applications"],
  ["show my applications", "vidysea_applications"],
  ["how many applications do I have", "vidysea_applications"],
  ["status of my applications please", "vidysea_applications"],
  ["mere applications ka status", "vidysea_applications"],
  ["what is my visa status", "vidysea_visa"],
  ["my visa status", "vidysea_visa"],
  ["check my visa application status", "vidysea_visa"],
  ["mera visa ka status dikhao", "vidysea_visa"],
  ["what are my favourites", "vidysea_favourites"],
  ["list my favourites", "vidysea_favourites"],
  ["how many favourites do I have", "vidysea_favourites"],
  ["what are my scholarships", "vidysea_saved_scholarships"],
  ["which scholarships have I saved", "vidysea_saved_scholarships"],
  ["what is my scholarship status", "vidysea_saved_scholarships"],
  ["what is my progress", "vidysea_progress"],
  ["show my progress", "vidysea_progress"],
  ["my progress so far", "vidysea_progress"],
  ["how am I doing", "vidysea_progress"],
  ["where do I stand", "vidysea_progress"],
  ["what next", "vidysea_progress"],
  ["what's next?", "vidysea_progress"],
  ["what should I do next", "vidysea_progress"],
  ["what is my next step", "vidysea_progress"],
  ["ab aage kya karun", "vidysea_progress"],
  ["mera progress dikhao", "vidysea_progress"],
  ["मेरी प्रगति दिखाओ", "vidysea_progress"],
];

test("T4: own-progress phrases (English, Hinglish, Hindi) route to the read tools", () => {
  const bad = T4_ASKS.filter(([q, want]) => classifyIntent(q) !== want).map(([q]) => `${q} -> ${classifyIntent(q)}`);
  assert.deepEqual(bad, []);
});

const T4_STAYS: [string, string][] = [
  ["what is the visa processing time for Canada", "search_kb"],
  ["what is my visa fee going to be for Germany", "search_kb"],
  ["how do I check my application status on the Canadian portal", "search_kb"],
  ["what are the scholarships for Indian students in Germany", "search_kb"],
  ["what is the status of my friend's application", "search_kb"],
  ["what is my friend's progress", "search_kb"],
  ["how many applications can I send to UK universities", "search_kb"],
  ["what next after getting an offer letter from a German university", "search_kb"],
  ["what should I do next if my visa is rejected", "search_kb"],
  ["where do I stand with a 6.5 IELTS for Canada", "search_kb"],
  ["how am I doing on the GRE with 310", "search_kb"],
  ["what are favourites in the Vidysea explorer", "search_kb"],
  // Existing tools and the T1 recipes keep their asks.
  ["show my shortlisted programmes", "vidysea_shortlisted_programmes"],
  ["where is the journey map", "navigate_steps"],
  ["open my application status", "navigate_steps"],
  ["my scholarships", "navigate_steps"],
  ["where can I see my favourites", "navigate_steps"],
  ["make my full journey", "navigate_steps"],
  ["how do I start an application", "navigate_steps"],
  ["did I finish my assessment?", "pathlynks_assessment"],
];

test("T4: asks about someone else, general KB questions and the T1 recipe asks are not taken by the read tools", () => {
  const bad = T4_STAYS.filter(([q, want]) => classifyIntent(q) !== want).map(([q, want]) => `${q} -> ${classifyIntent(q)} (want ${want})`);
  assert.deepEqual(bad, []);
});

// route-fix-1 item 2: colloquial and Hinglish progress asks. "my/mera" stays required, so a KB-shaped Hinglish worry is not taken.
test("RF1-2: colloquial and Hinglish progress asks route to the read tools", () => {
  const asks: [string, string][] = [
    ["mera visa kahan tak pahuncha", "vidysea_visa"],
    ["mera visa kahan tak pahuncha?", "vidysea_visa"],
    ["meri journey kahan tak pahunchi", "vidysea_journey_maps"],
    ["meri application kahan tak pahunchi", "vidysea_applications"],
    ["mere scholarships dikhao", "vidysea_saved_scholarships"],
    ["mere favourites batao", "vidysea_favourites"],
    ["meri applications dikhao", "vidysea_applications"],
    ["next steps?", "vidysea_progress"],
    ["next step", "vidysea_progress"],
    ["did I apply to anything yet", "vidysea_applications"],
    ["have I applied to anything?", "vidysea_applications"],
    ["track my visa", "vidysea_visa"],
    ["track my applications", "vidysea_applications"],
  ];
  const bad = asks.filter(([q, want]) => classifyIntent(q) !== want).map(([q]) => `${q} -> ${classifyIntent(q)}`);
  assert.deepEqual(bad, []);
  const stays = [
    "mera visa reject ho gaya ab kya karu",
    "mujhe Canada ka visa kab milega",
    "visa kahan tak pahuncha",
    "kahan tak pahuncha mera friend ka visa",
    "mere dost ke scholarships dikhao",
    "next steps after getting an offer letter",
    "did I apply to the right university for a 6.5 IELTS",
    "track my visa fee for Germany",
    "did my friend apply to anything yet",
  ];
  assert.deepEqual(stays.filter((q) => classifyIntent(q) !== "search_kb").map((q) => `${q} -> ${classifyIntent(q)}`), []);
});

test("RF1-2 (ReDoS): the new colloquial rules stay linear on 5000-char hostile input", () => {
  for (const head of ["mera visa kahan tak ", "did i apply to ", "track my ", "mere scholarships ", "next "]) {
    for (const unit of ["pahuncha ", "anything ", "yet ", "kahan ", "tak ", " ", "steps ", "dikhao "]) for (const tail of ["", "x", "?"]) {
      const text = (head + unit.repeat(5000)).slice(0, 5000) + tail;
      const t0 = performance.now();
      classifyIntent(text);
      assert.ok(performance.now() - t0 < 200, `${JSON.stringify(head + unit)} took ${(performance.now() - t0).toFixed(1)} ms`);
    }
  }
});

test("T4 (ReDoS): the own-progress rules stay linear on hostile input", () => {
  const units = ["my ", "what is ", "what next ", "journey map ", "applications ", "visa status ", "how many ", "do i have ", "favourites ", "hi ", " ", ",", "�"];
  const heads = ["", "what is my ", "how many ", "status of my ", "show ", "mere ", "what ", "can you please "];
  for (const head of heads) for (const unit of units) for (const tail of ["!", "?", "x", ""]) {
    const text = head + unit.repeat(300) + tail;
    const t0 = performance.now();
    classifyIntent(text);
    const ms = performance.now() - t0;
    assert.ok(ms < 100, `${JSON.stringify(head + unit)}x300+${JSON.stringify(tail)} took ${ms.toFixed(1)} ms`);
  }
  for (const filler of ["a", " ", "my ", "what next", "!"]) {
    const text = ("what is my application status" + filler.repeat(4000)).slice(0, 4000) + "#";
    const t0 = performance.now();
    classifyIntent(text);
    assert.ok(performance.now() - t0 < 100, JSON.stringify(filler));
  }
});
