import { test } from "node:test";
import assert from "node:assert/strict";
import { citationGuard, dropUncited } from "../src/guards/citation.js";
import type { Card } from "@vc/schemas";

function makeCard(overrides: Partial<Card> = {}): Card {
  return {
    id: "card-1",
    type: "evidence",
    prompt: "80% of 2024 grads found jobs within 6 months (source: careers office report).",
    sources: [{ type: "kb", id: "univ-123", quote: "80% placement" }],
    confidence: 0.8,
    ...overrides,
  } as Card;
}

test("a card with a valid source passes", () => {
  const result = citationGuard(makeCard());
  assert.equal(result.ok, true);
});

test("a card with empty sources is rejected", () => {
  const result = citationGuard(makeCard({ sources: [] }));
  assert.equal(result.ok, false);
});

test("a card with an invalid source (missing id) is rejected", () => {
  const result = citationGuard(makeCard({ sources: [{ type: "kb", id: "" }] }));
  assert.equal(result.ok, false);
});

test("dropUncited keeps cited cards and drops uncited ones", () => {
  const cited = makeCard({ id: "card-cited" });
  const uncited = makeCard({ id: "card-uncited", sources: [] });
  const result = dropUncited([cited, uncited]);
  assert.deepEqual(
    result.kept.map((c) => c.id),
    ["card-cited"],
  );
  assert.equal(result.dropped.length, 1);
  assert.equal(result.dropped[0].card.id, "card-uncited");
  assert.ok(result.dropped[0].reason.length > 0);
});
