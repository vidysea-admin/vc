/**
 * P1 U5a, criterion A20: the go-live gate refuses to enable any student route (authenticated chat, the public
 * anonymous route, voice, partner publication) unless qa/gates holds the records U0 defined: B13-signed, answered
 * g-publish and g-prod, a Nights mode (voice also a passing A10 record). Outcome tests: real directories of gate
 * files are read; today's U0 files (reproduced below) and the real repo qa/gates must refuse. Synthetic data only (B13).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { GATE_FILES, GO_LIVE_TARGETS, GoLiveRefusedError, assertGoLive, evaluateGoLive, formatGoLiveReport, type GoLiveTarget } from "../src/go-live-gate.js";
import { assertVoiceGoLive } from "../src/voice.js";

const REPO_GATES = fileURLToPath(new URL("../../../qa/gates", import.meta.url));
const CLI = fileURLToPath(new URL("../scripts/go-live-gate.ts", import.meta.url));
const NOW = new Date("2026-11-01T00:00:00.000Z");
const APPROVER = "Umesh";
const EVIDENCE = "qa/evidence/a10-voice-20261016/report.md";

type Key = keyof typeof GATE_FILES;

const GOOD: Record<Key, string> = {
  b13: "# amendments\n## A.\n`B13-signed: SIGNED 2026-10-16T10:00:00+05:30 by Umesh`\n",
  gPublish: "# G-PUBLISH\n**Status:** ANSWERED\n\nAnswered: 2026-10-16T10:05:00+05:30 - a - publish text, voice disabled\n",
  gProd: "# G-PROD\n**Status:** ANSWERED\n\nAnswered: 2026-10-16T10:10:00+05:30 - c - all three including voice\n",
  nights: "# Nights\nNights-mode: tele-manas-disclosed\nMode-status: INTERIM\nHuman-alert-route: NOT ENABLED\n",
  a10: `# A10\nResult: PASS\nRun-at: 2026-10-16T11:00:00+05:30\nEvidence: ${EVIDENCE}\n`,
};

/** Today's U0 files (p1/u0 c3d52f5), reduced to the lines that matter plus the prose mentions that must NOT count. */
const TODAY: Record<Exclude<Key, "a10">, string> = {
  b13: "# HUMAN_GATE\nthe go-live script reads the `B13-signed:` line\n\n## A.\n`B13-signed: PENDING`\n\nfor item A the checker then flips `B13-signed:` to `SIGNED <ISO> by Umesh`.\n",
  gPublish: "# G-PUBLISH\n**Status:** OPEN\n**Answer format:** chat reply. The maker appends `Answered: <ISO> - <option>` here.\n",
  gProd: "# G-PROD\n**Status:** OPEN\n**Answer format:** chat reply. The maker appends `Answered: <ISO> - <option> - <decisions above>` here.\n",
  nights: "# Nights\nNights-mode: tele-manas-disclosed\nMode-status: INTERIM (applies until the CEO answers)\nHuman-alert-route: NOT ENABLED\n",
};

interface Fixture {
  root: string;
  gates: string;
}
function fixture(files: Partial<Record<Key, string | null>> = {}, defaults: Record<string, string> = GOOD, evidence = true): Fixture {
  const root = mkdtempSync(join(tmpdir(), "vc-golive-"));
  const gates = join(root, "qa", "gates");
  mkdirSync(gates, { recursive: true });
  for (const k of Object.keys(GATE_FILES) as Key[]) {
    const body = k in files ? files[k] : defaults[k];
    if (body !== null && body !== undefined) writeFileSync(join(gates, GATE_FILES[k]), body);
  }
  if (evidence) {
    mkdirSync(dirname(join(root, EVIDENCE)), { recursive: true });
    writeFileSync(join(root, EVIDENCE), "report");
  }
  return { root, gates };
}
const cleanup = (f: Fixture) => rmSync(f.root, { recursive: true, force: true });
const only = (r: { failures: string[] }) => r.failures.map((f) => f.split(":")[0]);

// The real gate files change as Umesh answers gates, so this test pins only the one invariant the
// agent never moves: while the real B13-signed line is PENDING (D-103, owned by the legal team),
// every target is refused and B13 is named. Once B13 is signed the real state is the human's call.
const REAL_B13_PENDING = /^`?B13-signed:\s*PENDING`?\s*$/m.test(readFileSync(join(REPO_GATES, GATE_FILES.b13), "utf8"));

