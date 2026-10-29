# completion-widget — S12 bounded contribution
Status: OWNED IMPLEMENTATION LOCAL-VERIFIED, ready for root integration; self-check only; root owns integration/final checker. T057 cycle2 STALLED history/costs/receipts unchanged.

## Stable mount/transport interface
Use VCWidget.mount(cfg, document, optionalFetch, {win}). cfg is existing parseConfig result plus programmatic authenticated: {basePath: '/api/v1/student/ai-counsellor/vc', getHeaders: async () => currentAuthHeaders, transport?: async (url, init) => Response}. basePath must be root-relative with no query/fragment, dot segments or encoded separators. transport (or optionalFetch) returns Fetch Response, never parsed body. getHeaders runs for every resource/text/voice request; headers are not retained. Cookie-only same-origin mode omits getHeaders. No identity from DOM/query/local storage. Wrapper must destroy old handle before account switch/logout and remount with current callbacks.

GET profile -> {memory:{items:[{factId,key,value,status,readOnly,pendingChange?:{candidateId:string,version:string,value:string,proposedAt:string}}]}}. GET threads -> {threads:[{threadId,createdAt,lastActivityAt}]}; POST threads {} -> {threadId}; GET threads/{id} -> {threadId,turns:[{turnId,role,text,at,claims?,sources?,publicationState?}]}. POST threads/{id}/turns -> {text,clientTurnId}. POST profile/facts/{id}/decision -> {action,value?,candidateId?,expectedVersion?}. Replacement confirm/reject sends exact displayed candidate value, candidateId, expectedVersion; erase is explicit Forget. Stale409 refreshes profile and requires manual Retry. UI yes/no applies only to a freshly displayed candidate in the current owned thread; never reads historical chat to infer approval.

Handle retains existing methods and adds ready Promise, destroy(), refreshProfile(), refreshThreads(), selectThread(id), newThread(). Voice uses same authenticated transport and server thread binding. No automatic regeneration on stale responses; failed send preserves text/clientTurnId/one user bubble.

## Scope
Existing widget and existing focused tests only; no host component edit, new product module/collection/test file, full suite, network/provider/DB, commit/push/deploy. New evidence artifact allowed.

## Environment
Shell read failed twice before process creation: helper_unknown_error/setup refresh. Local Node runtime used. Computer-use initialization rejected by automatic approval review as outside task constraints; not retried or bypassed.

## Red
Command: node --test --test-name-pattern=S12 apps/widget/tests/floater.test.js
✖ S12 auth: loads owned ordered history, current memory and sends with fresh host headers (2.692ms)
✖ S12 auth: manual transport Retry preserves clientTurnId, selected thread, draft and one user bubble (7.3675ms)
✖ S12 memory: reject carries exact candidate/version/value; stale409 refreshes without success or lost draft (0.5212ms)
✖ S12 memory: only a fresh exact yes/no is a decision; ambiguous text asks again, historical yes is inert (14.6105ms)
✖ S12 lifecycle: destroy cancels late requests, voice, listeners and private state; remount stays clean (15.7898ms)
✖ S12 auth: unsafe proxy destination never receives credentials or requests (0.417ms)
ℹ tests 6
ℹ suites 0
ℹ pass 0
ℹ fail 6
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 101.3188

✖ failing tests:

test at apps\widget\tests\floater.test.js:583:1
✖ S12 auth: loads owned ordered history, current memory and sends with fresh host headers (2.692ms)
  AssertionError [ERR_ASSERTION]: The input did not match the regular expression /Earlier[\s\S]*Later/. Input:
  
  'Hi, I am an AI career counsellor. Ask me about careers, courses and colleges. I can make mistakes, so please check important facts with a counsellor.'
  
      at TestContext.<anonymous> (D:\vc\.worktrees\vc-completion\apps\widget\tests\floater.test.js:587:10)
      at async Test.run (node:internal/test_runner/test:1110:7)
      at async startSubtestAfterBootstrap (node:internal/test_runner/harness:358:3) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: 'Hi, I am an AI career counsellor. Ask me about careers, courses and colleges. I can make mistakes, so please check important facts with a counsellor.',
    expected: /Earlier[\s\S]*Later/,
    operator: 'match',
    diff: 'simple'
  }

test at apps\widget\tests\floater.test.js:598:1
✖ S12 auth: manual transport Retry preserves clientTurnId, selected thread, draft and one user bubble (7.3675ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
  + actual - expected
  
  + ''
  - 'Keep my question'
  
      at TestContext.<anonymous> (D:\vc\.worktrees\vc-completion\apps\widget\tests\floater.test.js:601:47)
      at async Test.run (node:internal/test_runner/test:1110:7)
      at async Test.processPendingSubtests (node:internal/test_runner/test:785:7) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: '',
    expected: 'Keep my question',
    operator: 'strictEqual',
    diff: 'simple'
  }

test at apps\widget\tests\floater.test.js:608:1
✖ S12 memory: reject carries exact candidate/version/value; stale409 refreshes without success or lost draft (0.5212ms)
  TypeError: Cannot read properties of null (reading 'fire')
      at TestContext.<anonymous> (D:\vc\.worktrees\vc-completion\apps\widget\tests\floater.test.js:614:86)
      at async Test.run (node:internal/test_runner/test:1110:7)
      at async Test.processPendingSubtests (node:internal/test_runner/test:785:7)

test at apps\widget\tests\floater.test.js:623:1
✖ S12 memory: only a fresh exact yes/no is a decision; ambiguous text asks again, historical yes is inert (14.6105ms)
  AssertionError [ERR_ASSERTION]: The input did not match the regular expression /yes or no/i. Input:
  
  'maybe(no reply)'
  
      at TestContext.<anonymous> (D:\vc\.worktrees\vc-completion\apps\widget\tests\floater.test.js:627:10)
      at async Test.run (node:internal/test_runner/test:1110:7)
      at async Test.processPendingSubtests (node:internal/test_runner/test:785:7) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: 'maybe(no reply)',
    expected: /yes or no/i,
    operator: 'match',
    diff: 'simple'
  }

test at apps\widget\tests\floater.test.js:631:1
✖ S12 lifecycle: destroy cancels late requests, voice, listeners and private state; remount stays clean (15.7898ms)
  TypeError: q.h.destroy is not a function
      at TestContext.<anonymous> (D:\vc\.worktrees\vc-completion\apps\widget\tests\floater.test.js:635:7)
      at async Test.run (node:internal/test_runner/test:1110:7)
      at async Test.processPendingSubtests (node:internal/test_runner/test:785:7)

