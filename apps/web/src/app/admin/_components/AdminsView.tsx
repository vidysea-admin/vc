"use client";
import { useState, type FormEvent } from "react";
import { can, ROLES } from "../_lib/permissions";
import type { AdminRole, AdminSummary } from "../_lib/types";
import { ErrorBanner, PageHeading, shortDate } from "./ui";

export interface AdminsViewProps {
  role: AdminRole;
  admins: AdminSummary[];
  error: string | null;
  busy: boolean;
  onCreate: (input: { email: string; password: string; role: AdminRole }) => Promise<boolean | void>;
  onSetRole: (adminId: string, role: AdminRole) => Promise<void>;
}

function CreateAdminForm({ busy, onCreate }: { busy: boolean; onCreate: AdminsViewProps["onCreate"] }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<AdminRole>("viewer");
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const pw = password;
    setPassword("");
    if ((await onCreate({ email: email.trim(), password: pw, role })) === false) return;
    setEmail("");
  };
  return (
    <form className="adm-card" onSubmit={e => void submit(e)} data-testid="create-admin-form">
      <h2>Create an admin</h2>
      <label className="adm-field">
        <span>Email</span>
        <input type="email" required value={email} onChange={e => setEmail(e.target.value)} data-testid="admin-email" />
      </label>
      <label className="adm-field">
        <span>Initial password (at least 12 characters)</span>
        <input type="password" required minLength={12} autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} data-testid="admin-password" />
      </label>
      <label className="adm-field">
        <span>Role</span>
        <select value={role} onChange={e => setRole(ROLES.find(r => r === e.target.value) ?? "viewer")} data-testid="admin-role">
          {ROLES.map(r => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </label>
      <button type="submit" className="adm-btn adm-btn-primary" disabled={busy} data-testid="create-admin">
        Create admin
      </button>
    </form>
  );
}

export function AdminsView({ role, admins, error, busy, onCreate, onSetRole }: AdminsViewProps) {
  if (!can(role, "admin.write")) {
    return (
      <div>
        <PageHeading title="Admins" />
        <p className="adm-note" data-testid="admins-denied">
          Only a super-admin can manage admin accounts.
        </p>
      </div>
    );
  }
  return (
    <div>
      <PageHeading title="Admins" />
      <ErrorBanner error={error} />
      <CreateAdminForm busy={busy} onCreate={onCreate} />
      <section className="adm-card" aria-label="Admin accounts">
        {admins.length === 0 ? (
          <p className="adm-note">No admins loaded.</p>
        ) : (
          <div className="adm-scroll">
            <table className="adm-table" data-testid="admins-table">
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {admins.map(a => (
                  <tr key={a.id} data-testid={`admin-row-${a.id}`}>
                    <td>
                      {a.email} {a.disabled ? <span className="adm-badge adm-badge-bad">disabled</span> : null}
                    </td>
                    <td>
                      <select
                        aria-label={`Role for ${a.email}`}
                        value={a.role}
                        disabled={busy}
                        onChange={e => void onSetRole(a.id, ROLES.find(r => r === e.target.value) ?? a.role)}
                        data-testid={`role-select-${a.id}`}
                      >
                        {ROLES.map(r => (
                          <option key={r} value={r}>
                            {r}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>{shortDate(a.createdAt)}</td>
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
