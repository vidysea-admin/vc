"use strict";
// VA18 (vc-admin-control, spec S7): the floater. Written first (TDD); runs against src/vc-widget.js via its CommonJS export.
// No jsdom: a small fake DOM (FakeEl) that supports exactly what the widget touches, plus a fake window (size, resize, open).
// Every test names the real scenario that reaches the code (a visitor drags the header, drags the corner, taps Voice, ...).
const test = require("node:test");
const assert = require("node:assert/strict");
const W = require("../src/vc-widget.js");

// ---- fake DOM ---------------------------------------------------------------------------------------------

class FakeEl {
  constructor(tag, doc) {
    this.tagName = String(tag).toUpperCase();
    this.ownerDocument = doc;
    this.children = [];
    this.parentNode = null;
    this.attrs = {};
    this.handlers = {};
    this.style = { _p: {}, setProperty(k, v) { this._p[k] = v; } };
    this.className = "";
    this.hidden = false;
    this.disabled = false;
    this.value = "";
    this._text = "";
    this.scrollTop = 0;
    this.scrollHeight = 0;
    this.captured = [];
    this.focused = 0;
  }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; }
  hasAttribute(k) { return k in this.attrs; }
  appendChild(c) { if (c.parentNode) c.parentNode.removeChild(c); c.parentNode = this; this.children.push(c); return c; }
  insertBefore(c, ref) {
    if (c.parentNode) c.parentNode.removeChild(c);
    c.parentNode = this;
    const i = ref ? this.children.indexOf(ref) : -1;
    if (i < 0) this.children.push(c); else this.children.splice(i, 0, c);
    return c;
  }
  removeChild(c) { const i = this.children.indexOf(c); if (i >= 0) this.children.splice(i, 1); c.parentNode = null; return c; }
  attachShadow() { this.shadowRoot = new FakeEl("#shadow", this.ownerDocument); return this.shadowRoot; }
  addEventListener(t, fn) { (this.handlers[t] = this.handlers[t] || []).push(fn); }
  removeEventListener(t, fn) { this.handlers[t] = (this.handlers[t] || []).filter((f) => f !== fn); }
  focus() { this.focused += 1; this.ownerDocument.activeElement = this; }
  setPointerCapture(id) { this.captured.push(id); }
  releasePointerCapture() {}
  hasPointerCapture() { return true; }
  get textContent() { return this._text + this.children.map((c) => c.textContent).join(""); }
  set textContent(v) { this.children = []; this._text = String(v); }
  getBoundingClientRect() {
    const s = this.style;
    const num = (v, d) => (typeof v === "string" && /px$/.test(v) ? parseFloat(v) : d);
    const w = num(s.width, 380), h = num(s.height, 540);
    const l = num(s.left, 1280 - 12 - w), t = num(s.top, 800 - 84 - h);
    return { left: l, top: t, width: w, height: h, right: l + w, bottom: t + h };
  }
  // dispatch: runs the handlers on this node and then on its ancestors (bubbling); target stays the origin.
  fire(type, init) {
    const ev = Object.assign({ type, target: this, button: 0, isPrimary: true, pointerId: 1, defaultPrevented: false, stopped: false,
      preventDefault() { this.defaultPrevented = true; }, stopPropagation() { this.stopped = true; } }, init || {});
    for (let n = this; n && !ev.stopped; n = n.parentNode) for (const fn of (n.handlers[type] || []).slice()) fn(ev);
    return ev;
  }
  find(pred) {
    if (pred(this)) return this;
    for (const c of this.children) { const r = c.find ? c.find(pred) : null; if (r) return r; }
    return null;
  }
  findAll(pred, out) {
    out = out || [];
    if (pred(this)) out.push(this);
    for (const c of this.children) if (c.findAll) c.findAll(pred, out);
    return out;
  }
}

function makeDoc() {
  const calls = { cookieWrites: 0 };
  const doc = {
    calls,
    activeElement: null,
    readyState: "complete",
    createElement(tag) { return new FakeEl(tag, doc); },
    createElementNS(ns, tag) { const e = new FakeEl(tag, doc); e.ns = ns; return e; },
    createTextNode(t) { return { nodeType: 3, textContent: String(t), children: [], parentNode: null }; },
  };
  Object.defineProperty(doc, "cookie", { get() { calls.cookieWrites += 1; return ""; }, set() { calls.cookieWrites += 1; } });
  doc.documentElement = new FakeEl("html", doc);
  doc.documentElement.lang = "en";
  doc.body = new FakeEl("body", doc);
  doc.documentElement.appendChild(doc.body);
  return doc;
}

function makeWin(w, h) {
  const win = {
    innerWidth: w, innerHeight: h, opened: [], handlers: {},
    addEventListener(t, fn) { (win.handlers[t] = win.handlers[t] || []).push(fn); },
    removeEventListener() {},
    open(url, name, features) { win.opened.push({ url, name, features }); return null; },
    resizeTo(nw, nh) { win.innerWidth = nw; win.innerHeight = nh; (win.handlers.resize || []).forEach((f) => f({ type: "resize" })); },
  };
  return win;
}

const byLabel = (root, label) => root.find((n) => n.attrs && n.attrs["aria-label"] === label);
const byClass = (root, cls) => root.find((n) => (" " + n.className + " ").indexOf(" " + cls + " ") >= 0);
const resp = (status, body, headers) => ({ status, ok: status >= 200 && status < 300, headers: { get: (k) => (headers || {})[String(k).toLowerCase()] ?? null }, json: async () => body });
const okReply = (message) => resp(200, { state: "ok", message, claims: [], sources: [] });

const KEY_CFG = (extra) => Object.assign({ ok: true, errors: [], mode: "key", key: "vck_pub_acme_SECRETSECRETSECRET", turnUrl: "https://vc.example.org/v1/public/chat/turns", title: "Career Counsellor", color: "#1f5fbf", voice: false, site: "acme" }, extra || {});

function setup(cfgOver, opts) {
  opts = opts || {};
  const doc = makeDoc();
  const win = makeWin(opts.vw || 1280, opts.vh || 800);
  const fetchImpl = opts.fetch || (async () => okReply("Hello from VC."));
  const h = W.mount(KEY_CFG(cfgOver), doc, fetchImpl, { win: win });
  const shadow = h.host.shadowRoot;
  const q = {
    h, doc, win, shadow,
    panel: byClass(shadow, "panel"),
    head: byClass(shadow, "head"),
    log: byClass(shadow, "log"),
    input: shadow.find((n) => n.tagName === "TEXTAREA"),
    bubble: byClass(shadow, "bubble"),
  };
  q.close = byLabel(shadow, "Close chat");
  return q;
}

