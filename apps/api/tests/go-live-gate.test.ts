/**
 * P1 U5a, criterion A20: the go-live gate refuses to enable any student route (authenticated chat, the public
 * anonymous route, voice, partner publication) unless qa/gates holds the records U0 defined: B13-signed, answered
 * g-publish and g-prod, a Nights mode (voice also a passing A10 record). Outcome tests: real directories of gate
 * files are read; today's U0 files (reproduced below) and the real repo qa/gates must refuse. Synthetic data only (B13).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { GATE_FILES, GO_LIVE_TARGETS, GoLiveRefusedError, assertGoLive, evaluateGoLive, type GoLiveTarget } from "../src/go-live-gate.js";

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

test("A20: the real repo qa/gates refuses every target today (B13 not signed, gates unanswered)", () => {
  for (const target of GO_LIVE_TARGETS) {
    const r = evaluateGoLive(REPO_GATES, target, NOW, APPROVER);
    assert.equal(r.allowed, false, target);
    assert.ok(r.failures.length >= 2, `${target}: ${r.failures.join(" | ")}`);
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
  const refused = run(["student-routes", "--gates-dir", REPO_GATES]);
  assert.equal(refused.status, 1, refused.stderr);
  assert.match(refused.stdout, /REFUSED/);
  assert.ok(refused.stdout.includes(GATE_FILES.b13), refused.stdout);
  assert.ok(refused.stdout.includes(GATE_FILES.gPublish), refused.stdout);
  const voice = run(["voice", "--gates-dir", REPO_GATES]);
  assert.equal(voice.status, 1);
  assert.ok(voice.stdout.includes(GATE_FILES.a10));
  const f = fixture();
  try {
    const allowed = run(["voice", "--gates-dir", f.gates]);
    assert.equal(allowed.status, 0, allowed.stdout + allowed.stderr);
    assert.match(allowed.stdout, /ALLOWED/);
  } finally {
    cleanup(f);
  }
  assert.equal(run(["nonsense"]).status, 2);
  assert.equal(run([]).status, 1, "default target is student-routes against the real qa/gates");
});