test at apps\widget\tests\floater.test.js:641:1
✖ S12 auth: unsafe proxy destination never receives credentials or requests (0.417ms)
  TypeError: q.h.destroy is not a function
      at TestContext.<anonymous> (D:\vc\.worktrees\vc-completion\apps\widget\tests\floater.test.js:644:56)
      at async Test.run (node:internal/test_runner/test:1110:7)
      at async Test.processPendingSubtests (node:internal/test_runner/test:785:7)


## Additional lifecycle red
Command: node --test --test-name-pattern="S12 lifecycle: replaced" apps/widget/tests/floater.test.js
✖ S12 lifecycle: replaced memory prompt listeners are released and anonymous request aborts on teardown (29.8935ms)
ℹ tests 1
ℹ suites 0
ℹ pass 0
ℹ fail 1
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 106.1714

✖ failing tests:

test at apps\widget\tests\floater.test.js:648:1
✖ S12 lifecycle: replaced memory prompt listeners are released and anonymous request aborts on teardown (29.8935ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
  
  1 !== 0
  
      at TestContext.<anonymous> (D:\vc\.worktrees\vc-completion\apps\widget\tests\floater.test.js:651:37)
      at async Test.run (node:internal/test_runner/test:1110:7)
      at async startSubtestAfterBootstrap (node:internal/test_runner/harness:358:3) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: 1,
    expected: 0,
    operator: 'strictEqual',
    diff: 'simple'
  }

## Peer DTO reconciliation red
Peer-pinned pendingChange.version and expectedVersion are opaque strings, confirmed from completion-memory-db.md:8-11 and student-api.ts:75-85. Updated existing synthetic fixtures to the actual DTO.
node --test --test-name-pattern="S12 memory: reject" apps/widget/tests/floater.test.js
✖ S12 memory: reject carries exact candidate/version/value; stale409 refreshes without success or lost draft (21.7218ms)
ℹ tests 1
ℹ suites 0
ℹ pass 0
ℹ fail 1
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 82.4612

✖ failing tests:

test at apps\widget\tests\floater.test.js:608:1
✖ S12 memory: reject carries exact candidate/version/value; stale409 refreshes without success or lost draft (21.7218ms)
  TypeError: Cannot read properties of null (reading 'fire')
      at TestContext.<anonymous> (D:\vc\.worktrees\vc-completion\apps\widget\tests\floater.test.js:614:86)
      at async Test.run (node:internal/test_runner/test:1110:7)
      at async startSubtestAfterBootstrap (node:internal/test_runner/harness:358:3)

## Voice server prompt red
node --test --test-name-pattern="S12 voice: only" apps/widget/tests/voice.test.js
✖ S12 voice: only authenticated server confirm refresh events are surfaced, without inferring transcript approval (2.2398ms)
ℹ tests 1
ℹ suites 0
ℹ pass 0
ℹ fail 1
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 118.2716

✖ failing tests:

test at apps\widget\tests\voice.test.js:742:1
✖ S12 voice: only authenticated server confirm refresh events are surfaced, without inferring transcript approval (2.2398ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
  
  0 !== 1
  
      at TestContext.<anonymous> (D:\vc\.worktrees\vc-completion\apps\widget\tests\voice.test.js:746:10)
      at async Test.run (node:internal/test_runner/test:1110:7)
      at async startSubtestAfterBootstrap (node:internal/test_runner/harness:358:3) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: 0,
    expected: 1,
    operator: 'strictEqual',
    diff: 'simple'
  }

