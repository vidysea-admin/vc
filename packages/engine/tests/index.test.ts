import { test } from "node:test";
import assert from "node:assert/strict";
import { engineStatus } from "../src/index.js";

test("engineStatus reports the scaffold placeholder", () => {
  assert.match(engineStatus(), /not yet implemented/);
});
