# T052 cycle2 — proposed visible English browser acceptance

Status: PREPARATION ONLY. No browser, server, build, test, provider or DB process was started for this document. No acceptance verdict or PASS is recorded. Execute only after the current T052 privacy prechecks, source readiness and required fresh review, in the coordinator's serialized heavy lane. Rebind this recipe to the final candidate hashes; this is not a substitute for independent checker acceptance.

## Scope and source anchors

Use the existing local reference UI at `http://localhost:3108`, with synthetic student `demo-student-4`, in-process fake Mongo and MockProvider. Walk the first provider-style 503, the SAME-input Retry, mixed approval/rejection, summary withholding and repeated browser reload/readback. The observed writes must come from actual `startScribe`/`resumeScribe` graph execution.

Inspected source on 2026-10-14:

- `apps/web/src/components/NewSessionForm.tsx:29`: the session request is built once per mount; it has five English turns, a generated session ID and `demo-student-4`.
- `apps/web/src/components/NewSessionForm.tsx:67`: Submit and Retry serialize that same request; the provider-style error is an alert, and success links to the resulting approval thread.
- `apps/web/demo/seed.ts:180`: `createDemoRuntime` constructs the tenant-scoped fake DB, real graph/checkpointer, synthetic grants and a separate once-failing session graph. D050 adds a fresh `randomUUID()` incarnation to each seeded grant (`:201`, `:213`). Do not seed session authority, generation, proof, root, receipt or commitment metadata. The core establishes its own actual creation/verification.
- `apps/web/demo/seed.ts:95`: extraction proposes four cited facts and two guard-dropped facts. `:151` supplies the typed synthetic `AiUnavailableError`; `:273` exposes the complete projected synthetic readback.
- `apps/web/tests/session-api.test.ts:45`: existing SAME-request Retry regression uses **two turns**, so its pending facts are only `targetCountry` and `intendedMajor`. The actual browser page uses **five turns** and must decide all **four** cited proposals. Do not reuse the test's two-fact count in browser assertions.
- `apps/web/src/components/ApprovalScreen.tsx:330`: explicit per-fact decisions plus a summary choice gate submission; `:400` exposes named radio groups; `:431` exposes the reject-reason counter; `:503` exposes the summary radio group.
- `apps/web/src/components/labels.ts`: all quoted UI labels below; `apps/web/src/app/layout.tsx` declares `lang="en"`.
- `apps/web/src/server/runtime.ts`: only `VC_WEB_MODE=live` selects live runtime; demo is process-local and retained through the global runtime holder.
- `apps/web/src/app/api/sessions/route.ts`, `api/approvals/[threadId]/route.ts`, `api/demo/readback/route.ts`: actual reference routes. Readback is demo-only, `cache-control: no-store`, and 404 in live mode.
- `qa/contracts/counselling-engine.md:203` B17, `:223` B19, `:276` B23; `docs/DECISIONS.md:481` D050.

This milestone does not prove real provider failover/quality, actual consent issuer creation, Pathlynks JWT/client integration, production Mongo, voice, Hindi, international policy compliance, feedback receipt expiry/post-close behavior or the full counselling goal. `apps/web` is the internal localhost reference surface under B21. D050 is unrelated to the T050 feedback-expiry decision.

## Safe build/start/cleanup recipe for the eventual runner