async function sendText(q, text) {
  q.input.value = text;
  q.input.fire("keydown", { key: "Enter", shiftKey: false, isComposing: false });
  await new Promise((r) => setTimeout(r, 5));
}
const px = (v) => parseFloat(v);

test("Q5: proxy Chat/Voice/Chat retains typed and voice history, releases the mic and makes fallback text usable", async () => {
  const V = require("../src/voice.js");
  const q = setup({ mode: "proxy", key: "", turnUrl: "/api/vc", voice: true, voiceProxy: "/api/voice/session" });
  q.h.open();
  await sendText(q, "Keep this typed message");
  q.input.value = "Keep this unsent draft";
  const before = q.log.textContent;
  let socket, stopped = 0, capturedStopped = 0;
  class Socket {
    constructor() { socket = this; this.readyState = 0; }
    send() {}
    close() { this.readyState = 3; }
  }
  const deps = {
    fetch: async () => resp(201, { token: "token.signature", wsUrl: "wss://vc.example.org/stream", expiresAt: "2030-01-01T00:00:00Z", threadId: "owned-thread" }),
    WebSocket: Socket,
    mediaDevices: { getUserMedia: async () => ({ getTracks: () => [{ stop() { stopped++; } }] }) },
    audio: { capture() { return () => { capturedStopped++; }; }, close() {} },
  };
  assert.equal(q.h.attachVoice(V, deps), true);
  q.h.setMode("voice");
  byLabel(q.shadow, "Start voice conversation").fire("click");
  await new Promise((resolve) => setImmediate(resolve));
  socket.readyState = 1; socket.onopen();
  socket.onmessage({ data: JSON.stringify({ type: "transcript.final", role: "assistant", text: "Keep this voice answer" }) });
  q.h.setMode("chat");
  assert.equal(stopped, 1);
  assert.equal(capturedStopped, 1);
  assert.ok(q.log.textContent.includes(before));
  assert.match(q.log.textContent, /Keep this voice answer/);
  assert.equal(q.input.value, "Keep this unsent draft");
  q.h.setMode("voice");
  deps.mediaDevices.getUserMedia = async () => { throw { name: "NotAllowedError" }; };
  byLabel(q.shadow, "Start voice conversation").fire("click");
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(q.h.mode(), "chat", "permission fallback restores text controls");
  assert.match(q.log.textContent, /Microphone access is blocked/);
  assert.match(q.log.textContent, /Keep this voice answer/);
  assert.equal(q.input.value, "Keep this unsent draft");
});

// ---- version ----------------------------------------------------------------------------------------------

test("VA18: VERSION is 1.1.0 and the hosted name keeps major 1", () => {
  assert.equal(W.VERSION, "1.1.0");
  assert.equal(require("../package.json").version, "1.1.0");
});

// ---- drag: pure clamp -------------------------------------------------------------------------------------

test("VA18 drag clamp: a rectangle dragged past any edge is pulled back inside the viewport", () => {
  const vw = 1280, vh = 800;
  const r = (left, top) => W.clampRect({ left, top, width: 380, height: 540 }, vw, vh);
  assert.deepEqual(r(-500, -500), { left: 0, top: 0, width: 380, height: 540 });
  assert.deepEqual(r(5000, 5000), { left: 900, top: 260, width: 380, height: 540 });
  assert.deepEqual(r(100, 100), { left: 100, top: 100, width: 380, height: 540 });
});

test("VA18 clampRect: a window shrink pulls the size and the position inside; the size floor is 300 x 380", () => {
  const small = W.clampRect({ left: 900, top: 260, width: 380, height: 540 }, 400, 500);
  assert.equal(small.width, 380); assert.equal(small.height, 500);
  assert.equal(small.left, 20); assert.equal(small.top, 0);
  const floor = W.clampRect({ left: 0, top: 0, width: 100, height: 100 }, 1280, 800);
  assert.equal(floor.width, 300); assert.equal(floor.height, 380);
  // a viewport narrower than the floor wins over the floor, so nothing overflows
  const tiny = W.clampRect({ left: 0, top: 0, width: 380, height: 540 }, 280, 640);
  assert.equal(tiny.width, 280);
  assert.equal(W.MIN_W, 300); assert.equal(W.MIN_H, 380);
});

// ---- drag: through the header -----------------------------------------------------------------------------

test("VA18 drag: a visitor drags the header with the pointer; the panel follows and stops at the viewport edges", () => {
  const q = setup();
  q.h.open();
  q.head.fire("pointerdown", { clientX: 900, clientY: 200, pointerId: 7 });
  assert.deepEqual(q.head.captured, [7], "the header captures the pointer so a fast drag is not lost");
  q.head.fire("pointermove", { clientX: 800, clientY: 250, pointerId: 7 });
  const rect0 = q.panel.getBoundingClientRect();
  assert.equal(px(q.panel.style.left), 888 - 100, "moved 100 px left from the default left of 888");
  assert.equal(px(q.panel.style.top), 176 + 50);
  assert.equal(rect0.width, 380);
  q.head.fire("pointermove", { clientX: -9000, clientY: -9000, pointerId: 7 });
  assert.equal(px(q.panel.style.left), 0);
  assert.equal(px(q.panel.style.top), 0);
  q.head.fire("pointermove", { clientX: 99999, clientY: 99999, pointerId: 7 });
  assert.equal(px(q.panel.style.left), 1280 - 380);
  assert.equal(px(q.panel.style.top), 800 - 540);
  q.head.fire("pointerup", { pointerId: 7 });
  q.head.fire("pointermove", { clientX: 0, clientY: 0, pointerId: 7 });
  assert.equal(px(q.panel.style.left), 1280 - 380, "after pointerup a move does nothing");
});

test("VA18 drag: pressing a header button (close, toggle, pop-out) never starts a drag", () => {
  const q = setup();
  q.h.open();
  q.close.fire("pointerdown", { clientX: 900, clientY: 200 });
  q.head.fire("pointermove", { clientX: 100, clientY: 100 });
  assert.equal(q.panel.style.left, undefined, "no explicit position was ever set");
});

test("VA18 drag after a window resize: the panel is pulled back inside when the browser window shrinks", () => {
  const q = setup();
  q.h.open();
  q.head.fire("pointerdown", { clientX: 900, clientY: 200 });
  q.head.fire("pointermove", { clientX: 99999, clientY: 99999 });
  q.head.fire("pointerup", {});
  assert.equal(px(q.panel.style.left), 900);
  q.win.resizeTo(600, 500);
  const r = { left: px(q.panel.style.left), top: px(q.panel.style.top), w: px(q.panel.style.width), h: px(q.panel.style.height) };
  assert.ok(r.left >= 0 && r.left + r.w <= 600, "inside horizontally: " + JSON.stringify(r));
  assert.ok(r.top >= 0 && r.top + r.h <= 500, "inside vertically: " + JSON.stringify(r));
});

