# T-057 demo: local browser end-to-end evidence (run 8b, 2026-11-01)

**Scope.** This is a local run, not a deployed one. Nothing is deployed yet: there is no VC host, image or widget release.

| Component | Where it ran |
|---|---|
| Code | `codex/vc-completion` at 79cc922f (vidysea/main is 2e84adcf) |
| VC API | :8787, on the **real** `virtual_counsellor` Mongo, which is reachable again |
| Vidysea backend gateway | :8000 |
| Vidysea frontend | :3001 |
| Widget | :8790, served from `apps/widget/src` |
| Admin web | :3108 |

The walk command was `node qa/.delivery/requests/t057-walk.mjs vidysea --voice`; the log is `walk-vidysea-run8b.log` in the session scratchpad. Screenshots are in `qa/evidence/t057/` (gitignored). The walk records only lengths, counts and kinds: no student text and no secrets.

## Preflight (`pnpm demo:preflight`, 2026-11-01)

| Target | Result |
|---|---|
| VC Mongo `virtual_counsellor` | OK |
| Pathlynks DB (read-only, TLS) | FAIL connect_error. IP 122.161.79.226 is not allow-listed. |
| Vidysea DB (read-only, TLS) | OK |
| KB `/search` | FAIL, unavailable in 4025 ms. The KB redeploy is pending. |

## Contract rows

| Row | What | Result | Evidence / owner |
|---|---|---|---|
| C1 | Preflight 4× OK | **BLOCKED** (2/4) | DevOps: allow-list 122.161.79.226 on the Pathlynks DB and redeploy the KB with `/api/search`. Request text is in `qa/evidence/t057/network-2026-11-01.md`; Umesh sends it. |
| C2 | Pathlynks student context | **BLOCKED** | Pathlynks DB unreachable (DevOps) |
| C3 | Careers answer (Vidysea) | **OK** | step05 reply=321ch kind=bot |
| C4 | Pathlynks careers | **BLOCKED** | Pathlynks DB (DevOps) |
| C5 | KB-cited university answer | **FAIL / BLOCKED** | step06 no-citation (kind=note). KB `/search` is down (DevOps redeploy). The code path itself is checker-PASS (t057-c5-pl-sources). |
| C6 | Memory: propose → confirm → recall in a new thread | **OK** | step07 note 1006ch, step08 confirm OK, step09 recall 894ch. Fix dfb0f8cc maps sensitivity "normal" to medium (verdict 67aa4577). |
| C7 | Threads persist / reload history | **OK** | step11 bubbles=4. Uses the real VC Mongo this run. |
| C8 | Student isolation | **OK** | Probe with two synthetic students under the gateway partner key: A reads its own thread 200; B on its own path 404; B header on A's path 404; B's list has 0 threads; B posting into A's thread 404; no key 401. |
| C9 | Crisis | **OK** | step10 kind=crisis 606ch (zero-LLM crisis path) |
| C10 | Voice question → spoken answer | **OK** | step04 userTranscript=29ch audioFrames=62 reply=315ch. Before the fix the reply was 4–12ch: the panel showed only the newest delta chunk. Fixed in t057-voice-delta (65f5279d + 79cc922f, verdict e2f01472). |
| C11 | Vidysea walk end to end | **OK** (10/11, C5 blocked) | run 8b |
| C11-PL | Pathlynks walk | **BLOCKED** | Pathlynks DB (DevOps) and the uncommitted Pathlynks FE/BE wiring (Umesh: PR yes) |

## Extra checks

| Check | Result | Note |
|---|---|---|
| Widget size / resize | **OK** | Opens at 440×680, clamped to the viewport. The top-left and bottom-right grips are browser-dragged. Verdict 435ab9f3. |
| Admin console :3108 | **PARTIAL** | The login page renders. Signing in needs an admin account in the real VC DB. I did not create one or type a password; **Umesh signs in himself**. |
| Vidysea public homepage `/` | Not in scope | 500 from FaqSectionWrapper `assertValue`: a CMS environment variable is missing in the local `.env`. This is the Vidysea frontend, not VC. The walk starts at login. |
| Hindi crisis voice reply | Tests only | T-061, checker PASS. It was not spoken live in this run. |

## Fixes made during this run (all checker PASS)
- dfb0f8cc: C6 sensitivity "normal" maps to medium.
- a41bf67d + 259520ea: widget default size and top-left grip.
- 65f5279d + 79cc922f: the voice live line appends delta chunks; a confirm prompt closes the student's line; the walk citation check is scoped to the reply.
