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

test("VA18 toggle: Voice is hidden when voiceAvailable is false (no data-vc-voice, proxy mode, or no key)", () => {
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