test("VA18 drag before any drag: a window resize leaves the default CSS placement alone", () => {
  const q = setup();
  q.h.open();
  q.win.resizeTo(500, 600);
  assert.equal(q.panel.style.left, undefined);
});

test("VA18 drag with a page scrollbar: the clamp uses the layout viewport (clientWidth), so the panel never slides under the scrollbar", () => {
  const q = setup();
  q.doc.documentElement.clientWidth = 1265; // 15 px scrollbar
  q.doc.documentElement.clientHeight = 785;
  q.h.open();
  q.head.fire("pointerdown", { clientX: 900, clientY: 200 });
  q.head.fire("pointermove", { clientX: 99999, clientY: 99999 });
  assert.equal(px(q.panel.style.left), 1265 - 380);
  assert.equal(px(q.panel.style.top), 785 - 540);
});

test("VA18 drag release lost: a pointermove that reports no button down ends the drag instead of dragging on", () => {
  const q = setup();
  q.h.open();
  q.head.fire("pointerdown", { clientX: 900, clientY: 200 });
  q.head.fire("pointermove", { clientX: 800, clientY: 200, buttons: 1 });
  const moved = px(q.panel.style.left);
  q.head.fire("pointermove", { clientX: 300, clientY: 200, buttons: 0 });
  assert.equal(px(q.panel.style.left), moved, "released outside the window: the panel stays where the last real move put it");
});

// ---- resize -----------------------------------------------------------------------------------------------

test("VA18 resize: dragging the corner changes the size, never below 300 x 380, never past the viewport", () => {
  const q = setup();
  q.h.open();
  const grip = byClass(q.shadow, "grip");
  assert.ok(grip, "a resize handle exists");
  assert.equal(grip.getAttribute("aria-hidden"), "true", "a pointer-only affordance is hidden from assistive tech");
  grip.fire("pointerdown", { clientX: 1268, clientY: 716, pointerId: 3 });
  assert.deepEqual(grip.captured, [3]);
  grip.fire("pointermove", { clientX: 1168, clientY: 666, pointerId: 3 });
  assert.equal(px(q.panel.style.width), 300, "380 - 100 = 280 is below the floor, so 300");
  assert.equal(px(q.panel.style.height), 490);
  grip.fire("pointermove", { clientX: 0, clientY: 0, pointerId: 3 });
  assert.equal(px(q.panel.style.width), 300);
  assert.equal(px(q.panel.style.height), 380);
  grip.fire("pointermove", { clientX: 99999, clientY: 99999, pointerId: 3 });
  assert.equal(px(q.panel.style.width), 1280 - px(q.panel.style.left), "stops at the right edge of the viewport");
  assert.equal(px(q.panel.style.height), 800 - px(q.panel.style.top), "stops at the bottom edge");
  grip.fire("pointerup", { pointerId: 3 });
});

test("VA18 resize at phone width: at 360 x 640 the panel cannot be dragged or grown past the viewport", () => {
  const q = setup({}, { vw: 360, vh: 640 });
  q.h.open();
  const grip = byClass(q.shadow, "grip");
  grip.fire("pointerdown", { clientX: 340, clientY: 600 });
  grip.fire("pointermove", { clientX: 9999, clientY: 9999 });
  assert.ok(px(q.panel.style.left) + px(q.panel.style.width) <= 360);
  assert.ok(px(q.panel.style.top) + px(q.panel.style.height) <= 640);
  assert.ok(px(q.panel.style.width) >= 300);
});

// ---- toggle + shared history ------------------------------------------------------------------------------

test("VA18 toggle: with voice available the header shows Chat | Voice and Chat is selected", () => {
  const q = setup({ voice: true });
  const chat = byLabel(q.shadow, "Chat mode"), voice = byLabel(q.shadow, "Voice mode");
  assert.ok(chat && voice);
  assert.equal(chat.getAttribute("aria-pressed"), "true");
  assert.equal(voice.getAttribute("aria-pressed"), "false");
  assert.equal(chat.hidden, false); assert.equal(voice.hidden, false);
  assert.equal(q.h.mode(), "chat");
});

test("VA18 toggle: Voice is hidden without opt-in, key or explicit proxy mint path", () => {
  const cases = [
    KEY_CFG({ voice: false }),
    KEY_CFG({ voice: true, mode: "proxy", key: "" }),
    KEY_CFG({ voice: true, key: "" }),
  ];
  for (const c of cases) {
    assert.equal(W.voiceAvailable(c), false);
    const q = setup(c);
    const group = byClass(q.shadow, "modes");
    assert.equal(group.hidden, true, JSON.stringify({ mode: c.mode, voice: c.voice }));
    assert.equal(q.h.mode(), "chat");
    q.h.setMode("voice");
    assert.equal(q.h.mode(), "chat", "a hidden Voice mode cannot be reached by script either");
  }
});

test("VA18 shared history: a message sent in Chat is still there after Voice and back; one history, not copies", async () => {
  const q = setup({ voice: true });
  q.h.open();
  await sendText(q, "which course suits me?");
  const before = q.log.textContent;
  assert.match(before, /which course suits me\?/);
  assert.match(before, /Hello from VC\./);
  byLabel(q.shadow, "Voice mode").fire("click");
  assert.equal(q.h.mode(), "voice");
  assert.equal(q.panel.getAttribute("data-mode"), "voice");
  assert.equal(byLabel(q.shadow, "Voice mode").getAttribute("aria-pressed"), "true");
  assert.equal(q.log.textContent, before, "the log is untouched by the mode change");
  byLabel(q.shadow, "Chat mode").fire("click");
  assert.equal(q.h.mode(), "chat");
  assert.equal(q.panel.getAttribute("data-mode"), "chat");
  assert.equal(q.log.textContent, before);
  const hist = q.h.history();
  assert.deepEqual(hist.map((m) => m.text), [hist[0].text, "which course suits me?", "Hello from VC."], "greeting, question, reply - once each");
  assert.equal(hist.filter((m) => m.text === "which course suits me?").length, 1);
});

test("VA18 toggle by keyboard: the mode buttons are real buttons (Enter/Space activate them) and sit in the header before pop-out and close", () => {
  const q = setup({ voice: true });
  const buttons = q.head.findAll((n) => n.tagName === "BUTTON").map((b) => b.attrs["aria-label"]);
  assert.deepEqual(buttons, ["Chat mode", "Voice mode", "Open in a new window", "Close chat"]);
  for (const b of q.head.findAll((n) => n.tagName === "BUTTON")) assert.equal(b.type, "button");
});

