"use client";
import type { AuditEntry } from "../_lib/types";
import { ErrorBanner, PageHeading, shortDate } from "./ui";

export function AuditView({ entries, error }: { entries: AuditEntry[]; error: string | null }) {
  return (
    <div>
      <PageHeading title="Audit log" />
      <ErrorBanner error={error} />
      <section className="adm-card" aria-label="Audit entries">
        {entries.length === 0 ? (
          <p className="adm-note">No audit entries yet.</p>
        ) : (
          <div className="adm-scroll">
            <table className="adm-table" data-testid="audit-table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Actor</th>
                  <th>Action</th>
                  <th>Target</th>
                  <th>Result</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e, i) => (
                  <tr key={`${e.at}-${i}`}>
                    <td>{shortDate(e.at)}</td>
                    <td>{e.actorId}</td>
                    <td className="adm-mono">{e.action}</td>
                    <td>{e.target}</td>
                    <td>
                      <span className={e.ok ? "adm-badge adm-badge-ok" : "adm-badge adm-badge-bad"}>{e.ok ? "OK" : "Failed"}</span>
                    </td>
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
