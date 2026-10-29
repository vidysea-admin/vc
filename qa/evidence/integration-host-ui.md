# integration-host-ui — S12 same T057/cycle2

Status: OWNED SOURCE READY FOR ROOT INTEGRATION, self-check only; final closeout/current limits at end. No feature verdict; prior failures/costs/receipts preserved.
Round: existing 3 host product files, existing widget product file and existing test files, est 25 min — candidate forwarding, mounted SDK config, focused checks; root final review/browser/provider remain separate.

Installed maker/checker reread at safe boundary. Policy check: proportional-verification/2026-10-19.17 targets=2 drift=0; exit0. No repin/model override.
Shell runner failed before process creation helper_unknown_error/setup refresh; Node child runtime works; escalated shell also works for authorized isolated host files.

## Concrete root interface requests
CORE-REQUEST: isolated Pathlynks backend controllers/pathlynks_quest_controller.js aiChat line1327 currently drops result.memoryConfirmation from successful central reply. Forward validated optional result.memoryConfirmation; UI consumes this only for a fresh current response. Backend ownership untouched.
CORE-REQUEST: central 409 memory_changed currently covers both unpublished stale output and published cached replay; expose an explicit retryWithNewTurn=true only for stale published replay through both host proxies. UI cannot infer publication safely from generic memory_changed. Normal transport/unpublished Retry must retain its id.

## Red host regressions
```text
{
  "cmd": [
    "C:/Program Files/nodejs/node.exe",
    "--test",
    "--test-name-pattern=^S12 host",
    "scripts/student-contract-browser.test.cjs"
  ],
  "cwd": "D:/vc/.worktrees/quest-pathlynks-frontend",
  "code": 1,
  "out": "✖ S12 host service forwards only exact candidate and current prompt fields (3.6762ms)\n✖ S12 host fresh conversational yes is bound to a current server prompt; history never creates authority (53.7656ms)\n✖ S12 host candidate reject binds displayed new value and selected thread (10.4017ms)\nℹ tests 3\nℹ suites 0\nℹ pass 0\nℹ fail 3\nℹ cancelled 0\nℹ skipped 0\nℹ todo 0\nℹ duration_ms 487.9746\n\n✖ failing tests:\n\ntest at scripts\\student-contract-browser.test.cjs:501:1\n✖ S12 host service forwards only exact candidate and current prompt fields (3.6762ms)\n  AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal:\n  + actual - expected\n  ... Skipped lines\n  \n    [\n      [\n        'api/pathlynks-quest/ai/chat',\n        {\n          clientTurnId: 'compose-one',\n          island: 'career-selection',\n  -       memoryConfirmation: {\n  -         candidateId: 'candidate-one',\n  -         expectedVersion: 'version-one',\n  -         factId: 'fact-one',\n  -         promptId: 'prompt-one',\n  -         value: 'Germany'\n  -       },\n          message: 'yes',\n          role: 'coach',\n          threadId: 'thread-a'\n        }\n      ],\n  ...\n          action: 'reject',\n  -       candidateId: 'candidate-one',\n  -       expectedVersion: 'version-one',\n  -       threadId: 'thread-a',\n  -       value: 'Germany'\n        }\n      ]\n    ]\n  \n      at TestContext.<anonymous> (D:\\vc\\.worktrees\\quest-pathlynks-frontend\\scripts\\student-contract-browser.test.cjs:508:10)\n      at async Test.run (node:internal/test_runner/test:1110:7)\n      at async startSubtestAfterBootstrap (node:internal/test_runner/harness:358:3) {\n    generatedMessage: true,\n    code: 'ERR_ASSERTION',\n    actual: [ [ 'api/pathlynks-quest/ai/chat', [Object] ], [ 'api/pathlynks-quest/ai/profile/facts/fact-one/decision', [Object] ] ],\n    expected: [ [ 'api/pathlynks-quest/ai/chat', [Object] ], [ 'api/pathlynks-quest/ai/profile/facts/fact-one/decision', [Object] ] ],\n    operator: 'deepStrictEqual',\n    diff: 'simple'\n  }\n\ntest at scripts\\student-contract-browser.test.cjs:513:1\n✖ S12 host fresh conversational yes is bound to a current server prompt; history never creates authority (53.7656ms)\n  SyntaxError: \"undefined\" is not valid JSON\n      at JSON.parse (<anonymous>)\n      at TestContext.<anonymous> (D:\\vc\\.worktrees\\quest-pathlynks-frontend\\scripts\\student-contract-browser.test.cjs:519:25)\n      at async Test.run (node:internal/test_runner/test:1110:7)\n      at async Test.processPendingSubtests (node:internal/test_runner/test:785:7)\n\ntest at scripts\\student-contract-browser.test.cjs:523:1\n✖ S12 host candidate reject binds displayed new value and selected thread (10.4017ms)\n  AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal:\n  + actual - expected\n  \n    [\n      'fact-one',\n      'reject',\n      'Germany',\n  -   {\n  -     candidateId: 'candidate-one',\n  -     expectedVersion: 'version-one',\n  -     threadId: 'thread-a'\n  -   }\n    ]\n  \n      at TestContext.<anonymous> (D:\\vc\\.worktrees\\quest-pathlynks-frontend\\scripts\\student-contract-browser.test.cjs:527:10)\n      at async Test.run (node:internal/test_runner/test:1110:7)\n      at async Test.processPendingSubtests (node:internal/test_runner/test:785:7) {\n    generatedMessage: true,\n    code: 'ERR_ASSERTION',\n    actual: [ 'fact-one', 'reject', 'Germany' ],\n    expected: [ 'fact-one', 'reject', 'Germany', { candidateId: 'candidate-one', expectedVersion: 'version-one', threadId: 'thread-a' } ],\n    operator: 'deepStrictEqual',\n    diff: 'simple'\n  }\n",
  "err": ""
}
```

