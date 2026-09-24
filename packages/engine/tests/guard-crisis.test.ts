import { test } from "node:test";
import assert from "node:assert/strict";
import { crisisGuard, routeBeforeGeneration } from "../src/guards/crisis.js";

test("a plain statement is level 'none' and continues", () => {
  const result = crisisGuard("I want to study computer science in Canada.");
  assert.equal(result.level, "none");
  assert.deepEqual(result.matched, []);
  assert.deepEqual(routeBeforeGeneration("I want to study computer science in Canada."), {
    route: "continue",
  });
});

test("a benign use of 'dying' is NOT flagged (documented false-positive guard)", () => {
  const result = crisisGuard("I'm dying to go to LSE, it's my dream school.");
  assert.equal(result.level, "none");
  assert.deepEqual(routeBeforeGeneration("I'm dying to go to LSE, it's my dream school."), {
    route: "continue",
  });
});

test("an explicit self-harm signal is level 'crisis' and escalates", () => {
  const result = crisisGuard("I just want to kill myself, nothing matters anymore.");
  assert.equal(result.level, "crisis");
  assert.ok(result.matched.length > 0);

  const routed = routeBeforeGeneration("I just want to kill myself, nothing matters anymore.");
  assert.equal(routed.route, "escalate");
  if (routed.route === "escalate") {
    assert.equal(routed.card.type, "escalation");
    assert.equal(routed.card.level, "crisis");
    assert.match(routed.card.message, /iCALL/);
    assert.ok(routed.card.matched.length > 0);
  }
});

test("a Hinglish self-harm signal is level 'crisis'", () => {
  const result = crisisGuard("mujhe lagta hai ab jeene ka mann nahi hai, sab kuch khatam karna chahti hoon");
  assert.equal(result.level, "crisis");
});

test("an abuse signal is level 'crisis'", () => {
  const result = crisisGuard("my stepfather beats me every week and I don't know what to do.");
  assert.equal(result.level, "crisis");
});

test("a softer distress signal is level 'concern' and still escalates", () => {
  const result = crisisGuard("I feel so hopeless about this whole application process.");
  assert.equal(result.level, "concern");
  assert.ok(result.matched.length > 0);

  const routed = routeBeforeGeneration("I feel so hopeless about this whole application process.");
  assert.equal(routed.route, "escalate");
  if (routed.route === "escalate") {
    assert.equal(routed.card.level, "concern");
    assert.match(routed.card.message, /iCALL/);
  }
});

test("crisis takes priority over concern when both match in the same turn", () => {
  const result = crisisGuard("I feel so hopeless, I just want to end it all.");
  assert.equal(result.level, "crisis");
});

test("empty text is level 'none'", () => {
  assert.equal(crisisGuard("").level, "none");
  assert.equal(crisisGuard("   ").level, "none");
});