test("A20: the real repo qa/gates refuses every target while B13 is not signed", { skip: !REAL_B13_PENDING }, () => {
  for (const target of GO_LIVE_TARGETS) {
    const r = evaluateGoLive(REPO_GATES, target, NOW, APPROVER);
    assert.equal(r.allowed, false, target);
    assert.ok(r.failures.some((f) => f.includes("B13-signed")), `${target}: ${r.failures.join(" | ")}`);
    assert.throws(() => assertGoLive(REPO_GATES, target, NOW, APPROVER), GoLiveRefusedError);
  }
});

test("A20: today's U0 gate files (B13-signed: PENDING, gates open, interim Nights mode) are refused, with Nights the only satisfied record", () => {
  const f = fixture({}, TODAY);
  try {
    for (const target of GO_LIVE_TARGETS) {
      const r = evaluateGoLive(f.gates, target, NOW, APPROVER);
      assert.equal(r.allowed, false, target);
      assert.ok(only(r).includes(GATE_FILES.b13), target);
      assert.ok(only(r).includes(GATE_FILES.gPublish), target);
      assert.deepEqual(r.satisfied, [GATE_FILES.nights], target);
    }
    assert.ok(only(evaluateGoLive(f.gates, "student-routes", NOW, APPROVER)).includes(GATE_FILES.gProd));
  } finally {
    cleanup(f);
  }
});

test("A20: with every record (g-prod option c, A10 pass) every target is allowed", () => {
  const f = fixture();
  try {
    for (const target of GO_LIVE_TARGETS) {
      const r = evaluateGoLive(f.gates, target, NOW, APPROVER);
      assert.deepEqual(r.failures, [], target);
      assert.equal(r.allowed, true, target);
      assert.doesNotThrow(() => assertGoLive(f.gates, target, NOW, APPROVER));
    }
  } finally {
    cleanup(f);
  }
});

test("A20: B13, g-publish and Nights are each required by every target; g-prod by the three student targets, not by publish", () => {
  const cases: Array<[Key, GoLiveTarget[]]> = [
    ["b13", [...GO_LIVE_TARGETS]],
    ["gPublish", [...GO_LIVE_TARGETS]],
    ["nights", [...GO_LIVE_TARGETS]],
    ["gProd", ["student-routes", "anonymous", "voice"]],
  ];
  for (const [key, targets] of cases) {
    const f = fixture({ [key]: null });
    try {
      for (const target of GO_LIVE_TARGETS) {
        const r = evaluateGoLive(f.gates, target, NOW, APPROVER);
        const expectRefused = targets.includes(target);
        assert.equal(r.allowed, !expectRefused, `${key} missing, ${target}`);
        if (expectRefused) assert.deepEqual(only(r), [GATE_FILES[key]], `${key} missing, ${target}`);
      }
    } finally {
      cleanup(f);
    }
  }
});

test("A20: g-prod option scopes what may go live (a: auth text, b: + anonymous, c: + voice, d: hold)", () => {
  const prod = (opt: string) => `Answered: 2026-10-16T10:10:00+05:30 - ${opt} - scope\n`;
  const expect: Record<string, Record<GoLiveTarget, boolean>> = {
    a: { "student-routes": true, anonymous: false, voice: false, publish: true },
    b: { "student-routes": true, anonymous: true, voice: false, publish: true },
    c: { "student-routes": true, anonymous: true, voice: true, publish: true },
    d: { "student-routes": false, anonymous: false, voice: false, publish: true },
  };
  for (const [opt, targets] of Object.entries(expect)) {
    const f = fixture({ gProd: prod(opt) });
    try {
      for (const target of GO_LIVE_TARGETS) assert.equal(evaluateGoLive(f.gates, target, NOW, APPROVER).allowed, targets[target], `${opt} ${target}`);
    } finally {
      cleanup(f);
    }
  }
});

