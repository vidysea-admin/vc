/**
 * vc-admin-control VA4 (spec S3): the admin-user CLI core.  `pnpm -C apps/api admin create <email> --role super-admin`.
 *
 * The password is read from an interactive terminal prompt, never from argv or the environment, and is never written to stdout or stderr.
 * Any password-looking flag (`--password`, `--pass`, `-p`, `--pw`, `--password=...`) is refused with usage exit 2 BEFORE a prompt is shown, so a
 * password that was typed on the command line (and so is already in shell history) is not silently accepted. A non-TTY stdin is refused too.
 * The script (scripts/admin.ts) wires the TTY prompt and the database; everything else is here so it is tested.
 */
import { ADMIN_ROLES, AdminStoreError, type AdminRole, type AdminStore } from "@vc/db";

import { ADMIN_PASSWORD_MIN_CHARS, hashPassword, passwordPolicyError } from "./admin-auth.js";

export const ADMIN_CLI_USAGE = [
  "usage:",
  "  admin create <email> --role super-admin|admin|viewer     the password is asked on the terminal (never on the command line)",
];

export interface AdminCliDeps {
  store: Pick<AdminStore, "users">;
  /** True when stdin is an interactive terminal. */
  isTty: boolean;
  /** Reads one line without echoing it. */
  readPassword(prompt: string): Promise<string>;
  out(line: string): void;
  err(line: string): void;
}

const PASSWORD_FLAG = /^(-p|--p|--pw|--pass|--passwd|--password)(=|$)/i;

/** Returns the exit code: 0 done, 1 refused or failed, 2 bad usage. */
export async function runAdminCli(argv: readonly string[], deps: AdminCliDeps): Promise<number> {
  const usage = (extra?: string): number => {
    if (extra) deps.err(extra);
    for (const l of ADMIN_CLI_USAGE) deps.err(l);
    return 2;
  };
  if (argv.some((a) => PASSWORD_FLAG.test(a))) {
    return usage("refused: a password is never taken from the command line (it would sit in shell history); it is asked on the terminal");
  }
  const [cmd, email, ...rest] = argv;
  if (cmd !== "create" || email === undefined || email.startsWith("-")) return usage();
  let role: string | undefined;
  for (let i = 0; i < rest.length; i++) {
    if (rest[i] === "--role" && role === undefined && rest[i + 1] !== undefined) {
      role = rest[i + 1];
      i++;
    } else return usage("unexpected extra argument (a password is never an argument: it is asked on the terminal)");
  }
  if (role === undefined || !(ADMIN_ROLES as readonly string[]).includes(role)) return usage(`--role must be one of ${ADMIN_ROLES.join(", ")}`);
  if (!deps.isTty) return usage("refused: the password is read from an interactive terminal, and stdin is not one");

  const first = await deps.readPassword("Password: ");
  const policy = passwordPolicyError(first);
  if (policy) {
    deps.err(`refused: ${policy === "password must be a string" ? `password must be at least ${ADMIN_PASSWORD_MIN_CHARS} characters` : policy}`);
    return 1;
  }
  const second = await deps.readPassword("Repeat password: ");
  if (second !== first) {
    deps.err("refused: the two passwords differ");
    return 1;
  }
  try {
    const created = await deps.store.users.create({ email, passwordHash: await hashPassword(first), role: role as AdminRole });
    deps.out(`created admin ${created.email} (${created.role})`);
    return 0;
  } catch (err) {
    if (err instanceof AdminStoreError) {
      deps.err(err.code === "exists" ? "refused: an admin with that e-mail already exists" : "refused: the e-mail or role is not valid");
      return 1;
    }
    throw err;
  }
}