## Focused green
node --test apps/widget/tests/floater.test.js apps/widget/tests/request.test.js apps/widget/tests/voice.test.js
✔ Q5: proxy Chat/Voice/Chat retains typed and voice history, releases the mic and makes fallback text usable (8.822ms)
✔ VA18: VERSION is 1.1.0 and the hosted name keeps major 1 (0.3868ms)
✔ VA18 drag clamp: a rectangle dragged past any edge is pulled back inside the viewport (0.5846ms)
✔ VA18 clampRect: a window shrink pulls the size and the position inside; the size floor is 300 x 380 (0.1027ms)
✔ VA18 drag: a visitor drags the header with the pointer; the panel follows and stops at the viewport edges (0.5277ms)
✔ VA18 drag: pressing a header button (close, toggle, pop-out) never starts a drag (0.1761ms)
✔ VA18 drag after a window resize: the panel is pulled back inside when the browser window shrinks (0.2647ms)
✔ VA18 drag before any drag: a window resize leaves the default CSS placement alone (0.2067ms)
✔ VA18 drag with a page scrollbar: the clamp uses the layout viewport (clientWidth), so the panel never slides under the scrollbar (0.2367ms)
✔ VA18 drag release lost: a pointermove that reports no button down ends the drag instead of dragging on (0.2539ms)
✔ VA18 resize: dragging the corner changes the size, never below 300 x 380, never past the viewport (0.294ms)
✔ VA18 resize at phone width: at 360 x 640 the panel cannot be dragged or grown past the viewport (0.1964ms)
✔ VA18 toggle: with voice available the header shows Chat | Voice and Chat is selected (0.2231ms)
✔ VA18 toggle: Voice is hidden without opt-in, key or explicit proxy mint path (0.2852ms)
✔ VA18 shared history: a message sent in Chat is still there after Voice and back; one history, not copies (16.4465ms)
✔ VA18 toggle by keyboard: the mode buttons are real buttons (Enter/Space activate them) and sit in the header before pop-out and close (0.3574ms)
✔ VA18 voice mode: switching back to Chat ends a running voice call (the mic is released) (0.3688ms)
✔ VA18 voice add-on fails to load: the Voice toggle disappears again and Chat stays (0.1416ms)
✔ VA18 pop-out URL: /vc-popout?site=<id> on the API origin (key mode), with no key and no token in it (0.0953ms)
✔ VA18 pop-out URL: proxy mode uses the host page origin for a relative proxy and the proxy's origin for an absolute one (0.0897ms)
✔ VA18 pop-out URL: no site id, an unsafe site id, or no usable origin means no pop-out (null) (0.1222ms)
✔ VA18 pop-out: the header button opens the URL in a new window with noopener; the chat so far is not sent anywhere (14.7788ms)
✔ VA18 pop-out: no site id configured means the pop-out button is not shown (0.2985ms)
✔ VA18 config: data-vc-site sets cfg.site; without it the partner id inside a vck_pub_ key is the site id (never the key itself) (0.7515ms)
✔ VA18 no storage: drag, resize, toggle, pop-out and a chat turn make zero localStorage / sessionStorage / indexedDB / cookie calls (15.2073ms)
✔ VA18 unchanged: key mode sends X-VC-Key, proxy mode sends no key, and the footer carries 14416 / 112 (31.8063ms)
✔ VA18 unchanged: an escalated reply is the crisis block with the helpline (15.1625ms)
✔ VA18 unchanged: 401 shows 'Chat unavailable' and disables the box; 429 shows the Retry-After countdown (31.2757ms)
✔ VA18 unchanged: Esc closes the panel, focus returns to the bubble, and the roles/labels are kept (0.2745ms)
✔ VA18 unchanged: the mic attaches only when voice is available and sits in the form before Send (0.2451ms)
✔ VA18 phone width: the default placement (before any drag) is CSS-fit to the viewport at 360 px (0.3913ms)
✔ S12 auth: loads owned ordered history, current memory and sends with fresh host headers (30.3731ms)
✔ S12 auth: manual transport Retry preserves clientTurnId, selected thread, draft and one user bubble (31.3756ms)
✔ S12 memory: reject carries exact candidate/version/value; stale409 refreshes without success or lost draft (30.405ms)
✔ S12 memory: only a fresh exact yes/no is a decision; ambiguous text asks again, historical yes is inert (31.8213ms)
✔ S12 lifecycle: destroy cancels late requests, voice, listeners and private state; remount stays clean (31.1956ms)
✔ S12 auth: unsafe proxy destination never receives credentials or requests (0.4934ms)
✔ S12 lifecycle: replaced memory prompt listeners are released and anonymous request aborts on teardown (30.3625ms)
✔ S12 voice: authenticated mint uses fresh host transport, selected server thread and destroy stops pending microphone start (1.021ms)
✔ key mode: POST to <api>/v1/public/chat/turns with X-VC-Key and body exactly {text} (2.0045ms)
✔ proxy mode: POST to the proxy URL with the same body and NO X-VC-Key (0.3024ms)
✔ a proxy config that also carries a key never sends the key (0.1662ms)
✔ open mode sends no key header (0.1804ms)
✔ 401 -> unavailable (chat unavailable) (0.1798ms)
✔ 429 -> rate with the Retry-After seconds (0.2493ms)
✔ Retry-After parsing: seconds, clamping, HTTP-date, junk and missing (0.1315ms)
✔ a network failure and a non-JSON 200 are distinct, safe results (0.1979ms)
✔ other errors carry the status and the helpline from the body (0.2408ms)
✔ a reply is normalised: message, claims, sources; unknown shapes are dropped (0.4016ms)
✔ an unknown state is treated as ok and a missing message becomes empty text (0.1006ms)
✔ sanitizeUrl allows only http and https absolute URLs (0.1957ms)
✔ the source never uses storage, cookies, eval or HTML injection (0.7574ms)
✔ visitor taps the mic: the browser is asked for the microphone, a session is minted with the page key and no cookies, the socket offers the vc-voice-v1 and token protocols, and start names the anonymous thread (2.6727ms)
✔ mic audio goes out as binary frames once the socket is open, and not before (0.4314ms)
✔ the visitor's page key sits in a header only: the session URL carries no key and the cookie jar is not used (0.2301ms)
✔ Q5: injected proxy mint uses same-origin authentication and only the returned owned thread (0.5917ms)
✔ Q5: proxy refuses malformed binding/credentials before opening a socket and frees the mic (0.8091ms)
✔ Q5: proxy permission denial, missing mic and unavailable mint return to text without leaking resources (0.3469ms)
✔ live transcript: partial words grow in place, a final line closes them, for the visitor and for the counsellor's reply (0.3346ms)
✔ the counsellor's audio frames are played; sources arrive as data for the log, never as markup (0.2824ms)
✔ a crisis turn shows the helpline (14416 and 112) once, whether the flag, the state or both arrive, and nothing else: no paraphrase of the server's fixed wording (0.2725ms)
✔ the widget renders the voice crisis notice as the helpline line only, exactly like the text chat's escalated reply (14416 and 112 shown, no free text) (0.9027ms)
✔ a state escalated on its own (no flag) is also a crisis; an ordinary ok state is not (0.1821ms)
✔ other flags (uncited number, named speaker) do not raise the crisis notice (0.1052ms)
✔ a confirm event is never answered by the widget: an anonymous visitor has no profile to confirm into (0.13ms)
✔ mic permission denied: no session is minted, no socket is opened, and the widget falls back to text with the reason (0.2529ms)
✔ no microphone at all (NotFoundError) or no getUserMedia in the browser also falls back to text (0.138ms)
✔ a refused mint falls back to text and frees the mic: 401/403 unavailable, 429 waits as told, 5xx and offline are errors (0.4461ms)
✔ a malformed mint answer is refused before any socket: no token, a non-ws URL, a javascript: URL, a plain http URL (0.28ms)
✔ a socket that never opens (error before open) falls back to text and frees the mic (0.1227ms)
✔ the not_started error for the first frames before the provider is ready is ignored; real errors are shown with the helpline (0.2685ms)
✔ tapping stop sends end, closes the socket, releases the mic and the audio, and a second stop is harmless (0.1584ms)
✔ the server ending the session (time cap, idle, superseded) releases the mic and reports it once (0.1407ms)
✔ tapping stop while still connecting cancels cleanly: the mic is released and no socket is left open (5.8491ms)
✔ cancel then restart while the first mic prompt is pending: the stale prompt's stream is stopped when it resolves, in either resolve order (0.9637ms)
✔ a stale start never stops the newer start's microphone (0.3549ms)
✔ a second tap on start while a session is running does nothing (0.1218ms)
✔ bad frames from the server (not JSON, not an object) are ignored, not thrown (0.1064ms)
✔ voice needs a key or explicit proxy endpoint: unconfigured proxy and open modes have no session URL (0.1537ms)
✔ the mic add-on is fetched from the folder the widget was loaded from, under the versioned name (0.0969ms)
✔ mic samples are downsampled to 16 kHz PCM16 little-endian, clamped, with no NaN leaking through (0.2256ms)
✔ counsellor PCM16 is decoded to floats, an odd trailing byte is dropped (0.1053ms)
✔ voice.js keeps nothing: no storage, cookie, IndexedDB or innerHTML, and no eval (0.3403ms)
✔ the shared constants: the exported helpline matches the footer's helpline, and the version has a major for the file name (0.0686ms)
✔ nginx-vc.conf serves the widget script under its versioned name and the vc-widget.js alias, ahead of the /widget/ 404 and the /v1/ 404 (0.1154ms)
✔ nginx-vc.conf proxies the anonymous voice session route and the voice stream with the WebSocket upgrade, and sets the client address itself (0.1514ms)
✔ the snippet and nginx-vc.conf agree on the widget locations (0.2148ms)
✔ H3: a 429 voice_busy from the session mint is a busy fallback (not rate, not network) that waits as told, frees the mic and opens no socket (0.2631ms)
✔ H3: the widget words the busy state in English and Hindi (page language), keeps the other voice fallback texts, and a voice_busy error frame gets the same busy note instead of the raw server text (0.3508ms)
✔ H3: the busy/ended frames keep the crisis path intact: a crisis flag still shows the helpline only, and the helpline text is unchanged (0.1365ms)
✔ J1: the voice busy note carries the helpline too, in the note's own language, for both busy signals (the mint 429 voice_busy fallback and the voice_busy error frame), and the busy wording itself is unchanged (0.1377ms)
✔ J1: a voice_busy error frame reaches the widget as an error event carrying its code and the helpline, which the busy notice then renders in full (0.0957ms)
✔ J2: a mint refused with 403 voice_unavailable (voice switched off for this client or partner) is the off fallback, not unavailable-right-now and not busy: it frees the mic, opens no socket, and the widget says voice is not available here, please type, plus the helpline, in en and hi (0.2547ms)
✔ R1: the Hindi helpline line is built only from fragments copied verbatim from the approved Hindi text in packages/engine/src/student/lang.ts (LK10), and no new Hindi word is in the widget source (1.8773ms)
✔ S12 voice: only authenticated server confirm refresh events are surfaced, without inferring transcript approval (0.2466ms)
ℹ tests 95
ℹ suites 0
ℹ pass 95
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 389.5439

