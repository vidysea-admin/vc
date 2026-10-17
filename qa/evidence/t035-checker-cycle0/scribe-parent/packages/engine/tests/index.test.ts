import { test } from "node:test";
import assert from "node:assert/strict";
import { engineStatus } from "../src/index.js";
import { CardSchema } from "@vc/schemas";

test("engineStatus reports the scaffold placeholder", () => {
  assert.match(engineStatus(), /not yet implemented/);
});

// ISS-007: proves @vc/schemas is importable as a workspace dependency (source
// exports, no build step, per D-007) from another workspace package.
test("ISS-007: @vc/schemas is importable cross-package and parses a valid Card", () => {
  const card = {
    id: "card-1",
    type: "widen" as const,
    prompt: "Have you thought about universities outside the top 10 rankings?",
    sources: [{ type: "kb", id: "univ-123", quote: "ranked #45, strong placement record" }],
    confidence: 0.7,
  };
  assert.doesNotThrow(() => CardSchema.parse(card));
});
