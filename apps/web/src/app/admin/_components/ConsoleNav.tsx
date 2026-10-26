"use client";
import Link from "next/link";
import { canSeeNav, type NavPage } from "../_lib/permissions";
import type { AdminRole } from "../_lib/types";

const ITEMS: { page: NavPage; label: string; href: string }[] = [
  { page: "dashboard", label: "Dashboard", href: "/admin/dashboard" },
  { page: "sites", label: "Sites", href: "/admin/sites" },
  { page: "sources", label: "Sources", href: "/admin/sources" },
  { page: "admins", label: "Admins", href: "/admin/admins" },
  { page: "audit", label: "Audit", href: "/admin/audit" },
];

export function ConsoleNav({ role, email, current, onLogout }: { role: AdminRole; email: string; current: NavPage | null; onLogout: () => void }) {
  return (
    <header className="adm-nav">
      <nav aria-label="Admin sections">
        {ITEMS.filter(i => canSeeNav(role, i.page)).map(i => (
          <Link key={i.page} href={i.href} className={i.page === current ? "adm-navlink adm-navlink-current" : "adm-navlink"} aria-current={i.page === current ? "page" : undefined}>
            {i.label}
          </Link>
        ))}
      </nav>
      <div className="adm-who">
        <span className="adm-badge" data-testid="whoami-role">{role}</span>
        <span className="adm-who-email" data-testid="whoami-email">{email}</span>
        <button type="button" className="adm-btn adm-btn-small" data-testid="sign-out" onClick={onLogout}>
          Sign out
        </button>
      </div>
    </header>
  );
}