## Widget binding red
```text
{
  "cmd": [
    "C:/Program Files/nodejs/node.exe",
    "--test",
    "--test-name-pattern=^(S12 memory: reject|S12 memory: explicit|S12 auth: unpublished)",
    "apps/widget/tests/floater.test.js"
  ],
  "cwd": "D:/vc/.worktrees/vc-completion",
  "code": 1,
  "out": "✖ S12 memory: reject carries exact candidate/version/value; stale409 refreshes without success or lost draft (40.2684ms)\n✖ S12 memory: explicit confirm/correct/forget preserve displayed binding and readonly account fields (14.1606ms)\n✖ S12 auth: unpublished memory change retains id for deliberate Retry (32.3129ms)\nℹ tests 3\nℹ suites 0\nℹ pass 0\nℹ fail 3\nℹ cancelled 0\nℹ skipped 0\nℹ todo 0\nℹ duration_ms 282.4068\n\n✖ failing tests:\n\ntest at apps\\widget\\tests\\floater.test.js:608:1\n✖ S12 memory: reject carries exact candidate/version/value; stale409 refreshes without success or lost draft (40.2684ms)\n  AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal:\n  + actual - expected\n  \n    {\n      action: 'reject',\n      candidateId: 'candidate-2',\n      expectedVersion: 'version-2',\n  -   threadId: 'owned-1',\n      value: 'Germany'\n    }\n  \n      at TestContext.<anonymous> (D:\\vc\\.worktrees\\vc-completion\\apps\\widget\\tests\\floater.test.js:617:10)\n      at async Test.run (node:internal/test_runner/test:1110:7)\n      at async startSubtestAfterBootstrap (node:internal/test_runner/harness:358:3) {\n    generatedMessage: true,\n    code: 'ERR_ASSERTION',\n    actual: { action: 'reject', value: 'Germany', candidateId: 'candidate-2', expectedVersion: 'version-2' },\n    expected: { action: 'reject', value: 'Germany', candidateId: 'candidate-2', expectedVersion: 'version-2', threadId: 'owned-1' },\n    operator: 'deepStrictEqual',\n    diff: 'simple'\n  }\n\ntest at apps\\widget\\tests\\floater.test.js:672:1\n✖ S12 memory: explicit confirm/correct/forget preserve displayed binding and readonly account fields (14.1606ms)\n  AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal:\n  + actual - expected\n  \n    {\n      action: 'confirm',\n      candidateId: 'candidate-2',\n      expectedVersion: 'version-2',\n  -   threadId: 'owned-1',\n      value: 'Germany'\n    }\n  \n      at TestContext.<anonymous> (D:\\vc\\.worktrees\\vc-completion\\apps\\widget\\tests\\floater.test.js:684:10)\n      at async Test.run (node:internal/test_runner/test:1110:7)\n      at async Test.processPendingSubtests (node:internal/test_runner/test:785:7) {\n    generatedMessage: true,\n    code: 'ERR_ASSERTION',\n    actual: { action: 'confirm', value: 'Germany', candidateId: 'candidate-2', expectedVersion: 'version-2' },\n    expected: { action: 'confirm', value: 'Germany', candidateId: 'candidate-2', expectedVersion: 'version-2', threadId: 'owned-1' },\n    operator: 'deepStrictEqual',\n    diff: 'simple'\n  }\n\ntest at apps\\widget\\tests\\floater.test.js:723:1\n✖ S12 auth: unpublished memory change retains id for deliberate Retry (32.3129ms)\n  AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:\n  + actual - expected\n  \n  + 'dd238557-57fb-47ad-9364-697016f82fc2'\n  - 'turn-1793115114386-1v6xiamrldi'\n  \n      at TestContext.<anonymous> (D:\\vc\\.worktrees\\vc-completion\\apps\\widget\\tests\\floater.test.js:726:66)\n      at async Test.run (node:internal/test_runner/test:1110:7)\n      at async Test.processPendingSubtests (node:internal/test_runner/test:785:7) {\n    generatedMessage: true,\n    code: 'ERR_ASSERTION',\n    actual: 'dd238557-57fb-47ad-9364-697016f82fc2',\n    expected: 'turn-1793115114386-1v6xiamrldi',\n    operator: 'strictEqual',\n    diff: 'simple'\n  }\n",
  "err": ""
}
```