test("VA18 voice mode: switching back to Chat ends a running voice call (the mic is released)", () => {
  const q = setup({ voice: true });
  q.h.open();
  const calls = [];
  const state = { s: "idle" };
  const lib = { create() { return { state: () => state.s, start() { calls.push("start"); state.s = "listening"; }, stop() { calls.push("stop"); state.s = "idle"; } }; } };
  assert.equal(q.h.attachVoice(lib), true);
  byLabel(q.shadow, "Voice mode").fire("click");
  const mic = byClass(q.shadow, "mic");
  mic.fire("click");
  assert.deepEqual(calls, ["start"]);
  byLabel(q.shadow, "Chat mode").fire("click");
  assert.deepEqual(calls, ["start", "stop"]);
});

test("VA18 voice add-on fails to load: the Voice toggle disappears again and Chat stays", () => {
  const q = setup({ voice: true });
  byLabel(q.shadow, "Voice mode").fire("click");
  assert.equal(q.h.mode(), "voice");
  q.h.voiceFailed();
  assert.equal(byClass(q.shadow, "modes").hidden, true);
  assert.equal(q.h.mode(), "chat");
});

// ---- pop-out ----------------------------------------------------------------------------------------------

test("VA18 pop-out URL: /vc-popout?site=<id> on the API origin (key mode), with no key and no token in it", () => {
  const cfg = KEY_CFG();
  const u = W.popoutUrl(cfg, "https://partner.example");
  assert.equal(u, "https://vc.example.org/vc-popout?site=acme");
  assert.equal(u.includes(cfg.key), false);
  assert.equal(/vck_|token|bearer|key=/i.test(u), false);
});

test("VA18 pop-out URL: proxy mode uses the host page origin for a relative proxy and the proxy's origin for an absolute one", () => {
  const rel = KEY_CFG({ mode: "proxy", key: "", turnUrl: "/api/vc" });
  assert.equal(W.popoutUrl(rel, "https://pathlynks.example"), "https://pathlynks.example/vc-popout?site=acme");
  const abs = KEY_CFG({ mode: "proxy", key: "", turnUrl: "https://api.pathlynks.example/api/vc" });
  assert.equal(W.popoutUrl(abs, "https://pathlynks.example"), "https://api.pathlynks.example/vc-popout?site=acme");
});

test("VA18 pop-out URL: no site id, an unsafe site id, or no usable origin means no pop-out (null)", () => {
  assert.equal(W.popoutUrl(KEY_CFG({ site: "" }), "https://p.example"), null);
  for (const bad of ["a b", "x&key=1", "../x", "A", "a", "x".repeat(40), "a/b", "a?b"]) assert.equal(W.popoutUrl(KEY_CFG({ site: bad }), "https://p.example"), null, bad);
  assert.equal(W.popoutUrl(KEY_CFG({ mode: "proxy", key: "", turnUrl: "/api/vc" }), ""), null, "relative proxy and no page origin");
  assert.equal(W.popoutUrl(KEY_CFG({ mode: "proxy", key: "", turnUrl: "/api/vc" }), "null"), null, "an opaque origin is not usable");
});

test("VA18 pop-out: the header button opens the URL in a new window with noopener; the chat so far is not sent anywhere", async () => {
  const q = setup();
  q.h.open();
  await sendText(q, "secret question about marks");
  byLabel(q.shadow, "Open in a new window").fire("click");
  assert.equal(q.win.opened.length, 1);
  const o = q.win.opened[0];
  assert.equal(o.url, "https://vc.example.org/vc-popout?site=acme");
  assert.equal(o.name, "_blank");
  assert.match(o.features, /noopener/);
  assert.equal(o.url.includes("secret"), false, "no history in the URL");
  assert.equal(o.url.includes("vck_"), false, "no key in the URL");
});

test("VA18 pop-out: no site id configured means the pop-out button is not shown", () => {
  const q = setup({ site: "" });
  assert.equal(byLabel(q.shadow, "Open in a new window").hidden, true);
});

test("VA18 config: data-vc-site sets cfg.site; without it the partner id inside a vck_pub_ key is the site id (never the key itself)", () => {
  const src = "https://vc.example.org/widget/vc-widget.v1.js";
  assert.equal(W.parseConfig({ vcKey: "vck_pub_acme-co_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", vcSite: "partner-x" }, src).site, "partner-x");
  assert.equal(W.parseConfig({ vcKey: "vck_pub_acme-co_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" }, src).site, "acme-co");
  assert.equal(W.parseConfig({ vcKey: "vck_demo_key" }, src).site, "");
  assert.equal(W.parseConfig({ vcProxy: "/api/vc" }, src).site, "");
  assert.equal(W.parseConfig({ vcKey: "k", vcSite: "BAD SITE" }, src).site, "", "an invalid site id is dropped");
});

// ---- storage spy ------------------------------------------------------------------------------------------

test("VA18 no storage: drag, resize, toggle, pop-out and a chat turn make zero localStorage / sessionStorage / indexedDB / cookie calls", async () => {
  const calls = [];
  const spy = (name) => new Proxy({}, { get(_t, p) { calls.push(name + "." + String(p)); return () => null; }, set(_t, p) { calls.push(name + "." + String(p) + "="); return true; } });
  const saved = {};
  for (const n of ["localStorage", "sessionStorage", "indexedDB"]) {
    saved[n] = Object.getOwnPropertyDescriptor(globalThis, n);
    Object.defineProperty(globalThis, n, { configurable: true, get() { calls.push(n); return spy(n); } });
  }
  try {
    const q = setup({ voice: true });
    q.h.open();
    await sendText(q, "hello");
    q.head.fire("pointerdown", { clientX: 900, clientY: 200 });
    q.head.fire("pointermove", { clientX: 700, clientY: 300 });
    q.head.fire("pointerup", {});
    const grip = byClass(q.shadow, "grip");
    grip.fire("pointerdown", { clientX: 0, clientY: 0 });
    grip.fire("pointermove", { clientX: 50, clientY: 50 });
    grip.fire("pointerup", {});
    byLabel(q.shadow, "Voice mode").fire("click");
    byLabel(q.shadow, "Chat mode").fire("click");
    byLabel(q.shadow, "Open in a new window").fire("click");
    q.win.resizeTo(700, 600);
    q.close.fire("click");
    assert.deepEqual(calls, [], "storage APIs touched: " + calls.join(", "));
    assert.equal(q.doc.calls.cookieWrites, 0, "document.cookie touched");
  } finally {
    for (const n of Object.keys(saved)) { if (saved[n]) Object.defineProperty(globalThis, n, saved[n]); else delete globalThis[n]; }
  }
});

// ---- existing behaviour still intact (characterisation at mount level) ------------------------------------

