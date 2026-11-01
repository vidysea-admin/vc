# VC DevOps handover: README plan (2026-11-01, after push b1ecb6ae)

## Context
Umesh wants three things:
1. A proper, ordered plan and a README for the DevOps team covering everything VC needs from them.
2. A check of the sibling projects that DevOps already took live (Knowledge Base), because they came out with many issues for lack of a README and plan.
3. A straight answer: is this directory's work fully validated, or is something still remaining?

Decisions taken with Umesh (AskUserQuestion):
- **Deploy shape: Ubuntu + systemd + nginx.** `infra/ubuntu/` already has the nginx site, the systemd unit and 8 steps.
- **Fix scope: only what blocks DevOps.** That is the health endpoint, the `.env.example` drift and the admin console `start` script. The other gaps go into the README as "known gaps, later".

## What I found

### Knowledge Base, live state (probed 2026-11-01, GET only)
- `https://vidysea.com/knowledgebase/` answers 301 to `https://www.vidysea.com/knowledgebase/`, which then answers **302 to `https://34.47.136.12:8081/`**, a raw IP. `/api/health`, `/api/auth/session` and `/config.js` all answer 302 too.
- This is exactly what `D:/KnowledgeBase/docs/DEVOPS-REDEPLOY-2026-11-01.md:9-12` recorded: the 30 Oct redeploy never happened, and the old bundle is still served. **The KB is not fixed; DevOps has not executed the redeploy.**
- My public IP is still 122.161.79.226, the same IP as in `qa/evidence/t057/network-2026-11-01.md`. So the VC Mongo and Pathlynks allow-list items are still open. I did not probe VC Mongo this turn: the probe was denied, and the earlier TCP timeout stands.

### Why KB went live with issues (from `D:/KnowledgeBase/docs/DEVOPS-HANDOVER.md` and `DEVOPS-REDEPLOY-2026-11-01.md`)
1. The Mongo host was open to the internet with no password and held a ransom note (2026-10-26). Security came after go-live, not before.
2. `docker-compose.yml` forwarded none of the account variables, so `.env` values never reached the containers. This was fixed later (D-212).
3. The outer vidysea.com proxy redirects to a raw IP. That proxy is outside the repo, and nobody knew its config.
4. Values were guessed: `TRUST_PROXY_HOPS=2` is "an assumption".
5. The handover and the redeploy runbook were written after the first deploy had gone wrong.

### Lessons for the VC README
1. Write the README before DevOps starts, with owner, order and a pass/fail check for every step.
2. Security and network first (allow-lists), then the app.
3. Names only for env vars. Mark each one required or optional, and for which service.
4. Smoke checks with the exact expected output, plus a rollback section.
5. A "Not confirmed, ask" section, so nobody guesses (for example the Vidysea prod origin, or the KB base URL).

### VC, what already exists (`qa/evidence/deploy-readiness.md`, 20 gaps)
- 5 gaps block the first live URL, and all five are external or human steps: host and TLS, Mongo allow-list for the server IP, the KB, the server env file, and Umesh's go decision.
- A port inconsistency must be settled before the allow-list request goes out: `network-2026-11-01.md` asks for the Pathlynks DB on port 27017, but `config/sources.json` says Postgres 5432.

### Code reality check (2026-11-02, static scan of apps/ packages/ mcp/)
- **Stack:** Node 20 + TypeScript (310 .ts, 30 .tsx). It is not Python. The Python files are 3 dev-time checks only.
- **How it runs:** `pnpm -C apps/api start` → `tsx src/main.ts`. AI runs on LangGraph.js, MongoDB, and Gemini (`@google/genai`), Ollama or LiteLLM, chosen by `VC_LLM_PROVIDER`.
- **No runtime dependency on Claude Code or skills:**
  - Product source has 0 `child_process`/spawn calls.
  - The only "claude" in product code is a word-list regex at `go-live-gate.ts:44`.
  - The local browser walks already ran the API as a plain Node process.
  - A Python rewrite is not needed; it would be wrong.