## Integration result and current wire interfaces

Owned changes are ready for parent integration self-check only. No feature PASS, checker verdict, lineage/cost reset, commit, push or deployment. Main D:/vc source/index was not edited. No new product/test module/collection, dependency install or model override. voice.js and central/backend/Admin files were not edited.

- Existing Vidysea ChatWidget.tsx now passes dataset and script URL to the actual shared SDK parseConfig signature, checks config.ok, bounds SDK loading at10seconds, handles captureSession refusal, removes owned voice script callbacks on teardown, and forwards the explicit Retry marker in sanitized error Responses. Existing page continues selecting ONE shared wrapper only for NEXT_PUBLIC_VC_STUDENT_CENTRAL_ENABLED=true, legacy VideoCounsellor otherwise. NEXT_PUBLIC_VC_WIDGET_SCRIPT_URL remains a public asset URL only.
- Existing Pathlynks aiChat optional sixth argument is a current memoryConfirmation. Only factId/candidateId/expectedVersion/value/promptId cross the service; no identities or arbitrary browser fields. Guide derives this only from a successful current owned-thread reply, clears it on history/session change and decisions, binds fresh English/Hindi yes/no or ambiguous reply to the server ref, and preserves that ref on ordinary transport Retry.
- Existing decideAIMemory optional fourth argument carries candidateId/expectedVersion/threadId. Guide confirms/rejects pendingChange.value, displays old/new values, keeps correction/Forget semantics, stops voice before changes, and refreshes on409 without claiming local success.
- Existing shared widget decision POST now includes selected owned threadId. Both UIs retain clientTurnId and one user bubble for ordinary/unpublished Retry. Only response retryWithNewTurn===true with a stale snapshot error schedules id rotation on the NEXT manual Retry; no automatic generation. Central and BOTH host proxies must supply/forward that marker exclusively for stale published replay. That root-owned completion is not inferred from generic409.

## Final focused commands/output

Windows Node v24.13.1; configured providers/models unchanged. All payloads synthetic, offline/mocked transport. Test selection came from existing function reference hits and sibling UI consumers. No helper acceptance or whole suite.