stderr: 
exit 0

## Explicit correction/forget and stale Retry red
node --test --test-name-pattern="S12 memory: explicit|S12 auth: memory_changed" apps/widget/tests/floater.test.js
✖ S12 memory: explicit confirm/correct/forget preserve displayed binding and readonly account fields (50.5017ms)
✖ S12 auth: memory_changed requires a manual fresh Retry, ordinary errors keep id and new drafts survive (12.335ms)
ℹ tests 2
ℹ suites 0
ℹ pass 0
ℹ fail 2
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 143.1229

✖ failing tests:

test at apps\widget\tests\floater.test.js:672:1
✖ S12 memory: explicit confirm/correct/forget preserve displayed binding and readonly account fields (50.5017ms)
  AssertionError [ERR_ASSERTION]: The expression evaluated to a falsy value:
  
    assert.ok(edit)
  
      at TestContext.<anonymous> (D:\vc\.worktrees\vc-completion\apps\widget\tests\floater.test.js:685:77)
      at async Test.run (node:internal/test_runner/test:1110:7)
      at async startSubtestAfterBootstrap (node:internal/test_runner/harness:358:3) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: null,
    expected: true,
    operator: '==',
    diff: 'simple'
  }

test at apps\widget\tests\floater.test.js:693:1
✖ S12 auth: memory_changed requires a manual fresh Retry, ordinary errors keep id and new drafts survive (12.335ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
  
  'Send' !== 'Retry'
  
      at TestContext.<anonymous> (D:\vc\.worktrees\vc-completion\apps\widget\tests\floater.test.js:697:10)
      at async Test.run (node:internal/test_runner/test:1110:7)
      at async Test.processPendingSubtests (node:internal/test_runner/test:785:7) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: 'Send',
    expected: 'Retry',
    operator: 'strictEqual',
    diff: 'simple'
  }

