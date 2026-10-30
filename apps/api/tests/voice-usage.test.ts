/**
 * D-140: voice sessions are observable and cost-tracked (no cap).
 *   - every model tool call writes one text-free `voice_tool_call` log line: declared tool name, duration ms, outcome
 *   - Live usage reports are summed per session and written into the turn_usage row (real tokens and USD, not zeros)
 */
import assert from "node:assert/strict";
import test from "node:test";
import { adult, newThread, studentToken, until, voiceWorld, type VoiceWorld, type VoiceWorldOptions } from "./voice-fixtures.js";
import type { VoiceTools } from "../src/voice.js";
import type { TurnUsageSink, UsageMeter } from "../src/chat.js";

async function withWorld(fn: (w: VoiceWorld, threadId: string) => Promise<void>, opts?: VoiceWorldOptions): Promise<void> {
  const w = await voiceWorld(opts);
  try {
    const claims = adult();
    const threadId = await newThread(w.chat, await studentToken(claims), String(claims.studentId));
    await fn(w, threadId);
  } finally {
    await w.cleanup();
  }
}

type Row = { entry: Parameters<TurnUsageSink["record"]>[0]; meter: UsageMeter };
function recordingUsage(): { sink: TurnUsageSink; rows: Row[] } {
  const rows: Row[] = [];
  return { rows, sink: { scope: (fn) => fn({ inputTokens: 0, outputTokens: 0, costUsd: 0 }), record: async (entry, meter) => void rows.push({ entry, meter: { ...meter } }) } };
}
const toolLines = (w: VoiceWorld) => w.logs.filter((l) => l.event === "voice_tool_call");

test("D-140: two Live usage reports in one session are summed into the single voice turn_usage row (tokens and USD, not zeros)", async () => {
  const usage = recordingUsage();
  await withWorld(async (w, threadId) => {
    const { client } = await w.open(adult(), threadId);
    w.provider.last.emitInputTranscript("what should I study", true);
    w.provider.last.emitUsage({ inputTokens: 2500, outputTokens: 1500, costUsd: 0.02325 });
    w.provider.last.emitTurnComplete();
    w.provider.last.emitUsage({ inputTokens: 4000, outputTokens: 900, costUsd: 0.0231 });
    w.clock.ms += 30_000;
    client.send({ type: "end" });
    await until(() => client.closed, "socket closed");
    await w.voice.settled();
    assert.equal(usage.rows.length, 1);
    const [row] = usage.rows;
    assert.equal(row!.entry.mode, "voice");
    assert.equal(row!.meter.inputTokens, 6500);
    assert.equal(row!.meter.outputTokens, 2400);
    assert.ok(Math.abs(row!.meter.costUsd - 0.04635) < 1e-12, `cost ${row!.meter.costUsd}`);
    assert.doesNotMatch(JSON.stringify(row), /what should I study/);
  }, { deps: { usage: usage.sink } });
});

test("D-140: a usage report with no price still meters tokens; the row's cost stays 0 (no invented price)", async () => {
  const usage = recordingUsage();
  await withWorld(async (w, threadId) => {
    const { client } = await w.open(adult(), threadId);
    w.provider.last.emitUsage({ inputTokens: 10, outputTokens: 5 });
    client.send({ type: "end" });
    await until(() => client.closed, "socket closed");
    await w.voice.settled();
    assert.deepEqual(usage.rows.map((r) => r.meter), [{ inputTokens: 10, outputTokens: 5, costUsd: 0 }]);
  }, { deps: { usage: usage.sink } });
});

test("D-140: a tool call logs one text-free voice_tool_call line with the tool name, measured duration and outcome ok", async () => {
  let clockRef!: { ms: number };
  const tools: VoiceTools = {
    declarations: [{ name: "pathlynks_profile", description: "profile", parameters: { type: "object" } }],
    run: async () => {
      clockRef.ms += 1234;
      return { result: { message: "Grade 12, likes biology" }, outcome: "ok" };
    },
  };
  await withWorld(async (w, threadId) => {
    clockRef = w.clock;
    await w.open(adult(), threadId);
    w.provider.last.emitInputTranscript("tell me my profile secret phrase", true);
    w.provider.last.emitToolCall({ id: "c1", name: "pathlynks_profile", args: { note: "secret phrase" } });
    await until(() => w.provider.last.calls.some((c) => c.type === "tool_response"), "tool response");
    await until(() => toolLines(w).length === 1, "tool log line");
    const [line] = toolLines(w);
    assert.deepEqual({ ...line, ts: undefined }, { level: "info", event: "voice_tool_call", ts: undefined, tool: "pathlynks_profile", durationMs: 1234, outcome: "ok" });
    assert.doesNotMatch(JSON.stringify(w.logs), /secret phrase|biology|Grade 12/);
  }, { deps: { tools } });
});

test("D-140: tool outcomes timeout, unavailable and error are logged; an undeclared tool name is logged as unknown", async () => {
  const tools: VoiceTools = {
    declarations: [{ name: "slow_tool", description: "s" }, { name: "fenced_tool", description: "f" }, { name: "broken_tool", description: "b" }],
    run: async (call) => {
      if (call.name === "slow_tool") return { result: { message: "unavailable" }, outcome: "timeout" };
      if (call.name === "fenced_tool") return { result: { unavailable: true } };
      if (call.name === "broken_tool") throw new Error("boom with student words");
      return { result: { unavailable: true }, outcome: "unavailable" };
    },
  };
  await withWorld(async (w, threadId) => {
    await w.open(adult(), threadId);
    w.provider.last.emitInputTranscript("hello", true);
    w.provider.last.emitToolCall({ id: "a", name: "slow_tool", args: {} });
    w.provider.last.emitToolCall({ id: "b", name: "fenced_tool", args: {} });
    w.provider.last.emitToolCall({ id: "c", name: "broken_tool", args: {} });
    w.provider.last.emitToolCall({ id: "d", name: "my name is Priya Sharma", args: {} });
    await until(() => toolLines(w).length === 4, "four tool log lines");
    const byTool = Object.fromEntries(toolLines(w).map((l) => [l.tool, l.outcome]));
    assert.deepEqual(byTool, { slow_tool: "timeout", fenced_tool: "unavailable", broken_tool: "error", unknown: "unavailable" });
    assert.doesNotMatch(JSON.stringify(w.logs), /Priya|boom with student words/);
  }, { deps: { tools } });
});