Command (completion cwd): node --test apps/widget/tests/config.test.js apps/widget/tests/floater.test.js apps/widget/tests/request.test.js
✔ key mode: data-vc-key, api defaults to the script origin (1.3761ms)
✔ data-vc-api overrides the origin and a trailing slash is trimmed (0.2153ms)
✔ proxy mode: data-vc-proxy is the post target as-is and wins over a key (0.1319ms)
✔ no key and no proxy is open mode (the anonymous route without a key) (0.1062ms)
✔ rejects a non-http(s) api and a protocol-relative or javascript proxy (0.1519ms)
✔ accepts an absolute https proxy (0.1092ms)
✔ title and colour have defaults, are trimmed and capped, and a bad colour falls back (0.1702ms)
✔ data-vc-voice=on is parsed (the mic itself is covered by voice.test.js); anything else is off (0.098ms)
✔ contrastText picks readable text for the bubble colour (0.1558ms)
✔ Q5: explicit same-origin voice proxy enables authenticated voice without retaining browser identity or keys (0.3622ms)
✔ the file version matches package.json; the hosted name carries the major (vc-widget.v1.js) (0.4106ms)
✔ S12 manual SDK loading exports library without an automatic anonymous mount (2.106ms)
✔ Q5: proxy Chat/Voice/Chat retains typed and voice history, releases the mic and makes fallback text usable (23.1491ms)
✔ VA18: VERSION is 1.1.0 and the hosted name keeps major 1 (0.4648ms)
✔ VA18 drag clamp: a rectangle dragged past any edge is pulled back inside the viewport (0.5501ms)
✔ VA18 clampRect: a window shrink pulls the size and the position inside; the size floor is 300 x 380 (0.1024ms)
✔ VA18 drag: a visitor drags the header with the pointer; the panel follows and stops at the viewport edges (0.5206ms)
✔ VA18 drag: pressing a header button (close, toggle, pop-out) never starts a drag (0.2065ms)
✔ VA18 drag after a window resize: the panel is pulled back inside when the browser window shrinks (0.2577ms)
✔ VA18 drag before any drag: a window resize leaves the default CSS placement alone (0.1868ms)
✔ VA18 drag with a page scrollbar: the clamp uses the layout viewport (clientWidth), so the panel never slides under the scrollbar (0.2494ms)
✔ VA18 drag release lost: a pointermove that reports no button down ends the drag instead of dragging on (0.3461ms)
✔ VA18 resize: dragging the corner changes the size, never below 300 x 380, never past the viewport (0.3284ms)
✔ VA18 resize at phone width: at 360 x 640 the panel cannot be dragged or grown past the viewport (0.2093ms)
✔ VA18 toggle: with voice available the header shows Chat | Voice and Chat is selected (0.2227ms)
✔ VA18 toggle: Voice is hidden without opt-in, key or explicit proxy mint path (0.2532ms)
✔ VA18 shared history: a message sent in Chat is still there after Voice and back; one history, not copies (9.7444ms)
✔ VA18 toggle by keyboard: the mode buttons are real buttons (Enter/Space activate them) and sit in the header before pop-out and close (0.3419ms)
✔ VA18 voice mode: switching back to Chat ends a running voice call (the mic is released) (0.502ms)
✔ VA18 voice add-on fails to load: the Voice toggle disappears again and Chat stays (0.1884ms)
✔ VA18 pop-out URL: /vc-popout?site=<id> on the API origin (key mode), with no key and no token in it (0.1215ms)
✔ VA18 pop-out URL: proxy mode uses the host page origin for a relative proxy and the proxy's origin for an absolute one (0.0959ms)
✔ VA18 pop-out URL: no site id, an unsafe site id, or no usable origin means no pop-out (null) (0.1112ms)
✔ VA18 pop-out: the header button opens the URL in a new window with noopener; the chat so far is not sent anywhere (13.9134ms)
✔ VA18 pop-out: no site id configured means the pop-out button is not shown (0.2062ms)
✔ VA18 config: data-vc-site sets cfg.site; without it the partner id inside a vck_pub_ key is the site id (never the key itself) (0.3524ms)
✔ VA18 no storage: drag, resize, toggle, pop-out and a chat turn make zero localStorage / sessionStorage / indexedDB / cookie calls (14.8113ms)
✔ VA18 unchanged: key mode sends X-VC-Key, proxy mode sends no key, and the footer carries 14416 / 112 (31.7962ms)
✔ VA18 unchanged: an escalated reply is the crisis block with the helpline (15.8528ms)
✔ VA18 unchanged: 401 shows 'Chat unavailable' and disables the box; 429 shows the Retry-After countdown (30.6609ms)
✔ VA18 unchanged: Esc closes the panel, focus returns to the bubble, and the roles/labels are kept (0.2166ms)
✔ VA18 unchanged: the mic attaches only when voice is available and sits in the form before Send (0.2165ms)
✔ VA18 phone width: the default placement (before any drag) is CSS-fit to the viewport at 360 px (0.357ms)
✔ S12 auth: loads owned ordered history, current memory and sends with fresh host headers (30.8867ms)
✔ S12 auth: manual transport Retry preserves clientTurnId, selected thread, draft and one user bubble (31.9591ms)
✔ S12 memory: reject carries exact candidate/version/value; stale409 refreshes without success or lost draft (31.6468ms)
✔ S12 memory: only a fresh exact yes/no is a decision; ambiguous text asks again, historical yes is inert (31.0367ms)
✔ S12 lifecycle: destroy cancels late requests, voice, listeners and private state; remount stays clean (32.091ms)
✔ S12 auth: unsafe proxy destination never receives credentials or requests (0.4466ms)
✔ S12 lifecycle: replaced memory prompt listeners are released and anonymous request aborts on teardown (31.0661ms)
✔ S12 voice: authenticated mint uses fresh host transport, selected server thread and destroy stops pending microphone start (1.2115ms)
✔ S12 memory: explicit confirm/correct/forget preserve displayed binding and readonly account fields (46.5835ms)
✔ S12 auth: memory_changed requires a manual fresh Retry, ordinary errors keep id and new drafts survive (31.8967ms)
✔ S12 sessions: empty account creates a server thread; listed-thread failure preserves draft and foreign ids are refused (15.8656ms)
✔ S12 lifecycle: external detach triggers destroy and removes owned window listeners (0.5983ms)
✔ S12 auth: unpublished memory change retains id for deliberate Retry (31.3479ms)
✔ key mode: POST to <api>/v1/public/chat/turns with X-VC-Key and body exactly {text} (1.9708ms)
✔ proxy mode: POST to the proxy URL with the same body and NO X-VC-Key (0.2701ms)
✔ a proxy config that also carries a key never sends the key (0.1508ms)
✔ open mode sends no key header (0.1761ms)
✔ 401 -> unavailable (chat unavailable) (0.1677ms)
✔ 429 -> rate with the Retry-After seconds (0.2074ms)
✔ Retry-After parsing: seconds, clamping, HTTP-date, junk and missing (0.1256ms)
✔ a network failure and a non-JSON 200 are distinct, safe results (0.1976ms)
✔ other errors carry the status and the helpline from the body (0.2385ms)
✔ a reply is normalised: message, claims, sources; unknown shapes are dropped (0.3699ms)
✔ an unknown state is treated as ok and a missing message becomes empty text (0.0905ms)
✔ sanitizeUrl allows only http and https absolute URLs (0.6434ms)
✔ the source never uses storage, cookies, eval or HTML injection (0.7451ms)
ℹ tests 69
ℹ suites 0
ℹ pass 69
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 531.555

Exit: 0

