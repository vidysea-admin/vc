import { test } from "node:test";
import assert from "node:assert/strict";
import { studentProfileMcpStatus } from "../src/index.js";

test("studentProfileMcpStatus reports the scaffold placeholder", () => {
  assert.match(studentProfileMcpStatus(), /not yet implemented/);
});
