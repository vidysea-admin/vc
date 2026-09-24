import { test } from "node:test";
import assert from "node:assert/strict";
import { universityKbMcpStatus } from "../src/index.js";

test("universityKbMcpStatus reports the scaffold placeholder", () => {
  assert.match(universityKbMcpStatus(), /not yet implemented/);
});