test("VA18 unchanged: key mode sends X-VC-Key, proxy mode sends no key, and the footer carries 14416 / 112", async () => {
  const seen = [];
  const f = async (url, init) => { seen.push({ url, init }); return okReply("ok"); };
  const q = setup({}, { fetch: f });
  q.h.open();
  await sendText(q, "hi");
  assert.equal(seen[0].init.headers["X-VC-Key"], "vck_pub_acme_SECRETSECRETSECRET");
  assert.equal(seen[0].init.credentials, "omit");
  assert.match(byClass(q.shadow, "foot").textContent, /14416.*112/);
  const p = setup({ mode: "proxy", key: "", turnUrl: "/api/vc" }, { fetch: f });
  p.h.open();
  await sendText(p, "hi");
  assert.equal(seen[1].init.headers["X-VC-Key"], undefined);
  assert.equal(seen[1].init.credentials, "same-origin");
});

test("VA18 unchanged: an escalated reply is the crisis block with the helpline", async () => {
  const q = setup({}, { fetch: async () => resp(200, { state: "escalated", message: "You are not alone.", claims: [], sources: [] }) });
  q.h.open();
  await sendText(q, "crisis");
  const c = byClass(q.shadow, "crisis");
  assert.ok(c);
  assert.match(c.textContent, /Tele-MANAS 14416/);
  assert.match(c.textContent, /112/);
});

test("VA18 unchanged: 401 shows 'Chat unavailable' and disables the box; 429 shows the Retry-After countdown", async () => {
  const q = setup({}, { fetch: async () => resp(401, { error: "unauthorized" }) });
  q.h.open();
  await sendText(q, "hi");
  assert.match(q.log.textContent, /Chat unavailable right now/);
  assert.equal(q.input.disabled, true);

  const timers = [];
  const si = globalThis.setInterval, ci = globalThis.clearInterval;
  globalThis.setInterval = (fn) => { timers.push(fn); return timers.length; };
  globalThis.clearInterval = () => {};
  try {
    const r = setup({}, { fetch: async () => resp(429, {}, { "retry-after": "17" }) });
    r.h.open();
    await sendText(r, "slow down");
    assert.match(r.log.textContent, /wait 17 seconds/);
    assert.match(byClass(r.shadow, "status").textContent, /Please wait 17 s/);
    assert.equal(r.input.value, "slow down", "the message is given back");
  } finally { globalThis.setInterval = si; globalThis.clearInterval = ci; }
});

test("VA18 unchanged: Esc closes the panel, focus returns to the bubble, and the roles/labels are kept", () => {
  const q = setup();
  q.h.open();
  assert.equal(q.panel.hidden, false);
  assert.equal(q.panel.getAttribute("role"), "dialog");
  assert.equal(q.panel.getAttribute("aria-label"), "Career Counsellor");
  assert.equal(q.log.getAttribute("role"), "log");
  assert.equal(q.input.getAttribute("aria-label"), "Your message");
  assert.equal(q.bubble.getAttribute("aria-expanded"), "true");
  q.shadow.fire("keydown", { key: "Escape" });
  assert.equal(q.panel.hidden, true);
  assert.equal(q.bubble.getAttribute("aria-expanded"), "false");
  assert.equal(q.doc.activeElement, q.bubble);
});

test("VA18 unchanged: the mic attaches only when voice is available and sits in the form before Send", () => {
  const lib = { create() { return { state: () => "idle", start() {}, stop() {} }; } };
  const on = setup({ voice: true });
  assert.equal(on.h.attachVoice(lib), true);
  assert.ok(byClass(on.shadow, "mic"));
  const off = setup({ voice: false });
  assert.equal(off.h.attachVoice(lib), false);
  assert.equal(byClass(off.shadow, "mic"), null);
});