test("A20: g-publish option c (hold) refuses; a (publish) and b (text only) allow; '(a)' and en/em dash separators parse", () => {
  const body = (sep: string, opt: string) => `Answered: 2026-10-16T10:05:00+05:30 ${sep} ${opt}\n`;
  const ok: Array<[string, string]> = [["-", "a"], ["-", "(b)"], ["—", "a - note"], ["–", "B: text only"], ["--", "a"]];
  for (const [sep, opt] of ok) {
    const f = fixture({ gPublish: body(sep, opt) });
    try {
      assert.equal(evaluateGoLive(f.gates, "publish", NOW, APPROVER).allowed, true, `${sep} ${opt}`);
    } finally {
      cleanup(f);
    }
  }
  for (const opt of ["c", "(c) hold", "hold", "x", "ab"]) {
    const f = fixture({ gPublish: body("-", opt) });
    try {
      assert.equal(evaluateGoLive(f.gates, "publish", NOW, APPROVER).allowed, false, opt);
    } finally {
      cleanup(f);
    }
  }
});

test("A20: the LAST Answered line counts (an append-only later hold withdraws an earlier go)", () => {
  const f = fixture({ gPublish: "Answered: 2026-10-16T10:05:00+05:30 - a\nAnswered: 2026-10-16T12:00:00+05:30 - c - hold again\n" });
  try {
    assert.equal(evaluateGoLive(f.gates, "publish", NOW, APPROVER).allowed, false);
  } finally {
    cleanup(f);
  }
});

test("A20: voice alone needs the passing A10 record and its evidence file; the text targets do not", () => {
  const f = fixture({ a10: null });
  try {
    for (const target of ["student-routes", "anonymous", "publish"] as GoLiveTarget[]) assert.equal(evaluateGoLive(f.gates, target, NOW, APPROVER).allowed, true, target);
    assert.deepEqual(only(evaluateGoLive(f.gates, "voice", NOW, APPROVER)), [GATE_FILES.a10]);
  } finally {
    cleanup(f);
  }
  const bad = [
    GOOD.a10.replace("PASS", "FAIL"),
    GOOD.a10.replace(/Evidence:.*\n/, ""),
    GOOD.a10.replace(EVIDENCE, "docs/elsewhere.md"),
    GOOD.a10.replace(EVIDENCE, "qa/evidence/../../secret.md"),
    GOOD.a10.replace("2026-10-16T11:00:00+05:30", "2030-01-01T00:00:00Z"),
  ];
  for (const body of bad) {
    const d = fixture({ a10: body });
    try {
      assert.equal(evaluateGoLive(d.gates, "voice", NOW, APPROVER).allowed, false, body);
    } finally {
      cleanup(d);
    }
  }
  const noEvidence = fixture({}, GOOD, false);
  try {
    assert.match(evaluateGoLive(noEvidence.gates, "voice", NOW, APPROVER).failures.join(), /does not exist/);
  } finally {
    cleanup(noEvidence);
  }
});

test("A20 hostile: placeholders, wrong signer, bad or future dates, wrong mode, duplicates and fenced or quoted text do not count", () => {
  const sig = (v: string) => `B13-signed: ${v}\n`;
  const hostile: Array<[string, Key, string]> = [
    ["b13 pending", "b13", sig("PENDING")],
    ["b13 empty", "b13", ""],
    ["b13 wrong signer", "b13", sig("SIGNED 2026-10-16T10:00:00+05:30 by the maker")],
    ["b13 signer case", "b13", sig("SIGNED 2026-10-16T10:00:00+05:30 by umesh")],
    ["b13 no date", "b13", sig("SIGNED by Umesh")],
    ["b13 date only", "b13", sig("SIGNED 2026-10-16 by Umesh")],
    ["b13 future", "b13", sig("SIGNED 2027-01-01T00:00:00Z by Umesh")],
    ["b13 trailing text", "b13", sig("SIGNED 2026-10-16T10:00:00+05:30 by Umesh and more")],
    ["b13 duplicate", "b13", sig("PENDING") + sig("SIGNED 2026-10-16T10:00:00+05:30 by Umesh")],
    ["b13 fenced", "b13", "```\n" + sig("SIGNED 2026-10-16T10:00:00+05:30 by Umesh") + "```\n"],
    ["b13 quoted", "b13", "> " + sig("SIGNED 2026-10-16T10:00:00+05:30 by Umesh")],
    ["b13 indented", "b13", "  " + sig("SIGNED 2026-10-16T10:00:00+05:30 by Umesh")],
    ["b13 prose mention", "b13", "the checker flips `B13-signed:` to `SIGNED 2026-10-16T10:00:00+05:30 by Umesh` later\n"],
    ["answer unanswered template", "gPublish", "The maker appends `Answered: <ISO> - <option>` here.\n"],
    ["answer no date", "gPublish", "Answered: yesterday - a\n"],
    ["answer future", "gPublish", "Answered: 2030-01-01T00:00:00Z - a\n"],
    ["answer fenced", "gPublish", "```\nAnswered: 2026-10-16T10:05:00+05:30 - a\n```\n"],
    ["answer indented", "gPublish", "  Answered: 2026-10-16T10:05:00+05:30 - a\n"],
    ["nights unknown mode", "nights", "Nights-mode: whatever\n"],
    ["nights undecided", "nights", "Nights-mode: undecided\n"],
    ["nights duplicate", "nights", "Nights-mode: funded\nNights-mode: tele-manas-disclosed\n"],
    ["nights fenced", "nights", "```\nNights-mode: funded\n```\n"],
    ["oversized", "gProd", GOOD.gProd + "x".repeat(70_000)],
  ];
  for (const [name, key, body] of hostile) {
    const f = fixture({ [key]: body });
    try {
      const r = evaluateGoLive(f.gates, "student-routes", NOW, APPROVER);
      assert.equal(r.allowed, false, name);
      assert.deepEqual(only(r), [GATE_FILES[key]], name);
    } finally {
      cleanup(f);
    }
  }
});

