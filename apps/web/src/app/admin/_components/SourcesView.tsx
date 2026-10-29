"use client";
import { useState, type FormEvent } from "react";
import { can } from "../_lib/permissions";
import type { AdminRole, GithubService, SourceActionResult, SourceInput, SourceSummary } from "../_lib/types";
import { ErrorBanner, PageHeading, parseList, ReadOnlyNote, shortDate } from "./ui";

export interface SourcesViewProps {
  role: AdminRole;
  sources: SourceSummary[];
  results: Record<string, SourceActionResult | undefined>;
  error: string | null;
  busy: boolean;
  onCreate: (input: SourceInput) => Promise<void>;
  onTest: (sourceId: string) => Promise<void>;
  onSync: (sourceId: string) => Promise<void>;
  onSetSecret: (sourceId: string, secret: string) => Promise<void>;
}

/** Only these non-secret config fields are ever shown (S1: `*Ref` fields hold env NAMES, never values). Anything else the payload carries is dropped. */
const SHOWN_CONFIG: Record<SourceSummary["kind"], string[]> = {
  github: ["platform", "enabled", "owner", "repo", "branch", "service", "tokenRef"],
  postgres: ["platform", "enabled", "host", "port", "database", "user", "sslmode", "passwordRef", "tables"],
};

function configText(v: unknown): string {
  if (Array.isArray(v)) return v.filter(x => typeof x === "string").join(", ");
  return typeof v === "string" || typeof v === "number" || typeof v === "boolean" ? String(v) : "";
}

const SERVICES: GithubService[] = ["frontend", "auth", "school", "career", "other"];

function AddSourceForm({ busy, onCreate }: { busy: boolean; onCreate: SourcesViewProps["onCreate"] }) {
  const [kind, setKind] = useState<"github" | "postgres">("github");
  const [f, setF] = useState<Record<string, string>>({ branch: "main", service: "frontend", port: "5432", sslmode: "require", platform: "pathlynks", siteId: "pathlynks" });
  const set = (k: string) => (e: { target: { value: string } }) => setF(prev => ({ ...prev, [k]: e.target.value }));
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (kind === "github") {
      await onCreate({
        kind: "github",
        siteId: f.siteId?.trim() ?? "",
        platform: f.platform === "vidysea" ? "vidysea" : "pathlynks",
        id: f.id?.trim() ?? "",
        owner: f.owner?.trim() ?? "",
        repo: f.repo?.trim() ?? "",
        branch: f.branch?.trim() ?? "main",
        service: (SERVICES.includes(f.service as GithubService) ? f.service : "other") as GithubService,
        ...(f.tokenRef?.trim() ? { tokenRef: f.tokenRef.trim() } : {}),
      });
    } else {
      await onCreate({
        kind: "postgres",
        siteId: f.siteId?.trim() ?? "",
        platform: f.platform === "vidysea" ? "vidysea" : "pathlynks",
        id: f.id?.trim() ?? "",
        host: f.host?.trim() ?? "",
        port: Number(f.port) || 5432,
        database: f.database?.trim() ?? "",
        user: f.user?.trim() ?? "",
        sslmode: f.sslmode === "verify-full" ? "verify-full" : "require",
        passwordRef: f.passwordRef?.trim() ?? "",
        tables: parseList(f.tables ?? ""),
      });
    }
  };
  const text = (k: string, label: string, opts: { required?: boolean; hint?: string } = {}) => (
    <label className="adm-field">
      <span>{label}</span>
      <input type="text" required={opts.required ?? true} value={f[k] ?? ""} onChange={set(k)} data-testid={`source-${k}`} placeholder={opts.hint} />
    </label>
  );
  return (
    <form className="adm-card" onSubmit={e => void submit(e)} data-testid="add-source-form">
      <h2>Add a source</h2>
      <label className="adm-field">
        <span>Kind</span>
        <select value={kind} onChange={e => setKind(e.target.value === "postgres" ? "postgres" : "github")} data-testid="source-kind">
          <option value="github">GitHub repository</option>
          <option value="postgres">Postgres database</option>
        </select>
      </label>
      <label className="adm-field"><span>Platform</span><select value={f.platform} onChange={e => setF(prev => ({ ...prev, platform: e.target.value, siteId: e.target.value }))} data-testid="source-platform"><option value="pathlynks">Pathlynks</option><option value="vidysea">Vidysea</option></select></label>
      {text("siteId", "Site id")}
      {text("id", "Source id", { hint: "for example gh-frontend" })}
      {kind === "github" ? (
        <>
          {text("owner", "Owner")}
          {text("repo", "Repository")}
          {text("branch", "Branch")}
          <label className="adm-field">
            <span>Service</span>
            <select value={f.service} onChange={set("service")} data-testid="source-service">
              {SERVICES.map(s => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          {text("tokenRef", "Token variable name (optional, a name such as GITHUB_TOKEN, never the token)", { required: false })}
        </>
      ) : (
        <>
          {text("host", "Host")}
          {text("port", "Port")}
          {text("database", "Database")}
          {text("user", "User")}
          <label className="adm-field">
            <span>SSL mode</span>
            <select value={f.sslmode} onChange={set("sslmode")} data-testid="source-sslmode">
              <option value="require">require</option>
              <option value="verify-full">verify-full</option>
            </select>
          </label>
          {text("passwordRef", f.platform === "vidysea" ? "Password variable name (VIDYSEA_DB_PASSWORD, never the password)" : "Password variable name (PATHLYNKS_DB_PASSWORD, never the password)")}
          {text("tables", "Tables (comma separated)")}
        </>
      )}
      <button type="submit" className="adm-btn adm-btn-primary" disabled={busy} data-testid="add-source">
        Add source
      </button>
    </form>
  );
}

function SecretForm({ sourceId, busy, onSetSecret }: { sourceId: string; busy: boolean; onSetSecret: SourcesViewProps["onSetSecret"] }) {
  const [secret, setSecret] = useState("");
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const value = secret;
    setSecret("");
    await onSetSecret(sourceId, value);
  };
  return (
    <form className="adm-inline" onSubmit={e => void submit(e)}>
      <input type="password" required autoComplete="new-password" aria-label={`New secret for ${sourceId}`} placeholder="New secret" value={secret} onChange={e => setSecret(e.target.value)} data-testid={`secret-input-${sourceId}`} />
      <button type="submit" className="adm-btn adm-btn-small" disabled={busy} data-testid="set-secret">
        Set secret
      </button>
    </form>
  );
}