1. Confirm the coordinator released the heavy lane, all prerequisite handles are terminal and the final source inventory is frozen. Use the existing normal mutex `scripts/vc-testlock.sh`; never set a private `VC_TESTLOCK_DIR`, disable its RAM gate or delete a live lock. Inspect current lock ownership, relevant process identity and port ownership before launch. Historical `ownership-final.json` is not current liveness evidence.
2. Verify no listener owns TCP 3108. If occupied, record exact PID/start time/command and stop this launch; never kill a foreign listener. Verify local port 1 is inaccessible so the deliberately disabled service URLs cannot reach a local service. Do not probe production URLs. Record Node/Next paths and current source hashes. Do not install dependencies or read/print `.env` secrets.
3. Launch commands with a new `System.Diagnostics.ProcessStartInfo` environment, `UseShellExecute=false`, `CreateNoWindow=true`, and redirected stdout/stderr. Clear the child environment first; retain only required Windows/runtime variables such as `SystemRoot`, `WINDIR`, `ComSpec`, `TEMP`, `TMP`, `USERPROFILE`, `LOCALAPPDATA`, `APPDATA`, `HOMEDRIVE`, `HOMEPATH`. Supply a trusted PATH containing `C:/Program Files/nodejs`, `C:/Program Files/Git/usr/bin`, `C:/Windows/System32`, and `C:/Windows`. Do not mutate the user's persistent environment or an `.env` file. If using `Start-Process`, use `-WindowStyle Hidden`. Read both redirected streams asynchronously to avoid buffer deadlock; preserve logs even on failure.
4. Set these **child-only** values for both build and start, overriding any dotenv fallback. Demo code explicitly constructs fake Mongo/MockProvider; URL/key overrides add containment and are not a claim of a real service connection:

   | Variable | Value |
   | --- | --- |
   | `VC_WEB_MODE` | `demo` |
   | `VC_LLM_PROVIDER`, `VC_LLM_MODEL` | `mock`, `mock` |
   | `VC_LLM_MODELS` | empty |
   | `MONGODB_URL` | `mongodb://127.0.0.1:1/virtual_counsellor?directConnection=true&serverSelectionTimeoutMS=100` |
   | `VC_LLM_BASE_URL`, `VC_KB_BASE_URL` | `http://127.0.0.1:1` |
   | `GEMINI_API_KEY`, `VC_LLM_API_KEY`, `VC_KB_API_KEY` | `synthetic-disabled` |
   | `VC_WEBHOOK_DESTINATION_URL`, `VC_WEBHOOK_SECRET` | empty |
   | `LANGFUSE_BASE_URL`, `LANGFUSE_HOST` | `http://127.0.0.1:1` |
   | `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY` | empty (tracing config disabled) |
   | `TELEMETRY_ENABLED`, `DO_NOT_TRACK` | `false`, `1` |
   | `NEXT_TELEMETRY_DISABLED` | `1` |
   | `VC_SKILLS_DIR` | `D:/vc/skills` |
   | `VC_JWT_JWKS_URL`, `VC_JWT_PUBLIC_KEY`, `VC_JWT_HS256_SECRET` | empty; no real issuer used |
   | `VC_AUDIT_HMAC_KEY`, `VC_ERASURE_APPROVER_EMAIL` | empty; no email/approver action |
   | `VC_ERASURE_AUTO_DELETE` | `false` |

5. Run a single serialized final build, cwd `D:/vc/apps/web`, using the installed runtime, through the existing mutex. Pass arguments as an argument list; do not construct interpolated shell code:

   ```text
   executable: C:/Program Files/Git/bin/bash.exe
   args: D:/vc/scripts/vc-testlock.sh
         C:/Program Files/nodejs/node.exe
         D:/vc/apps/web/node_modules/next/dist/bin/next
         build --webpack
   ```

   Preserve the actual command, stdout/stderr and terminal exit code. Build failure gates browser acceptance; never infer success from a log footer. Do not run build and a dev/start server concurrently. Generated `.next`/type artifacts are runtime outputs, not product source edits. Record any generated changes and leave peer files intact.