test("A20: both Nights modes are accepted, and a backtick-wrapped B13 line is read", () => {
  for (const mode of ["funded", "tele-manas-disclosed"]) {
    const f = fixture({ nights: `Nights-mode: ${mode}\n` });
    try {
      assert.equal(evaluateGoLive(f.gates, "student-routes", NOW, APPROVER).allowed, true, mode);
    } finally {
      cleanup(f);
    }
  }
  const f = fixture({ b13: "B13-signed: SIGNED 2026-10-16T10:00:00+05:30 by Umesh\n" });
  try {
    assert.equal(evaluateGoLive(f.gates, "student-routes", NOW, APPROVER).allowed, true);
  } finally {
    cleanup(f);
  }
});

test("A20: the B13 signer must be a personal name (never a role) and, when an approver is configured, exactly that name", () => {
  const signed = (who: string) => `B13-signed: SIGNED 2026-10-16T10:00:00+05:30 by ${who}\n`;
  const ev = (who: string, approver?: string) => {
    const f = fixture({ b13: signed(who) });
    try {
      return evaluateGoLive(f.gates, "student-routes", NOW, approver).allowed;
    } finally {
      cleanup(f);
    }
  };
  assert.equal(ev("Umesh"), true);
  assert.equal(ev("Sapna Rao"), true, "no approver configured: any personal name");
  for (const role of ["Maker", "Checker", "Claude", "Agent", "The maker", "Bot", "PENDING", "Unknown", "umesh", "", "3rd"]) {
    assert.equal(ev(role), false, `role or malformed signer: ${JSON.stringify(role)}`);
  }
  assert.equal(ev("Umesh", "Umesh"), true);
  assert.equal(ev("Sapna", "Umesh"), false, "configured approver must match exactly");
  assert.equal(ev("Umesh Kumar", "Umesh"), false);
  process.env.VC_GATE_APPROVER = "Umesh";
  try {
    const f = fixture({ b13: signed("Sapna") });
    try {
      assert.equal(evaluateGoLive(f.gates, "student-routes", NOW).allowed, false, "VC_GATE_APPROVER is honoured by default");
    } finally {
      cleanup(f);
    }
  } finally {
    delete process.env.VC_GATE_APPROVER;
  }
});

test("A20: a gate path that is a directory, or a missing gates dir, refuses instead of throwing", () => {
  const f = fixture({ b13: null });
  mkdirSync(join(f.gates, GATE_FILES.b13));
  try {
    assert.equal(evaluateGoLive(f.gates, "student-routes", NOW, APPROVER).allowed, false);
  } finally {
    cleanup(f);
  }
  assert.equal(evaluateGoLive(join(tmpdir(), "vc-golive-does-not-exist", "qa", "gates"), "voice", NOW, APPROVER).allowed, false);
});

