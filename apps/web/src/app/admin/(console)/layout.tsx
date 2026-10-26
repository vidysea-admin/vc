import type { ReactNode } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ConsoleShell } from "../_components/ConsoleShell";
import { adminGateTarget } from "../_lib/gate";
import { SESSION_COOKIE_NAME } from "../_lib/session-cookie";

export const dynamic = "force-dynamic";

/** Server gate: no session cookie, no console. An expired token is caught in the browser on the first API call (401 goes back to login). */
export default async function ConsoleLayout({ children }: { children: ReactNode }) {
  const target = adminGateTarget((await cookies()).get(SESSION_COOKIE_NAME)?.value);
  if (target) redirect(target);
  return <ConsoleShell>{children}</ConsoleShell>;
}
