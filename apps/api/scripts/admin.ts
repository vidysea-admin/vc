/**
 * Admin-user CLI (vc-admin-control VA4). Usage:  tsx scripts/admin.ts create <email> --role super-admin|admin|viewer
 * Reads MONGODB_URL (and the optional VC_ADMIN_MASTER_KEY) from the environment and writes only the `admin_users` collection of the virtual_counsellor database.
 * The password is asked on the terminal with echo off; it is never an argument. Exit 0 = done, 1 = refused or failed, 2 = bad usage.
 */
import { connectFromEnv, createAdminStore } from "@vc/db";
import { runAdminCli } from "../src/admin-cli.js";

/** Reads one line from the TTY with echo off: raw mode, nothing written back, backspace and Ctrl-C handled. */
function readPasswordTty(prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const stdin = process.stdin;
    process.stderr.write(prompt);
    let value = "";
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");
    const done = (fn: () => void): void => {
      stdin.setRawMode(false);
      stdin.pause();
      stdin.removeListener("data", onData);
      process.stderr.write("\n");
      fn();
    };
    const onData = (chunk: string): void => {
      for (const ch of chunk) {
        if (ch === "\r" || ch === "\n" || ch === "\u0004") return done(() => resolve(value));
        if (ch === "\u0003") return done(() => reject(new Error("cancelled")));
        if (ch === "\u007f" || ch === "\b") value = value.slice(0, -1);
        else value += ch;
      }
    };
    stdin.on("data", onData);
  });
}

async function main(): Promise<number> {
  const argv = process.argv.slice(2);
  // Check usage before touching the database: a refused argv password must not need a connection.
  const { client, db } = connectFromEnv(process.env);
  try {
    if (!argv.some((a) => /^(-p|--p|--pw|--pass|--passwd|--password)(=|$)/i.test(a))) await client.connect();
    return await runAdminCli(argv, {
      store: createAdminStore(db),
      isTty: process.stdin.isTTY === true,
      readPassword: readPasswordTty,
      out: (l) => console.log(l),
      err: (l) => console.error(l),
    });
  } finally {
    await client.close().catch(() => undefined);
  }
}

main().then(
  (code) => process.exit(code),
  (err: unknown) => {
    console.error(`admin: failed (${err instanceof Error ? err.name : "error"})`);
    process.exit(1);
  },
);