6. After build exit 0, start the built reference server in the **same containment environment**, cwd `D:/vc/apps/web`, again through the normal mutex:

   ```text
   executable: C:/Program Files/Git/bin/bash.exe
   args: D:/vc/scripts/vc-testlock.sh
         C:/Program Files/nodejs/node.exe
         D:/vc/apps/web/node_modules/next/dist/bin/next
         start --hostname 127.0.0.1 --port 3108
   ```

   Record the owned wrapper PID/start time, descendants and actual listener PID/start time. Hold the lane while the browser runs. Check readiness in bounded windows; keep the user informed. A failed `/` request may expose demo initialization failure even if a socket is listening, so require HTTP 200 and the actual home screen. Never call POST `/api/sessions` as a readiness probe: that would consume the one-time failure. Do not use the legacy browser evidence scripts: they launch additional servers, choose other ports, do not supply this containment recipe and do not execute this exact four-fact mixed flow.
7. Open a **visible** browser tab at `http://localhost:3108`; use the current supported browser tool's documented API. Load its documentation first. The previously inspected `built-in-browser` skill describes a legacy bridge and cannot determine current CUA capabilities; do not use its old tool names or infer localhost availability from it. If the enabled browser cannot reach this host, record BLOCKED-CAPABILITY; an invisible/headless script is not replacement evidence for this visible milestone. No CUA was called during preparation.
8. Keep this single server process alive and source frozen for the entire Retry/approval/reload sequence. Restarting resets the fake DB and the once-failing provider. If a restart or source change occurs, discard the run identity and begin a new explicitly identified run; do not splice screenshots/readbacks across runtimes.
9. In a `finally` cleanup, terminate only the owned Next node process after rechecking its PID **and start time** and ancestry under the recorded launcher. Let its waiting `vc-testlock.sh` wrapper exit naturally and run the normal release trap. Do not force-kill a wrapper before its child exits or recursively terminate a tree containing unverified descendants. Capture actual child/wrapper termination and stdout/stderr. Confirm port 3108 is no longer listening and the normal mutex has released. AccessDenied/unconfirmed termination is a cleanup blocker; preserve owner evidence, stop new heavy work and do not delete the lock. Never kill unrelated Node/browser processes. Leave the user's visible browser tab available unless its closure was requested.

## Visible flow and exact assertions

Use role/name locators after inspecting the actual DOM. CSS/test IDs below are documented fallbacks and assertions, not permission to click a guessed element. Capture each visited screen, state, visible labels and relevant accessibility attributes. Tab/focus checks are observations; do not claim complete WCAG compliance.