## Updated focused green
node --test apps/widget/tests/floater.test.js apps/widget/tests/request.test.js apps/widget/tests/voice.test.js
✔ Q5: proxy Chat/Voice/Chat retains typed and voice history, releases the mic and makes fallback text usable (12.0565ms)
✔ VA18: VERSION is 1.1.0 and the hosted name keeps major 1 (0.4299ms)
✔ VA18 drag clamp: a rectangle dragged past any edge is pulled back inside the viewport (0.5352ms)
✔ VA18 clampRect: a window shrink pulls the size and the position inside; the size floor is 300 x 380 (0.1028ms)
✔ VA18 drag: a visitor drags the header with the pointer; the panel follows and stops at the viewport edges (0.5678ms)
✔ VA18 drag: pressing a header button (close, toggle, pop-out) never starts a drag (0.1973ms)
✔ VA18 drag after a window resize: the panel is pulled back inside when the browser window shrinks (0.3022ms)
✔ VA18 drag before any drag: a window resize leaves the default CSS placement alone (0.201ms)
✔ VA18 drag with a page scrollbar: the clamp uses the layout viewport (clientWidth), so the panel never slides under the scrollbar (0.281ms)
✔ VA18 drag release lost: a pointermove that reports no button down ends the drag instead of dragging on (0.2728ms)
✔ VA18 resize: dragging the corner changes the size, never below 300 x 380, never past the viewport (0.2893ms)
✔ VA18 resize at phone width: at 360 x 640 the panel cannot be dragged or grown past the viewport (0.1955ms)
✔ VA18 toggle: with voice available the header shows Chat | Voice and Chat is selected (0.2246ms)
✔ VA18 toggle: Voice is hidden without opt-in, key or explicit proxy mint path (0.2705ms)
✔ VA18 shared history: a message sent in Chat is still there after Voice and back; one history, not copies (9.7029ms)
✔ VA18 toggle by keyboard: the mode buttons are real buttons (Enter/Space activate them) and sit in the header before pop-out and close (0.3411ms)
✔ VA18 voice mode: switching back to Chat ends a running voice call (the mic is released) (0.3059ms)
✔ VA18 voice add-on fails to load: the Voice toggle disappears again and Chat stays (0.1496ms)
✔ VA18 pop-out URL: /vc-popout?site=<id> on the API origin (key mode), with no key and no token in it (0.0982ms)
✔ VA18 pop-out URL: proxy mode uses the host page origin for a relative proxy and the proxy's origin for an absolute one (0.0901ms)
✔ VA18 pop-out URL: no site id, an unsafe site id, or no usable origin means no pop-out (null) (0.1059ms)
✔ VA18 pop-out: the header button opens the URL in a new window with noopener; the chat so far is not sent anywhere (14.4108ms)
✔ VA18 pop-out: no site id configured means the pop-out button is not shown (0.1838ms)
✔ VA18 config: data-vc-site sets cfg.site; without it the partner id inside a vck_pub_ key is the site id (never the key itself) (0.3636ms)
✔ VA18 no storage: drag, resize, toggle, pop-out and a chat turn make zero localStorage / sessionStorage / indexedDB / cookie calls (15.1099ms)
✔ VA18 unchanged: key mode sends X-VC-Key, proxy mode sends no key, and the footer carries 14416 / 112 (30.4045ms)
✔ VA18 unchanged: an escalated reply is the crisis block with the helpline (14.953ms)
✔ VA18 unchanged: 401 shows 'Chat unavailable' and disables the box; 429 shows the Retry-After countdown (30.4837ms)
✔ VA18 unchanged: Esc closes the panel, focus returns to the bubble, and the roles/labels are kept (0.2836ms)
✔ VA18 unchanged: the mic attaches only when voice is available and sits in the form before Send (0.2805ms)
✔ VA18 phone width: the default placement (before any drag) is CSS-fit to the viewport at 360 px (0.3843ms)
✔ S12 auth: loads owned ordered history, current memory and sends with fresh host headers (30.0797ms)
✔ S12 auth: manual transport Retry preserves clientTurnId, selected thread, draft and one user bubble (32.1345ms)
✔ S12 memory: reject carries exact candidate/version/value; stale409 refreshes without success or lost draft (31.8693ms)
✔ S12 memory: only a fresh exact yes/no is a decision; ambiguous text asks again, historical yes is inert (31.7457ms)
✔ S12 lifecycle: destroy cancels late requests, voice, listeners and private state; remount stays clean (30.5376ms)
✔ S12 auth: unsafe proxy destination never receives credentials or requests (0.6075ms)
✔ S12 lifecycle: replaced memory prompt listeners are released and anonymous request aborts on teardown (30.8105ms)
✔ S12 voice: authenticated mint uses fresh host transport, selected server thread and destroy stops pending microphone start (1.1364ms)
✔ S12 memory: explicit confirm/correct/forget preserve displayed binding and readonly account fields (45.4724ms)
✔ S12 auth: memory_changed requires a manual fresh Retry, ordinary errors keep id and new drafts survive (30.5916ms)
✔ key mode: POST to <api>/v1/public/chat/turns with X-VC-Key and body exactly {text} (2.0808ms)
✔ proxy mode: POST to the proxy URL with the same body and NO X-VC-Key (0.3157ms)
✔ a proxy config that also carries a key never sends the key (0.1964ms)
✔ open mode sends no key header (0.2048ms)
✔ 401 -> unavailable (chat unavailable) (0.1824ms)
✔ 429 -> rate with the Retry-After seconds (0.2122ms)
✔ Retry-After parsing: seconds, clamping, HTTP-date, junk and missing (0.1279ms)
✔ a network failure and a non-JSON 200 are distinct, safe results (0.1953ms)
✔ other errors carry the status and the helpline from the body (0.2314ms)
✔ a reply is normalised: message, claims, sources; unknown shapes are dropped (0.4087ms)
✔ an unknown state is treated as ok and a missing message becomes empty text (0.7688ms)
✔ sanitizeUrl allows only http and https absolute URLs (0.2386ms)
✔ the source never uses storage, cookies, eval or HTML injection (0.85ms)
✔ visitor taps the mic: the browser is asked for the microphone, a session is minted with the page key and no cookies, the socket offers the vc-voice-v1 and token protocols, and start names the anonymous thread (2.5959ms)
✔ mic audio goes out as binary frames once the socket is open, and not before (0.4583ms)
✔ the visitor's page key sits in a header only: the session URL carries no key and the cookie jar is not used (0.3267ms)
✔ Q5: injected proxy mint uses same-origin authentication and only the returned owned thread (0.6224ms)
✔ Q5: proxy refuses malformed binding/credentials before opening a socket and frees the mic (0.8058ms)
✔ Q5: proxy permission denial, missing mic and unavailable mint return to text without leaking resources (0.3599ms)
✔ live transcript: partial words grow in place, a final line closes them, for the visitor and for the counsellor's reply (0.3369ms)
✔ the counsellor's audio frames are played; sources arrive as data for the log, never as markup (0.2763ms)
✔ a crisis turn shows the helpline (14416 and 112) once, whether the flag, the state or both arrive, and nothing else: no paraphrase of the server's fixed wording (0.2618ms)
✔ the widget renders the voice crisis notice as the helpline line only, exactly like the text chat's escalated reply (14416 and 112 shown, no free text) (0.864ms)
✔ a state escalated on its own (no flag) is also a crisis; an ordinary ok state is not (0.1869ms)
✔ other flags (uncited number, named speaker) do not raise the crisis notice (0.1096ms)
✔ a confirm event is never answered by the widget: an anonymous visitor has no profile to confirm into (0.1492ms)
✔ mic permission denied: no session is minted, no socket is opened, and the widget falls back to text with the reason (0.2352ms)
✔ no microphone at all (NotFoundError) or no getUserMedia in the browser also falls back to text (0.1228ms)
✔ a refused mint falls back to text and frees the mic: 401/403 unavailable, 429 waits as told, 5xx and offline are errors (0.4519ms)
✔ a malformed mint answer is refused before any socket: no token, a non-ws URL, a javascript: URL, a plain http URL (0.2859ms)
✔ a socket that never opens (error before open) falls back to text and frees the mic (0.1332ms)
✔ the not_started error for the first frames before the provider is ready is ignored; real errors are shown with the helpline (0.2007ms)
✔ tapping stop sends end, closes the socket, releases the mic and the audio, and a second stop is harmless (0.1313ms)
✔ the server ending the session (time cap, idle, superseded) releases the mic and reports it once (0.1091ms)
✔ tapping stop while still connecting cancels cleanly: the mic is released and no socket is left open (5.8653ms)
✔ cancel then restart while the first mic prompt is pending: the stale prompt's stream is stopped when it resolves, in either resolve order (1.4828ms)
✔ a stale start never stops the newer start's microphone (0.3586ms)
✔ a second tap on start while a session is running does nothing (0.1251ms)
✔ bad frames from the server (not JSON, not an object) are ignored, not thrown (0.1111ms)
✔ voice needs a key or explicit proxy endpoint: unconfigured proxy and open modes have no session URL (0.1524ms)
✔ the mic add-on is fetched from the folder the widget was loaded from, under the versioned name (0.0934ms)
✔ mic samples are downsampled to 16 kHz PCM16 little-endian, clamped, with no NaN leaking through (0.2126ms)
✔ counsellor PCM16 is decoded to floats, an odd trailing byte is dropped (0.108ms)
✔ voice.js keeps nothing: no storage, cookie, IndexedDB or innerHTML, and no eval (0.3574ms)
✔ the shared constants: the exported helpline matches the footer's helpline, and the version has a major for the file name (0.0781ms)
✔ nginx-vc.conf serves the widget script under its versioned name and the vc-widget.js alias, ahead of the /widget/ 404 and the /v1/ 404 (0.119ms)
✔ nginx-vc.conf proxies the anonymous voice session route and the voice stream with the WebSocket upgrade, and sets the client address itself (0.1434ms)
✔ the snippet and nginx-vc.conf agree on the widget locations (0.2287ms)
✔ H3: a 429 voice_busy from the session mint is a busy fallback (not rate, not network) that waits as told, frees the mic and opens no socket (0.2861ms)
✔ H3: the widget words the busy state in English and Hindi (page language), keeps the other voice fallback texts, and a voice_busy error frame gets the same busy note instead of the raw server text (0.3802ms)
✔ H3: the busy/ended frames keep the crisis path intact: a crisis flag still shows the helpline only, and the helpline text is unchanged (0.1198ms)
✔ J1: the voice busy note carries the helpline too, in the note's own language, for both busy signals (the mint 429 voice_busy fallback and the voice_busy error frame), and the busy wording itself is unchanged (0.1345ms)
✔ J1: a voice_busy error frame reaches the widget as an error event carrying its code and the helpline, which the busy notice then renders in full (0.207ms)
✔ J2: a mint refused with 403 voice_unavailable (voice switched off for this client or partner) is the off fallback, not unavailable-right-now and not busy: it frees the mic, opens no socket, and the widget says voice is not available here, please type, plus the helpline, in en and hi (0.3414ms)
✔ R1: the Hindi helpline line is built only from fragments copied verbatim from the approved Hindi text in packages/engine/src/student/lang.ts (LK10), and no new Hindi word is in the widget source (1.9539ms)
✔ S12 voice: only authenticated server confirm refresh events are surfaced, without inferring transcript approval (0.2453ms)
ℹ tests 97
ℹ suites 0
ℹ pass 97
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 463.9584

