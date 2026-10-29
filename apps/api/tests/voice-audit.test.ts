/**
 * P1 U10 (C5, A9b): the spoken answer is audited AFTER it is spoken. A listed speaker or an uncited figure becomes a stored audit finding
 * on the assistant row and a `flag` event to the client; a clean answer produces neither. SYNTHETIC only.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { adult, minorNoConsent, newThread, studentToken, until, voiceWorld, SPEAKER_NAME, type VoiceWorld, type VoiceWorldOptions } from "./voice-fixtures.js";
import type { VoiceTools } from "../src/voice.js";

async function withWorld(fn: (w: VoiceWorld, threadId: string) => Promise<void>, opts?: VoiceWorldOptions, claims: Record<string, unknown> = adult()): Promise<void> {
  const w = await voiceWorld(opts);
  try {
    const threadId = await newThread(w.chat, await studentToken(claims), String(claims.studentId));
    await fn(w, threadId);
  } finally {
    await w.cleanup();
  }
}
const turnRows = (w: VoiceWorld) => w.fakeDb.collection<any>("chat_turns").all();
const assistantRow = (w: VoiceWorld) => turnRows(w).find((r) => r.role === "assistant" && r.channel === "voice");
const speak = (w: VoiceWorld, text: string): void => w.provider.last.emitInputTranscript(text, true);

test("C5: an uncited figure in the spoken answer is flagged to the client and stored on the assistant row, after the audio was already sent", async () => {
  await withWorld(async (w, threadId) => {
    const { client } = await w.open(adult(), threadId);
    speak(w, "What are the fees in Germany?");
    w.provider.last.emitOutputAudio(new Uint8Array(480).fill(5));
    w.provider.last.emitOutputTranscript("The fee is 5000 euros per year");
    w.provider.last.emitTurnComplete();
    await until(() => client.of("flag").length === 1, "flag event");
    const flag = client.of("flag")[0];
    assert.equal(flag.reason, "uncited_number");
    assert.equal(flag.detail, "5000");
    assert.equal(client.frames.length, 1, "the audio was not held back: the audit is after the fact");
    await until(() => (assistantRow(w)?.voiceAudit?.length ?? 0) === 1, "stored audit");
    const row = assistantRow(w);
    assert.equal(row.voiceAudit[0].reason, "uncited_number");
    assert.equal(row.voiceAudit[0].detail, "5000");
    assert.ok(typeof row.voiceAudit[0].at === "string");
    assert.equal(row.text, "The fee is 5000 euros per year");
  });
});

test("C5: a listed speaker named aloud is flagged as named_speaker and the name is never repeated in the flag or the stored finding", async () => {
  await withWorld(async (w, threadId) => {
    const { client } = await w.open(adult(), threadId);
    speak(w, "who told you that");
    w.provider.last.emitOutputTranscript(`${SPEAKER_NAME} said you should apply early`);
    w.provider.last.emitTurnComplete();
    await until(() => client.of("flag").length === 1, "flag event");
    assert.equal(client.of("flag")[0].reason, "named_speaker");
    assert.ok(!JSON.stringify(client.of("flag")).includes("Arjun"));
    await until(() => (assistantRow(w)?.voiceAudit?.length ?? 0) === 1, "stored audit");
    const audit = JSON.stringify(assistantRow(w).voiceAudit);
    assert.ok(!audit.includes("Arjun") && !audit.includes("Mehrotra"), "the speaker's name is not stored in the finding");
    assert.equal(assistantRow(w).voiceAudit[0].reason, "named_speaker");
  });
});

test("C5: a clean spoken answer produces no flag and no stored audit", async () => {
  await withWorld(async (w, threadId) => {
    const { client } = await w.open(adult(), threadId);
    speak(w, "hello");
    w.provider.last.emitOutputTranscript("Hello, tell me about your plans");
    w.provider.last.emitTurnComplete();
    await until(() => client.of("state").length === 1, "turn complete");
    assert.equal(client.of("flag").length, 0);
    assert.equal(assistantRow(w).voiceAudit, undefined);
  });
});

test("C5: a figure that a knowledge-base tool returned this session is cited, so it is not flagged; the sources reach the client", async () => {
  const tools: VoiceTools = {
    declarations: [{ name: "search_kb", description: "search", parameters: { type: "object" } }],
    run: async () => ({
      result: { hits: [{ text: "Fees are about 5000 euros" }] },
      sources: [{ id: "src-1", kind: "internal-seminar", title: "Seminar" }],
      claims: [{ text: "Fees are about 5000 euros", kind: "number", sourceIds: ["src-1"], status: "verified" }],
    }),
  };
  await withWorld(
    async (w, threadId) => {
      const { client } = await w.open(adult(), threadId);
      assert.deepEqual(w.provider.configs[0]!.tools?.map(t => t.name), ["search_kb", "student_memory"], "the exact knowledge and eligible memory declarations are offered to the model");
      speak(w, "fees?");
      w.provider.last.emitToolCall({ id: "c1", name: "search_kb", args: { q: "fees" } });
      await until(() => w.provider.last.calls.some((c) => c.type === "tool_response"), "tool response sent");
      await until(() => client.of("answer.sources").length === 1, "sources event");
      assert.equal(client.of("answer.sources")[0].sources[0].id, "src-1");
      w.provider.last.emitOutputTranscript("It is about 5000 euros");
      w.provider.last.emitTurnComplete();
      await until(() => client.of("state").length === 1, "turn complete");
      assert.equal(client.of("flag").length, 0);
      assert.equal(assistantRow(w).voiceAudit, undefined);
    },
    { deps: { tools } },
  );
});

test("C5: an auditor that throws becomes a visible unverified_claim flag, never a silent pass", async () => {
  await withWorld(
    async (w, threadId) => {
      const { client } = await w.open(adult(), threadId);
      speak(w, "hi");
      w.provider.last.emitOutputTranscript("Some answer");
      w.provider.last.emitTurnComplete();
      await until(() => client.of("flag").length === 1, "flag");
      assert.equal(client.of("flag")[0].reason, "unverified_claim");
      assert.ok(!JSON.stringify(client.of("flag")).includes("auditor secret failure"));
    },
    {
      deps: {
        auditOutput: () => {
          throw new Error("auditor secret failure");
        },
      },
    },
  );
});

test("C5: for an unconsented minor the flag still reaches the student but no finding or text is stored", async () => {
  await withWorld(
    async (w, threadId) => {
      const { client } = await w.open(minorNoConsent(), threadId);
      speak(w, "fees?");
      w.provider.last.emitOutputTranscript("It is 7000 euros");
      w.provider.last.emitTurnComplete();
      await until(() => client.of("flag").length === 1, "flag");
      await until(() => client.of("state").length === 1, "turn complete");
      assert.equal(turnRows(w).length, 0);
    },
    undefined,
    minorNoConsent(),
  );
});
