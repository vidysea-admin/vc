/** S3 role matrix: viewer = GET only; admin = all except admins + secrets; super-admin = all. The API enforces it; the UI mirrors it so a control is absent or disabled, never offered and refused. */
import type { AdminRole } from "./types";

export const ROLES: readonly AdminRole[] = ["super-admin", "admin", "viewer"];

export type Capability = "site.write" | "key.write" | "source.write" | "source.test" | "source.sync" | "source.secret" | "admin.write";

const ADMIN_CAPS: readonly Capability[] = ["site.write", "key.write", "source.write", "source.test", "source.sync"];

export function can(role: AdminRole | undefined | null, capability: Capability): boolean {
  if (role === "super-admin") return true;
  if (role === "admin") return ADMIN_CAPS.includes(capability);
  return false;
}

export type NavPage = "dashboard" | "sites" | "sources" | "admins" | "audit";

/** Admins is listed by `GET admins`, a super-admin-only route, so only a super-admin gets the link. */
export function canSeeNav(role: AdminRole | undefined | null, page: NavPage): boolean {
  if (page === "admins") return role === "super-admin";
  return role === "super-admin" || role === "admin" || role === "viewer";
}
