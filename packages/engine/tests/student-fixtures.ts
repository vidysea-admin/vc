/**
 * Shared SYNTHETIC fixtures for the P1 U6 student-graph tests. Hit/node/session shapes mirror the
 * structuredContent of the U2 MCP tools (`search_kb`, `ask_knowledge_base`, `get_session` in
 * mcp/university-kb/src/index.ts) and the U2 contract-shaped fixtures in mcp/university-kb/kb-fixture/.
 * Invented text only; no KB content.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { MockProvider } from "@vc/providers";
import { SpeakersFileSchema, type SpeakersFile } from "../src/guards/no-quote.js";
import type { AskToolOutput, SearchHit, SearchToolOutput, SessionToolOutput, StudentKbPort } from "../src/student/claims.js";

const here = dirname(fileURLToPath(import.meta.url));
export const SKILLS_DIR = join(here, "..", "..", "..", "skills");
export const SPEAKERS: SpeakersFile = SpeakersFileSchema.parse(JSON.parse(readFileSync(join(here, "fixtures", "speakers.json"), "utf8")));
export const NOW = new Date("2026-10-17T09:00:00.000Z");

export const HIT_SEMINAR: SearchHit = {
  turnId: "t-sem-1",
  sessionId: "sess-sem-1",
  score: 3.2,
  text: "German public universities charge no tuition for most programmes, but expect a semester contribution of about 300 euros.",
  speakerLabel: "Nisha Varadkar",
  sessionDate: "2026-03-04",
  sessionTitle: "Study in Germany seminar",
  sourceId: "src-sem-1",
  sourceKind: "internal-seminar",
};
export const HIT_WHATSAPP: SearchHit = {
  turnId: "t-wa-1",
  sessionId: "sess-wa-1",
  score: 2.1,
  text: "my cousin got the DAAD scholarship last year, apply by October and call 98765 43210 for the agent",
  sessionDate: "2026-02-01",
  sessionTitle: "Alumni group batch",
  sourceId: "src-wa-1",
  sourceKind: "whatsapp",
};
export const HIT_UNLISTED_RECORDING: SearchHit = {
  turnId: "t-rec-9",
  sessionId: "sess-rec-9",
  score: 1.4,
  text: "Blocked accounts of about 11,904 euros are required for the German student visa.",
  sessionDate: "2025-11-20",
  sessionTitle: "Unlisted recording",
  sourceId: "src-rec-9",
  sourceKind: "unknown",
};
export const HIT_TOC_OLD: SearchHit = {
  turnId: "t-toc-1",
  sessionId: "sess-toc-1",
  score: 1.1,
  text: "Canada requires proof of funds for the study permit.",
  sessionDate: "2023-01-10",
  sourceId: "src-toc-1",
  sourceKind: "toc",
};
export const HIT_LOW_SCORE: SearchHit = {
  turnId: "t-low-1",
  sessionId: "sess-low-1",
  score: 0.4,
  text: "Some general remarks about studying abroad.",
  sessionDate: "2026-01-01",
  sourceId: "src-sem-1",
  sourceKind: "internal-seminar",
};

export const SEARCH_OK: SearchToolOutput = { status: "ok", hits: [HIT_SEMINAR, HIT_WHATSAPP, HIT_UNLISTED_RECORDING, HIT_TOC_OLD], dropped: 0 };

export const ASK_ANSWERED: AskToolOutput = {
  status: "answered",
  answer: "Most German public universities charge no tuition; budget about 11,000 euros a year for living costs.",
  citations: { internal: [{ node_id: "session:sess-sem-2", evidence: { sessionRef: "sess-sem-2" } }, { node_id: "topic:germany-costs" }], web: [] },
  verdict: "correct",
  insufficient_coverage: false,
  reason: "top node scored above the upper threshold",
  sourceKind: "unknown",
};

export const SESSION_SEM_2: SessionToolOutput = {
  status: "ok",
  session: { id: "sess-sem-2", title: "Germany costs seminar", date: "2026-05-01", sourceId: "src-sem-2" },
  sourceKind: "internal-seminar",
  turns: [
    { turnId: "t-sem-2a", text: "Living costs in Germany come to about 11,000 euros a year for most students." },
    { turnId: "t-sem-2b", text: "Public universities there mostly charge no tuition." },
  ],
};

/** A recording fake of the U2 tool surface; `calls` lists every outgoing tool call in order. */
export function fakeKb(opts: {
  search?: SearchToolOutput | ((q: string) => SearchToolOutput);
  ask?: AskToolOutput;
  sessions?: Record<string, SessionToolOutput>;
  anonymous?: boolean;
} = {}): StudentKbPort & { calls: { tool: string; arg: string }[] } {
  const calls: { tool: string; arg: string }[] = [];
  const port: StudentKbPort & { calls: { tool: string; arg: string }[] } = {
    calls,
    async searchKb(query: string) {
      calls.push({ tool: "search_kb", arg: query });
      const s = opts.search ?? SEARCH_OK;
      return typeof s === "function" ? s(query) : structuredClone(s);
    },
  };
  if (!opts.anonymous) {
    port.askKnowledgeBase = async (query: string) => {
      calls.push({ tool: "ask_knowledge_base", arg: query });
      return structuredClone(opts.ask ?? ASK_ANSWERED);
    };
    port.getSession = async (sessionId: string) => {
      calls.push({ tool: "get_session", arg: sessionId });
      const found = (opts.sessions ?? { "sess-sem-2": SESSION_SEM_2 })[sessionId];
      return found ? structuredClone(found) : { status: "unavailable", unavailableReason: "not_found" };
    };
  }
  return port;
}

/** A Mock provider with canned outputs for the two student skills. */
export function studentProvider(responses: { kbAnswer?: unknown; coach?: unknown } = {}): MockProvider {
  return new MockProvider({
    responses: {
      "kb-answer": responses.kbAnswer ?? {
        claims: [{ text: "Public universities in Germany charge no tuition for most programmes.", kind: "fact", sourceIds: ["t-sem-1"] }],
        followUp: "Which cities are you considering?",
      },
      "vc-capabilities": responses.coach ?? {
        reply: "Let's build this together from your own experience.",
        questions: ["What moment made you choose this field?", "Which project are you proudest of, and why?"],
      },
    },
  });
}

/**
 * U6h fix1 M4b: `hasPriorFlag` is a REQUIRED dep of the student graph. This is the test-only stand-in: a store that has
 * no earlier flag for any thread. Production wires the stored flag log instead (never this).
 */
export const NO_PRIOR_FLAG = async (): Promise<boolean> => false;
