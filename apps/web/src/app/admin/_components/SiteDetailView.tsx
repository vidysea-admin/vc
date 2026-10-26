"use client";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { can } from "../_lib/permissions";
import type { AdminRole, KeyScope, RevealedKeys, SiteSummary } from "../_lib/types";
import { ErrorBanner, KeyRevealPanel, PageHeading, parseList, ReadOnlyNote, shortDate } from "./ui";

export interface SiteDetailViewProps {
  role: AdminRole;
  site: SiteSummary;
  revealed: RevealedKeys | null;
  error: string | null;
  busy: boolean;
  onSave: (patch: { name: string; origins: string[] }) => Promise<void>;
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
  const save = (e: FormEvent) => {
    e.preventDefault();
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