- **Real deploy traps, which the README and fixes must cover:**
  1. **The `qa/gates/` files are read at boot.** `assertGoLive` (`apps/api/src/go-live-gate.ts`) runs from `chat.ts:352`, `anonymous.ts:432` and `voice.ts:378`, with the default dir `anonymous.ts:68`, which is repo-relative.
     - It needs `p1-u0-amendment-signatures.md` (B13 SIGNED), `g-publish.md`, `g-prod.md` and `nights.md`.
     - Voice also needs `a10-voice-gate.md`, plus the evidence it points to: `qa/evidence/p1-a10-diag/a10-diag-report.md`.
     - It also needs the env var `VC_GATE_APPROVER`.
     - All of these are signed today. But a deploy that copies only `apps/` and `packages/` makes chat and voice refuse to start, with `GoLiveRefusedError`.
     - The README must say: deploy the full git checkout (including `qa/gates` and `qa/evidence/p1-a10-diag`) and set `VC_GATE_APPROVER`.
  2. **`tsx` is a devDependency** (root `package.json:18`, `apps/api/package.json:34`), but `start` uses it. So `pnpm install --prod` breaks the start. **F4:** move `tsx` to `dependencies` in `apps/api` (a 1-line edit, with a test that asserts it).
  3. `config/sources.json` is read at boot (`index.ts:546`). It is also repo-relative, so it ships with the checkout.
- **Reviewer verdicts (2026-11-02, read-only):**
  - ai-engineer: **Approve**. The runtime is self-contained. SKILL.md files are prompt templates read by our own loader (`loader.ts`), which fails fast. Voice uses real Gemini function calling, and text chat routes tools by rules. The MCP packages run in-process.
  - senior-software-engineer: **Warning**, "runs with steps". Nothing is Windows-only, and every boot file is tracked in git. It breaks on these points:
    - (a) `VC_GATE_APPROVER` is unset. It must be `Umesh`, and it is missing from `.env.example` and from `infra/ubuntu/README.md`.
    - (b) The folders are copied instead of cloned, so `skills/`, `qa/gates` or `config/` are missing.
    - (c) A required env var is missing: `MONGODB_URL`, `VC_JWT_ISSUER` plus one key source, or `VC_LLM_PROVIDER` (no default; `mock` would serve canned replies).
    - (d) The server IP is not on the Mongo allow-list, so the service crash-loops.
    - (e) The server runs Node older than 20.16, and `process.getBuiltinModule` throws.
    - (f) pnpm is not pinned (there is no `packageManager` field).
    - (g) `node_modules` is copied from Windows.
- **Added to fixes:**
  - **F4:** set root `package.json` `engines.node` to `>=20.16` and add `packageManager: pnpm@10.33.0`.
  - **F2:** also covers `VC_GATE_APPROVER`.
  - **README:** gets "git clone, never copy; reinstall node_modules on the server; never `--prod`; set `VC_LLM_PROVIDER` to gemini or litellm, never mock; PEM keys as `\n` or a JWKS URL".
  - **Gate check before start:** `pnpm -C apps/api go-live-gate student-routes` must print ALLOWED.
- **Later, not blocking:**
  - One shared schema validator for voice tool args.
  - An alert and a distinct outage message when the safety screen is down.
  - A boot test with `qa/gates` or `skills/` absent.

## Deliverables

### D1. `docs/DEVOPS-HANDOVER.md` (new file; Umesh asked for a README explicitly)
It is modelled on the KB handover. `infra/ubuntu/README.md` gets one pointer line. Sections:
1. What VC is, and the two milestones:
   - M1: anonymous chat behind nginx and TLS.
   - M2: embedded personalised chat, after partner keys and origins.
