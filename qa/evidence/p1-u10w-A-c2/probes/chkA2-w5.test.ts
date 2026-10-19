// Checker A cycle-2 independent probe for W5 (placed in an isolated copy only).
import assert from "node:assert/strict";
import { test } from "node:test";
import { VoiceConfigError, voiceEnabledFromEnv } from "../src/voice.js";

const KEY = "VC_VOICE_ENABLED";
test("A2-1: only the exact string 'true' is on; every hostile variant is never on", () => {
  assert.equal(voiceEnabledFromEnv({ [KEY]: "true" }), true);
  const hostile = [" true", "true ", "\ttrue", "true\t", "\ntrue", "true\n", "true\r\n", " true ", "\u00a0true", "true\u00a0", "\ufefftrue", "true\u200b", "\u2003true\u2003",
    "TRUE", "True", "tRue", "1", "yes", "on", "enabled", "true;", "true,", "'true'", '"true"', "truee", "tru", "t", "true\0", "t rue"];
  for (const v of hostile) {
    let r: unknown = "no-throw";
    try { r = voiceEnabledFromEnv({ [KEY]: v }); } catch (e) { assert.ok(e instanceof VoiceConfigError, JSON.stringify(v)); r = "threw"; }
    assert.notEqual(r, true, `enabled by ${JSON.stringify(v)}`);
    assert.equal(r, "threw", `${JSON.stringify(v)} should fail closed (throw), got ${String(r)}`);
  }
});
test("A2-2: the off values stay off and do not throw; padded 'false' / 'off' values are never on", () => {
  for (const env of [{}, { [KEY]: undefined }, { [KEY]: "" }, { [KEY]: "false" }]) assert.equal(voiceEnabledFromEnv(env as Record<string, string | undefined>), false);
  for (const v of [" false", "false ", "FALSE", "0", "no", "off", " "]) {
    let r: unknown = "no-throw";
    try { r = voiceEnabledFromEnv({ [KEY]: v }); } catch { r = "threw"; }
    assert.notEqual(r, true, JSON.stringify(v));
  }
});
test("A2-3: a different env key spelling (lowercase / other name) does not enable voice", () => {
  assert.equal(voiceEnabledFromEnv({ vc_voice_enabled: "true" } as Record<string, string>), false);
  assert.equal(voiceEnabledFromEnv({ VC_VOICE_ENABLE: "true" } as Record<string, string>), false);
});