Command (isolated Pathlynks frontend cwd): node --test --test-name-pattern='^(Quest|S12)' scripts/student-contract-browser.test.cjs
✔ Quest host service uses authenticated interceptor and excludes browser facts/identity from payloads (2.1548ms)
✔ Quest host component retains failed input and retries the same composed turn without duplicate bubble (38.4294ms)
✔ Quest host timeout-after-success history followed by Retry does not duplicate the displayed central turn (8.79ms)
[baseline-browser-mapping] The data in this module is over two months old.  To ensure accurate Baseline data, please update: `npm i baseline-browser-mapping@latest -D`
Received `false` for a non-boolean attribute `drag`.

If you want to write it to the DOM, pass a string instead: drag="false" or drag={value.toString()}.

If you used to conditionally omit it with drag={condition && value}, pass drag={condition ? value : undefined} instead.
React does not recognize the `dragControls` prop on a DOM element. If you intentionally want it to appear in the DOM as a custom attribute, spell it as lowercase `dragcontrols` instead. If you accidentally passed it from a parent component, remove it from the DOM element.
React does not recognize the `dragListener` prop on a DOM element. If you intentionally want it to appear in the DOM as a custom attribute, spell it as lowercase `draglistener` instead. If you accidentally passed it from a parent component, remove it from the DOM element.
React does not recognize the `dragMomentum` prop on a DOM element. If you intentionally want it to appear in the DOM as a custom attribute, spell it as lowercase `dragmomentum` instead. If you accidentally passed it from a parent component, remove it from the DOM element.
✔ Quest host component voice uses interceptor mint, appends to same log, stops mic and refreshes redacted history (18.2451ms)
✔ Quest host component cancels pending add-on load when returning to Chat (7.8769ms)
✔ Quest host actual React render retains Guide, Chat/Voice controls and disabled locked navigation chip (202.0569ms)
✔ Quest host actual shared voice add-on binds interceptor mint thread and releases mic without credential URL/storage (8.5145ms)
✔ Quest memory UI reload selects owned latest, new chat preserves memory and retry thread identity (6.1388ms)
✔ Quest memory UI fences delayed chat mint transcripts and profile on switching and rejects failed opens (9.2127ms)
✔ Quest memory UI failed create blocks sends and retry restores originating draft after reopen (4.8833ms)
✔ Quest memory UI fences delayed list create history and account profile before effect cleanup (4.7878ms)
✔ Quest memory service uses interceptor for bounded sessions and memory and forwards only resource selectors (1.0988ms)
✔ Quest memory UI decision outranks a delayed pre-decision memory read (3.9992ms)
✔ Quest memory UI late history refresh cannot replace a newly composed answer (5.1635ms)
✔ Quest memory actual React renders sidebar and editable provenance with live fields read-only (46.0427ms)
✔ Quest selection UI reload restores server-selected older session outside listed first page (10.8656ms)
✔ Quest selection UI late reload cannot override current session or retry ownership (7.7105ms)
✔ S12 host service forwards only exact candidate and current prompt fields (1.3438ms)
✔ S12 host fresh conversational yes is bound to a current server prompt; history never creates authority (3.9927ms)
✔ S12 host candidate reject binds displayed new value and selected thread (3.5599ms)
✔ S12 host unpublished stale turn keeps transport id; explicit published marker rotates only on manual Retry (6.7519ms)
ℹ tests 21
ℹ suites 0
ℹ pass 21
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 671.0689
warning: in the working copy of 'scripts/student-contract-browser.test.cjs', LF will be replaced by CRLF the next time Git touches it
warning: in the working copy of 'src/components/career-quest/AIChatWidget.jsx', LF will be replaced by CRLF the next time Git touches it
warning: in the working copy of 'src/services/pathlynksQuestService.js', LF will be replaced by CRLF the next time Git touches it

Exit: 0
The static React fixture emits existing Motion prop warnings. No acceptance claim from warning-free output.

Command: node -e <mounted harness below>, cwd D:/vc/.worktrees/vc-vidysea-frontend
PASS mounted actual Vidysea page + ChatWidget + shared SDK: authenticated history/send,409 Retry,account cleanup,session invalidation,legacy flag

Exit:0
This mounts actual current TSX page/wrapper and actual shared SDK under real React19/jsdom with synthetic useAuth/apiCall/captureSession. It checks authenticated history/send, the published Retry error marker, single mount, account replacement cleanup, session invalidation and legacy flag. It does not prove real browser rendering, microphone permission or provider behavior.