export function SourcesView({ role, sources, results, error, busy, onCreate, onTest, onSync, onSetSecret }: SourcesViewProps) {
  const canAdd = can(role, "source.write");
  const canTest = can(role, "source.test");
  const canSync = can(role, "source.sync");
  const canSecret = can(role, "source.secret");
  return (
    <div>
      <PageHeading title="Sources" />
      <ErrorBanner error={error} />
      {canAdd ? <AddSourceForm busy={busy} onCreate={onCreate} /> : <ReadOnlyNote role={role} />}
      {sources.length === 0 ? (
        <section className="adm-card">
          <p className="adm-note">No sources yet.</p>
        </section>
      ) : (
        sources.map(s => {
          const result = results[s.id];
          return (
            <section className="adm-card" key={s.id} data-testid={`source-card-${s.id}`}>
              <h2>
                {s.id} <span className="adm-badge">{s.kind}</span>
              </h2>
              <dl className="adm-dl">
                <div><dt>site</dt><dd>{s.siteId}</dd></div>
                {SHOWN_CONFIG[s.kind].map(k => {
                  const v = configText(s.config[k]);
                  return v === "" ? null : (
                    <div key={k}>
                      <dt>{k}</dt>
                      <dd>{v}</dd>
                    </div>
                  );
                })}
                <div>
                  <dt>secret</dt>
                  <dd>
                    <span className={s.hasSecret ? "adm-badge adm-badge-ok" : "adm-badge"} data-testid={`secret-state-${s.id}`}>{s.hasSecret ? "set" : "not set"}</span>
                  </dd>
                </div>
                <div>
                  <dt>last sync</dt>
                  <dd>{s.lastSync ? `${shortDate(s.lastSync.at)} ${s.lastSync.status}` : "never"}</dd>
                </div>
              </dl>
              <div className="adm-actions">
                {canTest ? (
                  <button type="button" className="adm-btn adm-btn-small" disabled={busy || s.config.enabled === false} data-testid="test-source" onClick={() => void onTest(s.id)}>
                    Test
                  </button>
                ) : null}
                {canSync && s.kind === "github" ? (
                  <button type="button" className="adm-btn adm-btn-small" disabled={busy || s.config.enabled === false} data-testid="sync-source" onClick={() => void onSync(s.id)}>
                    Sync
                  </button>
                ) : null}
              </div>
              {canSecret ? <SecretForm sourceId={s.id} busy={busy} onSetSecret={onSetSecret} /> : null}
              {result ? (
                <p className={result.ok ? "adm-ok" : "adm-bad"} role="status" data-testid={`source-result-${s.id}`}>
                  {result.message}
                </p>
              ) : null}
            </section>
          );
        })
      )}
    </div>
  );
}