| Step | Visible action / exact selector | Required observed result |
| --- | --- | --- |
| Home | Heading `Session approval`; link `Start a new session` (`[data-testid="new-session-link"]`) | Local demo home loads; three existing seeded thread links do not substitute for the new-session flow. |
| New session | Click that link to `/sessions/new`; heading `New session`; `[data-testid="new-session-student"]` | Student exactly `demo-student-4`; heading `Session transcript`; `[data-testid="new-session-turns"]` has five body rows `t1`–`t5`; table header `What was said`. Save DOM transcript before submit. |
| First submit | Button `Submit for scribe review` (`[data-testid="submit-session"]`) | Capture actual POST `/api/sessions` request bytes and response status **503**, JSON `state="ai_unavailable"`. Capture original sessionId and all request fields; `studentId` matches. Error JSON contains no transcript quote/key/secret. |
| Failure screen | `[data-state="ai_unavailable"][role="alert"]`; button `Retry` (`[data-testid="retry-session"]`) | Exact visible text `AI is unavailable right now`, `Sorry for the trouble`, `Nothing you typed is lost`; transcript still identical. No stack trace, model IDs or provider jargon is shown. A timeout-only screen does not prove the required provider503. Readback has facts `[]`, claims `0`, decisions `[]`; save complete snapshot without inventing a sessions count. |
| SAME Retry | Click `Retry` once, **without reload, navigation or retyping** | Capture second POST body; exact byte equality to first body (not merely matching sessionId). Response HTTP 200, `state="started"`, same sessionId, threadId `scribe:<sessionId>`. `[data-state="started"][role="status"]` shows `Session submitted`. |
| Open approval | Link `Open the approval screen` (`[data-testid="session-thread-link"]`) | Link URL `/approvals/<encoded threadId>`; heading `Session approval`; `[data-testid="thread-id"]` equals returned threadId; `[data-state="awaiting_approval"]` visible. Save initial GET proposal and complete readback. Facts `[]`, claims `0`, decisions `[]` before counsellor submission. |
| Proposals | Heading `Proposed profile changes`; `article[data-fact-key]` | Exactly `targetCountry`, `intendedMajor`, `preferredIntake`, `budget_inr_per_year` proposed. Values respectively Canada, computer science, September 2027, 2000000. Each has Evidence quote/Turn and confidence/sensitivity. Dropped table records uncited `scholarshipNeed` and fabricated-citation `parentOccupation`; neither is a proposal or stored fact. Heading `Draft session summary` contains actual nonempty synthetic draft. |
| Mixed choice 1 | Radio group `Decision targetCountry`, radio `Approve` (`[data-fact="targetCountry"][data-decision="approve"]`) | Selected radio has `aria-checked="true"`; approved value/source saved from proposal for final exact readback. |
| Mixed choice 2 | Group `Decision intendedMajor`, radio `Reject` | Reject selected; scoped textbox `Reason (optional)` (`[data-reason-for="intendedMajor"]`) appears. Type `still undecided after Retry`. Counter `#reason-count-intendedMajor` is referenced by input `aria-describedby`, has `aria-live="polite"`, shows `Characters left` and `27/500`, `data-at-limit="false"`. The wording labels a used/max count; record any clarity finding rather than silently renaming it. |
| Other choices | Groups `Decision preferredIntake`, `Decision budget_inr_per_year`, radio `Reject` in each | Reject both; leave their optional reason boxes blank. `[data-testid="decided-count"]` becomes `4/4`; choosing all facts alone still cannot submit until the summary is decided. |
| Withhold summary | Group `Draft session summary`, radio `Withhold` (`[data-summary="withhold"]`) | `aria-checked="true"`; `Submit decisions` now enabled. Draft is proposal-only and has not entered the student model. |
| Submit decisions | Button `Submit decisions` (`[data-testid="submit"]`) | Exactly one POST to the encoded `/api/approvals/<threadId>`; HTTP 200, `state="done"`, result status `written`, `summaryDecision="withhold"`. Body contains all four explicit decisions; only intendedMajor has the typed reason, blank reasons are omitted. |
| Resolved | `[data-state="done"][role="status"]` | `Resolved`; Outcome (`[data-testid="outcome"]`) `written`; heading `Written facts`; one row `[data-written-key="targetCountry"]` with Canada; no written rows for rejected/dropped facts; `[data-summary-decision="withhold"]` text `Summary withheld`. No pending Submit form remains. |
| In-app reload | Button `Reload` in the resolved state | Actual GET of same approval URL reconstructs same resolved JSON, same written fact and withholding label; complete readback unchanged. |
| Browser reload | Reload the actual approval page **three times**, waiting for each settled screen | Same URL/thread, same resolved view and full readback after each. Browser reload is separate from clicking `Reload`; no POSTs occur during either type of reload, no duplicate claim/audit/session/fact write. |

The reason string is 27 characters. All roles are exact: choice controls are `role="radio"` buttons within named `radiogroup`s, not ordinary `button` role locators. The reason input's label can be scoped to `article[data-fact-key="intendedMajor"]` to avoid ambiguity. Submission controls are actual buttons; the thread navigation is an anchor/link. The resolved banner has `role="status"`; the initial AI failure has `role="alert"`.

## Readback oracle and durable artifacts

Fetch only local demo readback `/api/demo/readback?studentId=demo-student-4` through the documented browser network/inspection capability or a bounded local HTTP read. Save response JSON in its original form before assertion; parsing/reordering for comparison is allowed, replacing it with an expected fixture is not. Observe network bodies through supported tooling; do not intercept/mock requests or invoke React handlers directly. If browser tooling cannot expose body bytes, record that exact SAME-byte assertion as unproved rather than claiming it from static source or the separate API test.