```js

const fs=require('fs'),assert=require('node:assert/strict'),ts=require('typescript');
const {JSDOM}=require('jsdom');const dom=new JSDOM('<!doctype html><div id="root"></div>',{url:'https://synthetic.example.test/student/ai-counsellor',pretendToBeVisual:true});
global.window=dom.window;global.document=window.document;Object.defineProperty(global,'navigator',{value:window.navigator,configurable:true});global.IS_REACT_ACT_ENVIRONMENT=true;window.Response=global.Response;
const React=require('react'),{createRoot}=require('react-dom/client');let auth={user:{id:'synthetic-one'},isLoading:false},current=true,calls=[],destroyed=0,mounted=0,handles=[],failTurn=false;
const apiCall=async(endpoint,init={})=>{calls.push({endpoint,init});if(endpoint.endsWith('/runtime'))return {mode:'central',apiBase:'/api/v1/student/ai-counsellor/vc'};if(endpoint.endsWith('/profile'))return {memory:{items:[]}};if(endpoint.endsWith('/threads'))return {threads:[{threadId:'owned-one',createdAt:'2026-10-27T00:00:00Z'}]};if(endpoint.endsWith('/threads/owned-one'))return {threadId:'owned-one',turns:[]};if(endpoint.endsWith('/turns')){if(failTurn)throw Object.assign(Error('changed'),{status:409,response:{error:'memory_changed',retryWithNewTurn:true}});return {state:'ok',message:'Synthetic current answer',claims:[],sources:[],profileFactsUsed:[]}}throw Error('Unexpected resource '+endpoint)};
const captureSession=()=>({assertCurrent(){if(!current)throw Object.assign(Error('changed'),{code:'SESSION_CHANGED'})}});
window.VCWidget=require('D:/vc/.worktrees/vc-completion/apps/widget/src/vc-widget.js');const original=window.VCWidget.mount;window.VCWidget.mount=(...args)=>{mounted++;const h=original(...args),d=h.destroy;h.destroy=()=>{destroyed++;d()};handles.push(h);return h};
window.VCWidgetVoice={create:()=>({start:async()=>true,stop(){},state:()=> 'idle'})};process.env.NEXT_PUBLIC_VC_WIDGET_SCRIPT_URL='https://assets.example.test/vc-widget.v1.js';process.env.NEXT_PUBLIC_VC_STUDENT_CENTRAL_ENABLED='true';
function compile(p,mocks){const code=ts.transpileModule(fs.readFileSync(p,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;const m={exports:{}};new Function('require','module','exports',code)(s=>s in mocks?mocks[s]:require(s),m,m.exports);return m.exports.default}
const ChatWidget=compile('src/components/student/ChatWidget.tsx',{'@/context/student/AuthContext':{useAuth:()=>auth},'@/lib/api':{apiCall,captureSession}});
const Legacy=()=>React.createElement('div',{'data-legacy':true},'legacy');
const Page=compile('src/app/student/(main)/ai-counsellor/page.tsx',{'@/components/student/ChatWidget':{default:ChatWidget,__esModule:true},'./_components/VideoCounsellor':{default:Legacy,__esModule:true}});
const root=createRoot(document.getElementById('root'));async function settle(){for(let i=0;i<4;i++)await React.act(async()=>{await new Promise(r=>setImmediate(r))})}
const deadline=setTimeout(()=>{console.error('Mounted harness deadline');process.exit(2)},15000);
(async()=>{try{
await React.act(async()=>root.render(React.createElement(Page)));await settle();assert.match(document.body.textContent,/Open the counsellor button/);assert.equal(mounted,1);assert.equal(document.querySelectorAll('[data-vc-widget]').length,1);assert.equal(document.querySelector('[data-legacy]'),null);assert.ok(calls.some(c=>c.endpoint.endsWith('/threads')));
handles[0].open();const shadow=document.querySelector('[data-vc-widget]').shadowRoot,input=shadow.querySelector('textarea,input'),form=shadow.querySelector('form');assert.ok(input);assert.ok(form);
input.value='Keep draft';failTurn=true;await React.act(async()=>form.dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true})));await settle();assert.equal(input.value,'Keep draft');failTurn=false;await React.act(async()=>form.dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true})));await settle();const turns=calls.filter(c=>c.endpoint.endsWith('/turns'));assert.equal(turns.length,2);assert.notEqual(turns[0].init.body.clientTurnId,turns[1].init.body.clientTurnId);
auth={user:{id:'synthetic-two'},isLoading:false};await React.act(async()=>root.render(React.createElement(Page)));await settle();assert.equal(destroyed,1);assert.equal(mounted,2);assert.equal(document.querySelectorAll('[data-vc-widget]').length,1);
current=false;await React.act(async()=>window.dispatchEvent(new window.Event('storage')));await settle();assert.equal(document.querySelectorAll('[data-vc-widget]').length,0);assert.match(document.body.textContent,/temporarily unavailable/);
process.env.NEXT_PUBLIC_VC_STUDENT_CENTRAL_ENABLED='false';await React.act(async()=>root.render(React.createElement(Page)));await settle();assert.ok(document.querySelector('[data-legacy]'));console.log('PASS mounted actual Vidysea page + ChatWidget + shared SDK: authenticated history/send,409 Retry,account cleanup,session invalidation,legacy flag');
}finally{await React.act(async()=>root.unmount());dom.window.close();clearTimeout(deadline)}})().catch(e=>{console.error(e);process.exitCode=1});

```

git diff --check on the named widget/Pathlynks/Vidysea source/test/page paths:exit0, no whitespace errors; only Git LF/CRLF working-copy notices.