// ---------------------------------------------------------------------------
// pc-voice V1 (D-111): an owner override in place of `Result: PASS`
// ---------------------------------------------------------------------------

const A10_FAIL_RECORD = `# A10 voice gate record\nResult: FAIL\nRun-at: 2026-10-21T12:39:32+05:30\nEvidence: ${EVIDENCE}\nNote: 10/20 crisis phrases reached the fixed message within 2 s.\n`;
const OVERRIDE_LINE = "Owner-override: 2026-10-22T08:00:00+05:30 — Umesh — D-111";
const OVERRIDE_TEXT = "A10 OVERRIDDEN by owner (D-111)";

test("V1: a FAIL record plus the owner-override line allows voice, and the gate output says A10 was overridden", () => {
  const f = fixture({ a10: `${A10_FAIL_RECORD}${OVERRIDE_LINE}\n` });
  try {
    const r = evaluateGoLive(f.gates, "voice", NOW, APPROVER);
    assert.deepEqual(r.failures, []);
    assert.equal(r.allowed, true);
    assert.doesNotThrow(() => assertGoLive(f.gates, "voice", NOW, APPROVER));
    assert.ok(r.satisfied.includes(GATE_FILES.a10));
    assert.ok(formatGoLiveReport(r).includes(OVERRIDE_TEXT), formatGoLiveReport(r));
    // The CLI prints the same words and exits 0.
    const cli = spawnSync(process.execPath, ["--import", "tsx", CLI, "voice", "--gates-dir", f.gates], { encoding: "utf8", env: { ...process.env, VC_GATE_APPROVER: APPROVER } });
    assert.equal(cli.status, 0, cli.stdout + cli.stderr);
    assert.ok(cli.stdout.includes(OVERRIDE_TEXT), cli.stdout);
  } finally {
    cleanup(f);
  }
});

test("V1: the override works even with no evidence file, and a PASS record is not reported as overridden", () => {
  const f = fixture({ a10: `# A10\nResult: FAIL\n${OVERRIDE_LINE}\n` }, GOOD, false);
  try {
    assert.equal(evaluateGoLive(f.gates, "voice", NOW, APPROVER).allowed, true);
  } finally {
    cleanup(f);
  }
  const pass = fixture({ a10: `${GOOD.a10}${OVERRIDE_LINE}\n` });
  try {
    const r = evaluateGoLive(pass.gates, "voice", NOW, APPROVER);
    assert.equal(r.allowed, true);
    assert.ok(!formatGoLiveReport(r).includes("OVERRIDDEN"), "a genuine PASS is reported as a pass");
  } finally {
    cleanup(pass);
  }
});

test("V1: without the override line the gate behaves as before (FAIL refuses, PASS allows), and the override reaches only the voice target's A10 record", () => {
  const f = fixture({ a10: A10_FAIL_RECORD });
  try {
    const r = evaluateGoLive(f.gates, "voice", NOW, APPROVER);
    assert.equal(r.allowed, false);
    assert.deepEqual(only(r), [GATE_FILES.a10]);
    assert.ok(!formatGoLiveReport(r).includes("OVERRIDDEN"));
  } finally {
    cleanup(f);
  }
  // The override is not a way round B13, g-prod option c or Nights.
  for (const key of ["b13", "gProd", "nights"] as const) {
    const d = fixture({ a10: `${A10_FAIL_RECORD}${OVERRIDE_LINE}\n`, [key]: null });
    try {
      const r = evaluateGoLive(d.gates, "voice", NOW, APPROVER);
      assert.equal(r.allowed, false, key);
      assert.deepEqual(only(r), [GATE_FILES[key]], key);
    } finally {
      cleanup(d);
    }
  }
});

