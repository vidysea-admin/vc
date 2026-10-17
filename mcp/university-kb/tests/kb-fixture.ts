/** Loads a contract-shaped fixture from `mcp/university-kb/kb-fixture/` (synthetic; see each file's `_fixture` marker). */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const FIXTURE_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "kb-fixture");

export function readFixture(name: string): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(path.join(FIXTURE_DIR, name), "utf8")) as Record<string, unknown>;
}
