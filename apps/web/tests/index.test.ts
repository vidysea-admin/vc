import { test } from "node:test";
import assert from "node:assert/strict";
import { webStatus } from "../src/index.js";

test("webStatus reports the scaffold placeholder and defers Next.js to T-008", () => {
  assert.match(webStatus(), /T-008/);
});