stderr: 
exit 0

## Final focused check
Command: node --test apps/widget/tests/floater.test.js apps/widget/tests/request.test.js apps/widget/tests/voice.test.js
✔ Q5: proxy Chat/Voice/Chat retains typed and voice history, releases the mic and makes fallback text usable (24.3611ms)
✔ VA18: VERSION is 1.1.0 and the hosted name keeps major 1 (0.3995ms)
✔ VA18 drag clamp: a rectangle dragged past any edge is pulled back inside the viewport (0.5167ms)
✔ VA18 clampRect: a window shrink pulls the size and the position inside; the size floor is 300 x 380 (0.1035ms)
✔ VA18 drag: a visitor drags the header with the pointer; the panel follows and stops at the viewport edges (0.528ms)
✔ VA18 drag: pressing a header button (close, toggle, pop-out) never starts a drag (0.2124ms)
✔ VA18 drag after a window resize: the panel is pulled back inside when the browser window shrinks (0.2588ms)
✔ VA18 drag before any drag: a window resize leaves the default CSS placement alone (0.2398ms)
✔ VA18 drag with a page scrollbar: the clamp uses the layout viewport (clientWidth), so the panel never slides under the scrollbar (0.2353ms)
✔ VA18 drag release lost: a pointermove that reports no button down ends the drag instead of dragging on (0.2678ms)
✔ VA18 resize: dragging the corner changes the size, never below 300 x 380, never past the viewport (0.2702ms)
✔ VA18 resize at phone width: at 360 x 640 the panel cannot be dragged or grown past the viewport (0.1941ms)
✔ VA18 toggle: with voice available the header shows Chat | Voice and Chat is selected (0.2234ms)
✔ VA18 toggle: Voice is hidden without opt-in, key or explicit proxy mint path (0.2622ms)
✔ VA18 shared history: a message sent in Chat is still there after Voice and back; one history, not copies (10.2705ms)
✔ VA18 toggle by keyboard: the mode buttons are real buttons (Enter/Space activate them) and sit in the header before pop-out and close (0.3393ms)
✔ VA18 voice mode: switching back to Chat ends a running voice call (the mic is released) (0.3536ms)
✔ VA18 voice add-on fails to load: the Voice toggle disappears again and Chat stays (0.132ms)
✔ VA18 pop-out URL: /vc-popout?site=<id> on the API origin (key mode), with no key and no token in it (0.1222ms)
✔ VA18 pop-out URL: proxy mode uses the host page origin for a relative proxy and the proxy's origin for an absolute one (0.1121ms)
✔ VA18 pop-out URL: no site id, an unsafe site id, or no usable origin means no pop-out (null) (0.1128ms)
✔ VA18 pop-out: the header button opens the URL in a new window with noopener; the chat so far is not sent anywhere (14.7714ms)
✔ VA18 pop-out: no site id configured means the pop-out button is not shown (0.1959ms)
✔ VA18 config: data-vc-site sets cfg.site; without it the partner id inside a vck_pub_ key is the site id (never the key itself) (0.3417ms)
✔ VA18 no storage: drag, resize, toggle, pop-out and a chat turn make zero localStorage / sessionStorage / indexedDB / cookie calls (15.7056ms)
✔ VA18 unchanged: key mode sends X-VC-Key, proxy mode sends no key, and the footer carries 14416 / 112 (31.029ms)
✔ VA18 unchanged: an escalated reply is the crisis block with the helpline (15.9367ms)
✔ VA18 unchanged: 401 shows 'Chat unavailable' and disables the box; 429 shows the Retry-After countdown (31.7482ms)
✔ VA18 unchanged: Esc closes the panel, focus returns to the bubble, and the roles/labels are kept (0.355ms)
✔ VA18 unchanged: the mic attaches only when voice is available and sits in the form before Send (0.2893ms)
✔ VA18 phone width: the default placement (before any drag) is CSS-fit to the viewport at 360 px (0.4202ms)
✔ S12 auth: loads owned ordered history, current memory and sends with fresh host headers (29.2816ms)
✔ S12 auth: manual transport Retry preserves clientTurnId, selected thread, draft and one user bubble (31.2516ms)
✔ S12 memory: reject carries exact candidate/version/value; stale409 refreshes without success or lost draft (31.463ms)
✔ S12 memory: only a fresh exact yes/no is a decision; ambiguous text asks again, historical yes is inert (31.2193ms)
✔ S12 lifecycle: destroy cancels late requests, voice, listeners and private state; remount stays clean (32.3722ms)
✔ S12 auth: unsafe proxy destination never receives credentials or requests (0.7743ms)
✔ S12 lifecycle: replaced memory prompt listeners are released and anonymous request aborts on teardown (29.8022ms)
✔ S12 voice: authenticated mint uses fresh host transport, selected server thread and destroy stops pending microphone start (1.2386ms)
✔ S12 memory: explicit confirm/correct/forget preserve displayed binding and readonly account fields (45.307ms)
✔ S12 auth: memory_changed requires a manual fresh Retry, ordinary errors keep id and new drafts survive (31.5982ms)
✔ S12 sessions: empty account creates a server thread; listed-thread failure preserves draft and foreign ids are refused (15.0216ms)
✔ S12 lifecycle: external detach triggers destroy and removes owned window listeners (0.3625ms)
✔ key mode: POST to <api>/v1/public/chat/turns with X-VC-Key and body exactly {text} (2.0105ms)
✔ proxy mode: POST to the proxy URL with the same body and NO X-VC-Key (0.281ms)
✔ a proxy config that also carries a key never sends the key (0.1597ms)
✔ open mode sends no key header (0.2028ms)
✔ 401 -> unavailable (chat unavailable) (0.1771ms)
✔ 429 -> rate with the Retry-After seconds (0.2255ms)
✔ Retry-After parsing: seconds, clamping, HTTP-date, junk and missing (0.1227ms)
✔ a network failure and a non-JSON 200 are distinct, safe results (0.1993ms)
✔ other errors carry the status and the helpline from the body (0.2554ms)
✔ a reply is normalised: message, claims, sources; unknown shapes are dropped (0.3822ms)
✔ an unknown state is treated as ok and a missing message becomes empty text (0.0913ms)
✔ sanitizeUrl allows only http and https absolute URLs (0.7436ms)
✔ the source never uses storage, cookies, eval or HTML injection (0.8034ms)
✔ visitor taps the mic: the browser is asked for the microphone, a session is minted with the page key and no cookies, the socket offers the vc-voice-v1 and token protocols, and start names the anonymous thread (2.5455ms)
✔ mic audio goes out as binary frames once the socket is open, and not before (0.3742ms)
✔ the visitor's page key sits in a header only: the session URL carries no key and the cookie jar is not used (0.2108ms)
✔ Q5: injected proxy mint uses same-origin authentication and only the returned owned thread (0.5269ms)
✔ Q5: proxy refuses malformed binding/credentials before opening a socket and frees the mic (0.7835ms)
✔ Q5: proxy permission denial, missing mic and unavailable mint return to text without leaking resources (0.3591ms)
✔ live transcript: partial words grow in place, a final line closes them, for the visitor and for the counsellor's reply (0.3128ms)
✔ the counsellor's audio frames are played; sources arrive as data for the log, never as markup (0.282ms)
✔ a crisis turn shows the helpline (14416 and 112) once, whether the flag, the state or both arrive, and nothing else: no paraphrase of the server's fixed wording (0.2712ms)
✔ the widget renders the voice crisis notice as the helpline line only, exactly like the text chat's escalated reply (14416 and 112 shown, no free text) (0.9898ms)
✔ a state escalated on its own (no flag) is also a crisis; an ordinary ok state is not (0.1751ms)
✔ other flags (uncited number, named speaker) do not raise the crisis notice (0.102ms)
✔ a confirm event is never answered by the widget: an anonymous visitor has no profile to confirm into (0.1154ms)
✔ mic permission denied: no session is minted, no socket is opened, and the widget falls back to text with the reason (0.2097ms)
✔ no microphone at all (NotFoundError) or no getUserMedia in the browser also falls back to text (0.1081ms)
✔ a refused mint falls back to text and frees the mic: 401/403 unavailable, 429 waits as told, 5xx and offline are errors (0.3869ms)
✔ a malformed mint answer is refused before any socket: no token, a non-ws URL, a javascript: URL, a plain http URL (0.2497ms)
✔ a socket that never opens (error before open) falls back to text and frees the mic (0.1228ms)
✔ the not_started error for the first frames before the provider is ready is ignored; real errors are shown with the helpline (0.1634ms)
✔ tapping stop sends end, closes the socket, releases the mic and the audio, and a second stop is harmless (0.1122ms)
✔ the server ending the session (time cap, idle, superseded) releases the mic and reports it once (0.0769ms)
✔ tapping stop while still connecting cancels cleanly: the mic is released and no socket is left open (5.8198ms)
✔ cancel then restart while the first mic prompt is pending: the stale prompt's stream is stopped when it resolves, in either resolve order (0.7658ms)
✔ a stale start never stops the newer start's microphone (0.3221ms)
✔ a second tap on start while a session is running does nothing (0.1092ms)
✔ bad frames from the server (not JSON, not an object) are ignored, not thrown (0.1037ms)
✔ voice needs a key or explicit proxy endpoint: unconfigured proxy and open modes have no session URL (0.1574ms)
✔ the mic add-on is fetched from the folder the widget was loaded from, under the versioned name (0.0958ms)
✔ mic samples are downsampled to 16 kHz PCM16 little-endian, clamped, with no NaN leaking through (0.1957ms)
✔ counsellor PCM16 is decoded to floats, an odd trailing byte is dropped (0.0978ms)
✔ voice.js keeps nothing: no storage, cookie, IndexedDB or innerHTML, and no eval (0.3553ms)
✔ the shared constants: the exported helpline matches the footer's helpline, and the version has a major for the file name (0.0641ms)
✔ nginx-vc.conf serves the widget script under its versioned name and the vc-widget.js alias, ahead of the /widget/ 404 and the /v1/ 404 (0.1279ms)
✔ nginx-vc.conf proxies the anonymous voice session route and the voice stream with the WebSocket upgrade, and sets the client address itself (0.1508ms)
✔ the snippet and nginx-vc.conf agree on the widget locations (0.215ms)
✔ H3: a 429 voice_busy from the session mint is a busy fallback (not rate, not network) that waits as told, frees the mic and opens no socket (0.249ms)
✔ H3: the widget words the busy state in English and Hindi (page language), keeps the other voice fallback texts, and a voice_busy error frame gets the same busy note instead of the raw server text (0.3787ms)
✔ H3: the busy/ended frames keep the crisis path intact: a crisis flag still shows the helpline only, and the helpline text is unchanged (0.1101ms)
✔ J1: the voice busy note carries the helpline too, in the note's own language, for both busy signals (the mint 429 voice_busy fallback and the voice_busy error frame), and the busy wording itself is unchanged (0.1215ms)
✔ J1: a voice_busy error frame reaches the widget as an error event carrying its code and the helpline, which the busy notice then renders in full (0.0909ms)
✔ J2: a mint refused with 403 voice_unavailable (voice switched off for this client or partner) is the off fallback, not unavailable-right-now and not busy: it frees the mic, opens no socket, and the widget says voice is not available here, please type, plus the helpline, in en and hi (0.2459ms)
✔ R1: the Hindi helpline line is built only from fragments copied verbatim from the approved Hindi text in packages/engine/src/student/lang.ts (LK10), and no new Hindi word is in the widget source (1.9613ms)
✔ S12 voice: only authenticated server confirm refresh events are surfaced, without inferring transcript approval (0.188ms)
ℹ tests 99
ℹ suites 0
ℹ pass 99
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 503.6408