test("V1 hostile: a placeholder, wrong signer, wrong decision id, bad or future date, a quoted, fenced or repeated line does not count", () => {
  const hostile: Array<[string, string]> = [
    ["placeholder", "Owner-override: <iso> — Umesh — D-111"],
    ["role signer", "Owner-override: 2026-10-22T08:00:00+05:30 — the maker — D-111"],
    ["lower-case signer", "Owner-override: 2026-10-22T08:00:00+05:30 — umesh — D-111"],
    ["other person than the approver", "Owner-override: 2026-10-22T08:00:00+05:30 — Anita — D-111"],
    ["wrong decision", "Owner-override: 2026-10-22T08:00:00+05:30 — Umesh — D-110"],
    ["no decision", "Owner-override: 2026-10-22T08:00:00+05:30 — Umesh"],
    ["decision with a tail", "Owner-override: 2026-10-22T08:00:00+05:30 — Umesh — D-111 and more"],
    ["date only", "Owner-override: 2026-10-22 — Umesh — D-111"],
    ["future", "Owner-override: 2031-01-01T00:00:00Z — Umesh — D-111"],
    ["quoted", `> ${OVERRIDE_LINE}`],
    ["indented", `    ${OVERRIDE_LINE}`],
    ["mid-line", `Note: see ${OVERRIDE_LINE}`],
    ["fenced", `\`\`\`\n${OVERRIDE_LINE}\n\`\`\``],
    ["repeated", `${OVERRIDE_LINE}\n${OVERRIDE_LINE}`],
    ["key spelt differently", "Owner-Override: 2026-10-22T08:00:00+05:30 — Umesh — D-111"],
  ];
  for (const [name, line] of hostile) {
    const f = fixture({ a10: `${A10_FAIL_RECORD}${line}\n` });
    try {
      const r = evaluateGoLive(f.gates, "voice", NOW, APPROVER);
      assert.equal(r.allowed, false, name);
      assert.deepEqual(only(r), [GATE_FILES.a10], name);
      assert.ok(!formatGoLiveReport(r).includes(OVERRIDE_TEXT), name);
    } finally {
      cleanup(f);
    }
  }
});

/** The signer named on the real A10 record's Owner-override line (the repo Approver the override must be run with). */
function realOverrideSigner(): string {
  const realA10 = readFileSync(join(REPO_GATES, GATE_FILES.a10), "utf8");
  const m = /^Owner-override: \S+ (?:\u2014|\u2013|--|-) (.+?) (?:\u2014|\u2013|--|-) D-111$/mu.exec(realA10);
  assert.ok(m, "the real A10 record has no Owner-override line, so the owner's record is not what this test proves");
  return m[1]!;
}

/** Run `body` with VC_GATE_APPROVER set to `value` (or removed when undefined), then restore it. */
function withApproverEnv<T>(value: string | undefined, body: () => T): T {
  const saved = process.env.VC_GATE_APPROVER;
  if (value === undefined) delete process.env.VC_GATE_APPROVER;
  else process.env.VC_GATE_APPROVER = value;
  try {
    return body();
  } finally {
    if (saved === undefined) delete process.env.VC_GATE_APPROVER;
    else process.env.VC_GATE_APPROVER = saved;
  }
}

test("V1 real gates: the repo's actual qa/gates ALLOW voice with the D-111 note while VC_GATE_APPROVER is the record's signer, and REFUSE voice with it unset", () => {
  const signer = realOverrideSigner();
  withApproverEnv(signer, () => {
    const r = evaluateGoLive(REPO_GATES, "voice", new Date());
    assert.deepEqual(r.failures, []);
    assert.equal(r.allowed, true);
    assert.ok(formatGoLiveReport(r).includes(OVERRIDE_TEXT), formatGoLiveReport(r));
  });
  withApproverEnv(undefined, () => {
    const r = evaluateGoLive(REPO_GATES, "voice", new Date());
    assert.equal(r.allowed, false, "fail closed: the real override line does not apply when no approver is configured");
    assert.ok(only(r).includes(GATE_FILES.a10));
    assert.ok(!formatGoLiveReport(r).includes(OVERRIDE_TEXT));
    assert.ok(formatGoLiveReport(r).includes("VC_GATE_APPROVER"), formatGoLiveReport(r));
  });
});

