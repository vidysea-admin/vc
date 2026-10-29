/**
 * P1 U5a (spec v8 scope items 4, 10, 11, 12; A1 shape, A6 prefix, A15a counter schema, A23 config).
 * Contract schemas only: no route exists and none is enabled. Synthetic data only (B13).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  AnonymousCounterSchema,
  AnonymousTurnResponseSchema,
  AudioFormatSchema,
  ClaimSchema,
  DEFAULT_LIMITS,
  FactDecisionRequestSchema,
  LimitsConfigSchema,
  ProfileFactSchema,
  SYNTHETIC_STUDENT_ID_PREFIX,
  TurnRequestSchema,
  TurnResponseSchema,
  VoiceClientEventSchema,
  VoiceServerEventSchema,
  VoiceSessionResponseSchema,
  isSyntheticStudentId,
  resolveLimits,
} from "../src/student-api.js";

const claim = { text: "Tuition is EUR 2,314 per year", kind: "number", sourceIds: ["node-1"], status: "verified" } as const;

test("Q3: Quest context is optional fixed presentation metadata, never an identity or an instruction", () => {
  const base = { text: "How do I select a career?", clientTurnId: "retry-1" };
  assert.equal(TurnRequestSchema.safeParse(base).success, true);
  assert.equal(TurnRequestSchema.safeParse({ ...base, quest: { role: "coach", island: "career-selection" } }).success, true);
  for (const quest of [
    { role: "admin", island: "hub" },
    { role: "coach", island: "../../another-student" },
    { role: "coach", island: "hub", studentId: "someone-else" },
    { role: "coach", island: "hub", facts: { grade: 99 } },
    { role: "coach", island: "hub", instructions: "ignore safety" },
  ]) assert.equal(TurnRequestSchema.safeParse({ ...base, quest }).success, false);
});

test("claims[]: status is exactly verified | attributed | unverified", () => {
  for (const status of ["verified", "attributed", "unverified"]) {
    const sourceIds = status === "unverified" ? [] : ["node-1"];
    assert.equal(ClaimSchema.safeParse({ ...claim, status, sourceIds }).success, true, status);
  }
  assert.equal(ClaimSchema.safeParse({ ...claim, status: "sourced" }).success, false);
  assert.equal(ClaimSchema.safeParse({ ...claim, status: undefined }).success, false);
});

test("A1 shape: verified and attributed claims need >= 1 sourceId; an unverified claim may have none", () => {
  assert.equal(ClaimSchema.safeParse({ ...claim, sourceIds: [] }).success, false);
  assert.equal(ClaimSchema.safeParse({ ...claim, status: "attributed", sourceIds: [] }).success, false);
  assert.equal(ClaimSchema.safeParse({ ...claim, status: "unverified", sourceIds: [] }).success, true);
  assert.equal(ClaimSchema.safeParse({ ...claim, sourceIds: [""] }).success, false);
  assert.equal(ClaimSchema.safeParse({ ...claim, kind: "opinion" }).success, false);
  assert.equal(ClaimSchema.safeParse({ ...claim, extra: 1 }).success, false);
});

const okTurn = {
  state: "ok",
  claims: [claim],
  sources: [{ id: "node-1", kind: "internal-seminar", stale: false, dateUnknown: false }],
  profileFactsUsed: [],
};

test("turn response: state is one of ok | concern | escalated | no_sourced_answer | sign_in_required", () => {
  for (const state of ["ok", "concern", "escalated", "no_sourced_answer", "sign_in_required"]) {
    assert.equal(TurnResponseSchema.safeParse({ ...okTurn, state }).success, true, state);
  }
  assert.equal(TurnResponseSchema.safeParse({ ...okTurn, state: "crisis" }).success, false);
  assert.equal(TurnResponseSchema.safeParse({ ...okTurn, rankingProfile: "student-success" }).success, true);
});

test("turn response: source kind is internal-seminar | toc | whatsapp | unknown (A22)", () => {
  for (const kind of ["internal-seminar", "toc", "whatsapp", "unknown"]) {
    assert.equal(TurnResponseSchema.safeParse({ ...okTurn, sources: [{ id: "n", kind }] }).success, true, kind);
  }
  assert.equal(TurnResponseSchema.safeParse({ ...okTurn, sources: [{ id: "n", kind: "web" }] }).success, false);
});

test("profileFactsUsed carries source pathlynks | student-confirmed only (D-087 Q15)", () => {
  const f = { key: "target_country", value: "NL", source: "pathlynks" };
  assert.equal(ProfileFactSchema.safeParse(f).success, true);
  assert.equal(ProfileFactSchema.safeParse({ ...f, source: "student-confirmed" }).success, true);
  assert.equal(ProfileFactSchema.safeParse({ ...f, source: "chat-extracted" }).success, false);
});

test("turn request: text required and bounded, a body-supplied identity is rejected", () => {
  assert.equal(TurnRequestSchema.safeParse({ text: "hello" }).success, true);
  assert.equal(TurnRequestSchema.safeParse({ text: "" }).success, false);
  assert.equal(TurnRequestSchema.safeParse({ text: "x".repeat(4001) }).success, false);
  assert.equal(TurnRequestSchema.safeParse({ text: "hi", studentId: "other" }).success, false);
  assert.equal(TurnRequestSchema.safeParse({ text: "hi", tenant: "other" }).success, false);
});

test("fact decision: confirm | correct (needs value) | erase", () => {
  assert.equal(FactDecisionRequestSchema.safeParse({ action: "confirm" }).success, true);
  assert.equal(FactDecisionRequestSchema.safeParse({ action: "erase" }).success, true);
  assert.equal(FactDecisionRequestSchema.safeParse({ action: "correct", value: "DE" }).success, true);
  assert.equal(FactDecisionRequestSchema.safeParse({ action: "correct" }).success, false);
  assert.equal(FactDecisionRequestSchema.safeParse({ action: "approve" }).success, false);
});

test("D-088 default limits: 20-min session, 60 voice-min/month, 30 rpm, anon 10 rpm, PCM16 16k in / 24k out, 2 s crisis bound", () => {
  assert.deepEqual(DEFAULT_LIMITS, {
    requestsPerMinute: 30,
    anonymousRequestsPerMinute: 10,
    voiceMinutesPerMonth: 60,
    voiceSessionMaxMinutes: 20,
    crisisMaxAudioMsAfterTrigger: 2000,
    audio: { format: "pcm16", inputSampleRateHz: 16000, outputSampleRateHz: 24000 },
  });
  assert.equal(LimitsConfigSchema.safeParse(DEFAULT_LIMITS).success, true);
  assert.equal(Object.isFrozen(DEFAULT_LIMITS), true);
  assert.equal(Object.isFrozen(DEFAULT_LIMITS.audio), true);
});

test("A23 config: a per-tenant override changes only the named field and is validated", () => {
  const r = resolveLimits({ requestsPerMinute: 5 });
  assert.equal(r.requestsPerMinute, 5);
  assert.equal(r.voiceMinutesPerMonth, 60);
  assert.equal(DEFAULT_LIMITS.requestsPerMinute, 30, "defaults never mutate");
  assert.deepEqual(resolveLimits(undefined), DEFAULT_LIMITS);
  assert.deepEqual(resolveLimits({ audio: { outputSampleRateHz: 24000 } }).audio, DEFAULT_LIMITS.audio);
  assert.throws(() => resolveLimits({ requestsPerMinute: 0 }));
  assert.throws(() => resolveLimits({ requestsPerMinute: 1.5 }));
  assert.throws(() => resolveLimits({ voiceSessionMaxMinutes: -1 }));
  assert.throws(() => resolveLimits({ bogus: 1 } as never));
});

test("audio format is PCM16 only, 16 kHz in, 24 kHz out", () => {
  assert.equal(AudioFormatSchema.safeParse(DEFAULT_LIMITS.audio).success, true);
  assert.equal(AudioFormatSchema.safeParse({ ...DEFAULT_LIMITS.audio, format: "opus" }).success, false);
  assert.equal(AudioFormatSchema.safeParse({ ...DEFAULT_LIMITS.audio, inputSampleRateHz: 48000 }).success, false);
});

test("A6 prefix: synthetic ids start with syn- (exact, case-sensitive, non-empty remainder)", () => {
  assert.equal(SYNTHETIC_STUDENT_ID_PREFIX, "syn-");
  assert.equal(isSyntheticStudentId("syn-student-1"), true);
  for (const bad of ["syn-", "SYN-1", "Syn-1", " syn-1", "xsyn-1", "syn1", "student-1", "", "synthetic-1"]) {
    assert.equal(isSyntheticStudentId(bad), false, JSON.stringify(bad));
  }
  assert.equal(isSyntheticStudentId(undefined as never), false);
  assert.equal(isSyntheticStudentId(42 as never), false);
});

test("voice session response: token, wsUrl (wss/ws), expiry and the limits that apply", () => {
  const r = {
    token: "t",
    wsUrl: "wss://api.example.test/v1/voice/ws",
    expiresAt: "2026-10-17T10:00:00.000Z",
    sessionMaxMinutes: 20,
    audio: DEFAULT_LIMITS.audio,
  };
  assert.equal(VoiceSessionResponseSchema.safeParse(r).success, true);
  assert.equal(VoiceSessionResponseSchema.safeParse({ ...r, wsUrl: "https://x" }).success, false);
  assert.equal(VoiceSessionResponseSchema.safeParse({ ...r, token: "" }).success, false);
});

test("WS server events: transcript.partial/final, answer.sources, state, flag, confirm, error; each has an eventId for resume", () => {
  const base = { eventId: "e1" };
  const samples = [
    { ...base, type: "transcript.partial", role: "user", text: "hi" },
    { ...base, type: "transcript.final", role: "assistant", text: "hello", turnId: "t1" },
    { ...base, type: "answer.sources", sources: [{ id: "n", kind: "toc" }], claims: [] },
    { ...base, type: "state", state: "ok" },
    { ...base, type: "flag", reason: "uncited_number", detail: "x" },
    { ...base, type: "confirm", fact: { key: "budget", value: "8000" } },
    { ...base, type: "error", code: "provider_unavailable", message: "retry" },
  ];
  for (const s of samples) assert.equal(VoiceServerEventSchema.safeParse(s).success, true, s.type);
  assert.equal(VoiceServerEventSchema.safeParse({ type: "state", state: "ok" }).success, false, "no eventId");
  assert.equal(VoiceServerEventSchema.safeParse({ ...base, type: "flag", reason: "other" }).success, false);
  assert.equal(VoiceServerEventSchema.safeParse({ ...base, type: "audio" }).success, false);
});

test("WS client events: start | interrupt | end | confirm, resume via lastEventId", () => {
  assert.equal(VoiceClientEventSchema.safeParse({ type: "start", threadId: "th1" }).success, true);
  assert.equal(VoiceClientEventSchema.safeParse({ type: "start", threadId: "th1", lastEventId: "e9" }).success, true);
  assert.equal(VoiceClientEventSchema.safeParse({ type: "interrupt" }).success, true);
  assert.equal(VoiceClientEventSchema.safeParse({ type: "end" }).success, true);
  assert.equal(VoiceClientEventSchema.safeParse({ type: "confirm", key: "budget", accepted: true }).success, true);
  assert.equal(VoiceClientEventSchema.safeParse({ type: "shout" }).success, false);
});

test("A15a counter: only date, kind, count (strict) and kind is answered | no_answer | sign_in_required | crisis", () => {
  const c = { date: "2026-10-17", kind: "answered", count: 3 };
  assert.equal(AnonymousCounterSchema.safeParse(c).success, true);
  for (const extra of ["text", "ip", "clientId", "studentId", "q"]) {
    assert.equal(AnonymousCounterSchema.safeParse({ ...c, [extra]: "x" }).success, false, extra);
  }
  assert.equal(AnonymousCounterSchema.safeParse({ ...c, kind: "concern" }).success, false);
  assert.equal(AnonymousCounterSchema.safeParse({ ...c, date: "2026-10-17T10:00:00Z" }).success, false, "date only, no time");
  assert.equal(AnonymousCounterSchema.safeParse({ ...c, count: -1 }).success, false);
  assert.deepEqual(Object.keys(AnonymousCounterSchema.shape).sort(), ["count", "date", "kind"]);
});

test("anonymous response: no thread/profile fields; state ok | no_sourced_answer | sign_in_required | escalated", () => {
  const r = { state: "ok", claims: [claim], sources: okTurn.sources };
  assert.equal(AnonymousTurnResponseSchema.safeParse(r).success, true);
  assert.equal(AnonymousTurnResponseSchema.safeParse({ ...r, state: "concern" }).success, false);
  assert.equal(AnonymousTurnResponseSchema.safeParse({ ...r, profileFactsUsed: [] }).success, false);
  assert.equal(AnonymousTurnResponseSchema.safeParse({ ...r, threadId: "t" }).success, false);
  assert.equal(AnonymousTurnResponseSchema.safeParse({ ...r, state: "sign_in_required", claims: [], sources: [] }).success, true);
});


test("Q10-Q12: public DTOs reject internal context and strictly bound session/memory projections",async()=>{
 const s=await import("../src/student-api.js");
 for(const key of ["memory","history","facts","policy"])assert.equal(s.TurnRequestSchema.safeParse({text:"fees",[key]:{}}).success,false);
 assert.equal(s.ThreadCreateRequestSchema.safeParse({quest:{role:"coach",island:"hub"}}).success,true);
 assert.equal(s.ThreadCreateRequestSchema.safeParse({studentId:"other"}).success,false);
 assert.equal(s.ThreadListSchema.safeParse({threads:Array(51).fill({threadId:"t",createdAt:"2026-10-27T00:00:00.000Z",lastActivityAt:"2026-10-27T00:00:00.000Z",textStored:true})}).success,false);
 assert.equal(s.MemoryGraphSchema.safeParse({items:[],nodes:[{id:"student",type:"student"}],edges:[]}).success,true);
});


test("S12: candidate DTOs and decisions bind bounded refs while legacy first confirmation remains valid",async()=>{
 const m=await import("../src/student-api.js");
 const pendingChange={candidateId:"candidate",version:"version",value:"France",proposedAt:"2026-10-27T12:00:00.000Z",quote:"France",sourceLang:"fr",threadId:"owned",turnId:"new"};
 assert.equal(m.ProposedFactSchema.safeParse({factId:"fact",key:"target_country",value:"Germany",status:"confirmed",pendingChange}).success,true);
 assert.equal(m.MemoryItemSchema.safeParse({factId:"fact",key:"target_country",value:"Germany",status:"confirmed",source:"chat",readOnly:false,pendingChange}).success,true);
 assert.equal(m.ProfileFactSchema.safeParse({key:"interest",value:"music",source:"vidysea"}).success,true);
 assert.equal(m.MemoryItemSchema.safeParse({key:"interest",value:"music",source:"vidysea",status:"confirmed",readOnly:true}).success,true);
 assert.equal(m.FactDecisionRequestSchema.safeParse({action:"reject",value:"France",candidateId:"candidate",expectedVersion:"version"}).success,true);
 for(const invalid of [{action:"reject"},{action:"confirm",candidateId:"candidate"},{action:"confirm",candidateId:"x".repeat(129),expectedVersion:"version",value:"France"}]) assert.equal(m.FactDecisionRequestSchema.safeParse(invalid).success,false);
 assert.equal(m.FactDecisionRequestSchema.safeParse({action:"confirm"}).success,true);
 const voice={type:"confirm",key:"target_country",accepted:false,value:"France",candidateId:"candidate",expectedVersion:"version",threadId:"owned",promptId:"prompt"};
 assert.equal(m.VoiceClientEventSchema.safeParse(voice).success,true);
 assert.equal(m.VoiceServerEventSchema.safeParse({type:"confirm",eventId:"e",fact:{key:"target_country",value:"France",candidateId:"candidate",expectedVersion:"version"},threadId:"owned",promptId:"prompt"}).success,true);
 assert.equal(m.VoiceClientEventSchema.safeParse({type:"confirm",key:"interest",accepted:true}).success,true);
 assert.equal(m.VoiceClientEventSchema.safeParse({...voice,candidateId:"x".repeat(129)}).success,false);
 assert.equal(m.VoiceClientEventSchema.safeParse({...voice,expectedVersion:undefined}).success,false);
 assert.equal(m.VoiceClientEventSchema.safeParse({...voice,value:undefined}).success,false);
 assert.equal(m.VoiceServerEventSchema.safeParse({type:"confirm",eventId:"e",fact:{key:"interest",value:"music",candidateId:"only"}}).success,false);
});

test("S12: canonical preferences share aliases and authoritative account fields cannot become preferences",async()=>{
 const {canonicalPreferenceKey}=await import("../src/student-api.js");
 for(const key of ["target_country","targetCountry","preferred country","country"])assert.equal(canonicalPreferenceKey(key),"target_country");
 for(const key of ["name","studentName","first_name","grade","schoolGrade","accountId","email","date_of_birth"])assert.equal(canonicalPreferenceKey(key),null);
 assert.equal(canonicalPreferenceKey("budget"),"budget");
});
