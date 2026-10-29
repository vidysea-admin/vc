# VC chat widget (pc-widget)

One script tag puts a chatbot bubble on any page. Plain JavaScript, no dependencies, no build step. The UI lives in a shadow DOM so no CSS leaks either way. The conversation is kept in memory only (no localStorage, sessionStorage or cookies).

## Embed

Key mode (the page talks to VC directly; the key is a public, per-partner, origin-locked key):

    <script src="https://VC_HOST/widget/vc-widget.v1.js" data-vc-key="vck_..." defer></script>

Proxy mode (Pathlynks and any host with a backend; the host backend adds the key and student headers and forwards to VC):

    <script src="https://VC_HOST/widget/vc-widget.v1.js" data-vc-proxy="/api/vc" defer></script>

Authenticated proxy voice is an explicit opt-in; the mint path must be on the embedding page's origin:

    <script src="https://VC_HOST/widget/vc-widget.v1.js" data-vc-proxy="/api/vc" data-vc-voice="on" data-vc-voice-proxy="/api/pathlynks-quest/ai/voice/session" defer></script>

| Attribute | Meaning |
|---|---|
| `data-vc-key` | Partner key. Sent as `X-VC-Key` to `<api>/v1/public/chat/turns`. Ignored when `data-vc-proxy` is set. |
| `data-vc-api` | API origin. Default: the origin the script was loaded from. |
| `data-vc-proxy` | URL (absolute http/https, or a path starting with one `/`) that receives the same `{text}` body. No key is sent. |
| `data-vc-title` | Panel title (max 60 chars). Default `Career Counsellor`. |
| `data-vc-color` | Bubble and header colour, `#rgb` or `#rrggbb`. Text colour is chosen for contrast. |
| `data-vc-site` | Site id (`a-z`, `0-9`, `-`, 2 to 32 chars) used by the pop-out window address. Default: the partner id inside a `vck_pub_<partnerId>_...` key. With neither, the pop-out button is not shown. |
| `data-vc-voice` | `on` adds a mic button in key mode or with an explicit proxy mint path: tap to talk, live transcript, the reply, a crisis notice with the helpline. Denied/unavailable voice returns to Chat. The widget loads `vc-widget-voice.v1.js` from its own folder (see `nginx-widget.conf.snippet`). |
| `data-vc-voice-proxy` | Explicit root-relative session mint path in proxy mode. Rejects absolute/protocol-relative URLs, backslashes, controls, query and fragment. Sends POST with same-origin credentials, no key or identity/body, and rejects redirects. Host must authenticate, check origin/CSRF as appropriate, resolve the verified student's owned text thread and return `{token,wsUrl,expiresAt,threadId}` with HTTP 200 or 201. No browser identity/thread attributes are accepted. |

Floater (v1.1.0): the panel is a floating window.

- Drag it by the header (pointer events, mouse or touch). It is clamped to the viewport, also after the browser window is resized.
- Resize it from the bottom-right corner. Minimum 300 x 380, never larger than the viewport. The grip is pointer-only; at its default size the panel is fully usable from the keyboard.
- Header `Chat | Voice` toggle: shown only when voice is usable (`data-vc-voice="on"` plus a key or explicit proxy mint path). Both modes share one in-memory history (one log). Switching back to Chat ends a running voice call. If the voice add-on does not load, the toggle disappears.
- Pop-out button: opens `<api or host origin>/vc-popout?site=<id>` in a new window with `noopener,noreferrer`. The URL holds the site id only: no key, no token, no chat text. The chat so far is not handed over (nothing is stored and `noopener` leaves no channel), so the pop-out window starts a fresh conversation. Serving `/vc-popout` is not part of this file.
- Still no `localStorage`, `sessionStorage`, IndexedDB or cookie use; geometry lives in memory only and resets on reload.

Behaviour: Enter sends (Shift+Enter is a new line), Esc closes. 401/403 shows "Chat unavailable" and disables input. 429 shows a countdown for `Retry-After` seconds (1 to 300) and gives the message back to the box. The footer always shows Tele-MANAS 14416 / 112; an `escalated` reply is rendered as a crisis block with the same line. Model text is written with `textContent` only; source links must be http or https.

## Reusing voice in a host UI

The existing add-on exports `window.VCWidgetVoice`. React Quest Guide can load the same versioned script and supply its authenticated HTTP interceptor through `fetch`:

```js
const voice = window.VCWidgetVoice.create({
  cfg: { mode: "proxy", voice: true, voiceProxy: "/api/pathlynks-quest/ai/voice/session" },
  fetch: async (_url, _init) => {
    // Existing authenticated service; role/island are allowlisted presentation context.
    // The service must expose non-2xx errors as their HTTP status, rather than throwing them as network errors.
    const result = await pathlynksQuestService.aiVoiceSession({ role, island });
    return { ok: result.status >= 200 && result.status < 300, status: result.status,
      headers: { get: name => result.headers?.[name.toLowerCase()] ?? null },
      json: async () => result.data };
  },
  on: { state, transcript, sources, crisis, error, fallback, ended }
});
```

`fetch(url, init)` must return a Fetch-like `{ok,status,headers.get(name),json()}`. Normalize any service envelope to the direct mint DTO before returning `json()`. The add-on requests mic permission before invoking it; no session is minted on permission denial. The DTO uses a nonempty owned `threadId` (up to 200 characters, no whitespace, never `anonymous`), a future `expiresAt` timestamp string, and an absolute `ws:`/`wss:` URL with no userinfo, query or fragment. The token travels only in the `vc-token.<token>` WebSocket subprotocol; `start` carries the returned thread. Do not inject server keys or read authentication tokens into the add-on. Public-key mint keeps its original HTTP 201 DTO, cookie omission and `anonymous` start thread.

`state` receives `idle | connecting | listening`; `transcript` receives `{role,text,final}`; `sources` receives sanitized `{title,href}` entries; `crisis` receives `{help}`; `error` receives `{code,message,help}`; `fallback` receives a reason (including `permission`, `no_mic`, `unsupported`, `unavailable`, `off`, `busy`, `rate`, `network`, `error`); `ended` receives `{reason}`. Call `voice.stop()` on Chat selection, unmount, panel close or identity/context change. Keep both modes in one visible log, switch to text on fallback, and refresh server-redacted history after returning to Chat. The standalone widget keeps its log in memory; the host owns authenticated history refresh and deduplication.

## Hosting (W4)

`nginx-widget.conf.snippet` serves `src/vc-widget.js` at `/widget/vc-widget.v1.js` (cache one year, immutable) and `/widget/vc-widget.js` (alias, cache 5 minutes). It is a snippet because `infra/ubuntu/nginx-vc.conf` belongs to pc-partner-keys. The version in the hosted name is the major of `VERSION` in the file (a test keeps it equal to `package.json`).

## Test and demo

    node --test "apps/widget/tests/*.test.js"      # or: pnpm -C apps/widget test
    node apps/widget/tests/stub-server.js 5174       # stub API + demo at http://127.0.0.1:5174/demo.html (?mode=proxy for proxy mode)

The stub is a fixture, not the API. Trigger words in a message: `crisis`, `nosource`, `xss`, `ratelimit`, `revoke`, `slow`, `boom`.
