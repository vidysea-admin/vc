/** Server-side gate for the console pages: no session cookie means login. Expiry is detected on the first API call (401) and handled in the browser. */
export const LOGIN_PATH = "/admin/login";

export function adminGateTarget(cookieValue: string | undefined): string | null {
  return typeof cookieValue === "string" && cookieValue.trim() !== "" ? null : LOGIN_PATH;
}
