# Partner integration guide

Put the Virtual Counsellor on your site with one script tag, or call the same API from your own backend. The machine-readable contract is `GET https://VC_HOST/v1/partner/openapi.json` (OpenAPI 3.1, no key needed). Replace `VC_HOST` below with the host Vidysea gives you.

## Your two keys

Vidysea ops registers you and prints two keys, once each:

| Key | Looks like | Where it lives | What it opens |
|---|---|---|---|
| Page key | `vck_pub_<id>_<43 chars>` | In your public HTML. | Only `POST /v1/public/chat/turns`, sent as header `X-VC-Key`, and from a browser only from your registered origins. |
| Server key | `vck_srv_<id>_<43 chars>` | Only on your backend. **Never in a browser, an app bundle or a repo.** | Only the student chat routes, sent as `Authorization: Bearer`. |

A key used on the wrong route, a wrong, unknown, revoked or replaced key, and a page key sent from a foreign origin all get the same `401`.

## 1. Widget, key mode (public site, anonymous visitors)

```html
<script src="https://VC_HOST/widget/vc-widget.v1.js" data-vc-key="vck_pub_acme_..." defer></script>
```

Optional: `data-vc-title`, `data-vc-color` (`#rrggbb`), `data-vc-api` (API origin, default the script's origin). Your page origin must be on your registered origin list, or the widget shows "chat unavailable".

## 2. Widget, proxy mode (logged-in students)

```html
<script src="https://VC_HOST/widget/vc-widget.v1.js" data-vc-proxy="/api/vc" defer></script>
```

The widget posts `{"text": "..."}` to `/api/vc` on your site and sends no key. Your backend adds the server key and the student headers and forwards to VC (the answer is then personalised to the student's profile). Headers on every student call:

- `X-VC-Student-Id`: your student's id; must equal the `{studentId}` in the path (otherwise `404`).
- `X-VC-Student-Age`: whole years. Missing or invalid means the student is treated as a minor.
- `X-VC-Guardian-Consent`: `true` only when you hold a guardian's consent; a minor without it gets no stored text.

### Node/Express proxy (the server key stays here)

```js
import express from "express";
const VC = "https://VC_HOST", KEY = process.env.VC_SERVER_KEY; // vck_srv_...
const threads = new Map(); // studentId -> threadId; keep this in your database in production
async function vc(path, s, body) {
  const headers = { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json", "X-VC-Student-Id": s.id, "X-VC-Guardian-Consent": String(s.guardian === true) };
  if (Number.isInteger(s.age)) headers["X-VC-Student-Age"] = String(s.age);
  return fetch(`${VC}/v1/students/${encodeURIComponent(s.id)}/chat/${path}`, { method: "POST", headers, body: JSON.stringify(body ?? {}) });
}
const app = express();
app.post("/api/vc", express.json({ limit: "64kb" }), requireLogin, async (req, res) => { // requireLogin sets req.student = { id, age, guardian }
  const s = req.student;
  if (!threads.has(s.id)) threads.set(s.id, (await (await vc("threads", s)).json()).threadId);
  const r = await vc(`threads/${threads.get(s.id)}/turns`, s, { text: req.body.text });
  if (r.headers.get("retry-after")) res.set("Retry-After", r.headers.get("retry-after")); // the widget shows "please wait N s"
  res.status(r.status).json(await r.json());
});
app.listen(3000);
```

## 3. curl

Page key (anonymous; `Origin` is what a browser sends, and is checked when present):

```sh
curl -sS https://VC_HOST/v1/public/chat/turns \
  -H "X-VC-Key: vck_pub_acme_..." -H "Origin: https://www.acme.example" \
  -H "Content-Type: application/json" -d '{"text":"What can I study after 12th with maths?"}'
```

Server key (one of your students; start a thread, then send turns):

```sh
H=(-H "Authorization: Bearer vck_srv_acme_..." -H "X-VC-Student-Id: stu-42" -H "X-VC-Student-Age: 17" -H "X-VC-Guardian-Consent: true" -H "Content-Type: application/json")
curl -sS -X POST "${H[@]}" https://VC_HOST/v1/students/stu-42/chat/threads                       # {"threadId":"..."}
curl -sS -X POST "${H[@]}" https://VC_HOST/v1/students/stu-42/chat/threads/THREAD_ID/turns -d '{"text":"Which colleges suit me?"}'
```

The answer carries `state`, `message`, `claims` (each `verified`, `attributed` or `unverified`) and `sources`. Other student routes: `GET .../chat/threads/{threadId}`, `GET .../chat/profile`, `POST .../chat/profile/facts/{factId}/decision`. Voice sessions are coming with pc-voice and are not part of this guide yet.

## 4. Add, rotate, revoke (Vidysea ops, on the VC server)

```sh
pnpm -C apps/api partner add "Acme" --id acme --origin https://www.acme.example   # prints page key and server key once
pnpm -C apps/api partner rotate acme --scope pub     # new page key; --scope srv for the server key; the other key is unchanged
pnpm -C apps/api partner revoke acme                 # both keys stop working
pnpm -C apps/api partner list                        # status and key prefixes, never a key
```

A partner id is lower-case letters, digits and hyphens (2 to 32). It is also the tenant id of everything your server key reaches, so `add` refuses an id that is, or looks like, an existing tenant: `sandbox`, `admin`, `system`, `root`, `default` or `internal` alone or followed by a separator and suffix (`sandbox-1`, `admin_2`), any tenant id listed in `VC_RESERVED_TENANT_IDS` (list every `tenant` your student JWTs carry; **an empty list protects only the built-in names and the repo's own tenants**, and `add` and `list` warn on stderr when it is empty), and the repo's own demo and evaluation tenants. The running server applies the same rule to every key, so an older partner record with such an id gets the plain `401` too, and `rotate` on such a partner refuses without minting a key (`revoke` still works). Run `pnpm -C apps/api partner list --check` before deploying a new list: it marks each partner whose id is now reserved and exits 1 if any active partner is flagged. A listed tenant matches by its exact id only (only the built-in names have a suffix family), so listing `pathlynks` does not refuse a partner `pathlynks-2`, which reaches only its own tenant `pathlynks-2`.

If a partner's own id is also a real JWT tenant (for example `pathlynks`), the operator binds it explicitly with `VC_PARTNER_OWN_TENANTS=pathlynks:pathlynks`: that exact partner is then not blocked by the list. A partner key reaches only the tenant named by its own id, so the two halves must be equal; any other partner whose id equals or looks like that tenant is still refused, and the built-in names, the repo's tenants and the sandbox tenant can never be bound.

Only a hash is stored, so a lost key cannot be shown again: rotate it. A rotate or revoke reaches a running server within 60 seconds. If two rotates of the same key overlap, only the first takes effect: the other fails with "rotated concurrently, run again" and prints no key. Any other unexpected CLI failure prints only the error class and code, never the driver's message (it can quote the connection string). Origins are `https://host[:port]` (or `http://localhost[:port]`); no path and no wildcard.

## 5. Limits and errors

| Route | Limit (per minute) | Over the limit |
|---|---|---|
| Public turn (page key) | 10 per partner and client | `429` with `Retry-After` seconds |
| Student routes (server key) | 30 per partner's student | `429` with `Retry-After` seconds |

### Anonymous voice caps

The page key's voice session is capped per visitor (`maxActivePerClient`, default 2) and per partner (`maxActivePerPartner`, default 50) in the API's voice configuration. At capacity the session request answers `429 {"error":"voice_busy"}` with `Retry-After`: busy, try again shortly, and the widget says so. Set `0` to turn anonymous voice off for that visitor or partner: the session request then answers `403 {"error":"voice_unavailable"}` (no `Retry-After`, it is not transient) and the widget tells the visitor that voice is not available here and to type. A negative or invalid value falls back to the default; it never switches the cap off.

Bodies over 64 KiB get `413`. `400` is a malformed body or student header, `404` an unknown thread or a student that is not yours, `409` a turn still in progress or a student under erasure, `503` a temporary store failure (retry). Always wait the `Retry-After` and retry; do not loop.

## 6. Crisis behaviour

If a message shows signs of crisis, VC does not run a normal answer: it returns state `escalated` with the fixed crisis message, which names Tele-MANAS 14416 (also 1800-891-4416) and says to call 112 in immediate danger. A crisis message is never rate limited on the public route. The widget shows it as a crisis block and always shows "14416 / 112" in its footer. If you build your own UI, show the `message` of an `escalated` or `concern` turn unchanged and keep a 14416 / 112 footer on every screen.

## Never

- Never put the server key in a browser, a mobile app, a public repo or a log. If it leaks, rotate it at once.
- Never send student data in the page-key (anonymous) call; it is for generic questions and stores nothing.
- Never trust a browser for the student id or age: your backend sets them from your own session.

## Vidysea handover received — 2026-10-27

Source: https://docs.google.com/document/d/1oZU5yV8N_4qOXlObQ9ZKhd22du7V-K1w/edit . Connection values below are non-secret metadata; passwords and database URIs are deliberately absent. This is an integration inventory, not a claim that Vidysea is connected or deployed.

| Existing component | Production source | Verified reuse point |
|---|---|---|
| Gateway backend | `vidysea-admin/vidysea-main-service-backend`, branch `prod` | Python/FastAPI + SQLAlchemy; existing authentication, users, student shortlist and conversation routes. `app/models/user.py` defines users/user_sessions/user_preferences; use server-verified ownership. |
| AI/ML engine | `vidysea-admin/furtherstudies-aiml-engine`, branch `prod` | Existing Python service; `dbfunc.py` uses MongoDB, `main.py` provides `/health`, existing university/programme and compare APIs should be reused after their contracts are mapped. |
| Student UI | `vidysea-admin/vidysea-user-frontend`, branch `prod` | Next16/React19; existing course/university compare, shortlisted-programme and auth flows. This is the future host for the existing central widget/API, not another counsellor implementation. |
| Admin UI | `vidysea-admin/vidysea-admin-frontend`, branch `prod` | Next16/React19; keep this platform admin separate from VC's existing control console. |
| Sanity CMS | user frontend `prod/src/sanity` | Integration source provided; standalone Studio repository/branch are still placeholders in the handover. |

Gateway Postgres: host `vidysea-prod-ecs.clk264aaira9.ap-south-1.rds.amazonaws.com`, port5432, database `vidyseaprodecs`, SSL enabled. AI/ML Mongo database: `Vanced_new`. AI/ML deployment names for gateway credentials are `PROD_NEW_GATEWAY_DB_HOST`, `PROD_NEW_GATEWAY_DB_USER`, `PROD_NEW_GATEWAY_DB_PASSWORD`, `PROD_NEW_GATEWAY_DB_NAME`. These describe another service's environment; do not replace VC's own `MONGODB_URL`/`virtual_counsellor` database with the Vidysea application database.

Pre-S12 runtime limits to preserve: `config/sources.json` was a single-site bootstrap; its Postgres credential refs are Pathlynks-bound and its student-data adapter explicitly targets `pathlynks-db`. Adding Vidysea records under the Pathlynks site, relabelling its password as a Pathlynks credential, or supplying an API key alone would not create a correct personalized Vidysea connection. Admin already supports per-site source records and encrypted credentials. Reuse those surfaces; prepare the explicit Vidysea ownership/schema/API mapping before enabling personal reads. No Vidysea production data was queried or changed in this inventory pass.

The supplied Virtual Counsellor tab `t.bo52uq822dd2` is a Living Knowledge Base task/architecture snapshot. It names the existing `D:/KnowledgeBase` and `POST /ask`; it supplies no deployed KB base URL or integration key. Keep the existing VC KB client and request contract; do not treat historical task PASS labels in that document as current live-connection evidence.

### S12 isolated local adapter contract

The version1 bootstrap now carries paired optional `siteId` / `platform` on each source. Legacy records without both retain the top-level site and Pathlynks meaning. Explicit Vidysea records use platform `vidysea`; credential names are `VIDYSEA_DB_*` only. Runtime callers must resolve the authenticated tenant to exactly one enabled Postgres source, then bind kind, exact site, source id, destination and ref against the trusted bootstrap before any environment lookup. Unknown tenants, ambiguous sources and disabled sources have no default personal adapter. Mutable Admin source destination/platform/site changes must reject or clear and re-provision encrypted credentials; a secret cannot silently travel with a retargeted source. Root owns that store/Admin and text/voice integration.

The Vidysea seed is disabled and its role `UNPROVISIONED_READONLY_ROLE` is an explicit placeholder, not a discovered database user. The team must supply a readonly role, password and official CA configuration before enabling it. This changes no production configuration and initiates no connection. The nonsecret host/database match the handover above; no deployment or live schema parity is claimed.

The existing `@vc/mcp-pathlynks` barrel exports `createVidyseaPort` with native labelled profile, shortlisted programmes and saved AI profile classifications. Each SELECT joins active/nondisabled users through `students.id = users.id`, excludes deleted students/shortlist rows, binds the verified student UUID as `$1`, and caps output before materialization (profile/classification1, shortlist51 to detect a50-row truncation; preference arrays20 bounded string excerpts). Stored shortlist decisions are labelled `stored_student_decision`, not asserted to be the latest UI round. Assessment classifications are not psychometric completion or career ranking. Comparison selection is explicitly unavailable because the proven selection store is browser-local. No shortlist GET/self-healing endpoint, other Mongo database, raw assessment JSON or contact/document columns are used.

The shared SQL runner retains TLS verification, bounded connection/query deadlines, SELECT-only fixed read models, read-only sessions and fail-closed write-privilege checks. Vidysea never inherits `PATHLYNKS_ALLOW_PRIVILEGED_ROLE`. Existing Pathlynks SQL/table joins and its explicitly approved G1 behavior are preserved.

### S13 release configuration — preparation, not deployment approval

Pathlynks's production workflow targets `pathlynks.vidysea.com` from `production_frontend`; pushing that branch triggers deployment. Both local Vidysea `prod` buildspecs name UAT ECR repositories, so DevOps must resolve the actual CodePipeline/ECS service and immutable image digest before rollout. The central VC API/Admin origin remains unresolved: `VC_HOST` and `vc.example.org` are placeholders. The two `/autotesting` links resolve to AutoTester sign-in and do not identify a VC endpoint.

The two host backends authenticate their existing user, derive student/eligibility server-side, and forward the per-site server key. Pathlynks uses `VC_QUEST_ENABLED`, `VC_BASE_URL`, `VC_PARTNER_SERVER_KEY`; Vidysea uses `VC_STUDENT_CENTRAL_ENABLED`, `VC_BASE_URL`, `VC_PARTNER_SERVER_KEY`. Provision each site independently; a page key alone is anonymous access. Keep central VC persistence in `virtual_counsellor`, and use provisioned read-only roles and verified CA certificates for both host Postgres sources. Consent/test identities remain team-provisioned.

Build the host images with public asset settings, not runtime-only environment injection:

- Pathlynks: repository variable/build argument `NEXT_PUBLIC_VC_WIDGET_BASE_URL=https://<confirmed-vc-origin>/widget/releases/<reviewed-40-character-commit>`.
- Vidysea: CodeBuild variable/build argument `NEXT_PUBLIC_VC_WIDGET_SCRIPT_URL=https://<confirmed-vc-origin>/widget/releases/<reviewed-40-character-commit>/vc-widget.v1.js`.
- Place the reviewed `apps/widget/src/vc-widget.js` in that release directory as `vc-widget.js` and `vc-widget.v1.js`, and reviewed `voice.js` as `vc-widget-voice.v1.js`. These are deployment artifacts from the same source revision. Record their SHA256 values; never overwrite a released directory. The voice loader resolves beside its widget. Existing immutable v1 URLs must not be reused for changed bytes.
- Vidysea's built headers allow that configured script origin and microphone permission on `/student/*`; other routes retain their existing microphone denial. Verify the final CDN/reverse-proxy headers too.

Voice requires explicit `VC_VOICE_MODEL` plus the existing provider/WS/crisis settings in `.env.example`. The paid allowance is exhausted. No new model fallback, paid probe or production enablement is authorized by these instructions. A separate reviewed, bounded synthetic probe must prove the exact question, authoritative finalized speech, and scoped DB readback; generated acknowledgement alone proves none of them. The optional transcription `finished` flag is documented by the SDK, but runtime emission still needs verification for the configured model.

Deploy only after independent acceptance and explicit approval. Record reviewed and pushed SHAs for central VC and both host repos, resulting image digests, actual origins and asset hashes. Verify API health/auth and Admin roles; then both actual signed-in pages: personalized source-backed answer, memory confirm/reject/correct/forget, history/new session, Chat/Voice controls, move/resize/input focus, microphone permission/reconnect, logout and account/tenant isolation. Keep fixture, real-provider and live-data evidence distinct. Rollback restores the previous central/host image digests and their prior asset directory/settings together; it does not roll back or copy student databases. An older runtime that cannot interpret S13 publication metadata is not a safe storage rollback target.