test("V1 signer (fail closed): with no approver configured the override is refused for every signer, Umesh and Mallory included; set, only the matching name is accepted", () => {
  const mallory = "Owner-override: 2026-10-22T08:00:00+05:30 — Mallory — D-111";
  const fm = fixture({ a10: `${A10_FAIL_RECORD}${mallory}\n` });
  const fu = fixture({ a10: `${A10_FAIL_RECORD}${OVERRIDE_LINE}\n` });
  const NEEDS = "Owner-override needs VC_GATE_APPROVER (the repo approver) to be set";
  try {
    withApproverEnv(undefined, () => {
      for (const [label, f] of [["Mallory", fm], ["Umesh", fu]] as const) {
        for (const r of [evaluateGoLive(f.gates, "voice", NOW, undefined), evaluateGoLive(f.gates, "voice", NOW), evaluateGoLive(f.gates, "voice", NOW, "")]) {
          assert.equal(r.allowed, false, label);
          assert.deepEqual(only(r), [GATE_FILES.a10], label);
          assert.ok(!formatGoLiveReport(r).includes(OVERRIDE_TEXT), label);
          assert.ok(r.failures.some((x) => x.includes(NEEDS)), `${label}: ${r.failures.join(" | ")}`);
        }
        assert.throws(() => assertGoLive(f.gates, "voice", NOW), GoLiveRefusedError, label);
      }
      // CLI with the env removed: both refuse (exit 1).
      const env = { ...process.env };
      delete env.VC_GATE_APPROVER;
      for (const f of [fm, fu]) {
        const cli = spawnSync(process.execPath, ["--import", "tsx", CLI, "voice", "--gates-dir", f.gates], { encoding: "utf8", env });
        assert.equal(cli.status, 1, cli.stdout + cli.stderr);
        assert.ok(!cli.stdout.includes(OVERRIDE_TEXT), cli.stdout);
      }
    });
    // Set: the configured approver decides (explicit parameter and the env default). B13 is signed by Umesh, so with an approver other than
    // Umesh B13 also refuses; only the A10 line is judged here.
    assert.ok(!only(evaluateGoLive(fm.gates, "voice", NOW, "Mallory")).includes(GATE_FILES.a10), "explicit approver Mallory accepts the Mallory line");
    assert.ok(only(evaluateGoLive(fu.gates, "voice", NOW, "Mallory")).includes(GATE_FILES.a10));
    assert.equal(evaluateGoLive(fu.gates, "voice", NOW, "Umesh").allowed, true);
    assert.equal(evaluateGoLive(fm.gates, "voice", NOW, "Umesh").allowed, false);
    withApproverEnv("Anita", () => {
      assert.ok(only(evaluateGoLive(fu.gates, "voice", NOW)).includes(GATE_FILES.a10));
      assert.ok(only(evaluateGoLive(fm.gates, "voice", NOW)).includes(GATE_FILES.a10));
    });
    withApproverEnv("Umesh", () => {
      assert.equal(evaluateGoLive(fu.gates, "voice", NOW).allowed, true);
      const cli = spawnSync(process.execPath, ["--import", "tsx", CLI, "voice", "--gates-dir", fu.gates], { encoding: "utf8", env: { ...process.env } });
      assert.equal(cli.status, 0, cli.stdout + cli.stderr);
      assert.ok(cli.stdout.includes(OVERRIDE_TEXT), cli.stdout);
    });
  } finally {
    cleanup(fm);
    cleanup(fu);
  }
});

test("V1: the override line for a different gate target is not read (text targets never need A10)", () => {
  const f = fixture({ a10: `${A10_FAIL_RECORD}${OVERRIDE_LINE}\n` });
  try {
    for (const target of ["student-routes", "anonymous", "publish"] as GoLiveTarget[]) {
      const r = evaluateGoLive(f.gates, target, NOW, APPROVER);
      assert.equal(r.allowed, true, target);
      assert.ok(!formatGoLiveReport(r).includes("OVERRIDDEN"), target);
    }
  } finally {
    cleanup(f);
  }
});

test("A20: an unknown target is refused, never treated as allowed", () => {
  const f = fixture();
  try {
    assert.throws(() => evaluateGoLive(f.gates, "everything" as never, NOW, APPROVER));
  } finally {
    cleanup(f);
  }
});

