/** T-009: loads and validates qa/evals/scribe/sessions.jsonl (one GoldSession per line). */
import { readFileSync } from "node:fs";
import { GoldSessionSchema, type GoldSession } from "./types.js";

export function parseDataset(raw: string, sourceLabel: string): GoldSession[] {
  const lines = raw.split(/\r?\n/).filter((line) => line.trim().length > 0);
  const sessions: GoldSession[] = [];
  const seenIds = new Set<string>();
  for (const [i, line] of lines.entries()) {
    let json: unknown;
    try {
      json = JSON.parse(line);
    } catch (err) {
      throw new Error(`${sourceLabel}:${i + 1}: invalid JSON (${(err as Error).message})`);
    }
    const parsed = GoldSessionSchema.safeParse(json);
    if (!parsed.success) {
      throw new Error(`${sourceLabel}:${i + 1}: ${parsed.error.issues.map((iss) => `${iss.path.join(".")}: ${iss.message}`).join("; ")}`);
    }
    if (seenIds.has(parsed.data.id)) {
      throw new Error(`${sourceLabel}:${i + 1}: duplicate session id "${parsed.data.id}"`);
    }
    seenIds.add(parsed.data.id);
    sessions.push(parsed.data);
  }
  if (sessions.length === 0) {
    throw new Error(`${sourceLabel}: no sessions found`);
  }
  return sessions;
}

export function loadDataset(path: string): GoldSession[] {
  const raw = readFileSync(path, "utf-8");
  return parseDataset(raw, path);
}
