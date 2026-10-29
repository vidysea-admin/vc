"use client";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { can } from "../_lib/permissions";
import type { AdminRole, KeyScope, MemoryPolicy, RevealedKeys, SiteSummary } from "../_lib/types";
import { ErrorBanner, KeyRevealPanel, PageHeading, parseList, ReadOnlyNote, shortDate } from "./ui";

export interface SiteDetailViewProps {
  role: AdminRole;
  site: SiteSummary;
  revealed: RevealedKeys | null;
  error: string | null;
  busy: boolean;
  onSave: (patch: { name?: string; origins?: string[]; memoryPolicy?: MemoryPolicy }) => Promise<void>;
  onRotate: (scope: KeyScope) => Promise<void>;
  onRevoke: () => Promise<void>;
  onUnrevoke: () => Promise<void>;
  onDismissReveal: () => void;
}

const SCOPE_LABEL: Record<KeyScope, string> = { pub: "Page key (pub)", srv: "Server key (srv)" };

function KeyRow({ scope, site, canWrite, busy, onRotate }: { scope: KeyScope; site: SiteSummary; canWrite: boolean; busy: boolean; onRotate: (s: KeyScope) => Promise<void> }) {
  const [confirming, setConfirming] = useState(false);
  const rec = site.keys[scope];
  return (
    <tr data-testid={`key-row-${scope}`}>
      <td>{SCOPE_LABEL[scope]}</td>
      <td className="adm-mono">{rec.prefix}</td>
      <td>{shortDate(rec.rotatedAt)}</td>
      {canWrite ? (
        <td>
          {!confirming ? (
            <button type="button" className="adm-btn adm-btn-small" disabled={busy} data-testid={`rotate-${scope}`} onClick={() => setConfirming(true)}>
              Rotate
            </button>
          ) : (
            <span className="adm-inline">
              <button
                type="button"
                className="adm-btn adm-btn-small adm-btn-danger"
                disabled={busy}
                data-testid={`confirm-rotate-${scope}`}
                onClick={() => {
                  setConfirming(false);
                  void onRotate(scope);
                }}
              >
                Confirm: the old key stops working now
              </button>
              <button type="button" className="adm-btn adm-btn-small" onClick={() => setConfirming(false)}>
                Cancel
              </button>
            </span>
          )}
        </td>
      ) : null}
    </tr>
  );
}

