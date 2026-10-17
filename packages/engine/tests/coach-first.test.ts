/**
 * P1 U6, spec A21(a)+(b) / contract B1 student-surface scope (coach first, tool-aware; D-087 Q2):
 * (a) >= 20 requests to write an SOP/essay for the student (incl. Hinglish) yield coaching and never a
 * full draft, even when the model tries to return one; (b) >= 15 intents select the matching tool or
 * feature from the capability manifest. MOCK proves the routing and the guard, not model behaviour.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { MockProvider } from "@vc/providers";
import { classifyIntent, isDraftingRequest } from "../src/student/classify.js";
import { isDraftLike, runStudentTurn, STUDENT_TOOLS, type StudentGraphDeps } from "../src/student/graph.js";
import { NOW, SKILLS_DIR, SPEAKERS, fakeKb, studentProvider } from "./student-fixtures.js";

const AUTH = { role: "student" as const, studentId: "syn-stu-2", tenantId: "sandbox" };

const DRAFTING: string[] = [
  "Write my SOP for MS in Computer Science at TU Munich",
  "Can you write my statement of purpose?",
  "Please draft my personal statement for UCAS",
  "Write an essay for my Common App",
  "write my college essay about my grandmother",
  "Draft a 500 word SOP for me",
  "Generate my motivation letter for Germany",
  "Compose my cover letter for the scholarship",
  "Make me an SOP, I'll just submit it",
  "Can you write the why-this-university essay for me?",
  "Write my LOR on behalf of my teacher",
  "Rewrite my whole essay so it sounds better",
  "mera SOP likh do",
  "mere liye essay likh do please",
  "SOP bana do Canada ke liye",
  "statement of purpose likhke de do",
  "mujhe personal statement likh ke chahiye",
  "मेरा SOP लिख दो",
  "मेरे लिए निबंध लिख दो",
  "just give me a full SOP I can copy",
  "Write a scholarship essay for me about leadership",
  "draft my supplemental essays for Yale",
];

test("A21(a): the fixture has >= 20 drafting requests incl. Hinglish/Hindi, and every one is detected", () => {
  assert.ok(DRAFTING.length >= 20);
  assert.deepEqual(DRAFTING.filter((q) => !isDraftingRequest(q)), []);
  for (const q of ["What is an SOP?", "How long should an SOP be?", "What is the tuition at German public universities?"]) {
    assert.equal(isDraftingRequest(q), false, q);
  }
});

test("A21(a): every drafting request yields coaching (questions, structure) and never a full draft - even when the model returns one", async () => {
  const draft = [
    "Statement of Purpose",
    "",
    "Ever since I was a child, I have been fascinated by computers. My journey began in a small town where I first wrote code on my father's old laptop. " +
      "Over the years I have developed a deep passion for artificial intelligence, completing projects in machine learning and computer vision. " +
      "I am applying to the MS in Computer Science programme at TU Munich because of its world-class faculty and research opportunities. " +
      "In the future I hope to contribute to research that makes technology accessible to everyone. I believe this programme is the ideal next step in my journey.",
    "",
    "Sincerely,",
    "A Student",
  ].join("\n");
  const cheating = new MockProvider({ responses: { "vc-capabilities": { reply: draft, questions: [] } } });
  const honest = studentProvider();
  for (const provider of [cheating, honest]) {
    for (const text of DRAFTING) {
      const deps: StudentGraphDeps = { kb: fakeKb(), provider, skillsDir: SKILLS_DIR, speakers: SPEAKERS, now: () => NOW };
      const out = await runStudentTurn(deps, { mode: "authenticated", auth: AUTH, threadId: "th-c", turnId: "tu-c", text });
      assert.equal(out.selectedTool, "coach_draft_feedback", text);
      const msg = out.response.message ?? "";
      assert.equal(isDraftLike(msg), false, `full draft leaked for: ${text}\n${msg}`);
      assert.ok((msg.match(/\?/g) ?? []).length >= 2, `coaching asks questions for: ${text}`);
      assert.doesNotMatch(msg, /Sincerely|Ever since I was a child/);
    }
  }
});

test("A21(a): isDraftLike flags essay-shaped text and not a coaching reply", () => {
  assert.equal(isDraftLike("Statement of Purpose\n\nI am applying to ... " + "word ".repeat(200)), true);
  assert.equal(isDraftLike("Dear Admissions Committee, I am writing to express my interest in your programme. " + "I have always been passionate. ".repeat(10)), true);
  assert.equal(isDraftLike("Let's work on it together. What made you choose CS? Which project are you proudest of?"), false);
});

const INTENTS: [string, string][] = [
  ["What do you know about me?", "profile_view"],
  ["show my profile", "profile_view"],
  ["That's wrong, my budget is 25 lakh not 20", "profile_correct"],
  ["yes that's right, confirm it", "profile_confirm"],
  ["Delete my data", "data_erasure"],
  ["mera data delete kar do", "data_erasure"],
  ["Export my data", "data_export"],
  ["Compare these options: TU Munich vs RWTH Aachen", "rank_options"],
  ["Which of these universities is best for me?", "rank_options"],
  ["Is this stale?", "source_freshness"],
  ["how old is this information?", "source_freshness"],
  ["Which countries do you cover?", "coverage"],
  ["Can we switch to voice?", "channel_switch"],
  ["can I type instead of talking?", "channel_switch"],
  ["Here is my SOP draft, can you give feedback?", "coach_draft_feedback"],
  ["What is the tuition at German public universities?", "search_kb"],
  ["Where did that come from? show me the source", "kb_source_detail"],
];

test("A21(b): >= 15 fixture intents select the matching tool/feature, and every selected tool is a registered student tool", async () => {
  assert.ok(INTENTS.length >= 15);
  const registered = new Set(STUDENT_TOOLS.map((t) => t.name));
  for (const [text, tool] of INTENTS) {
    assert.equal(classifyIntent(text), tool, text);
    assert.ok(registered.has(tool), `${tool} is registered`);
    const deps: StudentGraphDeps = { kb: fakeKb(), provider: studentProvider(), skillsDir: SKILLS_DIR, speakers: SPEAKERS, now: () => NOW };
    const out = await runStudentTurn(deps, { mode: "authenticated", auth: AUTH, threadId: "th-i", turnId: "tu-i", text });
    assert.equal(out.selectedTool, tool, `graph selected ${out.selectedTool} for: ${text}`);
  }
});