test("A20 CLI: exits 1 naming each missing record against the real qa/gates; 0 on a complete directory; 2 on bad usage", () => {
  const run = (args: string[]) => spawnSync(process.execPath, ["--import", "tsx", CLI, ...args], { encoding: "utf8" });
  // Real-gate refusal holds only while B13 is unsigned; once Umesh signs, student-routes is allowed (go-live).
  if (REAL_B13_PENDING) {
    const refused = run(["student-routes", "--gates-dir", REPO_GATES]);
    assert.equal(refused.status, 1, refused.stderr);
    assert.match(refused.stdout, /REFUSED/);
    assert.ok(refused.stdout.includes(GATE_FILES.b13), refused.stdout);
    assert.ok(refused.stdout.includes(GATE_FILES.gPublish), refused.stdout);
  }
  // The real A10 record: while it holds the D-111 owner-override line the REAL gates must ALLOW voice (never skipped); otherwise voice stays refused until a run passes.
  const realA10 = readFileSync(join(REPO_GATES, GATE_FILES.a10), "utf8");
  if (/^Owner-override: /m.test(realA10)) {
    // D-111 applies only with the repo Approver configured: with VC_GATE_APPROVER unset the real gates refuse voice (exit 1).
    const unsetEnv = { ...process.env };
    delete unsetEnv.VC_GATE_APPROVER;
    const realRefused = spawnSync(process.execPath, ["--import", "tsx", CLI, "voice", "--gates-dir", REPO_GATES], { encoding: "utf8", env: unsetEnv });
    assert.equal(realRefused.status, 1, realRefused.stdout + realRefused.stderr);
    assert.ok(!realRefused.stdout.includes(OVERRIDE_TEXT), realRefused.stdout);
    const realVoice = spawnSync(process.execPath, ["--import", "tsx", CLI, "voice", "--gates-dir", REPO_GATES], { encoding: "utf8", env: { ...process.env, VC_GATE_APPROVER: realOverrideSigner() } });
    assert.equal(realVoice.status, 0, realVoice.stdout + realVoice.stderr);
    assert.match(realVoice.stdout, /ALLOWED/);
    assert.ok(realVoice.stdout.includes(OVERRIDE_TEXT), realVoice.stdout);
  } else if (!/^Result: PASS$/m.test(realA10)) {
    const realVoice = run(["voice", "--gates-dir", REPO_GATES]);
    assert.equal(realVoice.status, 1);
    assert.ok(realVoice.stdout.includes(GATE_FILES.a10));
  }
  const f = fixture();
  try {
    const allowed = run(["voice", "--gates-dir", f.gates]);
    assert.equal(allowed.status, 0, allowed.stdout + allowed.stderr);
    assert.match(allowed.stdout, /ALLOWED/);
  } finally {
    cleanup(f);
  }
  assert.equal(run(["nonsense"]).status, 2);
  if (REAL_B13_PENDING) assert.equal(run([]).status, 1, "default target is student-routes against the real qa/gates");
});

test("K3 (pc-hardening-3): assertVoiceGoLive reads the approver from the env it is passed, and from process.env only when no env is passed (fail closed unchanged)", () => {
  const fu = fixture({ a10: `${A10_FAIL_RECORD}${OVERRIDE_LINE}\n` });
  try {
    const base = { gatesDir: fu.gates, now: NOW };
    // approver set ONLY in the passed env -> allowed
    withApproverEnv(undefined, () => {
      assert.doesNotThrow(() => assertVoiceGoLive({ ...base, env: { VC_GATE_APPROVER: "Umesh" } }));
    });
    // approver set ONLY in process.env, the passed env lacks it -> refused (the passed env is the configuration)
    withApproverEnv("Umesh", () => {
      assert.throws(() => assertVoiceGoLive({ ...base, env: {} }), GoLiveRefusedError);
      assert.throws(() => assertVoiceGoLive({ ...base, env: { VC_GATE_APPROVER: "" } }), GoLiveRefusedError);
      // a different approver in the passed env wins over a matching process.env
      assert.throws(() => assertVoiceGoLive({ ...base, env: { VC_GATE_APPROVER: "Mallory" } }), GoLiveRefusedError);
      // no env passed: process.env is the fallback
      assert.doesNotThrow(() => assertVoiceGoLive(base));
      // an explicit approver still decides
      assert.throws(() => assertVoiceGoLive({ ...base, approver: "Mallory", env: { VC_GATE_APPROVER: "Umesh" } }), GoLiveRefusedError);
    });
    // nothing configured anywhere -> refused
    withApproverEnv(undefined, () => {
      assert.throws(() => assertVoiceGoLive(base), GoLiveRefusedError);
      assert.throws(() => assertVoiceGoLive({ ...base, env: {} }), GoLiveRefusedError);
    });
  } finally {
    cleanup(fu);
  }
});