After approval require the **complete** readback:

- `studentId` exactly `demo-student-4`.
- Exactly one fact overall: `{key:"targetCountry", value:"Canada", active:true, source:<exact original targetCountry source>}`. Source is transcript with quote `computer science in Canada`, turnId `t1`; no fabricated edit provenance. Rejected and dropped keys absent, including retired rows.
- `claims` exactly 1.
- Exactly one session with the captured generated sessionId; `summary` exactly empty string; `summaryWithheldReason` exactly `withheld by the counsellor at approval`. Record the actual presence/value of `summaryApprovedAt`; do not claim it is absent without inspecting the result.
- Exactly one rejection audit, its threadId equals captured threadId; `rejected` contains exactly intendedMajor with reason `still undecided after Retry`, preferredIntake without a reason property and budget_inr_per_year without a reason property. Preserve actual order/timestamp in the saved oracle. Compare the key set and exact expected optional reasons, not only an array length.
- Resolved GET `decision.edits` contains exactly targetCountry and the original source; summaryDecision exactly withhold. Compare the complete settled GET JSON and complete readback against the saved post-submit snapshots after in-app Reload and each of three actual browser reloads, including timestamps, counts, source content and optional fields. Any mismatch is a finding.

The public reference routes and projected readback must not expose internal authority. Record structural/nested internal grant incarnation, session generation, opening capability, creation attempt/ownership, lease token or private proof/root/commitment material if encountered; never copy such raw authority into a public report. Preserve bounded private diagnostic evidence under the checker's established handling rules. This projection observation is only the reference UI boundary; B23.6's actual signed API/export oracle and B23.7's prepare/open/close, erasure/regrant, late-driver and semantic mutation proofs remain separately required.

Minimum eventual artifact inventory (use a new run-qualified evidence prefix beneath the assigned cycle2 directory; do not overwrite historical failures): build command/output/actual exit; sanitized environment manifest containing only known synthetic values; source hash/run identity; launcher/listener PID+start-time ownership; server stdout/stderr; per-screen DOM and screenshots; first and retry POST request/response plus explicit byte-equality assertion; pending/resolved approval JSON; failure/pending/post-submit/post-in-app-reload/three-post-browser-reload full readbacks; approval POST body/result; browser console/page-error/network observations; persona findings and per-row scenario accounting; cleanup terminal and current lock/listener absence. Artifacts are proposed here, not created by this preparation task.

The intended 503 can cause a normal browser failed-resource console message. Record it with its matching response; it must not be hidden, and it must not be confused with a JavaScript exception, an unexpected failed route or a server500. Screenshots alone do not prove status, identical request bytes or persisted graph writes.

## B17/B19 accounting and verdict boundary

The visible English flow supports scoped usability observations for `gaurav-pm`, `jaipur-counsellor` and `school-counsellor`; a persona is covered only when its own screen walk/findings were actually recorded. Do not infer a policy persona PASS from a Canada fact or an English-only Hindi persona PASS from a clean screen. Sapna's missing reference rubric remains NOT-YET-MEASURABLE. Gaurav-bhaiya/Hindi/voice and govt-teacher Hindi-first completion are not delivered by this run; if assessed, record the actual blocking screen/severity under B17, never suppress a high finding to allow PASS.

For B19, enumerate every actual row in `qa/scenarios/counselling-engine.csv` at the final run (current source has SC-001 through SC-057). Record each as `pass`, `fail` or `skip(<specific reason>)`, with artifact/step evidence for any pass. This recipe has no execution credit. Its four-fact case is not SC-002's five-proposed-fact case; failure/Retry is not the separate rules-provider path; byte-identical reload is not authenticated lifecycle coverage. Relevant rejection/unedited-provenance/withhold/error observations may support exact rows only when their full row expectations are reached. All unrun language, policy, live-card, authenticated API, webhook, erasure and other cases stay explicit skips for this scoped browser milestone. Report `SCENARIOS: <actually passed>/<actual total>`; no new product inventory or acceptance review is authored here.