2. Owners and order: DevOps / Umesh / Pathlynks team, ordered. Allow-lists first.
3. Network table: what to allow-list for the server IP, with host and port only. This covers VC Mongo, the KB, the Pathlynks and Vidysea DBs (**port corrected**), Ollama and Gemini egress, and 80/443 inbound.
4. Env file: names only, per service. M1 minimum set, then M2 additions. Who supplies each value, and how (private channel).
5. Host steps: `infra/ubuntu/README.md` steps 1 to 8, with each command's expected result.
6. nginx rules: CORS is done by the API per partner key, so DevOps must not add `Access-Control-*` at nginx or a CDN. The `/v1/` allow-list and the `/vc-popout` known gap.
7. Smoke checks with exact expected output, including the new health endpoint.
8. Widget release: the immutable path `/widget/releases/<sha>/`, the files, and SHA256.
9. Rollback.
10. Not confirmed, ask: the Vidysea prod frontend origin, the KB public base URL (the KB URL currently redirects to a raw IP), the student JWT shape and tenant ids, and the RDS CA files.
11. What DevOps sends back: URL, server IP, versions, and the smoke-check output.

### D2. Small product fixes (maker, TDD, tier S, one checker)
- **F1:** a health route `GET /v1/healthz` (Mongo ping: 200 `{"db":"ok"}`, 503 otherwise) in `apps/api/src/server.ts` `ROUTES`, plus the nginx location in `infra/ubuntu/nginx-vc.conf`, plus a test. Today no health route exists (`deploy-readiness.md` gap 11).
- **F2:** `.env.example` gets the 31 missing names (13 `VC_STUDENT_JWT_*`, `VC_GROUNDING*`, `VC_LLM_*`, and so on), names only (gap 17).
- **F3:** an `apps/web` `start` script (gap 14), with a note that the admin console is optional for M1.
- Correct `qa/evidence/t057/network-2026-11-01.md`: the request text must carry the verified port.

### D3. Not built (README lists them as "known gaps, later")
Dockerfile and CI, the pop-out route, the widget release script, production Langfuse, the API bind override, the single-replica limit.

## Order of work
1. Parallel: one writer for D1 (the README), one maker builder for F1 (the health route, test first), one small builder for F2 and F3.
2. Independent "cold read": a fresh Sonnet agent reads only the README as a DevOps engineer and lists every question it cannot answer from the file. Fix the README until that list is empty. This is the test of lesson 1.
3. Fact-check pass: every env name in the README against `grep process.env`, every command and path against the repo.
4. Checker on F1 to F3 (one manifest, tier S). The README is docs-lane and needs no checker. Senior-software-engineer review of the code.
5. 6c gate and push, only on Umesh's yes.
6. Umesh sends the README and the corrected request text to DevOps.

Constraint: the C: drive has about 0.5 GB free, so no new worktree of size; build in `D:/vc/.worktrees/vc-completion`.

## Verification
- `docs/DEVOPS-HANDOVER.md`: the cold-read agent returns "no open questions", and the fact-check lists 0 mismatches.
- F1: a new test is red first and then green; `curl http://127.0.0.1:8787/v1/healthz` returns 200 `{"db":"ok"}` locally; the nginx location passes `nginx -t` as a syntax read.
- `cd apps/widget && npm test`, plus the API and web package tests for the files touched.
- Then the live check of Umesh's own question: the KB probe above (re-run after DevOps acts), and the VC `pnpm demo:preflight` on the server.

## Answer to "is everything validated?"
- **Validated:** the local browser end to end (Vidysea walk, 10 of 11 steps; C5 blocked by the KB), the widget fix, the push of b1ecb6ae.
- **Not validated, still remaining:**
  - Nothing is deployed, so there is no live check.
  - The Pathlynks walk (blocked on the DB allow-list and the uncommitted wiring).
  - The DevOps README and the 3 small fixes in this plan.
  - DevOps work (KB redeploy, allow-lists, host, TLS) and Umesh's yes items (go decision, partner add, the Pathlynks PR, DB_PASS rotate).