export function SiteDetailView({ role, site, revealed, error, busy, onSave, onRotate, onRevoke, onUnrevoke, onDismissReveal }: SiteDetailViewProps) {
  const siteWritable = can(role, "site.write");
  const keyWritable = can(role, "key.write") && site.status === "active";
  const [name, setName] = useState(site.name);
  const [origins, setOrigins] = useState(site.allowedOrigins.join("\n"));
  const [memoryPolicy, setMemoryPolicy] = useState<MemoryPolicy>(site.memoryPolicy ?? { shortTermEnabled: false, longTermEnabled: false, learningEnabled: false, contextMessages: 0, maxFacts: 0 });
  const [memoryError, setMemoryError] = useState<string | null>(null);
  const saveMemory = (e: FormEvent) => {
    e.preventDefault();
    if (!siteWritable || busy) return;
    if (!Number.isInteger(memoryPolicy.contextMessages) || memoryPolicy.contextMessages < 0 || memoryPolicy.contextMessages > 12 || !Number.isInteger(memoryPolicy.maxFacts) || memoryPolicy.maxFacts < 0 || memoryPolicy.maxFacts > 20) {
      setMemoryError("Use whole numbers: context messages 0–12 and memory facts 0–20.");
      return;
    }
    setMemoryError(null);
    void onSave({ memoryPolicy: { ...memoryPolicy } });
  };
  const save = (e: FormEvent) => {
    e.preventDefault();
    if (!siteWritable || busy || site.status !== "active") return;
    void onSave({ name: name.trim(), origins: parseList(origins) });
  };
  return (
    <div>
      <p>
        <Link href="/admin/sites">Back to sites</Link>
      </p>
      <PageHeading title={site.name}>
        <span className={site.status === "active" ? "adm-badge adm-badge-ok" : "adm-badge adm-badge-bad"} data-testid="site-status">
          {site.status}
        </span>
      </PageHeading>
      <p className="adm-muted adm-mono">{site.partnerId}</p>
      <ErrorBanner error={error} />
      <KeyRevealPanel revealed={revealed} onDismiss={onDismissReveal} />
      {!siteWritable ? <ReadOnlyNote role={role} /> : null}

      <section className="adm-card" aria-label="Keys">
        <h2>Keys</h2>
        <div className="adm-scroll">
          <table className="adm-table" data-testid="keys-table">
            <thead>
              <tr>
                <th>Key</th>
                <th>Prefix</th>
                <th>Last rotated</th>
                {keyWritable ? <th>Action</th> : null}
              </tr>
            </thead>
            <tbody>
              <KeyRow scope="pub" site={site} canWrite={keyWritable} busy={busy} onRotate={onRotate} />
              <KeyRow scope="srv" site={site} canWrite={keyWritable} busy={busy} onRotate={onRotate} />
            </tbody>
          </table>
        </div>
        <p className="adm-note">Only the prefix of a key is stored. A full key is shown once, when it is created or rotated.</p>
      </section>

      {siteWritable && site.status === "active" ? (
        <form className="adm-card" onSubmit={save} data-testid="edit-site-form">
          <h2>Name and origins</h2>
          <label className="adm-field">
            <span>Name</span>
            <input type="text" required maxLength={120} value={name} onChange={e => setName(e.target.value)} data-testid="edit-site-name" />
          </label>
          <label className="adm-field">
            <span>Allowed origins (one per line)</span>
            <textarea rows={3} value={origins} onChange={e => setOrigins(e.target.value)} data-testid="edit-site-origins" />
          </label>
          <button type="submit" className="adm-btn adm-btn-primary" disabled={busy} data-testid="save-site">
            Save
          </button>
        </form>
      ) : (
        <section className="adm-card" aria-label="Origins">
          <h2>Allowed origins</h2>
          {site.allowedOrigins.length === 0 ? <p className="adm-note">None.</p> : site.allowedOrigins.map(o => <div key={o}>{o}</div>)}
        </section>
      )}

      <form className="adm-card" aria-label="Student memory" data-testid="memory-policy-form" onSubmit={saveMemory}>
        <h2>Student memory</h2>
        {!site.memoryPolicy ? <p className="adm-note">Memory is off until settings are saved. Choose each feature and its limits below.</p> : null}
        <p className="adm-note">Applies to this platform's text and voice conversations, subject to student consent. Turning a feature off keeps existing history and memories.</p>
        <fieldset disabled={!siteWritable || busy}>
          <legend>Memory features</legend>
          {([
            ["shortTermEnabled", "Use recent messages in the selected conversation"],
            ["longTermEnabled", "Use confirmed memories across conversations"],
            ["learningEnabled", "Suggest new memories for the student to confirm"],
          ] as const).map(([key, label]) => (
            <label className="adm-field" key={key}>
              <span><input type="checkbox" checked={memoryPolicy[key]} disabled={!siteWritable || busy} data-testid={"memory-" + key} onChange={e => setMemoryPolicy(p => ({ ...p, [key]: e.target.checked }))} /> {label}</span>
            </label>
          ))}
          <label className="adm-field">
            <span>Recent context messages (0–12)</span>
            <input type="number" min={0} max={12} step={1} required value={Number.isNaN(memoryPolicy.contextMessages) ? "" : memoryPolicy.contextMessages} disabled={!siteWritable || busy} data-testid="memory-contextMessages" onChange={e => setMemoryPolicy(p => ({ ...p, contextMessages: e.target.valueAsNumber }))} />
          </label>
          <label className="adm-field">
            <span>Confirmed memory facts (0–20)</span>
            <input type="number" min={0} max={20} step={1} required value={Number.isNaN(memoryPolicy.maxFacts) ? "" : memoryPolicy.maxFacts} disabled={!siteWritable || busy} data-testid="memory-maxFacts" onChange={e => setMemoryPolicy(p => ({ ...p, maxFacts: e.target.valueAsNumber }))} />
          </label>
        </fieldset>
        <p className="adm-note">A limit of 0 provides no messages or facts. Students can still inspect, confirm, correct and forget their memories when suggestions are off.</p>
        <ErrorBanner error={memoryError} />
        {siteWritable ? <button type="submit" className="adm-btn adm-btn-primary" disabled={busy} data-testid="save-memory">Save memory settings</button> : null}
      </form>

      {siteWritable ? (
        <section className="adm-card" aria-label="Revoke">
          <h2>Access</h2>
          {site.status === "active" ? (
            <button type="button" className="adm-btn adm-btn-danger" disabled={busy} data-testid="revoke-site" onClick={() => void onRevoke()}>
              Revoke this site
            </button>
          ) : (
            <button type="button" className="adm-btn" disabled={busy} data-testid="unrevoke-site" onClick={() => void onUnrevoke()}>
              Unrevoke this site
            </button>
          )}
        </section>
      ) : null}
    </div>
  );
}
