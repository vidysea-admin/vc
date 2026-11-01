# Session Handoff — VC DevOps handover — 2026-11-02T00:11+05:30

## TL;DR
- The local Vidysea student flow is validated in the browser: chat, memory propose → confirm → recall, and voice (run 8c). It is pushed to `vidysea/main` at b1ecb6ae.
- Nothing is deployed. The next unit, **devops-handover**, is APPROVED by Umesh but not built yet: a DevOps README plus 4 small fixes.
- Two builder requests are ready to dispatch. The old 2026-10-27 handoff is superseded; its history is in git.

## Where things are
- **Work checkout:** `D:/vc/.worktrees/vc-completion`, branch `codex/vc-completion`.
- **Root `D:/vc`:** paused. It holds many uncommitted files (the Pathlynks wiring and others). They are NOT this branch's work, so do not stage or push them blindly.
- **Remotes:** `vidysea` = https://github.com/vidysea-admin/vc.git (the real one; earlier pushes used `git push vidysea <sha>:refs/heads/main`). `origin` = umeshsugara-ai/vc.
- **Never commit `qa/.6c-green`.** The 6c push gate runs where the stamp is (see memory).

## Approved plan (Umesh, 2026-11-02)
Full text: `qa/.delivery/briefs/devops-handover-plan.md`. Manifest: `qa/manifests/devops-handover.md` (status in-progress, criteria H1 to H4).
- **Deploy shape:** Ubuntu + systemd + nginx, reusing `infra/ubuntu/`. No Docker.
- **Fix scope:** only what blocks DevOps.
  - **H1:** `GET /health` (200 `{"status":"ok"}`) and `GET /ready` (Mongo ping: 200, or 503 `{"status":"unavailable"}`), plus nginx exact locations. Brief: `qa/.delivery/briefs/gl-c-health-route.md`.
  - **H2:** `.env.example` gets every env name the API reads, including `VC_GATE_APPROVER`.
  - **H3:**
    - `apps/web` gets a `start` script.
    - Root `engines.node` becomes `>=20.16`, because `process.getBuiltinModule` needs it.
    - `packageManager` pins pnpm.
    - `tsx` moves to `apps/api` dependencies.
  - **H4 (docs-lane):** a new `docs/DEVOPS-HANDOVER.md`: an ordered, owner-tagged runbook modelled on `D:/KnowledgeBase/docs/DEVOPS-HANDOVER.md`.
- **Ready requests:**
  - `qa/.delivery/requests/dh-a-fixes-req.json` covers H1 to H3. Its handoff is generated: `qa/.delivery/context/0254e960…handoff.json`.
  - `qa/.delivery/requests/dh-b-readme-req.json` covers H4. Its handoff failed with "task acceptance required"; fix the request shape and regenerate.
  - Generate with `node D:/ai_os/.claude/skills/maker/tools/tick.mjs --delivery handoff <req.json>`, then dispatch each with `COMPACT_HANDOFF {path, sha256}` only.
  - The builders own disjoint files, so they can run in parallel.
- **After build:**
  1. A cold-read agent reads only the README and lists the questions it cannot answer; fix the README until the list is empty.
  2. Fact-check every env name and path in the README.
  3. Senior review and one checker (tier S).
  4. 6c gate.
  5. Push **only on a new yes from Umesh**.

## Findings this session (keep; they answer Umesh's "why does it break on the server")
- **The code is Node 20 + TypeScript, NOT Python.** There is no Claude Code dependency at runtime.
  - Reviews: ai-engineer Approve, senior-software-engineer Warning "runs with steps".
  - `SKILL.md` files under `skills/` are prompt templates read by our own loader (`packages/engine/src/skills/loader.ts`).
  - Voice tools are real Gemini function calls; text chat routes tools by rules; the MCP packages run in-process.
- **Server break causes:**
  - `VC_GATE_APPROVER` unset; it must be `Umesh`.
  - Folders copied instead of `git clone` (`skills/`, `qa/gates/`, `qa/evidence/p1-a10-diag/` and `config/` are read at boot).
  - Required env missing: `MONGODB_URL`, `VC_JWT_ISSUER` plus a key source, `VC_LLM_PROVIDER` (no default, never `mock`).
  - The server IP is not on the Mongo allow-list, so the service crash-loops.
  - Node is older than 20.16.
  - pnpm is unpinned.
  - `node_modules` was copied from Windows.
  - `pnpm install --prod` drops `tsx`.
- **KB (DevOps already took it live):** still broken. vidysea.com/knowledgebase → 302 to the raw IP `https://34.47.136.12:8081/`. The redeploy in `D:/KnowledgeBase/docs/DEVOPS-REDEPLOY-2026-11-01.md` was never executed.
- **Network:**
  - The machine IP is 122.161.79.226. VC Mongo and the Pathlynks DB time out (`qa/evidence/t057/network-2026-11-01.md`).
  - The Pathlynks port in that request (27017) disagrees with `config/sources.json` (Postgres 5432). Verify it before sending.
- **Later, not blocking:**
  - A shared schema validator for voice tool args.
  - An alert and an outage message when the safety screen is down (otherwise every turn gets the crisis message).
  - A boot test with `qa/gates` or `skills/` absent.
  - The `if (destroyed) return;` guard in `pollProfileAfterTurn`.

## Open, owned by others
- **DevOps:** KB redeploy, VC Mongo and Pathlynks allow-lists, host, DNS, TLS, `/etc/vc/vc.env`.
- **Umesh:**
  - Go decision.
  - Yes to the Pathlynks wiring PR.
  - Rotate DB_PASS.
  - Supply the Vidysea production frontend origin.
  - Supply the KB public base URL.

## Safety
- No product code changed this session after b1ecb6ae.
- No secrets printed. No production writes.
- Mongo writes are allowed only to `virtual_counsellor`, and only from `d:/vc`.
- The maker loop was un-paused (`qa/.paused` removed). The new session resumes it with `/maker continue "D:\vc\.worktrees\vc-completion"`.
