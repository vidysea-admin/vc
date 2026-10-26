"use client";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { can } from "../_lib/permissions";
import type { AdminRole, RevealedKeys, SiteSummary } from "../_lib/types";
import { ErrorBanner, KeyRevealPanel, PageHeading, parseList, ReadOnlyNote } from "./ui";

export interface SitesViewProps {
  role: AdminRole;
  sites: SiteSummary[];
  revealed: RevealedKeys | null;
  error: string | null;
  busy: boolean;
  /** Resolves false when the write failed, so the form keeps what the person typed. */
  onCreate: (input: { name: string; origins: string[] }) => Promise<boolean | void>;
  onDismissReveal: () => void;
  onRevoke: (siteId: string) => Promise<void>;
  onUnrevoke: (siteId: string) => Promise<void>;
}

function AddSiteForm({ busy, onCreate }: { busy: boolean; onCreate: SitesViewProps["onCreate"] }) {
  const [name, setName] = useState("");
  const [origins, setOrigins] = useState("");
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if ((await onCreate({ name: name.trim(), origins: parseList(origins) })) === false) return;
    setName("");
    setOrigins("");
  };
  return (
    <form className="adm-card" onSubmit={e => void submit(e)} data-testid="add-site-form">
      <h2>Add a site</h2>
      <label className="adm-field">
        <span>Name</span>
        <input type="text" required maxLength={120} value={name} onChange={e => setName(e.target.value)} data-testid="site-name" />
      </label>
      <label className="adm-field">
        <span>Allowed origins (one per line, for example https://pathlynks.example)</span>
        <textarea rows={3} value={origins} onChange={e => setOrigins(e.target.value)} data-testid="site-origins" />
      </label>
      <button type="submit" className="adm-btn adm-btn-primary" disabled={busy} data-testid="add-site">
        Add site
      </button>
    </form>
  );
}

export function SitesView({ role, sites, revealed, error, busy, onCreate, onDismissReveal, onRevoke, onUnrevoke }: SitesViewProps) {
  const writable = can(role, "site.write");
  return (
    <div>
      <PageHeading title="Sites" />
      <ErrorBanner error={error} />
      <KeyRevealPanel revealed={revealed} onDismiss={onDismissReveal} />
      {writable ? <AddSiteForm busy={busy} onCreate={onCreate} /> : <ReadOnlyNote role={role} />}
      <section className="adm-card" aria-label="Sites">
        {sites.length === 0 ? (
          <p className="adm-note">No sites yet.</p>
        ) : (
          <div className="adm-scroll">
            <table className="adm-table" data-testid="sites-table">
              <thead>
                <tr>
                  <th>Site</th>
                  <th>Status</th>
                  <th>Origins</th>
                  <th>Keys</th>
                  {writable ? <th>Actions</th> : null}
                </tr>
              </thead>
              <tbody>
                {sites.map(s => (
                  <tr key={s.partnerId} data-testid={`site-row-${s.partnerId}`}>
                    <td>
                      <Link href={`/admin/sites/${encodeURIComponent(s.partnerId)}`} data-testid={`site-link-${s.partnerId}`}>
                        {s.name}
                      </Link>{" "}
                      <span className="adm-muted">{s.partnerId}</span>
                    </td>
                    <td>
                      <span className={s.status === "active" ? "adm-badge adm-badge-ok" : "adm-badge adm-badge-bad"}>{s.status}</span>
                    </td>
                    <td>{s.allowedOrigins.length === 0 ? <span className="adm-muted">none</span> : s.allowedOrigins.map(o => <div key={o}>{o}</div>)}</td>
                    <td className="adm-mono">
                      <div>{s.keys.pub.prefix}</div>
                      <div>{s.keys.srv.prefix}</div>
                    </td>
                    {writable ? (
                      <td>
                        {s.status === "active" ? (
                          <button type="button" className="adm-btn adm-btn-small" disabled={busy} data-testid="revoke-site" onClick={() => void onRevoke(s.partnerId)}>
                            Revoke
                          </button>
                        ) : (
                          <button type="button" className="adm-btn adm-btn-small" disabled={busy} data-testid="unrevoke-site" onClick={() => void onUnrevoke(s.partnerId)}>
                            Unrevoke
                          </button>
                        )}
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
