/** A10 enablement: the offline synthetic-clip generator's pure steps (WAV parse, resample, trim/pad, voice plan). No TTS, no network. */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  LEAD_SILENCE_MS,
  TRAIL_SILENCE_MS,
  buildManifest,
  parseWav,
  planJobs,
  resampleTo16k,
  shapeClip,
} from "../scripts/gen-live-audio.js";
import { measureSpeechEndMs } from "./live-audio.js";
import phrasesFile from "./fixtures/live-crisis.phrases.json" with { type: "json" };

const PHRASES = phrasesFile.phrases;

function wav(samples: Int16Array, sampleRate: number, over: { channels?: number; bits?: number; format?: number; extraChunk?: boolean } = {}): Uint8Array {
  const channels = over.channels ?? 1;
  const bits = over.bits ?? 16;
  const extra = over.extraChunk ? Buffer.concat([Buffer.from("LIST"), Buffer.from(new Uint32Array([4]).buffer), Buffer.from("abcd")]) : Buffer.alloc(0);
  const data = Buffer.from(samples.buffer, samples.byteOffset, samples.byteLength);
  const fmt = Buffer.alloc(24);
  fmt.write("fmt ", 0);
  fmt.writeUInt32LE(16, 4);
  fmt.writeUInt16LE(over.format ?? 1, 8);
  fmt.writeUInt16LE(channels, 10);
  fmt.writeUInt32LE(sampleRate, 12);
  fmt.writeUInt32LE((sampleRate * channels * bits) / 8, 16);
  fmt.writeUInt16LE((channels * bits) / 8, 20);
  fmt.writeUInt16LE(bits, 22);
  const dhead = Buffer.concat([Buffer.from("data"), Buffer.from(new Uint32Array([data.byteLength]).buffer)]);
  const body = Buffer.concat([Buffer.from("WAVE"), fmt, extra, dhead, data]);
  return new Uint8Array(Buffer.concat([Buffer.from("RIFF"), Buffer.from(new Uint32Array([body.byteLength]).buffer), body]));
}

function sine(freq: number, seconds: number, rate: number, amp = 10000): Int16Array {
  const out = new Int16Array(Math.round(seconds * rate));
  for (let i = 0; i < out.length; i++) out[i] = Math.round(amp * Math.sin((2 * Math.PI * freq * i) / rate));
  return out;
}

test("parseWav reads rate and samples, skips extra chunks, and refuses anything but PCM16 mono", () => {
  const s = sine(440, 0.1, 22050);
  const ok = parseWav(wav(s, 22050, { extraChunk: true }));
  assert.equal(ok.sampleRate, 22050);
  assert.deepEqual([...ok.samples.subarray(0, 50)], [...s.subarray(0, 50)]);
  assert.throws(() => parseWav(wav(s, 22050, { channels: 2 })), /mono/i);
  assert.throws(() => parseWav(wav(s, 22050, { format: 3 })), /PCM/i);
  assert.throws(() => parseWav(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])), /RIFF|WAV/i);
});

test("resampleTo16k keeps pitch and level (22050 and 24000 Hz sources) and is the identity at 16 kHz", () => {
  for (const rate of [22050, 24000]) {
    const out = resampleTo16k(sine(440, 1, rate), rate);
    assert.ok(Math.abs(out.length - 16000) <= 2, `${rate}: ${out.length}`);
    let crossings = 0;
    for (let i = 1; i < out.length; i++) if (out[i - 1]! < 0 && out[i]! >= 0) crossings++;
    assert.ok(Math.abs(crossings - 440) <= 2, `${rate}: ${crossings} rising crossings`);
    const peak = Math.max(...out.subarray(200, out.length - 200).map(Math.abs));
    assert.ok(peak > 9000 && peak < 11000, `${rate}: peak ${peak}`);
  }
  const same = sine(300, 0.2, 16000);
  assert.deepEqual([...resampleTo16k(same, 16000)], [...same]);
});

