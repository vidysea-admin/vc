/*! vc-widget v1.0.0 - embeddable Virtual Counsellor chat (partner-chatbot, D-111).
 * One script tag, no dependencies, no build step. Renders a floating bubble inside a shadow DOM.
 *   <script src=".../widget/vc-widget.v1.js" data-vc-key="vck_..." defer></script>   key mode
 *   <script src=".../widget/vc-widget.v1.js" data-vc-proxy="/api/vc" defer></script> proxy mode
 * Options: data-vc-key, data-vc-api, data-vc-proxy, data-vc-title, data-vc-color, data-vc-voice ("on" adds a mic button; key mode only).
 * Safety: model text is only ever written with textContent; links are limited to http/https; nothing is stored
 * (no localStorage, sessionStorage, cookies or IndexedDB); the conversation lives in memory only.
 */
(function (root) {
  "use strict";

  var VERSION = "1.0.0";
  var TURN_PATH = "/v1/public/chat/turns";
  var HELP = "Tele-MANAS 14416 (24x7) · Emergency 112";
  var FOOTER = "Not a substitute for a counsellor. In distress? " + HELP;
  var UNAVAILABLE_TEXT = "Chat unavailable right now. Please try again later.";
  var GREETING = "Hi, I am an AI career counsellor. Ask me about careers, courses and colleges. I can make mistakes, so please check important facts with a counsellor.";
  var DEFAULT_COLOR = "#1f5fbf";
  var DEFAULT_TITLE = "Career Counsellor";
  var MAX_TEXT = 4000;
  var VOICE_RENDERED = true; // pc-voice (V3): data-vc-voice="on" (key mode) loads the mic add-on, voice.js, from the folder this script came from.
  var VOICE_MAJOR = "1"; // the add-on's file name carries its major version: vc-widget-voice.v1.js

  // ---- config -----------------------------------------------------------------------------------------------

  function httpUrl(u) {
    try {
      var p = new URL(u);
      return p.protocol === "http:" || p.protocol === "https:" ? p : null;
    } catch (e) {
      return null;
    }
  }

  // Returns an http/https absolute href, or null. Anything else (javascript:, data:, //host, relative) is refused.
  function sanitizeUrl(u) {
    if (typeof u !== "string" || u.length > 2048) return null;
    var s = u.trim();
    if (!s || /[\u0000-\u001f\u007f]/.test(s)) return null;
    var p = httpUrl(s);
    if (!p || !p.hostname) return null;
    return p.href;
  }

  // dataset: an object with camelCase keys (vcKey, vcApi, vcProxy, vcTitle, vcColor, vcVoice), like element.dataset.
  function parseConfig(dataset, scriptSrc) {
    var d = dataset || {};
    var errors = [];
    function str(k) { return typeof d[k] === "string" ? d[k].trim() : ""; }
    var key = str("vcKey"), api = str("vcApi"), proxy = str("vcProxy");
    var title = str("vcTitle").slice(0, 60) || DEFAULT_TITLE;
    var color = str("vcColor");
    if (!/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(color)) color = DEFAULT_COLOR;
    var voice = str("vcVoice").toLowerCase() === "on";
    var mode, turnUrl = "";

    if (proxy) {
      mode = "proxy";
      key = ""; // the host backend adds the key; it never travels from the page in proxy mode
      var pxAbs = httpUrl(proxy);
      if (pxAbs ? !pxAbs.hostname : !(proxy.charAt(0) === "/" && proxy.charAt(1) !== "/" && proxy.charAt(1) !== "\\" && !/[\u0000-\u001f\u007f]/.test(proxy))) {
        errors.push("data-vc-proxy must be an http(s) URL or a path starting with a single /");
      } else {
        turnUrl = proxy;
      }
    } else {
      mode = key ? "key" : "open";
      var base = "";
      if (api) {
        var a = httpUrl(api);
        if (a && a.hostname) base = a.origin + a.pathname.replace(/\/+$/, "");
        else errors.push("data-vc-api must be an http(s) URL");
      } else if (scriptSrc) {
        var s = httpUrl(scriptSrc);
        base = s ? s.origin : "";
      }
      if (!errors.length) turnUrl = base + TURN_PATH;
    }
    return { ok: errors.length === 0, errors: errors, mode: mode, key: key, turnUrl: turnUrl, title: title, color: color, voice: voice };
  }

  function contrastText(hex) {
    var h = String(hex).replace("#", "");
    if (h.length === 3) h = h.charAt(0) + h.charAt(0) + h.charAt(1) + h.charAt(1) + h.charAt(2) + h.charAt(2);
    var n = parseInt(h, 16);
    function lin(c) { c = c / 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
    var L = 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
    return L > 0.4 ? "#1b1f23" : "#ffffff";
  }

  // ---- voice hook (pc-voice V3) -----------------------------------------------------------------------------

  // The mic is offered only with data-vc-voice="on" AND a page key: the voice session is minted with the key (proxy and open modes have none).
  function voiceAvailable(cfg) {
    return !!(cfg && cfg.voice && cfg.mode === "key" && cfg.key);
  }

  // Where the add-on lives: next to the script that is running, under the versioned name. "" when the script URL is unusable.
  function voiceScriptUrl(scriptSrc) {
    var p = httpUrl(scriptSrc);
    if (!p || !p.hostname) return "";
    try { return new URL("vc-widget-voice.v" + VOICE_MAJOR + ".js", p).href; } catch (e) { return ""; }
  }

  // pc-hardening H3 (ISS-pc-voice-6): the voice-busy note, in English and Hindi. The widget has no language option of its own: the page's <html lang> picks it ("hi", "hi-IN", ...),
  // anything else is English. Only this note is translated (the voice add-on's other texts stay English, as before).
  var VOICE_BUSY_TEXT = {
    en: "Voice is busy right now. Please try again shortly, or keep typing here.",
    hi: "वॉइस अभी व्यस्त है। कृपया थोड़ी देर में फिर कोशिश करें, या यहीं टाइप करें।"
  };

  function pageLang(doc) {
    var l = "";
    try { l = String((doc && doc.documentElement && doc.documentElement.lang) || ""); } catch (e) { /* no document */ }
    return l;
  }

  function busyText(lang) {
    return /^hi(-|_|$)/i.test(String(lang || "").trim()) ? VOICE_BUSY_TEXT.hi : VOICE_BUSY_TEXT.en;
  }

  var VOICE_FALLBACK_TEXT = {
    permission: "Microphone access is blocked, so voice is off. You can keep typing here, or allow the microphone in your browser settings and try again.",
    no_mic: "No microphone was found, so voice is off. You can keep typing here.",
    unsupported: "Voice is not supported in this browser. You can keep typing here.",
    unavailable: "Voice is unavailable right now. You can keep typing here."
  };

  // What the log shows when the voice add-on falls back to text (the voice.js "fallback" event).
  function voiceFallbackText(d, lang) {
    var text = VOICE_FALLBACK_TEXT[d.reason];
    if (d.reason === "busy") text = busyText(lang);
    else if (d.reason === "rate") text = "Too many voice requests. Please wait " + d.wait + " seconds, or type your question.";
    else if (!text) text = "Voice could not start. You can keep typing here." + (d.helpline ? "\n" + d.helpline : "");
    return text;
  }

  // What the log shows for a voice "error" event: a voice_busy frame (sent before a 1008 close) is the busy note; any other keeps the server's message and the helpline.
  function voiceErrorNotice(e, lang) {
    if (e && e.code === "voice_busy") return { kind: "note", text: busyText(lang) };
    return { kind: "err", text: ((e && e.message) || "Voice had a problem.") + "\n" + (e && e.help) };
  }

  // ---- transport --------------------------------------------------------------------------------------------

  function buildRequest(cfg, text) {
    var headers = { "content-type": "application/json" };
    if (cfg.mode === "key") headers["X-VC-Key"] = cfg.key;
    return {
      url: cfg.turnUrl,
      init: {
        method: "POST",
        headers: headers,
        body: JSON.stringify({ text: text }),
        credentials: cfg.mode === "proxy" ? "same-origin" : "omit"
      }
    };
  }

  // Seconds to wait, clamped to 1..300; a missing or unreadable header means 60.
  function parseRetryAfter(value, nowMs) {
    if (value === null || value === undefined) return 60;
    var v = String(value).trim();
    var secs;
    if (/^\d+$/.test(v)) secs = parseInt(v, 10);
    else if (/^-/.test(v)) return 60;
    else {
      var t = Date.parse(v);
      if (isNaN(t)) return 60;
      secs = Math.ceil((t - (typeof nowMs === "number" ? nowMs : Date.now())) / 1000);
    }
    return Math.min(300, Math.max(1, secs));
  }

  var STATES = { ok: 1, no_sourced_answer: 1, sign_in_required: 1, escalated: 1 };

  function normalizeReply(body) {
    var b = body && typeof body === "object" ? body : {};
    var claims = [], sources = [];
    (Array.isArray(b.claims) ? b.claims : []).forEach(function (c) {
      if (c && typeof c === "object" && typeof c.text === "string" && c.text) {
        claims.push({ text: c.text.slice(0, 2000), unverified: c.status === "unverified" });
      }
    });
    (Array.isArray(b.sources) ? b.sources : []).slice(0, 20).forEach(function (s) {
      if (!s || typeof s !== "object") return;
      var href = sanitizeUrl(s.url);
      var title = typeof s.title === "string" && s.title ? s.title.slice(0, 500) : href || "";
      if (title) sources.push({ title: title, href: href });
    });
    return {
      state: STATES[b.state] ? b.state : "ok",
      message: typeof b.message === "string" ? b.message : "",
      claims: claims.slice(0, 20),
      sources: sources
    };
  }

  // One chat turn. Never throws. kind: reply | unavailable | rate | error | network.
  async function send(cfg, text, fetchImpl) {
    var req = buildRequest(cfg, text);
    var f = fetchImpl || (root.fetch && root.fetch.bind(root));
    var ctl = typeof AbortController === "function" ? new AbortController() : null;
    var timer = ctl ? setTimeout(function () { ctl.abort(); }, 130000) : null;
    if (ctl) req.init.signal = ctl.signal;
    var res;
    try {
      res = await f(req.url, req.init);
    } catch (e) {
      return { kind: "network" };
    } finally {
      if (timer) clearTimeout(timer);
    }
    if (res.status === 401 || res.status === 403) return { kind: "unavailable" };
    if (res.status === 429) return { kind: "rate", wait: parseRetryAfter(res.headers && res.headers.get("retry-after")) };
    var body = null;
    try { body = await res.json(); } catch (e) { /* non-JSON body */ }
    if (!res.ok || !body || typeof body !== "object") {
      var helpline = body && typeof body.helpline === "string" ? body.helpline.slice(0, 300) : "";
      return { kind: "error", status: res.status, helpline: helpline };
    }
    var r = normalizeReply(body);
    r.kind = "reply";
    return r;
  }

  // ---- UI ---------------------------------------------------------------------------------------------------

  function css(cfg) {
    return [
      ":host{all:initial}",
      "*{box-sizing:border-box}",
      ".root{position:fixed;right:16px;bottom:16px;z-index:2147483000;font:16px/1.45 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#1b1f23}",
      ".bubble{width:56px;height:56px;border-radius:50%;border:0;cursor:pointer;background:var(--c);color:var(--ct);display:flex;align-items:center;justify-content:center;box-shadow:0 2px 10px rgba(0,0,0,.3);padding:0}",
      ".bubble svg{width:28px;height:28px;fill:currentColor}",
      ".panel{position:fixed;right:12px;bottom:84px;width:min(380px,calc(100vw - 24px));height:min(560px,calc(100vh - 100px));height:min(560px,calc(100dvh - 100px));background:#f5f6f8;border:1px solid #c5cbd3;border-radius:14px;box-shadow:0 8px 30px rgba(0,0,0,.3);display:flex;flex-direction:column;overflow:hidden}",
      ".panel[hidden]{display:none}",
      ".head{display:flex;align-items:center;gap:8px;padding:6px 6px 6px 14px;background:var(--c);color:var(--ct)}",
      ".head h2{flex:1;margin:0;font-size:1rem;font-weight:650;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
      ".close{width:44px;height:44px;border:0;background:transparent;color:inherit;font:inherit;font-size:1.4rem;line-height:1;cursor:pointer;border-radius:8px}",
      ".log{flex:1;min-height:0;overflow-y:auto;display:flex;flex-direction:column;gap:8px;padding:10px 12px}",
      ".m{max-width:90%;padding:8px 12px;border-radius:12px;white-space:pre-wrap;overflow-wrap:anywhere;font-size:.95rem}",
      ".me{align-self:flex-end;background:var(--c);color:var(--ct)}",
      ".bot{align-self:flex-start;background:#fff;border:1px solid #d9dde3}",
      ".note{align-self:flex-start;background:#fff4d6;border:1px solid #e3c25a}",
      ".crisis{align-self:flex-start;background:#fde7e7;border:2px solid #b3261e}",
      ".err{align-self:flex-start;background:#fff;border:1px solid #b3261e;color:#8c1d18}",
      ".claims{margin:8px 0 0;padding-left:18px;font-size:.85rem;color:#3a4048}",
      ".flag{color:#8a5a00;font-weight:600}",
      ".src{margin-top:8px;font-size:.85rem;white-space:normal}",
      ".src a{color:#0b4aa8;text-decoration:underline}",
      ".typing{align-self:flex-start;background:#fff;border:1px solid #d9dde3;border-radius:12px;padding:10px 14px;display:flex;gap:4px}",
      ".typing[hidden]{display:none}",
      ".typing i{width:7px;height:7px;border-radius:50%;background:#6b7580;animation:b 1.2s infinite ease-in-out}",
      ".typing i:nth-child(2){animation-delay:.2s}.typing i:nth-child(3){animation-delay:.4s}",
      "@keyframes b{0%,60%,100%{opacity:.3}30%{opacity:1}}",
      "@media (prefers-reduced-motion:reduce){.typing i{animation:none;opacity:.7}}",
      ".status{min-height:1.2em;margin:0;padding:0 14px;font-size:.85rem;color:#444}",
      "form{display:flex;gap:6px;padding:6px 10px 8px;align-items:flex-end}",
      "textarea{flex:1;min-width:0;font:inherit;font-size:16px;padding:8px;border:1px solid #8c96a3;border-radius:8px;resize:none;height:44px;max-height:96px;background:#fff;color:#1b1f23}",
      ".send{min-width:64px;min-height:44px;padding:0 14px;font:inherit;font-weight:600;color:var(--ct);background:var(--c);border:0;border-radius:8px;cursor:pointer}",
      ".send:disabled,textarea:disabled{opacity:.55;cursor:not-allowed}",
      ".mic{min-width:44px;min-height:44px;padding:0 10px;border:1px solid #8c96a3;border-radius:8px;background:#fff;color:#1b1f23;cursor:pointer;font:inherit;font-weight:600}",
      ".mic[hidden]{display:none}",
      ".mic[aria-pressed=true]{background:#b3261e;border-color:#b3261e;color:#fff}",
      ".mic svg{width:20px;height:20px;fill:currentColor;vertical-align:middle}",
      ".foot{padding:6px 10px;font-size:.8rem;font-weight:600;text-align:center;background:#fff;border-top:1px solid #d9dde3}",
      "button:focus-visible,textarea:focus-visible,a:focus-visible{outline:3px solid #f0a100;outline-offset:2px}",
      "@media (max-width:480px){.panel{left:8px;right:8px;width:auto;bottom:80px}.root{right:12px;bottom:12px}}"
    ].join("\n");
  }

  function el(doc, tag, cls, text) {
    var n = doc.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  }

  function bubbleIcon(doc) {
    var ns = "http://www.w3.org/2000/svg";
    var svg = doc.createElementNS(ns, "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    var p = doc.createElementNS(ns, "path");
    p.setAttribute("d", "M4 4h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9l-5 4v-4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z");
    svg.appendChild(p);
    return svg;
  }

  function mount(cfg, doc, fetchImpl) {
    doc = doc || root.document;
    var host = doc.createElement("div");
    host.setAttribute("data-vc-widget", VERSION);
    var shadow = host.attachShadow({ mode: "open" });
    var style = doc.createElement("style");
    style.textContent = css(cfg);
    shadow.appendChild(style);

    var wrap = el(doc, "div", "root");
    wrap.style.setProperty("--c", cfg.color);
    wrap.style.setProperty("--ct", contrastText(cfg.color));

    var bubble = el(doc, "button", "bubble");
    bubble.type = "button";
    bubble.setAttribute("aria-label", "Open chat: " + cfg.title);
    bubble.setAttribute("aria-expanded", "false");
    bubble.setAttribute("aria-controls", "vc-panel");
    bubble.appendChild(bubbleIcon(doc));

    var panel = el(doc, "section", "panel");
    panel.id = "vc-panel";
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", cfg.title);
    panel.hidden = true;

    var head = el(doc, "div", "head");
    head.appendChild(el(doc, "h2", "", cfg.title));
    var close = el(doc, "button", "close", "×");
    close.type = "button";
    close.setAttribute("aria-label", "Close chat");
    head.appendChild(close);

    var log = el(doc, "div", "log");
    log.setAttribute("role", "log");
    log.setAttribute("aria-live", "polite");
    log.setAttribute("aria-label", "Conversation");
    var typing = el(doc, "div", "typing");
    typing.setAttribute("role", "status");
    typing.setAttribute("aria-label", "The counsellor is typing");
    typing.hidden = true;
    typing.appendChild(el(doc, "i"));
    typing.appendChild(el(doc, "i"));
    typing.appendChild(el(doc, "i"));
    log.appendChild(typing); // always the last child; messages are inserted before it

    var status = el(doc, "p", "status");
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");

    var form = el(doc, "form");
    form.setAttribute("autocomplete", "off");
    var input = el(doc, "textarea");
    input.rows = 1;
    input.maxLength = MAX_TEXT;
    input.setAttribute("aria-label", "Your message");
    input.placeholder = "Type your question";
    var sendBtn = el(doc, "button", "send", "Send");
    sendBtn.type = "submit";
    form.appendChild(input);
    form.appendChild(sendBtn);

    var foot = el(doc, "div", "foot", FOOTER);

    panel.appendChild(head);
    panel.appendChild(log);
    panel.appendChild(status);
    panel.appendChild(form);
    panel.appendChild(foot);
    wrap.appendChild(panel);
    wrap.appendChild(bubble);
    shadow.appendChild(wrap);

    var busy = false, dead = false, waitTimer = null, greeted = false;

    function add(cls, text) {
      var d = el(doc, "div", "m " + cls);
      d.textContent = text; // never innerHTML
      log.insertBefore(d, typing);
      log.scrollTop = log.scrollHeight;
      return d;
    }
    function setBusy(b) {
      busy = b;
      typing.hidden = !b;
      refreshControls();
      if (b) log.scrollTop = log.scrollHeight;
    }
    function refreshControls() {
      var off = busy || dead || !!waitTimer;
      sendBtn.disabled = off;
      input.disabled = dead;
      if (!dead && !busy && !waitTimer) status.textContent = "";
    }
    function linksBlock(sources) {
      if (!sources.length) return null;
      var box = el(doc, "div", "src");
      box.appendChild(doc.createTextNode("Sources: "));
      sources.forEach(function (s, i) {
        if (i) box.appendChild(doc.createTextNode(" · "));
        if (s.href) {
          var a = el(doc, "a", "", s.title);
          a.href = s.href;
          a.target = "_blank";
          a.rel = "noopener noreferrer";
          box.appendChild(a);
        } else {
          box.appendChild(doc.createTextNode(s.title));
        }
      });
      return box;
    }
    function showReply(r) {
      var m = r.message;
      if (r.state === "escalated") {
        add("crisis", (m || "It sounds like you may be going through a hard time.") + "\n" + HELP);
        return;
      }
      var bubbleEl;
      if (r.state === "no_sourced_answer") bubbleEl = add("note", m || "I could not find a sourced answer to that. Please ask a counsellor, or try rephrasing.");
      else if (r.state === "sign_in_required") bubbleEl = add("note", m || "Please sign in to continue with this question.");
      else bubbleEl = add("bot", m || "(no reply)");
      if (r.state === "ok" && r.claims.length) {
        var ul = el(doc, "ul", "claims");
        r.claims.forEach(function (c) {
          var li = el(doc, "li", "", c.text);
          if (c.unverified) li.appendChild(el(doc, "span", "flag", " (unverified)"));
          ul.appendChild(li);
        });
        bubbleEl.appendChild(ul);
      }
      var links = linksBlock(r.state === "no_sourced_answer" ? r.sources.filter(function (s) { return s.href; }) : r.sources);
      if (links) bubbleEl.appendChild(links);
      log.scrollTop = log.scrollHeight;
    }
    function startWait(seconds, text) {
      var left = seconds;
      input.value = text; // give the visitor's message back so it can be re-sent
      function tick() {
        if (left <= 0) {
          clearInterval(waitTimer);
          waitTimer = null;
          refreshControls();
          input.focus();
          return;
        }
        status.textContent = "Please wait " + left + " s before sending again.";
        left -= 1;
      }
      waitTimer = setInterval(tick, 1000);
      tick();
      refreshControls();
    }

    async function submit() {
      var text = input.value.trim();
      if (!text || busy || dead || waitTimer) return;
      add("me", text);
      input.value = "";
      setBusy(true);
      status.textContent = "Waiting for a reply...";
      var r;
      try { r = await send(cfg, text, fetchImpl); } finally { setBusy(false); }
      if (r.kind === "reply") showReply(r);
      else if (r.kind === "unavailable") {
        dead = true;
        add("err", UNAVAILABLE_TEXT);
        status.textContent = "Chat unavailable.";
        refreshControls();
      } else if (r.kind === "rate") {
        add("err", "You are sending messages too fast. Please wait " + r.wait + " seconds and try again.");
        startWait(r.wait, text);
      } else if (r.kind === "network") add("err", "Could not reach the service. Check your connection and try again.");
      else add("err", (r.status === 413 ? "That message is too long. Please shorten it." : "Something went wrong (" + r.status + "). Please try again.") + (r.helpline ? "\n" + r.helpline : ""));
      if (!dead && !waitTimer) input.focus();
    }

    function open() {
      panel.hidden = false;
      bubble.setAttribute("aria-expanded", "true");
      bubble.setAttribute("aria-label", "Close chat: " + cfg.title);
      if (!greeted) { greeted = true; add("bot", GREETING); }
      if (!input.disabled) input.focus(); else close.focus();
    }
    // pc-voice V3: the mic button. Added only when the add-on has loaded (voice.js) and the config allows voice; the text chat works either way.
    var voiceCtl = null, micBtn = null, liveLine = { user: null, assistant: null }, lastBot = null;
    function attachVoice(lib, deps) {
      if (micBtn || !lib || typeof lib.create !== "function" || !voiceAvailable(cfg)) return false;
      micBtn = el(doc, "button", "mic");
      micBtn.type = "button";
      micBtn.setAttribute("aria-pressed", "false");
      micBtn.setAttribute("aria-label", "Start voice conversation");
      var ns = "http://www.w3.org/2000/svg";
      var svg = doc.createElementNS(ns, "svg");
      svg.setAttribute("viewBox", "0 0 24 24");
      svg.setAttribute("aria-hidden", "true");
      var pth = doc.createElementNS(ns, "path");
      pth.setAttribute("d", "M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.9V21h2v-3.1A7 7 0 0 0 19 11h-2z");
      svg.appendChild(pth);
      micBtn.appendChild(svg);
      form.insertBefore(micBtn, sendBtn);
      var on = {
        state: function (s) {
          var active = s !== "idle";
          micBtn.setAttribute("aria-pressed", active ? "true" : "false");
          micBtn.setAttribute("aria-label", active ? "Stop voice conversation" : "Start voice conversation");
          if (s === "connecting") status.textContent = "Starting voice...";
          else if (s === "listening") status.textContent = "Listening. Speak now; tap the mic to stop.";
          else if (!busy && !waitTimer && !dead) status.textContent = "";
        },
        transcript: function (t) {
          var line = liveLine[t.role];
          if (!line) {
            line = add(t.role === "user" ? "me" : "bot", t.text);
            liveLine[t.role] = line;
            if (t.role === "assistant") lastBot = line;
          } else {
            line.textContent = t.text; // textContent only, as everywhere else
          }
          if (t.final) liveLine[t.role] = null;
          log.scrollTop = log.scrollHeight;
        },
        sources: function (list) {
          var box = lastBot && list.length ? linksBlock(list) : null;
          if (box) lastBot.appendChild(box);
        },
        crisis: function (c) { add("crisis", c.help); },
        error: function (e) { var n = voiceErrorNotice(e, pageLang(doc)); add(n.kind, n.text); },
        fallback: function (d) {
          add("note", voiceFallbackText(d, pageLang(doc)));
          if (!input.disabled) input.focus();
        },
        ended: function () {
          liveLine.user = liveLine.assistant = null;
          if (!busy && !waitTimer && !dead) status.textContent = "Voice ended.";
        }
      };
      voiceCtl = lib.create(Object.assign({ cfg: cfg, on: on }, deps || {}));
      micBtn.addEventListener("click", function () {
        if (voiceCtl.state() === "idle") voiceCtl.start(); else voiceCtl.stop();
      });
      return true;
    }
    function shut() {
      if (voiceCtl) voiceCtl.stop(); // closing the panel ends the call and releases the mic
      panel.hidden = true;
      bubble.setAttribute("aria-expanded", "false");
      bubble.setAttribute("aria-label", "Open chat: " + cfg.title);
      bubble.focus();
    }

    bubble.addEventListener("click", function () { if (panel.hidden) open(); else shut(); });
    close.addEventListener("click", shut);
    form.addEventListener("submit", function (ev) { ev.preventDefault(); submit(); });
    input.addEventListener("keydown", function (ev) {
      if (ev.key === "Enter" && !ev.shiftKey && !ev.isComposing) { ev.preventDefault(); submit(); }
    });
    shadow.addEventListener("keydown", function (ev) {
      if (ev.key === "Escape" && !panel.hidden) { ev.stopPropagation(); shut(); }
    });

    (doc.body || doc.documentElement).appendChild(host);
    return { host: host, open: open, close: shut, attachVoice: attachVoice };
  }

  // ---- bootstrap --------------------------------------------------------------------------------------------

  function init(scriptEl) {
    var doc = root.document;
    if (!doc || root.__vcWidgetMounted) return null;
    var cfg = parseConfig(scriptEl && scriptEl.dataset ? scriptEl.dataset : {}, scriptEl && scriptEl.src);
    if (!cfg.ok) {
      if (root.console) root.console.error("vc-widget: " + cfg.errors.join("; "));
      return null;
    }
    if (cfg.mode === "open" && root.console) root.console.warn("vc-widget: no data-vc-key or data-vc-proxy set; sending without a partner key.");
    root.__vcWidgetMounted = true;
    var go = function () {
      var handle = mount(cfg, doc);
      if (!voiceAvailable(cfg)) return;
      if (root.VCWidgetVoice) { handle.attachVoice(root.VCWidgetVoice); return; }
      var url = voiceScriptUrl(scriptEl && scriptEl.src);
      if (!url) return;
      var s = doc.createElement("script");
      s.src = url;
      s.async = true;
      s.onload = function () { if (root.VCWidgetVoice) handle.attachVoice(root.VCWidgetVoice); };
      s.onerror = function () { if (root.console) root.console.warn("vc-widget: the voice add-on did not load; text chat only."); };
      (doc.head || doc.documentElement).appendChild(s);
    };
    if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", go); else go();
    return cfg;
  }

  var api = {
    VERSION: VERSION, HELP: HELP, FOOTER: FOOTER, UNAVAILABLE_TEXT: UNAVAILABLE_TEXT, VOICE_RENDERED: VOICE_RENDERED,
    parseConfig: parseConfig, buildRequest: buildRequest, parseRetryAfter: parseRetryAfter, sanitizeUrl: sanitizeUrl,
    normalizeReply: normalizeReply, send: send, contrastText: contrastText, mount: mount, init: init,
    voiceAvailable: voiceAvailable, voiceScriptUrl: voiceScriptUrl, voiceFallbackText: voiceFallbackText, voiceErrorNotice: voiceErrorNotice
  };

  if (typeof module === "object" && module && module.exports) module.exports = api;
  if (root && root.document) {
    root.VCWidget = api;
    if (root.document.currentScript) init(root.document.currentScript);
  }
})(typeof window !== "undefined" ? window : globalThis);