test("VA18 phone width: the default placement (before any drag) is CSS-fit to the viewport at 360 px", () => {
  const raw = require("node:fs").readFileSync(require("node:path").join(__dirname, "..", "src", "vc-widget.js"), "utf8");
  assert.match(raw, /@media \(max-width:480px\)\{\.panel\{left:8px;right:8px;width:auto/, "the 480 px rule that fits 360 px is kept");
  assert.match(raw, /max-width:calc\(100vw/, "the panel is also capped to the viewport width");
});

// S12: authenticated host transport uses only server-owned sessions and exact displayed memory.
const AUTH_BASE = '/api/v1/student/ai-counsellor/vc';
const AUTH_CFG = (extra) => ({ mode: 'proxy', key: '', turnUrl: AUTH_BASE + '/threads', authenticated: {basePath: AUTH_BASE}, ...extra });
const threadList = {threads:[{threadId:'owned-1',createdAt:'2026-10-27T10:00:00Z',lastActivityAt:'2026-10-27T10:00:00Z'}]};
const pendingProfile = (version=2) => ({memory:{items:[{factId:'fact-1',key:'preferred_country',value:'India',status:'confirmed',source:'chat',readOnly:false,pendingChange:{candidateId:'candidate-'+version,version:'version-'+version,value:'Germany',proposedAt:'2026-10-27T10:00:00Z'}}]}});
function authFetch(over) {
  const calls=[];
  const f=async (url,init) => {
    calls.push({url,init});
    const custom=over && await over(url,init,calls);
    if(custom) return custom;
    if(url===AUTH_BASE+'/profile') return resp(200,pendingProfile());
    if(url===AUTH_BASE+'/threads' && init.method==='GET') return resp(200,threadList);
    if(url===AUTH_BASE+'/threads' && init.method==='POST') return resp(201,{threadId:'owned-2'});
    if(url===AUTH_BASE+'/threads/owned-1') return resp(200,{threadId:'owned-1',turns:[
      {turnId:'b',role:'assistant',text:'Later',at:'2026-10-27T10:02:00Z'},
      {turnId:'p',role:'assistant',text:'PRIVATE UNPUBLISHED',at:'2026-10-27T10:01:30Z',publicationState:'pending'},
      {turnId:'a',role:'user',text:'Earlier',at:'2026-10-27T10:01:00Z'}]});
    return okReply('Fresh answer');
  };
  f.calls=calls;return f;
}
test('S12 auth: loads owned ordered history, current memory and sends with fresh host headers',async()=>{
  let token='first';const f=authFetch();
  const q=setup(AUTH_CFG({authenticated:{basePath:AUTH_BASE,getHeaders:async()=>({Authorization:token})}}),{fetch:f});
  await q.h.ready;q.h.open();
  assert.match(q.log.textContent,/Earlier[\s\S]*Later/);
  assert.doesNotMatch(q.log.textContent,/PRIVATE UNPUBLISHED/);
  assert.match(q.shadow.textContent,/India[\s\S]*Germany/);
  token='second';await sendText(q,'Which course?');
  const call=f.calls.find(c=>c.url.endsWith('/owned-1/turns'));
  assert.ok(call);assert.equal(call.init.headers.authorization,'second');
  assert.equal(call.init.credentials,'same-origin');assert.equal(call.init.redirect,'error');
  assert.equal(JSON.parse(call.init.body).text,'Which course?');
  assert.ok(JSON.parse(call.init.body).clientTurnId);
  assert.equal(q.doc.calls.cookieWrites,0);q.h.destroy();
});
test('S12 auth: manual transport Retry preserves clientTurnId, selected thread, draft and one user bubble',async()=>{
  let fail=true;const f=authFetch((url)=>url.endsWith('/turns') ? (fail ? resp(503,{}) : okReply('Recovered')) : null);
  const q=setup(AUTH_CFG(),{fetch:f});await q.h.ready;
  await sendText(q,'Keep my question');assert.equal(q.input.value,'Keep my question');
  fail=false;await sendText(q,q.input.value);
  const turns=f.calls.filter(c=>c.url.endsWith('/turns'));
  assert.equal(turns.length,2);assert.equal(turns[0].init.body,turns[1].init.body);
  assert.equal(q.h.history().filter(m=>m.kind==='me' && m.text==='Keep my question').length,1);
  assert.match(q.log.textContent,/Recovered/);q.h.destroy();
});
test('S12 memory: reject carries exact candidate/version/value; stale409 refreshes without success or lost draft',async()=>{
  let stale=true;const f=authFetch((url,init)=>{
    if(url.endsWith('/decision')) return stale ? resp(409,{error:'memory_changed'}) : resp(200,{});
    if(url.endsWith('/profile') && !stale) return resp(200,{memory:{items:[{factId:'fact-1',key:'preferred_country',value:'India',status:'confirmed',readOnly:false}]}});
  });
  const q=setup(AUTH_CFG(),{fetch:f});await q.h.ready;
  q.input.value='Unsent draft';byLabel(q.shadow,'Reject change to preferred_country').fire('click');
  await new Promise(r=>setTimeout(r,10));
  const decision=f.calls.find(c=>c.url.endsWith('/decision'));
  assert.deepEqual(JSON.parse(decision.init.body),{action:'reject',value:'Germany',candidateId:'candidate-2',expectedVersion:'version-2',threadId:'owned-1'});
  assert.equal(q.input.value,'Unsent draft');assert.match(q.shadow.textContent,/changed.*review/i);
  assert.doesNotMatch(q.log.textContent,/Memory updated/);
  stale=false;byLabel(q.shadow,'Reject change to preferred_country').fire('click');await new Promise(r=>setTimeout(r,10));
  assert.match(q.shadow.textContent,/India/);assert.doesNotMatch(byClass(q.shadow,'memory').textContent,/Germany/);q.h.destroy();
});
test('S12 memory: only a fresh exact yes/no is a decision; ambiguous text asks again, historical yes is inert',async()=>{
  const f=authFetch();const q=setup(AUTH_CFG(),{fetch:f});await q.h.ready;
  assert.equal(f.calls.filter(c=>c.url.endsWith('/decision')).length,0);
  await sendText(q,'maybe');assert.equal(f.calls.filter(c=>c.url.endsWith('/decision')).length,0);
  assert.match(q.log.textContent,/yes or no/i);
  await sendText(q,'no');const call=f.calls.find(c=>c.url.endsWith('/decision'));
  assert.equal(JSON.parse(call.init.body).action,'reject');q.h.destroy();
});
test('S12 lifecycle: destroy cancels late requests, voice, listeners and private state; remount stays clean',async()=>{
  let finish;const f=authFetch(url=>url.endsWith('/turns') ? new Promise(r=>{finish=r;}) : null);
  const q=setup(AUTH_CFG(),{fetch:f});await q.h.ready;
  await sendText(q,'PRIVATE DRAFT');const turn=f.calls.find(c=>c.url.endsWith('/turns'));
  q.h.destroy();assert.equal(turn.init.signal.aborted,true);assert.equal(q.h.host.parentNode,null);
  assert.deepEqual(q.h.history(),[]);assert.equal(q.input.value,'');assert.equal(q.shadow.textContent.includes('India'),false);
  finish(okReply('PRIVATE LATE REPLY'));await new Promise(r=>setTimeout(r,10));
  assert.deepEqual(q.h.history(),[]);assert.doesNotMatch(q.shadow.textContent,/PRIVATE/);
  const next=setup(AUTH_CFG(),{fetch:authFetch()});await next.h.ready;assert.doesNotMatch(next.log.textContent,/PRIVATE/);next.h.destroy();
});
test('S12 auth: unsafe proxy destination never receives credentials or requests',async()=>{
  for(const basePath of ['https://evil.test/api','//evil.test/api','/api/../escape','/api/%2fescape','/api?token=secret','/api\\escape']) {
    const f=authFetch();const q=setup(AUTH_CFG({authenticated:{basePath,getHeaders:()=>({Authorization:'secret'})}}),{fetch:f});
    await q.h.ready;assert.equal(f.calls.length,0);q.h.destroy();
  }
});

test('S12 lifecycle: replaced memory prompt listeners are released and anonymous request aborts on teardown',async()=>{
  const q=setup(AUTH_CFG(),{fetch:authFetch()});await q.h.ready;
  const old=byLabel(q.shadow,'Reject change to preferred_country');
  await q.h.refreshProfile();assert.equal(old.handlers.click.length,0);q.h.destroy();
  let finish,signal;const anon=setup({}, {fetch:async(url,init)=>{signal=init.signal;return new Promise(r=>{finish=r;});}});
  await sendText(anon,'Private anonymous question');anon.h.destroy();assert.equal(signal.aborted,true);
  finish(okReply('Late anonymous answer'));await new Promise(r=>setTimeout(r,10));assert.deepEqual(anon.h.history(),[]);
});
test('S12 voice: authenticated mint uses fresh host transport, selected server thread and destroy stops pending microphone start',async()=>{
  const V=require('../src/voice.js');const f=authFetch();let mint,finish,stops=0;
  const transport=async(url,init)=>{
    if(!url.endsWith('/voice/session'))return f(url,init);
    mint={url,init};return new Promise(r=>{finish=r;});
  };
  const q=setup(AUTH_CFG({voice:true,authenticated:{basePath:AUTH_BASE,getHeaders:()=>({Authorization:'host-current'}),transport}}),{fetch:()=>{throw Error('must use injected transport');}});
  await q.h.ready;
  q.h.attachVoice(V,{mediaDevices:{getUserMedia:async()=>({getTracks:()=>[{stop(){stops++;}}]})},audio:{close(){}}});
  byLabel(q.shadow,'Start voice conversation').fire('click');await new Promise(r=>setImmediate(r));
  assert.deepEqual(JSON.parse(mint.init.body),{threadId:'owned-1'});assert.equal(mint.init.headers.authorization,'host-current');
  q.h.destroy();assert.equal(mint.init.signal.aborted,true);assert.equal(stops,1);
  finish(resp(201,{token:'unused',wsUrl:'wss://vc.invalid/socket',threadId:'owned-1',expiresAt:'2030-01-01T00:00:00Z'}));
  await new Promise(r=>setImmediate(r));assert.deepEqual(q.h.history(),[]);
});

test('S12 memory: explicit confirm/correct/forget preserve displayed binding and readonly account fields',async()=>{
  let profile=pendingProfile();const f=authFetch((url,init)=>{
    if(url.endsWith('/profile'))return resp(200,profile);
    if(url.endsWith('/decision')){
      const d=JSON.parse(init.body);
      profile={memory:{items:d.action==='erase'?[]:[{factId:'fact-1',key:'preferred_country',value:d.value,status:'confirmed',readOnly:false}]}};
      return resp(200,{});
    }
  });
  const q=setup(AUTH_CFG(),{fetch:f});await q.h.ready;
  assert.match(byClass(q.shadow,'memory').textContent,/preferred_country: India/);
  byLabel(q.shadow,'Confirm change to preferred_country').fire('click');await new Promise(r=>setTimeout(r,10));
  assert.deepEqual(JSON.parse(f.calls.find(c=>c.url.endsWith('/decision')).init.body),{action:'confirm',value:'Germany',candidateId:'candidate-2',expectedVersion:'version-2',threadId:'owned-1'});
  const edit=byLabel(q.shadow,'Correct value for preferred_country');assert.ok(edit);edit.value='Canada';
  byLabel(q.shadow,'Correct preferred_country').fire('click');await new Promise(r=>setTimeout(r,10));
  assert.match(byClass(q.shadow,'memory').textContent,/preferred_country: Canada/);
  byLabel(q.shadow,'Forget preferred_country').fire('click');await new Promise(r=>setTimeout(r,10));
  assert.doesNotMatch(byClass(q.shadow,'memory').textContent,/Canada|Germany|India/);
  profile={memory:{items:[{key:'grade',value:'12',status:'confirmed',readOnly:true}]}};await q.h.refreshProfile();
  assert.equal(byClass(q.shadow,'memory').findAll(n=>n.tagName==='BUTTON').length,0);q.h.destroy();
});
test('S12 auth: memory_changed requires a manual fresh Retry, ordinary errors keep id and new drafts survive',async()=>{
  let first=true;const f=authFetch((url)=>url.endsWith('/turns')?(first?resp(409,{error:'memory_changed',retryWithNewTurn:true}):okReply('New snapshot')):null);
  const q=setup(AUTH_CFG(),{fetch:f});await q.h.ready;await sendText(q,'My question');
  assert.equal(q.input.value,'My question');assert.equal(f.calls.filter(c=>c.url.endsWith('/turns')).length,1);
  assert.equal(byClass(q.shadow,'send').textContent,'Retry');first=false;await sendText(q,q.input.value);
  const sends=f.calls.filter(c=>c.url.endsWith('/turns'));assert.notEqual(JSON.parse(sends[0].init.body).clientTurnId,JSON.parse(sends[1].init.body).clientTurnId);
  assert.equal(q.h.history().filter(m=>m.kind==='me'&&m.text==='My question').length,1);q.h.destroy();
});

test('S12 sessions: empty account creates a server thread; listed-thread failure preserves draft and foreign ids are refused',async()=>{
  let failCreate=true;
  const f=authFetch((url,init)=>{
    if(url===AUTH_BASE+'/threads'&&init.method==='GET')return resp(200,{threads:[]});
    if(url===AUTH_BASE+'/threads'&&init.method==='POST')return failCreate?resp(503,{}):resp(201,{threadId:'owned-new'});
  });
  const q=setup(AUTH_CFG(),{fetch:f});assert.equal(await q.h.ready,false);
  q.input.value='Do not lose my draft';assert.equal(await q.h.newThread(),false);assert.equal(q.input.value,'Do not lose my draft');
  failCreate=false;assert.equal(await q.h.newThread(),true);
  await sendText(q,'New account question');assert.ok(f.calls.some(c=>c.url.endsWith('/threads/owned-new/turns')));
  const before=f.calls.length;assert.equal(await q.h.selectThread('someone-else'),false);assert.equal(f.calls.length,before);q.h.destroy();
});
test('S12 lifecycle: external detach triggers destroy and removes owned window listeners',async()=>{
  const doc=makeDoc(),win=makeWin(1280,800);let observe,disconnected=false;
  win.removeEventListener=(type,fn)=>{win.handlers[type]=(win.handlers[type]||[]).filter(x=>x!==fn);};
  win.MutationObserver=class {constructor(fn){observe=fn;}observe(){}disconnect(){disconnected=true;}};
  const h=W.mount(KEY_CFG(AUTH_CFG()),doc,authFetch(),{win});await h.ready;
  assert.equal(win.handlers.resize.length,1);h.host.isConnected=false;doc.body.removeChild(h.host);observe();
  assert.equal(win.handlers.resize.length,0);assert.equal(disconnected,true);assert.deepEqual(h.history(),[]);
});

test('S12 auth: unpublished memory change retains id for deliberate Retry',async()=>{
  let stale=true;const f=authFetch(url=>url.endsWith('/turns')?(stale?resp(409,{error:'memory_changed'}):okReply('Current answer')):null);
  const q=setup(AUTH_CFG(),{fetch:f});await q.h.ready;await sendText(q,'Keep this attempt');stale=false;await sendText(q,q.input.value);
  const turns=f.calls.filter(c=>c.url.endsWith('/turns'));assert.equal(JSON.parse(turns[0].init.body).clientTurnId,JSON.parse(turns[1].init.body).clientTurnId);q.h.destroy();
});

test('t057 auth: gateway 500 then Retry reuses the id; turn_in_progress 409 says it is still working, not memory changed; then replay succeeds',async()=>{
  let mode='cut';const f=authFetch(url=>url.endsWith('/turns')?(mode==='cut'?resp(500,{error:'proxy'}):mode==='busy'?resp(409,{error:'turn_in_progress'},{'retry-after':'2'}):okReply('Replayed answer')):null);
  const q=setup(AUTH_CFG(),{fetch:f});await q.h.ready;await sendText(q,'Journey map?');
  assert.match(q.log.textContent,/Could not get a reply\. Your question is kept for Retry\./);
  assert.equal(q.input.value,'Journey map?');
  mode='busy';await sendText(q,q.input.value);
  assert.match(q.log.textContent,/still working on your last question/i);
  assert.doesNotMatch(q.log.textContent,/Memory or chat state changed/);
  assert.equal(q.input.value,'Journey map?');assert.equal(byClass(q.shadow,'send').textContent,'Retry');
  mode='ok';await sendText(q,q.input.value);
  const ids=f.calls.filter(c=>c.url.endsWith('/turns')).map(c=>JSON.parse(c.init.body).clientTurnId);
  assert.equal(ids.length,3);assert.equal(new Set(ids).size,1);
  assert.match(q.log.textContent,/Replayed answer/);
  assert.equal(q.h.history().filter(m=>m.kind==='me'&&m.text==='Journey map?').length,1);q.h.destroy();
});
test('t057 auth: a non-busy 409 keeps its own memory-changed text',async()=>{
  const f=authFetch(url=>url.endsWith('/turns')?resp(409,{error:'memory_changed'}):null);
  const q=setup(AUTH_CFG(),{fetch:f});await q.h.ready;await sendText(q,'Q');
  assert.match(q.log.textContent,/Memory or chat state changed/);assert.doesNotMatch(q.log.textContent,/still working/i);q.h.destroy();
});

for(const success of [true,false]) test('S13 typing while New chat is opening preserves the new draft; success='+success,async()=>{
 let release,entered;const paused=new Promise(r=>entered=r);
 const f=authFetch((url,init)=>url===AUTH_BASE+'/threads'&&init.method==='POST'?new Promise(r=>{release=r;entered();}):null);
 const q=setup(AUTH_CFG(),{fetch:f});await q.h.ready;q.input.value='old draft';
 const opening=q.h.newThread();await paused;q.input.value='new draft while opening';
 release(success?resp(201,{threadId:'owned-2'}):resp(503,{}));assert.equal(await opening,success);
 assert.equal(q.input.value,'new draft while opening');q.h.destroy();
});

test("same-as-chat: a voice crisis shows ONE crisis block, the server's crisis message then the helpline, exactly the shape the text chat uses for an escalated reply", async () => {
  const V = require("../src/voice.js");
  const q = setup({ mode: "proxy", key: "", turnUrl: "/api/vc", voice: true, voiceProxy: "/api/voice/session" });
  q.h.open();
  let socket;
  class Socket { constructor() { socket = this; this.readyState = 0; } send() {} close() { this.readyState = 3; } }
  const deps = {
    fetch: async () => resp(201, { token: "token.signature", wsUrl: "wss://vc.example.org/stream", expiresAt: "2030-01-01T00:00:00Z", threadId: "owned-thread" }),
    WebSocket: Socket,
    mediaDevices: { getUserMedia: async () => ({ getTracks: () => [{ stop() {} }] }) },
    audio: { capture() { return () => {}; }, close() {} },
  };
  assert.equal(q.h.attachVoice(V, deps), true);
  q.h.setMode("voice");
  byLabel(q.shadow, "Start voice conversation").fire("click");
  await new Promise((resolve) => setImmediate(resolve));
  socket.readyState = 1; socket.onopen();
  const MSG = "I am really sorry you are feeling this way. Tele-MANAS 14416 is free and open 24x7.";
  socket.onmessage({ data: JSON.stringify({ type: "flag", eventId: "e1", reason: "crisis_detected" }) });
  socket.onmessage({ data: JSON.stringify({ type: "state", eventId: "e2", state: "escalated" }) });
  assert.equal(byClass(q.shadow, "crisis").textContent, W.HELP, "the helpline is on screen before the message arrives");
  socket.onmessage({ data: JSON.stringify({ type: "transcript.final", eventId: "e3", role: "assistant", text: MSG }) });
  const blocks = q.shadow.findAll ? q.shadow.findAll((n) => (" " + n.className + " ").indexOf(" crisis ") >= 0) : [byClass(q.shadow, "crisis")];
  assert.equal(blocks.length, 1, "one crisis block, upgraded in place");
  assert.equal(blocks[0].textContent, MSG + "\n" + W.HELP, "the chat's escalated-reply shape: message, newline, helpline");
  assert.equal(q.log.textContent.split(MSG).length - 1, 1, "the message is on screen once");
});

test("followups: a second voice crisis renders its own crisis block (message then helpline) and leaves the first block intact; one block per signal", async () => {
  const V = require("../src/voice.js");
  const q = setup({ mode: "proxy", key: "", turnUrl: "/api/vc", voice: true, voiceProxy: "/api/voice/session" });
  q.h.open();
  let socket;
  class Socket { constructor() { socket = this; this.readyState = 0; } send() {} close() { this.readyState = 3; } }
  const deps = {
    fetch: async () => resp(201, { token: "token.signature", wsUrl: "wss://vc.example.org/stream", expiresAt: "2030-01-01T00:00:00Z", threadId: "owned-thread" }),
    WebSocket: Socket,
    mediaDevices: { getUserMedia: async () => ({ getTracks: () => [{ stop() {} }] }) },
    audio: { capture() { return () => {}; }, close() {} },
  };
  assert.equal(q.h.attachVoice(V, deps), true);
  q.h.setMode("voice");
  byLabel(q.shadow, "Start voice conversation").fire("click");
  await new Promise((resolve) => setImmediate(resolve));
  socket.readyState = 1; socket.onopen();
  const say = (m) => socket.onmessage({ data: JSON.stringify(m) });
  const blocks = () => q.shadow.findAll((n) => (" " + n.className + " ").indexOf(" crisis ") >= 0).map((n) => n.textContent);
  const M1 = "First crisis message. Tele-MANAS 14416.", M2 = "Second crisis message. Tele-MANAS 14416.";
  say({ type: "flag", eventId: "e1", reason: "crisis_detected" });
  say({ type: "state", eventId: "e2", state: "escalated" });
  assert.deepEqual(blocks(), [W.HELP], "one block for the first signal, helpline alone");
  say({ type: "transcript.final", eventId: "e3", role: "assistant", text: M1 });
  say({ type: "state", eventId: "e4", state: "ok" });
  say({ type: "transcript.final", eventId: "e5", role: "user", text: "again" });
  say({ type: "flag", eventId: "e6", reason: "crisis_detected" });
  say({ type: "state", eventId: "e7", state: "escalated" });
  assert.deepEqual(blocks(), [M1 + "\n" + W.HELP, W.HELP], "the second signal adds a block and does not overwrite the first");
  say({ type: "transcript.final", eventId: "e8", role: "assistant", text: M2 });
  assert.deepEqual(blocks(), [M1 + "\n" + W.HELP, M2 + "\n" + W.HELP], "two blocks, each message then helpline, none duplicated");
  assert.equal(q.log.textContent.split(M2).length - 1, 1, "the second message is on screen once");
});