## Unsuccessful/incomplete checks preserved

- Baseline wrapper-to-SDK config check actually returned exit1 with 'open' !== 'proxy' before the wrapper repair. The actual mounted post-repair test above reaches the same integration and passes.
- First cua Node mounted attempt exceeded its30second tool timeout and reset that tool kernel; no result inferred. The replacement bounded Node/jsdom run above completed exit0.
- An overbroad host selector matched Q12/S10/Q15 browser cases despite parent ownership. It was interrupted in its own session38364,exit1 after Q12 reported a failure; no browser acceptance inferred and no further browser invocation made. The corrected final selector is exactly ^(Quest|S12), whose21 selected cases do not call guideBrowserFixture or chromium.launch. Parent must run its actual mounted browser cases and investigate the Q12 attempt; interruption output did not contain a complete assertion/stack.
- Full isolated frontend command node node_modules/typescript/bin/tsc --noEmit --incremental false produced no diagnostics over the available check budget. Stopped its OWN session47800,exit1 by interruption; no typecheck PASS or code-failure diagnosis. Root final affected/workspace types remain required.
- The installed Next16 Windows CLI debug-build-paths normalized slash paths, but collectAppFiles returns backslash-prefixed relative keys. Two CLI compile invocations and one first absolute-key experiment exited0 while omitting the route; app-paths-manifest contained only global-error, so they are NOT build evidence.
- A direct build experiment propagated node -e into worker NODE_OPTIONS and failed exit1/code9. Clearing only process.execArgv in that local check launcher resolves that launch error. The final exact-collector selected build is recorded below when complete.
- Installed next.config.mjs already has typescript.ignoreBuildErrors=true. A compile build never replaces independent TypeScript validation. No config edits were made.

## Root-owned remaining checks and limits

Current Pathlynks backend drops result.memoryConfirmation at aiChat response line1327; forward it with schema validation. Current central409 and both host error proxies need the exclusive published-replay retryWithNewTurn marker. UI marker tests currently inject this explicit synthetic marker and do not establish backend implementation. Root final independent dual acceptance/SSE/data/AI/browser/provider and paid-proof gates remain. Real team KB URL/keys/eligibility/audio/deployment are not claimed complete.

No planned source edits remain in this ownership lane. Root may take these files after current evidence hashes are checked. No independent reviewer was dispatched during BUILDING; the parent retains the final completed-feature boundary.

## Learning from this integration
Use the SDK's actual parseConfig(dataset,scriptSrc) seam when embedding it. A generic memory_changed error does not reveal whether a reply was published; preserve idempotency unless the server explicitly grants a fresh manual attempt. On Windows, validate a focused Next compile by its output route manifest, not exit0 alone.

## Final owned closeout (supersedes earlier running counts)

Status: OWNED SOURCE READY FOR ROOT INTEGRATION; self-check only, not product/checker PASS.
Final existing Pathlynks non-browser selection:22/22 pass0fail,exit0 (node --test --test-name-pattern='^(Quest|S12)' scripts/student-contract-browser.test.cjs). Final extra case checks the legacy three-argument decideAIMemory call with no selector. Empty fourth binding object removed in place; current candidate/thread decisions still use the optional fourth binding. The interrupted Q12 assertion had expected exactly3 args; this concrete source compatibility issue is now repaired. Its real browser rerun remains parent-owned and unperformed here.

Fresh root-owned source read: Pathlynks backend now validates and forwards optional result.memoryConfirmation at controller:1324-1333. The earlier CORE-REQUEST for that successful-response field is RESOLVED BY PEER SOURCE; no host backend test/live proof is inferred by this lane. Current read found no retryWithNewTurn in apps/api/src/chat.ts or isolated Vidysea backend, so that separate central+both-proxy error contract remains OPEN. No backend edits made by this lane.

Final affected Vidysea compile:
Environment: NEXT_TELEMETRY_DISABLED=1; NEXT_PUBLIC_API_URL=http://127.0.0.1:9/api/v1; NEXT_PUBLIC_VC_STUDENT_CENTRAL_ENABLED=true; NEXT_PUBLIC_VC_WIDGET_SCRIPT_URL=https://assets.example.test/vc-widget.v1.js.
Command: node -e <installed-build invocation below>, cwd D:/vc/.worktrees/vc-vidysea-frontend.
```js
process.execArgv.length=0;(async()=>{const {findPagesDir}=require('next/dist/lib/find-pages-dir'),{createValidFileMatcher}=require('next/dist/server/lib/find-page-file'),{collectAppFiles}=require('next/dist/build/entries');const d=findPagesDir(process.cwd()).appDir;const files=await collectAppFiles(d,createValidFileMatcher(['tsx','ts','jsx','js'],d));const picked=files.appPaths.filter(x=>x.includes('ai-counsellor')&&x.endsWith('page.tsx'));if(picked.length!==1)throw Error('unexpected affected route selection');console.log('Affected app route:',JSON.stringify(picked));require('next/dist/server/config-shared').defaultConfig.experimental.cpus=2;await require('next/dist/build').default(process.cwd(),false,false,false,false,false,true,require('next/dist/lib/bundler').Bundler.Webpack,'compile',undefined,picked,[])})().catch(e=>{console.error(e);process.exitCode=1});
```
Actual output:
```text
Affected app route: ["\\student\\(main)\\ai-counsellor\\page.tsx"]
Next.js16.0.10 (webpack)
Compiled successfully in48s
Collecting page data using2workers
Finalizing page optimization
Collecting build traces
Build ran with "compile" mode, to finalize the build run either "generate" or "generate-env" mode as well
Route (app)
 /_not-found
 /student/ai-counsellor
Dynamic server-rendered on demand
Exit0
```
This is an affected central-mode compile, not a production-ready generated build, deployment or typecheck. Prior exact-route compile with unset central flag also exited0 and showed the same route; it is separate from the earlier zero-route CLI attempts. No remote API or SDK URL was requested by the mounted synthetic transport. No provider/DB/RDS calls authorized or performed.

