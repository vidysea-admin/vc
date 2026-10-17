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
import { classifyQuestion } from "../src/student/classify.js";

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
  "help",
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