stderr: 
exit 0

## Self-check and inspected state
{
  "checks": [
    {
      "path": "apps/widget/src/vc-widget.js",
      "exit": 0,
      "stdout": "",
      "stderr": ""
    },
    {
      "path": "apps/widget/src/voice.js",
      "exit": 0,
      "stdout": "",
      "stderr": ""
    }
  ],
  "diffcheck": {
    "stdout": "",
    "stderr": "warning: in the working copy of 'apps/widget/src/vc-widget.js', LF will be replaced by CRLF the next time Git touches it\nwarning: in the working copy of 'apps/widget/src/voice.js', LF will be replaced by CRLF the next time Git touches it\nwarning: in the working copy of 'apps/widget/tests/floater.test.js', LF will be replaced by CRLF the next time Git touches it\nwarning: in the working copy of 'apps/widget/tests/voice.test.js', LF will be replaced by CRLF the next time Git touches it\n"
  },
  "identities": {
    "apps/widget/src/vc-widget.js": "57561aaefa5bad18810906edd8a163fcdce2695f2c36f8a32027b26e1be11da5",
    "apps/widget/src/voice.js": "4eab2c9e3199279c46e8f5b45b2e4a2aa81d5edc4078fc71d8894405bbf8a615",
    "apps/widget/tests/floater.test.js": "e412666dff1ab736211ba8db7d3a931998e6b24e2e80806f150785f58c6613c8",
    "apps/widget/tests/voice.test.js": "65c1d05145f69d6546c6910c4eaf9a744e990af3856b2c122be46f3e9bda8c5e"
  },
  "mainWidgetStartHash": "8be9985a9d1084dca44ee75b3bcb11787bbce42fafbc1ebb82b6b60266af8a10",
  "mainWidgetFinalHash": "8be9985a9d1084dca44ee75b3bcb11787bbce42fafbc1ebb82b6b60266af8a10",
  "mainWidgetUnchanged": true
}

