"use client";
import { useEffect, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { LOGIN_PATH } from "../_lib/gate";
import type { NavPage } from "../_lib/permissions";
import { useSession } from "../_lib/session";
import { ConsoleNav } from "./ConsoleNav";

function pageOf(pathname: string): NavPage | null {
  const seg = pathname.split("/")[2];
  return seg === "dashboard" || seg === "sites" || seg === "sources" || seg === "admins" || seg === "audit" ? seg : null;
}

/** Children render only once a session is in memory. Anonymous (no cookie, expired token) goes back to login. */
export function ConsoleShell({ children }: { children: ReactNode }) {
  const { status, role, email, logout } = useSession();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (status === "anonymous") router.replace(LOGIN_PATH);
  }, [status, router]);

  if (status !== "authenticated" || !role) {
    return (
      <main className="adm-main">
        <p className="adm-note" role="status" data-testid="session-loading">
          {status === "loading" ? "Loading your session..." : "Redirecting to sign in..."}
        </p>
      </main>
    );
  }
  return (
    <>
      <ConsoleNav role={role} email={email} current={pageOf(pathname)} onLogout={() => void logout()} />
      <main className="adm-main">{children}</main>
    </>
  );
}