Final handback must distinguish: proposed recipe; prerequisites satisfied; build exit; browser outcomes; independent checker verdict; cleanup confirmed. Even a successful local English run does not turn cycle2 into PASS, merge, push, release, live Pathlynks or full-goal completion.

## Read-only readiness refresh — current D058/D059/D060 wave

Status remains PREPARATION ONLY. This append corrects one launch assumption and verifies installed command declarations; no executable below was launched, no environment secret values were inspected, and no browser/acceptance evidence was generated. This append does not review or approve the source candidate.

### Freeze identity correction

The manifest's current `Checked state` explicitly identifies `d057-candidate-scopefix1.json` (26 paths; file SHA256 `F1BBF801A864C3F6A22D12559E9A7C132C392D3C4F5FDC8186B6BDE0642607CC`) as **historical pre-D058**. D058 and the active D059/D060 wave invalidate it as a whole current freeze. A later complete final freeze is required before build/browser, even though the two unchanged web inputs still match that historical snapshot:

| Existing input | Current raw SHA256 verified read-only | Scope of comparison |
| --- | --- | --- |
| `apps/web/demo/seed.ts` | `ABCF55EAAB452E0DA6FADC65630456ADC5EC9760C941DDC8BD05EB7D4A727026` | Exact equality to this historical manifest entry only |
| `apps/web/tests/session-api.test.ts` | `07B008F501314CB40EEAA3C464416D3BE9267B019C2302B2ECACB996FB1ABB0A` | Exact equality to this historical manifest entry only |

These two matches neither certify the other 24 paths nor imply current whole-feature readiness. Graph/DB privacy and settlement changes are loaded by the reference runtime; the final browser gate must use the coordinator's actual later complete freeze and terminal prerequisite evidence. Do not rerun browser while source builders remain active.

### Exact minimal launch correction

The earlier step 3 trusted PATH was incomplete: `vc-testlock.sh:152` and `:379` invoke bare `powershell` for process start-time and RAM checks. `C:/Windows/System32` alone does not include that executable. Replace the earlier PATH instruction with this explicit child-only PATH:

```text
C:\Program Files\nodejs;C:\Program Files\Git\usr\bin;C:\Program Files\Git\bin;C:\Windows\System32\WindowsPowerShell\v1.0;C:\Windows\System32;C:\Windows
```

Read-only filesystem inspection confirms these exact required files exist: `C:/Program Files/nodejs/node.exe`, `C:/Program Files/Git/bin/bash.exe`, `C:/Windows/System32/WindowsPowerShell/v1.0/powershell.exe`, `D:/vc/scripts/vc-testlock.sh`, `D:/vc/apps/web/node_modules/next/dist/bin/next`. Presence is not an executed runtime/version result. Record actual runtime versions during the final gate. Installed Next's launcher declares Node `>=20.9.0`.

Retain all earlier environment containment, and explicitly set child `NODE_ENV=production` for build and built-server start. Do not inherit `NODE_OPTIONS`, `NODE_PATH`, arbitrary provider credentials, debugging preload options or a user-defined `VC_TESTLOCK_DIR`. Keep the normal mutex defaults and the Windows/runtime variable whitelist. `CreateNoWindow=true` with `UseShellExecute=false` is the hidden launch setting for ProcessStartInfo; if another launcher uses Start-Process, its equivalent requirement is `-WindowStyle Hidden`.

The exact final two-command sequence remains valid by inspection of **installed** `next/dist/bin/next:109` and `:181`, rather than assumed script names. Supply each argument separately through ProcessStartInfo.ArgumentList, working directory `D:/vc/apps/web`:

```text
BUILD, after current feature gate authorizes the single final build:
FileName = C:/Program Files/Git/bin/bash.exe
ArgumentList = [ D:/vc/scripts/vc-testlock.sh,
                 C:/Program Files/nodejs/node.exe,
                 D:/vc/apps/web/node_modules/next/dist/bin/next,
                 build, --webpack ]

START, only after that build's actual exit 0:
FileName = C:/Program Files/Git/bin/bash.exe
ArgumentList = [ D:/vc/scripts/vc-testlock.sh,
                 C:/Program Files/nodejs/node.exe,
                 D:/vc/apps/web/node_modules/next/dist/bin/next,
                 start, --hostname, 127.0.0.1, --port, 3108 ]
```

`apps/web/package.json` has `build`, `dev` and `demo`; it has **no `start` script**. Do not issue `pnpm --filter @vc/web start`. The explicit installed Next `start` CLI is the built-server entrypoint. Its `--hostname` is necessary: installed default is `0.0.0.0`, while this gate binds only loopback. Port defaults to 3000/`PORT` unless passed, so always pass 3108. Do not add `--webpack` to `start` (it is a build/dev option); do not use Turbopack for this workspace's `.js`→`.ts` aliasing. Do not repeat an unchanged successful final build merely because this recipe was refreshed.

The primary visible URL is `http://localhost:3108`. Record its actual successful resolution and origin. If this host resolves localhost exclusively to IPv6 and cannot reach the deliberately IPv4-bound listener, record that observed connection failure and use the equivalent explicit loopback URL `http://127.0.0.1:3108` with one consistent origin for the entire new-session/Retry sequence; do not treat an untested URL as reachable or expose the server on all interfaces to solve it.

### Refreshed real result oracles

The demo/UI/tests are unchanged in the refreshed reads. Only GET `/` and local demo GET readback are suitable readiness/baseline operations; no synthetic submit may precede the visible first click. The UI still has five turns and four proposals; the two-turn test still has two proposals. Actual synthetic metadata is `vc-synthetic-demo`, four seeded consent grants with distinct random incarnations, source turns `t1`–`t5`, and the new-session student is precisely `demo-student-4`. The old `demo-student-3` crashed-claim seed is unrelated to the new student's approval claim; never count it as a new-student write.

For the required provider-style failure, `FlakyOnceProvider` declares the error metadata `attempts=10` and `modelsAttempted=["fast-cheap","balanced","smart-coding"]`; these are canned **synthetic error metadata**, not evidence of ten network calls or three real providers. Its first request throws before delegating, and the next request uses MockProvider. The JSON may legitimately contain those model-name fields; the visible alert must not render them. No API credential/transcript content may leak. Preserve the exact actual 503 response and original POST bytes; a client AbortError or static expected error fixture cannot replace that evidence.

The final four-fact browser decision remains approve `targetCountry`; reject `intendedMajor` with the exact 27-character reason; reject `preferredIntake` and `budget_inr_per_year` without reasons; choose summary `withhold`. A `written` badge alone does not pass: require one exact cited Canada fact, one session with empty summary and the defined counsellor-withheld reason, one claim, one complete three-key reject audit, and unchanged complete GET/readback after in-app Reload and three true browser reloads. The test's two-key case cannot supply the browser's three-key reject audit expectation. No runtime result for this schedule is claimed by this refresh.

The normal mutex wrapper's inspected bottom-level control flow is `"$@"` → collect status → exit, with `release` on EXIT; it does **not** replace itself with exec. Therefore the earlier cleanup recipe remains concrete: after fresh PID/start-time/ancestry checks stop only the owned Next child, let the waiting wrapper return and release its lock, then confirm child/wrapper terminal, listener absent and mutex released. Never infer cleanup from process output or stale prior ownership JSON.
