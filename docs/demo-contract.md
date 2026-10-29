# T-057 Demo Contract (FROZEN 2026-10-28, approved by Umesh, D-124)

Status: **FROZEN** (2026-10-28, D-124). The checker judges against these criteria
only. Anything new it finds goes to the backlog unless it breaks a safety or data boundary (tier A).

Scope (D-122): a **local** demo on **real** data for one real test student, signed in through Pathlynks SSO, on both
surfaces (Pathlynks and Vidysea). Facts come from `docs/data-sources.md`.

## Demo identity

- Pathlynks student: `VC_TEST_PATHLYNKS_USER_ID`. Vidysea user: `VC_TEST_VIDYSEA_USER_ID`. They are linked by
  `pathlynks_student_link`.
- Login: **through the platform** (Umesh, 2026-10-28). The student signs in on a locally run Pathlynks / Vidysea
  frontend and backend (the `.worktrees/quest-pathlynks-*` and `vc-vidysea-*` checkouts). Those backends point at the
  production platform DBs, so a login writes that platform's own session rows (`user_sessions` / `refresh_tokens`).
  This is an accepted, platform-owned write, recorded in D-124. VC itself still writes only to `virtual_counsellor`.
  The platform backend proxies to the local VC (`VC_BASE_URL=http://localhost:8787`, `VC_PARTNER_SERVER_KEY`).

## Acceptance criteria (each has one runnable check)

| # | Criterion | Check |
|---|---|---|
| C1 | VC API starts locally from `.env` and reaches Mongo `virtual_counsellor`, both platform DBs (TLS verified, read-only) and KB `/search` | `pnpm demo:preflight` prints 4× OK |
| C2 | Pathlynks context for the test student includes: profile + grade, top category fit scores, top subcategory careers, trait levels, and the latest Combined Report summary | `pnpm demo:context pathlynks` lists each block with non-zero counts |
| C3 | Vidysea context for the linked student comes from `pathlynks_student_snapshot` (grade, subjects, selected career, career picks, university preferences), plus the Vidysea profile | `pnpm demo:context vidysea` shows the same blocks |
| C4 | "Which careers suit me and why?" is answered from **their** fit scores and traits, citing the source tables | Scripted turn: the answer names ≥2 of the student's top careers, and the citations include fitscore/trait sources |
| C5 | A university question is answered from KB `/search` hits, with cited sources. `/ask` is not on the critical path (KB `/ask` takes ~2 min today) | Scripted turn: ≥1 KB citation, total turn time < 30 s |
| C6 | A preference the student states becomes a **proposed** fact; after the student confirms it, a new session recalls it | Two-session script: propose → confirm → new thread → the answer uses the fact |
| C7 | History: threads and turns list back after a restart | Restart the API, then `GET .../chat/threads` returns the earlier turns |
| C8 | Isolation: student A's token cannot read B's threads or data; with no token or a wrong token, nothing is read | Script: cross-student calls return 403/404, and no platform DB query runs |
| C9 | Crisis text gets the safe reply with zero LLM calls and raises a concern flag | Existing crisis test, plus one live scripted turn |
| C10 | Voice: one spoken question gets a spoken answer using the same context | Manual: browser widget voice turn, recorded in the evidence file |
| C11 | Widget is mounted in a local Pathlynks or Vidysea frontend (proxy mode), and the student chats there | Manual browser walk; screenshots go in `qa/evidence/t057-demo.md` |

## Tier A (always strict; can block at any time)

- Platform DBs: reads only (read-only transaction, SELECT-only SQL, owner-bound `users.id = $1`). No platform writes.
- Mongo writes go only to `virtual_counsellor`.
- No real student rows in git or logs; secrets never printed.
- Safety: the crisis path, and no-script ("never a cheating platform").

## Build work implied (edits to existing code, no new modules)

1. Extend the read model of `mcp/pathlynks/src/port.ts` and `config/sources.json`: add fit scores, traits and the
   Combined Report (Pathlynks), and the SSO snapshot (Vidysea). Add the matching tools in the student graph.
2. Vidysea privileged override: reads stay read-only, the same as Pathlynks G1. Approved by Umesh on 2026-10-28.
3. Pass the CA file through `sources.json` (`packages/schemas/src/sources.ts` allows `caFileRef`).
4. In `mcp/university-kb/src/kb-client.ts`: read evidence from `sources.internal/web`, and make the chat path use
   `/search`.
5. Add the `demo:preflight` / `demo:context` scripts, plus the scripted-turn checks for C4–C9.

## Out of scope for the demo

Deployment, P1 live cards, P2 application draft, P3 avatar, the anonymous widget KB key, concurrency hardening (tier C),
cleanup of the ~110 worktrees.
