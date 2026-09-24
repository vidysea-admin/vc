import { test } from "node:test";
import assert from "node:assert/strict";
import { apiStatus } from "../src/index.js";

test("apiStatus reports the scaffold placeholder", () => {
  assert.match(apiStatus(), /not yet implemented/);
});
