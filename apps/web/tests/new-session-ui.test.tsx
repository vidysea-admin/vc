/**
 * T-021 (D-020, contract B6 "runtime failover" + B17 persona usability): the "start a new session"
 * screen's initial markup (server-rendered with react-dom/server, no browser) — B1: every word the
 * screen writes on its own is a LABEL, never a composed sentence for the counsellor to read aloud.
 * The interactive Retry-preserves-input behaviour is proven live (Playwright) in
 * demo/browser-evidence-failover.ts, not here — a static render can only prove the initial idle
 * markup and the fixed labels, never a click.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { isScriptLike } from "@vc/schemas";
import { NewSessionForm } from "../src/components/NewSessionForm";
import { LABELS } from "../src/components/labels";

test("NewSessionForm: renders the title, the student id and every transcript turn, with a Submit button", () => {
  const html = renderToStaticMarkup(<NewSessionForm />);
  assert.ok(html.includes(LABELS.newSessionTitle));
  assert.ok(html.includes("demo-student-4"));
  for (const needle of ["computer science in Canada", "Which intake are you aiming for?", "September 2027", "20 lakh rupees a year"]) {
    assert.ok(html.includes(needle), `missing ${needle}`);
  }
  assert.ok(html.includes('data-testid="submit-session"'));
  assert.ok(html.includes(LABELS.submitSession));
});

test("D078 Hindi capability: new session labels and speaker display localize, transcript stays verbatim", () => {
  const html = renderToStaticMarkup(<NewSessionForm {...{ initialLocale: "hi" as const }} />);
  assert.ok(html.includes("नया सत्र"), "Hindi session must show its translated title");
  for (const speaker of ["विद्यार्थी", "परामर्शदाता"]) assert.ok(html.includes(speaker), `missing Hindi speaker ${speaker}`);
  for (const raw of [">student", ">counsellor", LABELS.newSessionTitle, LABELS.submitSession]) assert.equal(html.includes(raw), false, `untranslated display ${raw}`);
  for (const text of ["demo-student-4", "I am thinking about computer science in Canada, maybe Toronto or Waterloo.", "Which intake are you aiming for?", "Probably the September 2027 intake, after my boards.", "What yearly budget has your family discussed?", "My parents said around 20 lakh rupees a year is the limit."]) assert.ok(html.includes(text), `translated transcript data ${text}`);
  for (const id of ["t1", "t2", "t3", "t4", "t5"]) assert.ok(html.includes(`data-turn-id="${id}"`));
  assert.ok(html.includes('data-testid="submit-session"'));
  for (const state of ["retry-session", 'data-state="started"', 'data-state="done"', 'data-state="ai_unavailable"']) assert.equal(html.includes(state), false);
  const english = renderToStaticMarkup(<NewSessionForm />);
  assert.ok(english.includes("New session"), "English compatibility positive control");
});

test("NewSessionForm: the apologetic AI-unavailable copy is plain language, not a script, and never mentions a model/vendor name", () => {
  // B1: LABELS text must never read as a script (an instruction/recital) — ui.test.tsx's own
  // "every UI label is a short label" test already enforces this + the <=6-word / no-trailing-
  // punctuation shape across ALL of LABELS, this one included.
  const aiUnavailableCopy = [LABELS.stateAiUnavailable, LABELS.aiUnavailableApology, LABELS.aiUnavailableHint];
  for (const label of aiUnavailableCopy) assert.equal(isScriptLike(label, "evidence"), false);
  // Persona usability (B17): a Jaipur counsellor reads this, not an engineer — no vendor/engineering jargon.
  for (const jargon of ["litellm", "LiteLLM", "gemini", "Gemini", "failover", "stack trace", "500", "503"]) {
    for (const label of aiUnavailableCopy) assert.doesNotMatch(label, new RegExp(jargon, "i"));
  }
});

test("NewSessionForm: the initial idle render offers no Retry button and no ai_unavailable banner (only Submit)", () => {
  const html = renderToStaticMarkup(<NewSessionForm />);
  assert.equal(html.includes('data-testid="retry-session"'), false);
  assert.equal(html.includes('data-state="ai_unavailable"'), false);
  assert.equal(html.includes('data-state="started"'), false);
});

test("T-021 fix cycle 1 (ISS-t-021-c0-1, B17): the transcript table has its OWN column label for the spoken text, never the approval screen's colValue (\"Proposed value\")", () => {
  const html = renderToStaticMarkup(<NewSessionForm />);
  assert.ok(html.includes(LABELS.colTranscriptText), "the transcript column header renders its own label");
  assert.equal(LABELS.colTranscriptText, "What was said");
  assert.notEqual(LABELS.colTranscriptText, LABELS.colValue, "must not be the approval screen's proposed-fact label");
  assert.ok(!html.includes(LABELS.colValue), 'the new-session screen must never render "Proposed value" — this text is not a proposed fact');
});
