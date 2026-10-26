"use client";
/**
 * vc-admin-control S8 / VA19: the browser-side admin session.
 * The JWT is held in a React ref (memory) only. Across a reload it comes back from the httpOnly cookie through GET /api/admin-session.
 * No storage API is used; the token is never put in a URL.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { createAdminClient, type AdminClient } from "./client";
import { LOGIN_PATH } from "./gate";
import { ROLES } from "./permissions";
import type { AdminRole } from "./types";

export const SESSION_URL = "/api/admin-session";

export type SessionStatus = "loading" | "anonymous" | "authenticated";

export interface SessionValue {
  status: SessionStatus;
  role: AdminRole | null;
  email: string;
  api: AdminClient;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const SessionContext = createContext<SessionValue | null>(null);

export function useSession(): SessionValue {
  const v = useContext(SessionContext);
  if (!v) throw new Error("useSession needs <SessionProvider>");
  return v;
}

export class LoginError extends Error {}

function loginMessage(status: number): string {
  if (status === 401) return "Email or password is incorrect.";
  if (status === 429) return "Too many attempts. Wait a minute and try again.";
  if (status === 503) return "The admin service is not configured.";
  return "Could not sign in. Try again.";
}

function readRole(v: unknown): AdminRole | null {
  return typeof v === "string" && (ROLES as readonly string[]).includes(v) ? (v as AdminRole) : null;
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const tokenRef = useRef<string | undefined>(undefined);
  const [status, setStatus] = useState<SessionStatus>("loading");
  const [role, setRole] = useState<AdminRole | null>(null);
  const [email, setEmail] = useState("");

  const clear = useCallback(() => {
    tokenRef.current = undefined;
    setRole(null);
    setEmail("");
    setStatus("anonymous");
  }, []);

  const api = useMemo(
    () =>
      createAdminClient({
        fetch: (...args) => fetch(...args),
        getToken: () => tokenRef.current,
        onUnauthorized: () => {
          clear();
          void fetch(SESSION_URL, { method: "DELETE" }).catch(() => undefined);
          router.replace(LOGIN_PATH);
        },
      }),
    [clear, router],
  );

  // Page load / reload: ask the route handler to re-validate the cookie and hand the token back to memory.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(SESSION_URL, { cache: "no-store" });
        const body: Record<string, unknown> = res.ok ? await res.json() : {};
        const r = readRole(body.role);
        if (cancelled) return;
        if (res.ok && typeof body.token === "string" && r) {
          tokenRef.current = body.token;
          setRole(r);
          setEmail(typeof body.email === "string" ? body.email : "");
          setStatus("authenticated");
        } else {
          clear();
        }
      } catch {
        if (!cancelled) clear();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [clear]);

  const login = useCallback(
    async (emailIn: string, password: string) => {
      let res: Response;
      try {
        res = await fetch(SESSION_URL, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: emailIn, password }) });
      } catch {
        throw new LoginError(loginMessage(0));
      }
      const body: Record<string, unknown> = res.ok ? await res.json().catch(() => ({})) : {};
      const r = readRole(body.role);
      if (!res.ok || typeof body.token !== "string" || !r) throw new LoginError(loginMessage(res.status));
      tokenRef.current = body.token;
      setRole(r);
      setEmail(typeof body.email === "string" ? body.email : emailIn);
      setStatus("authenticated");
    },
    [],
  );

  const logout = useCallback(async () => {
    try {
      await fetch(SESSION_URL, { method: "DELETE" });
    } catch {
      // the cookie is httpOnly and can only be cleared by the server; memory is cleared regardless
    }
    clear();
    router.replace(LOGIN_PATH);
  }, [clear, router]);

  const value = useMemo<SessionValue>(() => ({ status, role, email, api, login, logout }), [status, role, email, api, login, logout]);
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}