test("shapeClip: fixed lead and trail silence around the speech; speechEndMs is the measured last non-silent sample", () => {
  const speech = sine(300, 0.5, 16000);
  const raw = new Int16Array(16000 * 2 + speech.length);
  raw.set(speech, 16000); // 1 s of leading silence, 0.5 s of speech, 1 s of trailing silence
  const clip = shapeClip(raw);
  assert.equal(clip.pcm.byteLength % 2, 0);
  const lead = LEAD_SILENCE_MS * 16;
  const speechMs = 500;
  assert.ok(Math.abs(clip.speechEndMs - (LEAD_SILENCE_MS + speechMs)) <= 2, `speechEndMs ${clip.speechEndMs}`);
  assert.equal(clip.speechEndMs, measureSpeechEndMs(clip.pcm), "the declared end of speech is what the loader will measure");
  assert.equal(clip.durationMs, clip.pcm.byteLength / 32);
  assert.ok(Math.abs(clip.durationMs - (clip.speechEndMs + TRAIL_SILENCE_MS)) <= 1, `duration ${clip.durationMs}`);
  const view = new DataView(clip.pcm.buffer, clip.pcm.byteOffset, clip.pcm.byteLength);
  for (let i = 0; i < lead - 2; i += 97) assert.equal(view.getInt16(i * 2, true), 0, "the lead is digital silence");
  assert.throws(() => shapeClip(new Int16Array(16000)), /silent|no speech/i);
});

test("planJobs: 20 phrases, a voice for each, Hinglish spoken from a Devanagari rendering, Hindi female forms get the female voice", () => {
  const all = ["Microsoft David", "Microsoft Zira", "Microsoft Mark", "Microsoft Hemant", "Microsoft Kalpana"];
  const { jobs, gaps } = planJobs(PHRASES, all);
  assert.equal(jobs.length, 20);
  assert.deepEqual(gaps, []);
  assert.equal(new Set(jobs.map((j) => j.id)).size, 20);
  for (const j of jobs) {
    const phrase = PHRASES.find((p) => p.id === j.id)!;
    if (phrase.lang === "en") assert.match(j.voice, /David|Zira|Mark/);
    else assert.match(j.voice, /Hemant|Kalpana/);
    if (phrase.lang === "hinglish") assert.match(j.text, /[ऀ-ॿ]/, `${j.id} is spoken from Devanagari`);
    if (phrase.lang === "hi") assert.equal(j.text, phrase.text);
  }
  assert.equal(jobs.find((j) => j.id === "crisis-16")!.voice, "Microsoft Kalpana");
  assert.equal(jobs.find((j) => j.id === "crisis-20")!.voice, "Microsoft Kalpana");
});

test("planJobs: a language with no installed voice is a recorded GAP, never a substitute voice", () => {
  const onlyEnglish = ["Microsoft David", "Microsoft Zira"];
  const { jobs, gaps } = planJobs(PHRASES, onlyEnglish);
  assert.equal(jobs.length, 7);
  assert.ok(jobs.every((j) => PHRASES.find((p) => p.id === j.id)!.lang === "en"));
  assert.deepEqual(gaps.map((g) => g.lang).sort(), ["hi", "hinglish"]);
  assert.equal(gaps.find((g) => g.lang === "hi")!.ids.length, 6);
  assert.equal(gaps.find((g) => g.lang === "hinglish")!.ids.length, 7);
});

test("buildManifest: synthetic provenance, a named generator, 16 kHz, per-clip hash/duration/speechEnd, gaps recorded, no timestamp", () => {
  const pcm = shapeClip(sine(300, 0.4, 16000)).pcm;
  const clip = { id: "crisis-01", lang: "en" as const, text: "t", voice: "Microsoft David", file: "crisis-01.pcm", pcm };
  const m = buildManifest([clip], [{ lang: "hi", ids: ["crisis-15"], reason: "no hi-IN voice" }], "Windows 11 test");
  assert.equal(m.provenance, "synthetic");
  assert.match(m.generator, /Windows\.Media\.SpeechSynthesis/);
  assert.match(m.generator, /Windows 11 test/);
  assert.equal(m.sampleRateHz, 16000);
  assert.equal(m.clips.length, 1);
  assert.match(m.clips[0]!.sha256, /^[0-9a-f]{64}$/);
  assert.equal(m.clips[0]!.speechEndMs, measureSpeechEndMs(pcm));
  assert.equal(m.clips[0]!.durationMs, pcm.byteLength / 32);
  assert.equal(m.gaps.length, 1);
  assert.equal(JSON.stringify(m).includes("generatedAt"), false);
});