## Contribution closeout
Status: owned implementation locally verified, ready for root integration; no independent verdict and no feature PASS. One named S12 contribution under T057 preserved lineage. No reset or historical tracker/verdict/receipt/cost modification.

Owned writes: apps/widget/src/vc-widget.js (existing send/mount seams), apps/widget/src/voice.js (existing onMessage seam), existing apps/widget/tests/floater.test.js and voice.test.js, this QA evidence only. request.test.js was run unchanged. Existing test byte prefixes preserved: {"apps/widget/tests/floater.test.js":true,"apps/widget/tests/voice.test.js":true}. Other pre-existing widget README/config/voice WIP remains; git diff from HEAD includes those pre-existing changes and is not all attributable to this contribution.

Final commands: node --test apps/widget/tests/floater.test.js apps/widget/tests/request.test.js apps/widget/tests/voice.test.js =>99 pass,0 fail, exit0. node --check apps/widget/src/vc-widget.js and node --check apps/widget/src/voice.js =>exit0. git diff --check -- <four owned source/test paths> =>exit0, no whitespace errors (only existing Windows LF/CRLF notices). No full suite.

Protocol identity at safe boundary: {"maker":"236bc0e7c075f9729ef464dbd8aa2bdbec02754e95e228c936480c96d4c8fe39","checker":"835d6a2764c50567b4573c7aa8f4f991430e2240a46107256b4a07d934799cf1"}. Existing proportional-verification/2026-10-19.17 retained; no repin/new checker/model override.

Interfaces: candidateId/version/expectedVersion are bounded opaque strings, aligned to completion-memory-db.md and current schema; do not coerce versions to numbers. Text yes/no is recognized only on a fresh single currently displayed candidate in selected owned thread; historical transcript/model text never drives this client decision operation. Candidate buttons and text choices use exact displayed value and opaque refs through existing HTTP decision route. Ambiguous choice reasks; multiple choices require explicit buttons. Correct and Forget are explicit controls; account facts remain readonly. Stale409 refreshes profile, keeps draft, and requires manual Retry; stale-answer Retry uses a fresh key only for explicit memory/policy-stale server errors, normal transport Retry keeps the key and one bubble. No automatic generation.

Host wrapper integration: mount returns ready/destroy plus thread/profile methods. Await ready as needed, load the existing voice add-on from the approved widget script folder and call handle.attachVoice(window.VCWidgetVoice) (programmatic mount does not itself load a script). Wrapper must call destroy on logout/account change/unmount, then remount using current host callbacks; detach observer also destroys removed hosts. Voice mint goes through the same current auth callback/injected Response transport with selected server-owned threadId. Server confirm events only trigger an authoritative profile refresh; final speech decision/prompt binding and provider-memory invalidation remain central/root responsibilities, never client transcript inference.

Open root integration/final checks: actual host mounted UI and browser/voice allow-deny/reconnect walks; HTTP/DTO/prompt agreement with central handlers and both host proxies; final cross-session/background publication-memory races and tenant/account authorization. This synthetic test set proves local widget behavior only and cannot close Q6/live acceptance. Main widget start/final hash matches; no main source/index write command, staging, reset, commit, push or deploy was performed. No provider/DB/network/browser execution.

Learning within owned evidence: use actual peer-pinned opaque version DTOs before finalizing fixtures; release dynamic memory-button callbacks when replacing/forgetting prompts, and invalidate async/voice callbacks plus abort requests on destroy.

Current existing-function locations:
{
  "apps/widget/src/vc-widget.js": [
    {
      "line": 265,
      "text": "async function send(cfg, text, fetchImpl, signal) {"
    },
    {
      "line": 369,
      "text": "function mount(cfg, doc, fetchImpl, env) {"
    },
    {
      "line": 630,
      "text": "async function refreshProfile() {"
    },
    {
      "line": 674,
      "text": "async function decideMemory(choice, action) {"
    },
    {
      "line": 693,
      "text": "async function selectThread(id) {"
    },
    {
      "line": 716,
      "text": "async function newThread() {"
    },
    {
      "line": 729,
      "text": "async function submitAuthenticated() {"
    },
    {
      "line": 762,
      "text": "function destroy() {"
    }
  ],
  "apps/widget/src/voice.js": [
    {
      "line": 355,
      "text": "case \"confirm\":"
    }
  ]
}
