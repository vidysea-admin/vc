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
