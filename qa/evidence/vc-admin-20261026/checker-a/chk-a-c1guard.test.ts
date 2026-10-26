/** Checker A cycle-1: R9 per-e-mail guard. Can one unauthenticated host make every admin login answer 429? */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createLoginGuard, handleSessionLogin, type SessionDeps } from "../src/app/admin/_lib/session-handlers";

const login = (email: string) =>
  new Request("http://admin.test/api/admin-session", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password: "x" }) });

test("C1-R9: 10,000 attempts with distinct attacker-chosen e-mails fill the guard; a legitimate admin's first login then gets 429 without reaching the API", async () => {
  let upstream = 0;
  const deps: SessionDeps = {
    upstreamBase: "http://api.test:9000",
    fetch: (async () => {
      upstream++;
      return new Response(JSON.stringify({ error: "invalid_credentials" }), { status: 401 });
    }) as typeof fetch,
    loginGuard: createLoginGuard(),
  };
  const t0 = Date.now();
  for (let i = 0; i < 10_000; i++) await handleSessionLogin(login(`bot${i}@x.test`), deps);
  console.log("R9 flood of 10000 took ms", Date.now() - t0, "upstream calls", upstream);
  const before = upstream;
  const legit = await handleSessionLogin(login("super@vc.test"), deps);
  console.log("R9 legit admin first login after the flood ->", legit.status, "upstream reached:", upstream > before);
  assert.equal(legit.status, 429, "documents the lock-out");
});
