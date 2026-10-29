/**
 * vc-admin-control / VA19 (unit vca-ui): server-rendered markup of the admin views per role (react-dom/server, no browser).
 * A static render proves which controls exist for which role, what a secret field shows, and what the dashboard reports.
 * Clicks, the key-shown-once-then-gone flow after a reload and the 360 px layout are proven in the live browser walk, not here.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { LoginView } from "../src/app/admin/_components/LoginView";
import { DashboardView } from "../src/app/admin/_components/DashboardView";
import { SitesView } from "../src/app/admin/_components/SitesView";
import { SiteDetailView } from "../src/app/admin/_components/SiteDetailView";
import { SourcesView } from "../src/app/admin/_components/SourcesView";
import { AdminsView } from "../src/app/admin/_components/AdminsView";
import { AuditView } from "../src/app/admin/_components/AuditView";
import { ConsoleNav } from "../src/app/admin/_components/ConsoleNav";
import { COST_TARGET_INR } from "../src/app/admin/_lib/format";
import type { AdminSummary, AuditEntry, Metrics, SiteSummary, SourceSummary } from "../src/app/admin/_lib/types";

const noop = () => undefined;
const noopAsync = async () => undefined;

const site: SiteSummary = {
  partnerId: "pathlynks",
  name: "Pathlynks",
  keys: { pub: { prefix: "vck_pub_pathlynks_AbCd", rotatedAt: null }, srv: { prefix: "vck_srv_pathlynks_EfGh", rotatedAt: "2026-10-20T10:00:00.000Z" } },
  allowedOrigins: ["https://pathlynks.example"],
  status: "active",
  createdAt: "2026-10-01T00:00:00.000Z",
};

const metrics: Metrics = {
  perSiteDay: [
    { siteId: "pathlynks", day: "2026-10-24", conversations: 41 },
    { siteId: "pathlynks", day: "2026-10-25", conversations: 57 },
    { siteId: "vidysea-web", day: "2026-10-25", conversations: 9 },
  ],
  activeStudents: 123,
  chatVsVoice: { chat: 480, voice: 77 },
  tokens: 1_234_567,
  costUsd: 31.5,
  costPerStudentInr: 21.4,
  latencyP50: 820,
  latencyP95: 2310,
  guardrailHits: 6,
  unanswered: 14,
};

const sources: SourceSummary[] = [
  { id: "gh-main", siteId: "pathlynks", kind: "github", config: { owner: "vidysea", repo: "frontend", branch: "main", service: "frontend", tokenRef: "GITHUB_TOKEN" }, hasSecret: true },
  { id: "pg-main", siteId: "pathlynks", kind: "postgres", config: { host: "db.internal", port: 5432, database: "pathlynks", user: "ro", sslmode: "require", passwordRef: "PATHLYNKS_DB_PASSWORD", tables: ["users"] }, hasSecret: false },
];

const WRITE_TESTIDS = ["add-site", "revoke-site", "unrevoke-site", "add-source", "test-source", "sync-source", "set-secret", "create-admin", "rotate-pub", "rotate-srv", "save-site"];

function writeControls(html: string): string[] {
  // A control counts as a live write control when it is present and not disabled.
  const found: string[] = [];
  for (const id of WRITE_TESTIDS) {
    const m = new RegExp(`<(?:button|input|select|textarea)[^>]*data-testid="${id}"[^>]*>`, "g");
    for (const tag of html.match(m) ?? []) if (!/\sdisabled(=|\s|>)/.test(tag)) found.push(id);
  }
  return found;
}

test("VA19 login: email + password form, the generic wrong-password message, no stored-credential hints", () => {
  const html = renderToStaticMarkup(<LoginView onSubmit={noopAsync} error="Email or password is incorrect." busy={false} />);
  assert.ok(html.includes('type="email"') && html.includes('type="password"'));
  assert.ok(html.includes('autoComplete="current-password"') || html.includes('autocomplete="current-password"'));
  assert.ok(html.includes("Email or password is incorrect."));
  assert.ok(html.includes('role="alert"'));
  assert.equal(renderToStaticMarkup(<LoginView onSubmit={noopAsync} error={null} busy={false} />).includes('role="alert"'), false);
});

test("VA19 viewer: sites, sources, admins and detail show the lists but every write control is absent or disabled", () => {
  const sitesHtml = renderToStaticMarkup(<SitesView role="viewer" sites={[site, { ...site, partnerId: "old", name: "Old", status: "revoked" }]} revealed={null} error={null} busy={false} onCreate={noopAsync} onDismissReveal={noop} onRevoke={noopAsync} onUnrevoke={noopAsync} />);
  assert.ok(sitesHtml.includes("Pathlynks") && sitesHtml.includes("https://pathlynks.example"), "the list is visible");
  const detailHtml = renderToStaticMarkup(<SiteDetailView role="viewer" site={site} revealed={null} error={null} busy={false} onSave={noopAsync} onRotate={noopAsync} onRevoke={noopAsync} onUnrevoke={noopAsync} onDismissReveal={noop} />);
  assert.ok(detailHtml.includes("vck_pub_pathlynks_AbCd"));
  const sourcesHtml = renderToStaticMarkup(<SourcesView role="viewer" sources={sources} results={{}} error={null} busy={false} onCreate={noopAsync} onTest={noopAsync} onSync={noopAsync} onSetSecret={noopAsync} />);
  assert.ok(sourcesHtml.includes("gh-main") && sourcesHtml.includes("pg-main"));
  for (const html of [sitesHtml, detailHtml, sourcesHtml]) assert.deepEqual(writeControls(html), [], "a viewer has no live write control");
});

test("VA19 admin: site + key + source write controls are live, the secret setter and the admins form are not", () => {
  const sitesHtml = renderToStaticMarkup(<SitesView role="admin" sites={[site]} revealed={null} error={null} busy={false} onCreate={noopAsync} onDismissReveal={noop} onRevoke={noopAsync} onUnrevoke={noopAsync} />);
  assert.ok(writeControls(sitesHtml).includes("add-site"));
  const detailHtml = renderToStaticMarkup(<SiteDetailView role="admin" site={site} revealed={null} error={null} busy={false} onSave={noopAsync} onRotate={noopAsync} onRevoke={noopAsync} onUnrevoke={noopAsync} onDismissReveal={noop} />);
  const detailLive = writeControls(detailHtml);
  for (const id of ["rotate-pub", "rotate-srv", "revoke-site", "save-site"]) assert.ok(detailLive.includes(id), id);
  const sourcesHtml = renderToStaticMarkup(<SourcesView role="admin" sources={sources} results={{}} error={null} busy={false} onCreate={noopAsync} onTest={noopAsync} onSync={noopAsync} onSetSecret={noopAsync} />);
  const live = writeControls(sourcesHtml);
  for (const id of ["add-source", "test-source", "sync-source"]) assert.ok(live.includes(id), id);
  assert.equal(live.includes("set-secret"), false, "only a super-admin sets a secret");
  const adminsHtml = renderToStaticMarkup(<AdminsView role="admin" admins={[]} error={null} busy={false} onCreate={noopAsync} onSetRole={noopAsync} />);
  assert.deepEqual(writeControls(adminsHtml), [], "the admins page is super-admin only");
  assert.ok(/super-admin/i.test(adminsHtml));
});

test("VA19 super-admin: sets a source secret and creates admins with a role", () => {
  const sourcesHtml = renderToStaticMarkup(<SourcesView role="super-admin" sources={sources} results={{}} error={null} busy={false} onCreate={noopAsync} onTest={noopAsync} onSync={noopAsync} onSetSecret={noopAsync} />);
  assert.ok(writeControls(sourcesHtml).includes("set-secret"));
  const admins: AdminSummary[] = [{ id: "u1", email: "boss@vidysea.test", role: "super-admin", disabled: false, createdAt: "2026-10-01T00:00:00.000Z" }];
  const html = renderToStaticMarkup(<AdminsView role="super-admin" admins={admins} error={null} busy={false} onCreate={noopAsync} onSetRole={noopAsync} />);
  assert.ok(html.includes("boss@vidysea.test"));
  assert.ok(writeControls(html).includes("create-admin"));
  for (const r of ["super-admin", "admin", "viewer"]) assert.ok(html.includes(`value="${r}"`), `role option ${r}`);
  assert.ok(html.includes('type="password"'), "admin password is typed in a password field");
});

test("VA19 secrets never re-display: a stored secret shows only 'set' / 'not set', even if the payload carried one", () => {
  const leaky = sources.map((s, i) => ({ ...s, secret: `LEAK-${i}-plain`, secretEnc: { iv: "LEAK-iv", tag: "LEAK-tag", ct: "LEAK-ct" }, config: { ...s.config, password: "LEAK-pw", token: "LEAK-token" } })) as unknown as SourceSummary[];
  for (const role of ["viewer", "admin", "super-admin"] as const) {
    const html = renderToStaticMarkup(<SourcesView role={role} sources={leaky} results={{}} error={null} busy={false} onCreate={noopAsync} onTest={noopAsync} onSync={noopAsync} onSetSecret={noopAsync} />);
    assert.doesNotMatch(html, /LEAK-/, `${role} view leaked a secret field`);
    assert.ok(/data-testid="secret-state-gh-main"[^>]*>\s*set\s*</.test(html), "gh-main shows 'set'");
    assert.ok(/data-testid="secret-state-pg-main"[^>]*>\s*not set\s*</.test(html), "pg-main shows 'not set'");
  }
  const sec = renderToStaticMarkup(<SourcesView role="super-admin" sources={sources} results={{}} error={null} busy={false} onCreate={noopAsync} onTest={noopAsync} onSync={noopAsync} onSetSecret={noopAsync} />);
  const secretInputs = sec.match(/<input[^>]*data-testid="secret-input[^>]*>/g) ?? [];
  assert.ok(secretInputs.length >= 1);
  for (const tag of secretInputs) {
    assert.ok(/type="password"/.test(tag), tag);
    assert.ok(!/\svalue="[^"]/.test(tag), `a secret input is never pre-filled: ${tag}`);
    assert.ok(/autoComplete="off"|autocomplete="off"|autoComplete="new-password"|autocomplete="new-password"/.test(tag), tag);
  }
});

test("VA19 key shown once: the freshly minted key is rendered while it is held in state, and absent from every other render", () => {
  const withKey = renderToStaticMarkup(<SitesView role="admin" sites={[site]} revealed={{ title: "Keys for Pathlynks", keys: [{ label: "pub", value: "vck_pub_pathlynks_SECRETSECRETSECRET" }] }} error={null} busy={false} onCreate={noopAsync} onDismissReveal={noop} onRevoke={noopAsync} onUnrevoke={noopAsync} />);
  assert.ok(withKey.includes("vck_pub_pathlynks_SECRETSECRETSECRET"));
  assert.ok(/only time|shown once|will not be shown again/i.test(withKey));
  // the same page after a reload has no revealed state: the full key is nowhere in the markup
  const afterReload = renderToStaticMarkup(<SitesView role="admin" sites={[site]} revealed={null} error={null} busy={false} onCreate={noopAsync} onDismissReveal={noop} onRevoke={noopAsync} onUnrevoke={noopAsync} />);
  assert.doesNotMatch(afterReload, /SECRETSECRET/);
  const detailAfter = renderToStaticMarkup(<SiteDetailView role="admin" site={site} revealed={null} error={null} busy={false} onSave={noopAsync} onRotate={noopAsync} onRevoke={noopAsync} onUnrevoke={noopAsync} onDismissReveal={noop} />);
  assert.doesNotMatch(detailAfter, /SECRETSECRET/);
  assert.ok(detailAfter.includes("vck_pub_pathlynks_AbCd"), "only the listing prefix remains");
});

test("VA19 revoked site: the detail page offers Unrevoke instead of Revoke and no rotate", () => {
  const html = renderToStaticMarkup(<SiteDetailView role="admin" site={{ ...site, status: "revoked" }} revealed={null} error={null} busy={false} onSave={noopAsync} onRotate={noopAsync} onRevoke={noopAsync} onUnrevoke={noopAsync} onDismissReveal={noop} />);
  const live = writeControls(html);
  assert.ok(live.includes("unrevoke-site"));
  assert.equal(live.includes("revoke-site"), false);
  assert.equal(live.includes("rotate-pub") || live.includes("rotate-srv"), false);
});

test("VA19 dashboard: conversations per site per day, active students, chat vs voice, tokens, cost per student vs the 50 INR target, latency, guardrail hits, unanswered", () => {
  assert.equal(COST_TARGET_INR, 50);
  const html = renderToStaticMarkup(<DashboardView metrics={metrics} sites={[{ id: "pathlynks", name: "Pathlynks" }]} range={{ from: "2026-10-19", to: "2026-10-25" }} siteId="" error={null} loading={false} onChange={noop} />);
  for (const needle of ["2026-10-24", "2026-10-25", "pathlynks", "vidysea-web"]) assert.ok(html.includes(needle), needle);
  for (const [id, value] of [
    ["metric-active-students", "123"],
    ["metric-chat", "480"],
    ["metric-voice", "77"],
    ["metric-tokens", "1,234,567"],
    ["metric-latency-p50", "820"],
    ["metric-latency-p95", "2310"],
    ["metric-guardrail", "6"],
    ["metric-unanswered", "14"],
    ["metric-cost-per-student", "21.40"],
  ] as const) {
    const m = new RegExp(`data-testid="${id}"[^>]*>([\\s\\S]*?)</`).exec(html);
    assert.ok(m, `missing ${id}`);
    assert.ok(m![1].replace(/<[^>]*>/g, "").includes(value), `${id} should show ${value}, got ${m![1]}`);
  }
  assert.ok(/50/.test(html) && html.includes("target"), "the 50 INR target is stated");
  assert.ok(/data-testid="cost-status"[^>]*>[^<]*(under|within|below)/i.test(html), "21.40 is under target");
  const over = renderToStaticMarkup(<DashboardView metrics={{ ...metrics, costPerStudentInr: 64.2 }} sites={[]} range={{ from: "a", to: "b" }} siteId="" error={null} loading={false} onChange={noop} />);
  assert.ok(/data-testid="cost-status"[^>]*>[^<]*(over|above)/i.test(over), "64.20 is over target");
});

test("VA19 dashboard empty / not yet loaded: no crash and no fake numbers", () => {
  const empty: Metrics = { perSiteDay: [], activeStudents: 0, chatVsVoice: { chat: 0, voice: 0 }, tokens: 0, costUsd: 0, costPerStudentInr: 0, latencyP50: 0, latencyP95: 0, guardrailHits: 0, unanswered: 0 };
  const html = renderToStaticMarkup(<DashboardView metrics={empty} sites={[]} range={{ from: "a", to: "b" }} siteId="" error={null} loading={false} onChange={noop} />);
  assert.ok(/no conversations/i.test(html));
  const loading = renderToStaticMarkup(<DashboardView metrics={null} sites={[]} range={{ from: "a", to: "b" }} siteId="" error={null} loading={true} onChange={noop} />);
  assert.ok(/loading/i.test(loading));
  assert.equal(/data-testid="metric-active-students"/.test(loading), false);
});

test("VA19 errors render as alerts and are escaped (a 403 sentence, hostile text)", () => {
  const html = renderToStaticMarkup(<SitesView role="viewer" sites={[]} revealed={null} error={'<img src=x onerror=alert(1)> You are not allowed to do that.'} busy={false} onCreate={noopAsync} onDismissReveal={noop} onRevoke={noopAsync} onUnrevoke={noopAsync} />);
  assert.ok(html.includes('role="alert"'));
  assert.doesNotMatch(html, /<img src=x/);
  assert.ok(html.includes("not allowed"));
});

test("VA19 audit table lists actor, action, target and ok/failed", () => {
  const entries: AuditEntry[] = [
    { at: "2026-10-25T10:00:00.000Z", actorId: "boss@vidysea.test", action: "sites.revoke", target: "pathlynks", ok: true },
    { at: "2026-10-25T10:05:00.000Z", actorId: "view@vidysea.test", action: "sites.create", target: "x", ok: false },
  ];
  const html = renderToStaticMarkup(<AuditView entries={entries} error={null} />);
  for (const needle of ["boss@vidysea.test", "sites.revoke", "pathlynks", "view@vidysea.test", "sites.create"]) assert.ok(html.includes(needle), needle);
  assert.ok(/ok/i.test(html) && /failed|denied/i.test(html));
});

test("VA19 nav: viewer and admin do not see Admins, super-admin does; every role sees Dashboard, Sites, Sources, Audit and Sign out", () => {
  for (const role of ["viewer", "admin", "super-admin"] as const) {
    const html = renderToStaticMarkup(<ConsoleNav role={role} email="x@y.test" current="dashboard" onLogout={noop} />);
    for (const label of ["Dashboard", "Sites", "Sources", "Audit", "Sign out"]) assert.ok(html.includes(label), `${role} ${label}`);
    assert.equal(html.includes("/admin/admins"), role === "super-admin", `${role} admins link`);
    assert.ok(html.includes(role), "the role is shown");
  }
});


test("Q13 memory policy: actual site detail exposes independent controls, hard caps and read-only viewer", () => {
  const policy = {shortTermEnabled:true,longTermEnabled:false,learningEnabled:true,contextMessages:0,maxFacts:7};
  for (const role of ["viewer","admin","super-admin"] as const) {
    const html = renderToStaticMarkup(<SiteDetailView role={role} site={{...site,memoryPolicy:policy}} revealed={null} error={null} busy={false} onSave={noopAsync} onRotate={noopAsync} onRevoke={noopAsync} onUnrevoke={noopAsync} onDismissReveal={noop} />);
    for (const id of ["shortTermEnabled","longTermEnabled","learningEnabled","contextMessages","maxFacts"]) assert.ok(html.includes('data-testid="memory-'+id+'"'),id);
    assert.match(html, /max="12"/); assert.match(html,/max="20"/);
    if(role==="viewer") assert.ok(!html.includes('data-testid="save-memory"'));
    else assert.ok(html.includes('data-testid="save-memory"'));
    for (const tag of html.match(/<input[^>]*data-testid="memory-[^"]+"[^>]*>/g)??[]) assert.equal(tag.includes('disabled=""'),role==="viewer");
  }
  const legacy=renderToStaticMarkup(<SiteDetailView role="admin" site={site} revealed={null} error={null} busy={false} onSave={noopAsync} onRotate={noopAsync} onRevoke={noopAsync} onUnrevoke={noopAsync} onDismissReveal={noop}/>);
  assert.ok(legacy.includes("Memory is off until settings are saved"));
});


test('S12 Admin shows both platforms and disables unprovisioned source actions',()=>{
 const props={role:'admin' as const,sources:[...sources,{id:'vidysea-db',siteId:'vidysea',kind:'postgres' as const,config:{platform:'vidysea',enabled:false,host:'fixture.example'},hasSecret:false}],results:{},error:null,busy:false,onCreate:noopAsync,onTest:noopAsync,onSync:noopAsync,onSetSecret:noopAsync};
 const html=renderToStaticMarkup(<SourcesView {...props}/>);assert.ok(html.includes('value="vidysea"'));assert.ok(html.includes('value="pathlynks"'));assert.ok(html.includes('source-siteId'));assert.ok(html.includes('<dd>vidysea</dd>'));
 const card=html.slice(html.indexOf('data-testid="source-card-vidysea-db"'));assert.match(card,/<button[^>]*disabled=""[^>]*data-testid="test-source"/);assert.ok(!card.includes('data-testid="sync-source"'));assert.ok(card.includes('<dd>false</dd>'));
});
