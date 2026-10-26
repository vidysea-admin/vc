# VC chat widget (pc-widget)

One script tag puts a chatbot bubble on any page. Plain JavaScript, no dependencies, no build step. The UI lives in a shadow DOM so no CSS leaks either way. The conversation is kept in memory only (no localStorage, sessionStorage or cookies).

## Embed

Key mode (the page talks to VC directly; the key is a public, per-partner, origin-locked key):

    <script src="https://VC_HOST/widget/vc-widget.v1.js" data-vc-key="vck_..." defer></script>

Proxy mode (Pathlynks and any host with a backend; the host backend adds the key and student headers and forwards to VC):

    <script src="https://VC_HOST/widget/vc-widget.v1.js" data-vc-proxy="/api/vc" defer></script>

| Attribute | Meaning |
|---|---|
| `data-vc-key` | Partner key. Sent as `X-VC-Key` to `<api>/v1/public/chat/turns`. Ignored when `data-vc-proxy` is set. |
| `data-vc-api` | API origin. Default: the origin the script was loaded from. |
| `data-vc-proxy` | URL (absolute http/https, or a path starting with one `/`) that receives the same `{text}` body. No key is sent. |
| `data-vc-title` | Panel title (max 60 chars). Default `Career Counsellor`. |
| `data-vc-color` | Bubble and header colour, `#rgb` or `#rrggbb`. Text colour is chosen for contrast. |
| `data-vc-site` | Site id (`a-z`, `0-9`, `-`, 2 to 32 chars) used by the pop-out window address. Default: the partner id inside a `vck_pub_<partnerId>_...` key. With neither, the pop-out button is not shown. |
| `data-vc-voice` | `on` adds a mic button (key mode only): tap to talk, live transcript, the reply, a crisis notice with the helpline; if the microphone is denied or voice is unavailable the chat stays text. The widget loads `vc-widget-voice.v1.js` from the folder it came from, so nginx must serve it (see `nginx-widget.conf.snippet`). |

Floater (v1.1.0): the panel is a floating window.

- Drag it by the header (pointer events, mouse or touch). It is clamped to the viewport, also after the browser window is resized.
- Resize it from the bottom-right corner. Minimum 300 x 380, never larger than the viewport. The grip is pointer-only; at its default size the panel is fully usable from the keyboard.
- Header `Chat | Voice` toggle: shown only when voice is usable (`data-vc-voice="on"`, key mode, key present). Both modes share one in-memory history (one log). Switching back to Chat ends a running voice call. If the voice add-on does not load, the toggle disappears.
- Pop-out button: opens `<api or host origin>/vc-popout?site=<id>` in a new window with `noopener,noreferrer`. The URL holds the site id only: no key, no token, no chat text. The chat so far is not handed over (nothing is stored and `noopener` leaves no channel), so the pop-out window starts a fresh conversation. Serving `/vc-popout` is not part of this file.
- Still no `localStorage`, `sessionStorage`, IndexedDB or cookie use; geometry lives in memory only and resets on reload.

Behaviour: Enter sends (Shift+Enter is a new line), Esc closes. 401/403 shows "Chat unavailable" and disables input. 429 shows a countdown for `Retry-After` seconds (1 to 300) and gives the message back to the box. The footer always shows Tele-MANAS 14416 / 112; an `escalated` reply is rendered as a crisis block with the same line. Model text is written with `textContent` only; source links must be http or https.

## Hosting (W4)

`nginx-widget.conf.snippet` serves `src/vc-widget.js` at `/widget/vc-widget.v1.js` (cache one year, immutable) and `/widget/vc-widget.js` (alias, cache 5 minutes). It is a snippet because `infra/ubuntu/nginx-vc.conf` belongs to pc-partner-keys. The version in the hosted name is the major of `VERSION` in the file (a test keeps it equal to `package.json`).

## Test and demo

    node --test "apps/widget/tests/*.test.js"      # or: pnpm -C apps/widget test
    node apps/widget/tests/stub-server.js 5174       # stub API + demo at http://127.0.0.1:5174/demo.html (?mode=proxy for proxy mode)

The stub is a fixture, not the API. Trigger words in a message: `crisis`, `nosource`, `xss`, `ratelimit`, `revoke`, `slow`, `boom`.