Final evidence: widget69/69; host22/22; mounted actual Vidysea page/wrapper/shared SDK synthetic test PASS; central-mode affected compile exit0; scoped git diff --check exit0. Full host types interrupted/unverified; actual browser/Q12+geometry/mic/final dual/SSE/data/AI/provider and exclusive published-Retry marker remain parent integration work. Four prior maker receipts and T057cycle2/history/costs unchanged. No commits/push/deploy, new product/test modules/collections or model/config changes. The QA edits JSON is a data-only guarded edit receipt, not a new runtime helper.

Resource/effort note: initial25min lane estimate overran due shell helper launch failures, mounted-runtime timeout and installed Next Windows selective-build path mismatch; aggregate root/peer usage/tokens UNKNOWN. Final exact compile was limited to2workers by temporary in-memory defaultConfig override in the check process only. No product config was edited. Typecheck and overbroad test sessions were explicitly interrupted in their OWN managed handles47800 and38364 respectively; no image-wide process cleanup was used.

Handoff: parent can take owned existing files now; revalidate hashes below against any further peer edit. Do not call this a feature PASS or pushable slice from this self-report.

Recorded-at:2026-10-27T15:49:40.222Z

```text
fa160da884d64f720b7839702d05b69434b1f9387bfc13f09e05878d43c01546 D:/vc/.worktrees/vc-completion/apps/widget/src/vc-widget.js
b1d23c98843c1c2c36d11378326f0e1694cbac887e923258967a3f6649f02d26 D:/vc/.worktrees/vc-completion/apps/widget/tests/config.test.js
e72462e0af0b2c92649daa6794fd37a05125b174748bcec8facf7e8887155655 D:/vc/.worktrees/vc-completion/apps/widget/tests/floater.test.js
42746b30763cfd22663001ecd5218cec0032f9b7e322a91b4f065f18bc290e5f D:/vc/.worktrees/vc-completion/apps/widget/tests/request.test.js
b344f406e0b6c4beb3df693b1e67cfc7b867afd3970c580207e4203d13a1de4d D:/vc/.worktrees/vc-completion/pnpm-lock.yaml
5a9cb8e6ca1ed6032cc0fea6ba8214e63458e7a40e0b1165d1636b8f0ba3c59f D:/vc/.worktrees/quest-pathlynks-frontend/src/components/career-quest/AIChatWidget.jsx
5dd9e0e534334e4c65c302af3a15c996bce2edaee2415e8e28fd066100eaa794 D:/vc/.worktrees/quest-pathlynks-frontend/src/services/pathlynksQuestService.js
67c1089ac434b63ba07bc7adcb45a4043db633267140ad9c4a950c5c7223cdd1 D:/vc/.worktrees/quest-pathlynks-frontend/scripts/student-contract-browser.test.cjs
75534cd9fb4a94ddf850c78388df9cf614c85a8477d03f611dc2f51416309998 D:/vc/.worktrees/quest-pathlynks-frontend/package-lock.json
92fa5dd1e727e82cdc47f7a115c9d51429fc949299e38953566197ea23deb3c8 D:/vc/.worktrees/vc-vidysea-frontend/src/components/student/ChatWidget.tsx
ac8c9d21b23653e24eee6f8f51b422921e7dcdd3028d916aed77b2c40d439b37 D:/vc/.worktrees/vc-vidysea-frontend/src/app/student/(main)/ai-counsellor/page.tsx
429ef75d3335c2d57adbcccf6fbc328be98e0ccfa96ce61a1be1be92a249ac96 D:/vc/.worktrees/vc-vidysea-frontend/package-lock.json
a51bff54e40fa51b9dd869976e6d425332e980b8cb76d362d0fac316b408a237 D:/vc/.worktrees/vc-vidysea-frontend/tsconfig.json
c34b906d460d8302cd24e9614866ad48fd5d653c401db321c4e479b0eea28a11 D:/vc/.worktrees/vc-vidysea-frontend/next.config.mjs
```
