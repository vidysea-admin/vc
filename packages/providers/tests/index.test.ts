import { test } from "node:test";
import assert from "node:assert/strict";
import { providersStatus } from "../src/index.js";

test("providersStatus reports the scaffold placeholder", () => {
  assert.match(providersStatus(), /not yet implemented/);
});
