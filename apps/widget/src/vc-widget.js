/*! vc-widget v1.1.0 - embeddable Virtual Counsellor chat (partner-chatbot, D-111; floater, vc-admin-control S7).
 * One script tag, no dependencies, no build step. Renders a floating bubble inside a shadow DOM.
 *   <script src=".../widget/vc-widget.v1.js" data-vc-key="vck_..." defer></script>   key mode
 *   <script src=".../widget/vc-widget.v1.js" data-vc-proxy="/api/vc" defer></script> proxy mode
 * Options: data-vc-key, data-vc-api, data-vc-proxy, data-vc-title, data-vc-color, data-vc-voice ("on" adds a mic button and a Chat|Voice toggle), data-vc-voice-proxy (same-origin mint path), data-vc-site (site id for the pop-out window).
 * The panel floats: drag it by the header, resize it from the bottom-right corner, or pop it out into its own window.
 * Safety: model text is only ever written with textContent; links are limited to http/https; nothing is stored
 * (no localStorage, sessionStorage, cookies or IndexedDB); the conversation lives in memory only.
 */
(function (root) {
  "use strict";

  var VERSION = "1.1.0";
  var TURN_PATH = "/v1/public/chat/turns";
  var HELP = "Tele-MANAS 14416 (24x7) · Emergency 112";
  var FOOTER = "Not a substitute for a counsellor. In distress? " + HELP;
  var UNAVAILABLE_TEXT = "Chat unavailable right now. Please try again later.";
  var GREETING = "Hi, I am an AI career counsellor. Ask me about careers, courses and colleges. I can make mistakes, so please check important facts with a counsellor.";
  var DEFAULT_COLOR = "#1f5fbf";
  var DEFAULT_TITLE = "Career Counsellor";
  var MAX_TEXT = 4000;
  var MIN_W = 300, MIN_H = 380; // the smallest the visitor can resize the panel to (a viewport smaller than this wins, so nothing overflows)
  var SITE_RE = /^[a-z0-9-]{2,32}$/; // the partner-id shape; the pop-out URL carries this id and never a key
  var POPOUT_PATH = "/vc-popout";
  var POPOUT_FEATURES = "popup=yes,width=420,height=680,noopener,noreferrer";
  var VOICE_RENDERED = true; // data-vc-voice="on" with a key or explicit voice proxy loads the mic add-on from this script's folder.
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

  // dataset: camelCase attribute keys, including vcVoiceProxy. Identity and thread attributes are never accepted.
  function parseConfig(dataset, scriptSrc) {
    var d = dataset || {};
    var errors = [];
    function str(k) { return typeof d[k] === "string" ? d[k].trim() : ""; }
    var key = str("vcKey"), api = str("vcApi"), proxy = str("vcProxy");
    var title = str("vcTitle").slice(0, 60) || DEFAULT_TITLE;
    var color = str("vcColor");
    if (!/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(color)) color = DEFAULT_COLOR;
    var voice = str("vcVoice").toLowerCase() === "on";
    var voiceProxy = str("vcVoiceProxy");
    // Root-relative paths only: browser origin, no credentials/query/fragment or slash normalization to a remote host.
    if (voiceProxy && (voiceProxy.length > 2048 || !/^\/(?![\/\\])[^\\?#\s]*$/.test(voiceProxy) || /[\u0000-\u001f\u007f]/.test(d.vcVoiceProxy))) {
      errors.push("data-vc-voice-proxy must be a same-origin path starting with a single /, without query or fragment");
      voiceProxy = "";
    }
    var site = str("vcSite");
    if (!SITE_RE.test(site)) site = "";
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
    if (!site && key) { // the partner id inside a page key (vck_pub_<partnerId>_<secret>) names the site; the key itself never leaves the config
      var km = /^vck_pub_([a-z0-9-]{2,32})_/.exec(key);
      if (km) site = km[1];
    }
    return { ok: errors.length === 0, errors: errors, mode: mode, key: key, turnUrl: turnUrl, title: title, color: color, voice: voice, voiceProxy: voiceProxy, site: site };
  }

  // ---- floater geometry (vc-admin-control S7) ---------------------------------------------------------------

  // Pulls a {left, top, width, height} rectangle inside a vw x vh viewport: size floor MIN_W x MIN_H (a smaller viewport wins), then the position.
  function clampRect(r, vw, vh) {
    var w = Math.min(Math.max(r.width, MIN_W), Math.max(vw, 0));
    var h = Math.min(Math.max(r.height, MIN_H), Math.max(vh, 0));
    return {
      left: Math.min(Math.max(r.left, 0), Math.max(vw - w, 0)),
      top: Math.min(Math.max(r.top, 0), Math.max(vh - h, 0)),
      width: w,
      height: h
    };
  }

  // The pop-out window address: <host or API origin>/vc-popout?site=<id>. Nothing else rides in it (no key, no student token, no chat text).
  // Key/open mode: the origin of the configured API. Proxy mode: the proxy's origin, or the host page's origin for a relative proxy. null when there is no usable site id or origin.
  function popoutUrl(cfg, pageOrigin) {
    if (!cfg || typeof cfg.site !== "string" || !SITE_RE.test(cfg.site)) return null;
    var t = String(cfg.turnUrl || "");
    var abs = httpUrl(t);
    var origin = "";
    if (abs && abs.hostname) origin = abs.origin;
    else if (t.charAt(0) === "/") {
      var po = httpUrl(pageOrigin);
      origin = po && po.hostname ? po.origin : "";
    }
    return origin ? origin + POPOUT_PATH + "?site=" + encodeURIComponent(cfg.site) : null;
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

  // Proxy voice is an explicit opt-in to the host's authenticated same-origin mint; never derive it from the text endpoint.
  function voiceAvailable(cfg) {
    return !!(cfg && cfg.voice && ((cfg.mode === "key" && cfg.key) ||
      (cfg.mode === "proxy" && typeof cfg.voiceProxy === "string" && cfg.voiceProxy.length <= 2048 && /^\/(?![\/\\])[^\\?#\s]*$/.test(cfg.voiceProxy) && !/[\u0000-\u001f\u007f]/.test(cfg.voiceProxy))));
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

  // pc-hardening-2 J2 (ISS-pc-hardening-3): voice switched off for this client or partner is permanent, so it is not worded as busy.
  var VOICE_OFF_TEXT = {
    en: "Voice is not available here. Please type your question.",
    hi: "यहाँ वॉइस उपलब्ध नहीं है। कृपया अपना सवाल टाइप करें।"
  };

  // pc-hardening-2 J1 (ISS-pc-hardening-1): the helpline line the voice notes keep, in the language of the note it follows. The English line is HELP itself; the numbers are the same.
  var HELP_HI = "Tele-MANAS: 14416, मुफ़्त, 24x7 · 112 पर फ़ोन करें";

  function isHindi(lang) {
    return /^hi(-|_|$)/i.test(String(lang || "").trim());
  }

  function helpText(lang) {
    return isHindi(lang) ? HELP_HI : HELP;
  }

  function busyText(lang) {
    return isHindi(lang) ? VOICE_BUSY_TEXT.hi : VOICE_BUSY_TEXT.en;
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
    if (d.reason === "busy") text = busyText(lang) + "\n" + helpText(lang);
    else if (d.reason === "off") text = (isHindi(lang) ? VOICE_OFF_TEXT.hi : VOICE_OFF_TEXT.en) + "\n" + helpText(lang);
    else if (d.reason === "rate") text = "Too many voice requests. Please wait " + d.wait + " seconds, or type your question.";
    else if (!text) text = "Voice could not start. You can keep typing here." + (d.helpline ? "\n" + d.helpline : "");
    return text;
  }

  // What the log shows for a voice "error" event: a voice_busy frame (sent before a 1008 close) is the busy note; any other keeps the server's message and the helpline.
  function voiceErrorNotice(e, lang) {
    if (e && e.code === "voice_busy") return { kind: "note", text: busyText(lang) + "\n" + helpText(lang) };
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
  async function send(cfg, text, fetchImpl, signal) {
    var req = buildRequest(cfg, text);
    var f = fetchImpl || (root.fetch && root.fetch.bind(root));
    var ctl = typeof AbortController === "function" ? new AbortController() : null;
    var timer = ctl ? setTimeout(function () { ctl.abort(); }, 130000) : null;
    if (ctl) req.init.signal = ctl.signal;
    var cancel = function () { if (ctl) ctl.abort(); };
    if (signal) { if (signal.aborted) cancel(); else signal.addEventListener("abort", cancel, {once:true}); }
    var res;
    try {
      res = await f(req.url, req.init);
    } catch (e) {
      return { kind: "network" };
    } finally {
      if (timer) clearTimeout(timer);
      if (signal) signal.removeEventListener("abort", cancel);
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
      ".panel{position:fixed;right:12px;bottom:84px;max-width:calc(100vw - 16px);width:min(380px,calc(100vw - 24px));height:min(560px,calc(100vh - 100px));height:min(560px,calc(100dvh - 100px));background:#f5f6f8;border:1px solid #c5cbd3;border-radius:14px;box-shadow:0 8px 30px rgba(0,0,0,.3);display:flex;flex-direction:column;overflow:hidden}",
      ".panel[hidden]{display:none}",
      ".head{display:flex;align-items:center;gap:6px;padding:6px 6px 6px 14px;background:var(--c);color:var(--ct);cursor:grab;touch-action:none;user-select:none;-webkit-user-select:none}",
      ".head h2{flex:1;margin:0;font-size:1rem;font-weight:650;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
      ".modes{display:flex;flex:none;border:1px solid currentColor;border-radius:8px;overflow:hidden}",
      ".modes[hidden],.pop[hidden]{display:none}",
      ".mode{min-height:36px;padding:0 10px;border:0;background:transparent;color:inherit;font:inherit;font-size:.85rem;font-weight:600;cursor:pointer}",
      ".mode[aria-pressed=true]{background:var(--ct);color:var(--c)}",
      ".pop,.close{flex:none;width:44px;height:44px;border:0;background:transparent;color:inherit;font:inherit;font-size:1.2rem;line-height:1;cursor:pointer;border-radius:8px}",
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
      ".panel[data-mode=voice] textarea,.panel[data-mode=voice] .send{display:none}",
      ".panel[data-mode=voice] .mic{flex:1}",
      ".grip{position:absolute;right:0;bottom:0;width:22px;height:22px;cursor:nwse-resize;touch-action:none;z-index:1;background:linear-gradient(135deg,transparent 52%,#8c96a3 52%,#8c96a3 60%,transparent 60%,transparent 72%,#8c96a3 72%,#8c96a3 80%,transparent 80%)}",
      ".foot{padding:6px 24px;font-size:.8rem;font-weight:600;text-align:center;background:#fff;border-top:1px solid #d9dde3}",
      "button:focus-visible,textarea:focus-visible,a:focus-visible,select:focus-visible{outline:3px solid #f0a100;outline-offset:2px}",
      ".sessions{display:flex;gap:8px;padding:8px 12px;border-bottom:1px solid #d9dde3}.sessions select{min-width:0;flex:1}.sessions button,.memory button{min-height:36px;font:inherit;cursor:pointer}.memory{padding:8px 12px;max-height:170px;overflow:auto;border-bottom:1px solid #d9dde3;font-size:.85rem}.memory p{margin:4px 0}.memory button{margin:4px 8px 4px 0}.sessions[hidden],.memory[hidden]{display:none}",
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

  // env (optional): { win } is the window whose size, resize event and open() the floater uses (tests pass a fake; default is the page window).
  function mount(cfg, doc, fetchImpl, env) {
    doc = doc || root.document;
    var win = (env && env.win) || root;
    var auth = cfg.authenticated || null, authBase = auth && auth.basePath;
    var authValid = !!(auth && cfg.mode === "proxy" && typeof authBase === "string" &&
      /^\/(?![\/\\])[^\\?#%\s]*$/.test(authBase) && !/[\u0000-\u001f\u007f]/.test(authBase) &&
      !authBase.split("/").some(function (s) { return s === "." || s === ".."; }));
    if (authValid) { authBase = authBase.replace(/\/+$/, ""); authValid = !!authBase; }
    if (authValid) cfg = Object.assign({}, cfg, { key: "", voiceProxy: authBase + "/voice/session" });
    var destroyed = false, listeners = [], memoryListeners = [], controllers = new Set(), observer = null;
    var selectedThread = "", ownedThreads = [], pendingTurn = null, pendingChoice = null, profileEpoch = 0, threadEpoch = 0;
    function listen(node, type, fn, list) {
      node.addEventListener(type, fn);
      (list || listeners).push(function () { node.removeEventListener(type, fn); });
    }
    var pageOrigin = "";
    try { pageOrigin = (win.location && win.location.origin) || ""; } catch (e) { /* no location */ }
    var popUrl = auth ? null : popoutUrl(cfg, pageOrigin);
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
    // Chat | Voice toggle: shown only when voice can be used here (voiceAvailable); both modes share the one log below.
    var modes = el(doc, "div", "modes");
    modes.setAttribute("role", "group");
    modes.setAttribute("aria-label", "Conversation mode");
    var modeChat = el(doc, "button", "mode", "Chat");
    var modeVoice = el(doc, "button", "mode", "Voice");
    modeChat.type = "button";
    modeVoice.type = "button";
    modeChat.setAttribute("aria-label", "Chat mode");
    modeVoice.setAttribute("aria-label", "Voice mode");
    modeChat.setAttribute("aria-pressed", "true");
    modeVoice.setAttribute("aria-pressed", "false");
    modes.appendChild(modeChat);
    modes.appendChild(modeVoice);
    modes.hidden = !voiceAvailable(cfg);
    head.appendChild(modes);
    var pop = el(doc, "button", "pop", "\u2197");
    pop.type = "button";
    pop.setAttribute("aria-label", "Open in a new window");
    pop.hidden = !popUrl;
    head.appendChild(pop);
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
    var sessions = el(doc, "div", "sessions"), threadSelect = el(doc, "select"), newChat = el(doc, "button", "", "New chat");
    threadSelect.setAttribute("aria-label", "Chat history"); newChat.type = "button";
    newChat.setAttribute("aria-label", "Start new chat");
    sessions.appendChild(threadSelect); sessions.appendChild(newChat); sessions.hidden = !auth;
    panel.appendChild(sessions);
    var memory = el(doc, "div", "memory"); memory.setAttribute("aria-label", "Your memory"); memory.hidden = !auth;
    panel.appendChild(memory);
    panel.appendChild(log);
    panel.appendChild(status);
    panel.appendChild(form);
    panel.appendChild(foot);
    var grip = el(doc, "div", "grip");
    grip.setAttribute("aria-hidden", "true"); // pointer-only resize handle; the panel is fully usable at its default size from the keyboard
    panel.appendChild(grip);
    panel.setAttribute("data-mode", "chat");
    wrap.appendChild(panel);
    wrap.appendChild(bubble);
    shadow.appendChild(wrap);

    var busy = false, dead = !!auth && !authValid, waitTimer = null, greeted = false;
    var hist = []; // the one in-memory history both modes share: {node, cls, text}; never stored, never sent to the pop-out window

    function add(cls, text) {
      if (destroyed) return el(doc, "div");
      var d = el(doc, "div", "m " + cls);
      d.textContent = text; // never innerHTML
      log.insertBefore(d, typing);
      hist.push({ node: d, cls: cls, text: text });
      log.scrollTop = log.scrollHeight;
      return d;
    }
    function setLine(node, text) {
      node.textContent = text; // textContent only, as everywhere else
      for (var i = 0; i < hist.length; i++) if (hist[i].node === node) hist[i].text = text;
    }
    function setBusy(b) {
      busy = b;
      typing.hidden = !b;
      refreshControls();
      if (b) log.scrollTop = log.scrollHeight;
    }
    function refreshControls() {
      var off = busy || dead || destroyed || !!waitTimer;
      threadSelect.disabled = off; newChat.disabled = off;
      sendBtn.disabled = off;
      if (auth) sendBtn.textContent = pendingTurn ? "Retry" : "Send";
      input.disabled = dead || destroyed;
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


    // Authenticated resources are rooted at an explicit host proxy. No browser identity is accepted.
    async function hostFetch(url, init) {
      if (destroyed || !authValid || !(url === authBase + '/profile' || url.indexOf(authBase + '/') === 0)) throw new Error('Unavailable');
      var extra = auth.getHeaders ? await auth.getHeaders() : {};
      if (destroyed || (init.signal && init.signal.aborted)) throw new Error('Cancelled');
      var headers = {'content-type':'application/json'};
      if (typeof Headers === 'function') new Headers(extra || {}).forEach(function (v,k) { headers[k] = v; });
      else Object.assign(headers, extra || {});
      var transport = auth.transport || fetchImpl || (root.fetch && root.fetch.bind(root));
      return transport(url, Object.assign({}, init, {headers:headers, credentials:'same-origin', redirect:'error'}));
    }
    async function resource(path, method, body) {
      if (!authValid || destroyed) return {ok:false,status:0};
      var ctl = new AbortController(), timer = setTimeout(function () { ctl.abort(); }, 130000);
      controllers.add(ctl);
      try {
        var res = await hostFetch(authBase + path, {method:method || 'GET', signal:ctl.signal, body:body === undefined ? undefined : JSON.stringify(body)});
        var data = await res.json();
        if (destroyed || ctl.signal.aborted) return {ok:false,status:0};
        return {ok:res.ok, status:res.status, body:data};
      } catch (e) { return {ok:false,status:0}; }
      finally { clearTimeout(timer); controllers.delete(ctl); }
    }
    function validId(id) { return typeof id === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(id); }
    function clearHistory() {
      hist.forEach(function (h) { if (h.node.parentNode) h.node.parentNode.removeChild(h.node); });
      hist = []; liveLine = {user:null,assistant:null}; lastBot = null;
    }
    function drawThreads() {
      threadSelect.textContent = '';
      ownedThreads.forEach(function (t,i) {
        var option = el(doc,'option','', 'Chat ' + (i+1) + (t.lastActivityAt ? ' · ' + String(t.lastActivityAt).slice(0,10) : ''));
        option.value = t.threadId; threadSelect.appendChild(option);
      });
      threadSelect.value = selectedThread;
    }
    async function refreshThreads() {
      var r = await resource('/threads');
      if (destroyed || !r.ok || !r.body || !Array.isArray(r.body.threads)) return false;
      ownedThreads = r.body.threads.slice(0,50).filter(function (t) { return t && validId(t.threadId); });
      drawThreads(); return true;
    }
    function candidateFor(item) {
      var p = item.pendingChange;
      if (!item.readOnly && validId(item.factId) && p && validId(p.candidateId) && typeof p.version === 'string' && p.version.length > 0 && p.version.length <= 128 && typeof p.value === 'string' && p.value.length > 0 && p.value.length <= 1000) {
        return {factId:item.factId,key:item.key,value:p.value,oldValue:item.status === 'confirmed' ? item.value : null,candidateId:p.candidateId,expectedVersion:p.version,threadId:selectedThread};
      }
      return null;
    }
    async function refreshProfile() {
      var epoch = ++profileEpoch, thread = selectedThread;
      var r = await resource('/profile');
      if (destroyed || epoch !== profileEpoch || thread !== selectedThread) return false;
      pendingChoice = null;
      memoryListeners.splice(0).forEach(function (off) { off(); });
      memory.textContent = '';
      if (!r.ok || !r.body || !r.body.memory || !Array.isArray(r.body.memory.items)) {
        memory.appendChild(el(doc,'p','','Memory unavailable. Please refresh before making a decision.')); return false;
      }
      var choices = [];
      memory.appendChild(el(doc,'strong','','Your memory'));
      r.body.memory.items.slice(0,20).forEach(function (item) {
        if (!item || typeof item.key !== 'string' || typeof item.value !== 'string') return;
        var row = el(doc,'div');
        row.appendChild(el(doc,'p','',item.key.slice(0,128) + ': ' + item.value.slice(0,1000) + (item.readOnly ? ' (account)' : item.status === 'proposed' ? ' (awaiting confirmation)' : '')));
        var choice = candidateFor(item);
        function button(label, action, payload) {
          var btn = el(doc,'button','',label); btn.type='button';
          btn.setAttribute('aria-label',label + (choice ? ' change to ' : ' ') + item.key);
          listen(btn,'click',function () { decideMemory(payload,action); },memoryListeners); row.appendChild(btn);
        }
        if (choice && selectedThread) {
          row.appendChild(el(doc,'p','',(choice.oldValue === null ? 'Remember ' + choice.key + ' as "' + choice.value + '"?' : 'Change ' + choice.key + ' from "' + choice.oldValue + '" to "' + choice.value + '"?') + ' Reply yes or no, or choose below.'));
          button('Confirm','confirm',choice); button('Reject','reject',choice); choices.push(choice);
        } else if (!item.readOnly && item.status === 'proposed' && validId(item.factId)) {
          button('Confirm','confirm',{factId:item.factId,value:item.value,threadId:selectedThread});
        }
        if (!item.readOnly && validId(item.factId)) {
          var edit = el(doc,'input'); edit.type='text'; edit.maxLength=1000; edit.value=item.value;
          edit.setAttribute('aria-label','Correct value for ' + item.key);
          var correct = el(doc,'button','','Correct'); correct.type='button'; correct.setAttribute('aria-label','Correct ' + item.key);
          listen(correct,'click',function () {
            var value=edit.value.trim();
            if (value && value.length <= 1000) decideMemory({factId:item.factId,value:value,threadId:selectedThread},'correct');
          },memoryListeners);
          row.appendChild(edit); row.appendChild(correct);
          button('Forget','erase',{factId:item.factId,threadId:selectedThread});
        }
        memory.appendChild(row);
      });
      if (choices.length === 1) pendingChoice = choices[0];
      return true;
    }
    async function decideMemory(choice, action) {
      if (destroyed || busy || !choice || choice.threadId !== selectedThread || !selectedThread) return false;
      var thread = selectedThread;
      setBusy(true); if (voiceCtl) voiceCtl.stop();
      var body = {action:action,threadId:thread};
      if (action !== 'erase') body.value = choice.value;
      if (choice.candidateId) { body.candidateId = choice.candidateId; body.expectedVersion = choice.expectedVersion; }
      var r = await resource('/profile/facts/' + encodeURIComponent(choice.factId) + '/decision', 'POST', body);
      if (destroyed || thread !== selectedThread) return false;
      pendingChoice = null;
      await refreshProfile();
      if (destroyed) return false;
      setBusy(false);
      if (r.status === 409) {
        status.textContent = 'Memory changed. Please review the current choice and try again.';
      } else if (!r.ok) status.textContent = 'Memory could not be updated. Please review and try again.';
      else add('note', action === 'reject' ? 'Change rejected; your confirmed preference is kept.' : action === 'erase' ? 'Preference forgotten.' : 'Memory updated.');
      return r.ok;
    }
    async function selectThread(id) {
      if (destroyed || busy || !ownedThreads.some(function (t) { return t.threadId === id; })) return false;
      if (voiceCtl) voiceCtl.stop();
      var epoch = ++threadEpoch; ++profileEpoch; pendingChoice = null;
      selectedThread = id; threadSelect.value = id; pendingTurn = null; input.value = ''; clearHistory();
      memoryListeners.splice(0).forEach(function (off) { off(); }); memory.textContent = '';
      setBusy(true);
      var r = await resource('/threads/' + encodeURIComponent(id));
      if (destroyed || epoch !== threadEpoch) return false;
      if (!r.ok || !r.body || r.body.threadId !== id || !Array.isArray(r.body.turns)) {
        selectedThread = ''; setBusy(false); status.textContent = 'History unavailable. Select a chat to retry.'; return false;
      }
      r.body.turns.slice(0,200).filter(function (t) {
        return t && (t.role === 'user' || t.role === 'assistant') && typeof t.text === 'string' && t.text &&
          t.status !== 'pending' && t.publicationState !== 'pending' && t.published !== false;
      }).sort(function (a,b) { return String(a.at).localeCompare(String(b.at)); }).forEach(function (t) {
        if (t.role === 'user') add('me',t.text.slice(0,8000));
        else showReply(normalizeReply({state:'ok',message:t.text,claims:t.claims,sources:t.sources}));
      });
      await refreshProfile();
      if (destroyed || epoch !== threadEpoch) return false;
      setBusy(false); return true;
    }
    async function newThread() {
      if (destroyed || busy) return false;
      if (voiceCtl) voiceCtl.stop();
      var priorDraft = input.value;
      input.value = '';
      setBusy(true);
      var r = await resource('/threads','POST',{});
      if (destroyed) return false;
      setBusy(false);
      if (!r.ok || !r.body || !validId(r.body.threadId)) { if (!input.value) input.value = priorDraft; status.textContent = 'Could not start a chat. Please retry.'; return false; }
      var meta = {threadId:r.body.threadId};
      if (!ownedThreads.some(function (t) {return t.threadId===meta.threadId;})) ownedThreads.unshift(meta);
      selectedThread = meta.threadId; ++threadEpoch; pendingTurn = null; pendingChoice = null; clearHistory(); drawThreads();
      await refreshProfile(); return !destroyed;
    }
    async function submitAuthenticated() {
      var text = input.value.trim();
      if (!text || busy || dead || destroyed || !selectedThread) return;
      if (pendingChoice && /^(yes|no|maybe|perhaps|not sure)[.!?]?$/i.test(text)) {
        if (!/^(yes|no)[.!?]?$/i.test(text)) { add('note','Please reply yes or no to the exact change shown, or use its buttons.'); return; }
        var decided = await decideMemory(pendingChoice,/^yes/i.test(text) ? 'confirm' : 'reject');
        if (decided && input.value.trim() === text) input.value = '';
        return;
      }
      // The same intentional transport Retry keeps its id and bubble; changing text starts a new attempt.
      if (!pendingTurn || pendingTurn.text !== text || pendingTurn.threadId !== selectedThread) {
        pendingTurn = {text:text,threadId:selectedThread,id:(root.crypto && root.crypto.randomUUID ? root.crypto.randomUUID() : 'turn-' + Date.now() + '-' + Math.random().toString(36).slice(2))};
        add('me',text);
      }
      var turn = pendingTurn;
      if (turn.freshOnRetry) { turn.id = (root.crypto && root.crypto.randomUUID ? root.crypto.randomUUID() : 'turn-' + Date.now() + '-' + Math.random().toString(36).slice(2)); delete turn.freshOnRetry; }
      input.value = ''; setBusy(true);
      var r = await resource('/threads/' + encodeURIComponent(selectedThread) + '/turns','POST',{text:text,clientTurnId:turn.id});
      if (destroyed || turn.threadId !== selectedThread) return;
      if (r.ok && r.body && typeof r.body === 'object') {
        showReply(normalizeReply(r.body)); pendingTurn = null;
      } else {
        if (!input.value) input.value = text;
        if (r.status === 409 && r.body && r.body.error === 'turn_in_progress') {
          // The server is still running this same turn (e.g. the host proxy cut the wait early). Keep the SAME id: once it finishes, Retry is
          // replayed idempotently by the API. A fresh id here would start a second concurrent turn.
          add('err','Still working on your last question. Please wait a few seconds, then press Retry.');
        } else if (r.status === 409) {
          // A stale published answer must not be replayed or automatically regenerated.
          // A deliberate subsequent Retry gets a new key only when server says the snapshot changed.
          if (r.body && r.body.retryWithNewTurn === true && /^(memory_changed|policy_changed|stale_memory|stale_response)$/.test(r.body.error || '')) pendingTurn.freshOnRetry = true;
          add('err','Memory or chat state changed. Review the current choice, then retry your message.');
        } else add('err',r.status === 401 || r.status === 403 ? 'Please sign in again. Your question is kept for Retry.' : 'Could not get a reply. Your question is kept for Retry.');
      }
      await refreshProfile();
      if (destroyed) return;
      setBusy(false); input.focus();
    }
    function destroy() {
      if (destroyed) return;
      destroyed = true; ++threadEpoch; ++profileEpoch;
      controllers.forEach(function (c) { c.abort(); }); controllers.clear();
      if (voiceCtl) voiceCtl.stop(); voiceCtl = null;
      if (waitTimer) clearInterval(waitTimer); waitTimer = null;
      listeners.splice(0).concat(memoryListeners.splice(0)).forEach(function (off) { off(); });
      if (observer) observer.disconnect();
      clearHistory(); selectedThread = ''; ownedThreads = []; pendingTurn = null; pendingChoice = null;
      input.value = ''; memory.textContent = ''; threadSelect.textContent = ''; status.textContent = '';
      if (host.parentNode) host.parentNode.removeChild(host);
      root.__vcWidgetMounted = false;
    }

    async function submit() {
      if (auth) return submitAuthenticated();
      var text = input.value.trim();
      if (!text || busy || dead || waitTimer) return;
      add("me", text);
      input.value = "";
      setBusy(true);
      status.textContent = "Waiting for a reply...";
      var r;
      var ctl = typeof AbortController === "function" ? new AbortController() : null;
      if (ctl) controllers.add(ctl);
      try { r = await send(cfg, text, fetchImpl, ctl && ctl.signal); } finally { if (ctl) controllers.delete(ctl); if (!destroyed) setBusy(false); }
      if (destroyed) return;
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

    // ---- floater: drag, resize, mode, pop-out ----------------------------------------------------------------
    var geom = null; // {left, top, width, height} in px once the visitor has moved or resized; until then the CSS placement applies
    function vp() {
      var de = doc.documentElement || {};
      // the layout viewport: innerWidth/Height include a page scrollbar that a fixed panel must not slide under, so the smaller of the two wins
      function least(a, b) { return a && b ? Math.min(a, b) : a || b || 0; }
      return { w: least(win.innerWidth, de.clientWidth), h: least(win.innerHeight, de.clientHeight) };
    }
    function applyGeom(g) {
      geom = g;
      panel.style.left = g.left + "px";
      panel.style.top = g.top + "px";
      panel.style.width = g.width + "px";
      panel.style.height = g.height + "px";
      panel.style.right = "auto";
      panel.style.bottom = "auto";
    }
    function pin() { // freeze the current on-screen rectangle as explicit numbers (first drag or resize)
      if (geom) return geom;
      var r = panel.getBoundingClientRect(), v = vp();
      applyGeom(clampRect({ left: r.left, top: r.top, width: r.width, height: r.height }, v.w, v.h));
      return geom;
    }
    function isControl(n) {
      while (n && n !== head) { if (n.tagName === "BUTTON") return true; n = n.parentNode; }
      return false;
    }
    // One pointer gesture: onMove(dx, dy, startGeom, viewport) returns the new rectangle. Pointer capture keeps a fast drag attached to the handle.
    function gesture(handle, accept, onMove) {
      var cur = null;
      function end(ev) {
        if (!cur || (ev && ev.pointerId !== undefined && ev.pointerId !== cur.id)) return;
        cur = null;
        try { handle.releasePointerCapture(ev && ev.pointerId); } catch (e) { /* already released */ }
      }
      listen(handle, "pointerdown", function (ev) {
        if (ev.button > 0 || ev.isPrimary === false || !accept(ev)) return;
        var g = pin();
        cur = { id: ev.pointerId, x: ev.clientX, y: ev.clientY, g: { left: g.left, top: g.top, width: g.width, height: g.height } };
        try { handle.setPointerCapture(ev.pointerId); } catch (e) { /* capture unsupported: moves still arrive while over the handle */ }
      });
      listen(handle, "pointermove", function (ev) {
        if (!cur || ev.pointerId !== cur.id) return;
        if (ev.buttons === 0) { end(ev); return; } // the button was released where no pointerup reached us (outside the window)
        var v = vp();
        applyGeom(clampRect(onMove(ev.clientX - cur.x, ev.clientY - cur.y, cur.g, v), v.w, v.h));
      });
      listen(handle, "pointerup", end);
      listen(handle, "pointercancel", end);
      listen(handle, "lostpointercapture", end);
    }
    gesture(head, function (ev) { return !isControl(ev.target); }, function (dx, dy, g) {
      return { left: g.left + dx, top: g.top + dy, width: g.width, height: g.height };
    });
    gesture(grip, function () { return true; }, function (dx, dy, g, v) {
      // keep the top-left corner fixed: cap the size at the viewport edge first, so clampRect does not slide the panel
      return { left: g.left, top: g.top, width: Math.max(Math.min(g.width + dx, v.w - g.left), MIN_W), height: Math.max(Math.min(g.height + dy, v.h - g.top), MIN_H) };
    });
    if (win.addEventListener) {
      listen(win, "resize", function () {
        if (!geom) return; // never dragged: the CSS placement already fits
        var v = vp();
        applyGeom(clampRect(geom, v.w, v.h));
      });
    }

    var mode = "chat", voiceOk = voiceAvailable(cfg);
    function setMode(m) {
      if (destroyed || (m !== "chat" && m !== "voice")) return;
      if (m === "voice" && (!voiceOk || (auth && (!selectedThread || busy || dead)))) return;
      mode = m;
      panel.setAttribute("data-mode", m);
      modeChat.setAttribute("aria-pressed", m === "chat" ? "true" : "false");
      modeVoice.setAttribute("aria-pressed", m === "voice" ? "true" : "false");
      if (m === "chat" && voiceCtl && voiceCtl.state() !== "idle") voiceCtl.stop(); // leaving Voice ends the call and releases the mic
      if (m === "voice" && !micBtn && !busy && !waitTimer && !dead) status.textContent = "Voice is loading...";
    }
    function voiceFailed() { // the voice add-on did not load: Voice is not offered, Chat carries on
      voiceOk = false;
      modes.hidden = true;
      setMode("chat");
    }
    listen(modeChat, "click", function () { setMode("chat"); });
    listen(modeVoice, "click", function () { setMode("voice"); });
    listen(pop, "click", function () {
      // a new window with no opener: the chat so far is NOT handed over (no storage, no URL, no postMessage); the pop-out starts a fresh conversation.
      if (popUrl && typeof win.open === "function") win.open(popUrl, "_blank", POPOUT_FEATURES);
    });

    function open() {
      if (destroyed) return;
      if (geom) { var v0 = vp(); applyGeom(clampRect(geom, v0.w, v0.h)); }
      panel.hidden = false;
      bubble.setAttribute("aria-expanded", "true");
      bubble.setAttribute("aria-label", "Close chat: " + cfg.title);
      if (!greeted && !auth) { greeted = true; add("bot", GREETING); }
      if (!input.disabled) input.focus(); else close.focus();
    }
    // pc-voice V3: the mic button. Added only when the add-on has loaded (voice.js) and the config allows voice; the text chat works either way.
    var voiceCtl = null, micBtn = null, liveLine = { user: null, assistant: null }, lastBot = null;
    function attachVoice(lib, deps) {
      if (destroyed || (auth && !authValid) || micBtn || !lib || typeof lib.create !== "function" || !voiceAvailable(cfg)) return false;
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
          if (destroyed) return;
          var active = s !== "idle";
          micBtn.setAttribute("aria-pressed", active ? "true" : "false");
          micBtn.setAttribute("aria-label", active ? "Stop voice conversation" : "Start voice conversation");
          if (s === "connecting") status.textContent = "Starting voice...";
          else if (s === "listening") status.textContent = "Listening. Speak now; tap the mic to stop.";
          else if (!busy && !waitTimer && !dead) status.textContent = "";
        },
        transcript: function (t) {
          if (destroyed) return;
          var line = liveLine[t.role];
          if (!line) {
            line = add(t.role === "user" ? "me" : "bot", t.text);
            liveLine[t.role] = line;
            if (t.role === "assistant") lastBot = line;
          } else {
            setLine(line, t.text);
          }
          if (t.final) liveLine[t.role] = null;
          log.scrollTop = log.scrollHeight;
        },
        sources: function (list) {
          var box = lastBot && list.length ? linksBlock(list) : null;
          if (box) lastBot.appendChild(box);
        },
        confirm: function () { if (auth) refreshProfile(); },
        crisis: function (c) { add("crisis", c.help); },
        error: function (e) {
          if (auth && e && /^(memory_changed|policy_changed|stale_memory|stale_response)$/.test(e.code || '')) {
            if (voiceCtl) voiceCtl.stop(); refreshProfile();
          }
          var n = voiceErrorNotice(e, pageLang(doc)); add(n.kind, n.text);
        },
        fallback: function (d) {
          add("note", voiceFallbackText(d, pageLang(doc)));
          setMode("chat");
          if (!input.disabled) input.focus();
        },
        ended: function () {
          if (auth) { refreshProfile(); refreshThreads(); }
          liveLine.user = liveLine.assistant = null;
          if (!busy && !waitTimer && !dead) status.textContent = "Voice ended.";
        }
      };
      Object.keys(on).forEach(function (name) {
        var callback = on[name]; on[name] = function (arg) { if (!destroyed) callback(arg); };
      });
      var voiceDeps = Object.assign({ cfg: cfg, on: on }, deps || {});
      if (auth) {
        voiceDeps.cfg = cfg; voiceDeps.on = on;
        voiceDeps.fetch = async function (url, init) {
          if (!selectedThread || destroyed || url !== cfg.voiceProxy) throw new Error("Voice session unavailable");
          var ctl = new AbortController(); controllers.add(ctl);
          try {
            return await hostFetch(url, Object.assign({}, init, {signal: ctl.signal, body: JSON.stringify({threadId: selectedThread})}));
          } finally { controllers.delete(ctl); }
        };
      }
      voiceCtl = lib.create(voiceDeps);
      listen(micBtn, "click", function () {
        if (destroyed || (auth && (!selectedThread || busy || dead))) return;
        if (voiceCtl.state() === "idle") voiceCtl.start(); else voiceCtl.stop();
      });
      return true;
    }
    function shut() {
      if (destroyed) return;
      if (voiceCtl) voiceCtl.stop(); // closing the panel ends the call and releases the mic
      panel.hidden = true;
      bubble.setAttribute("aria-expanded", "false");
      bubble.setAttribute("aria-label", "Open chat: " + cfg.title);
      bubble.focus();
    }

    listen(bubble, "click", function () { if (panel.hidden) open(); else shut(); });
    listen(close, "click", shut);
    listen(form, "submit", function (ev) { ev.preventDefault(); submit(); });
    listen(input, "keydown", function (ev) {
      if (ev.key === "Enter" && !ev.shiftKey && !ev.isComposing) { ev.preventDefault(); submit(); }
    });
    listen(shadow, "keydown", function (ev) {
      if (ev.key === "Escape" && !panel.hidden) { ev.stopPropagation(); shut(); }
    });

    listen(threadSelect, 'change', function () { selectThread(threadSelect.value); });
    listen(newChat, 'click', function () { newThread(); });
    (doc.body || doc.documentElement).appendChild(host);
    if (typeof win.MutationObserver === 'function') {
      observer = new win.MutationObserver(function () { if (!host.isConnected) destroy(); });
      observer.observe(doc.documentElement, {childList:true,subtree:true});
    }
    refreshControls();
    var ready = (async function () {
      if (!auth || !authValid) return false;
      setBusy(true);
      var loaded = await refreshThreads();
      if (destroyed) return false;
      setBusy(false);
      if (!loaded) { status.textContent = 'Could not load your chats. Please refresh or start a new chat.'; return false; }
      return ownedThreads.length ? selectThread(ownedThreads[0].threadId) : newThread();
    })();
    return {
      host: host, open: open, close: shut, attachVoice: attachVoice, setMode: setMode, voiceFailed: voiceFailed,
      ready: ready, destroy: destroy, refreshProfile: refreshProfile, refreshThreads: refreshThreads, selectThread: selectThread, newThread: newThread,
      mode: function () { return mode; },
      history: function () { return hist.map(function (h) { return { kind: h.cls, text: h.text }; }); }
    };
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
      s.onerror = function () { handle.voiceFailed(); if (root.console) root.console.warn("vc-widget: the voice add-on did not load; text chat only."); };
      (doc.head || doc.documentElement).appendChild(s);
    };
    if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", go); else go();
    return cfg;
  }

  var api = {
    VERSION: VERSION, HELP: HELP, FOOTER: FOOTER, UNAVAILABLE_TEXT: UNAVAILABLE_TEXT, VOICE_RENDERED: VOICE_RENDERED,
    MIN_W: MIN_W, MIN_H: MIN_H, clampRect: clampRect, popoutUrl: popoutUrl,
    parseConfig: parseConfig, buildRequest: buildRequest, parseRetryAfter: parseRetryAfter, sanitizeUrl: sanitizeUrl,
    normalizeReply: normalizeReply, send: send, contrastText: contrastText, mount: mount, init: init,
    voiceAvailable: voiceAvailable, voiceScriptUrl: voiceScriptUrl, voiceFallbackText: voiceFallbackText, voiceErrorNotice: voiceErrorNotice
  };

  if (typeof module === "object" && module && module.exports) module.exports = api;
  if (root && root.document) {
    root.VCWidget = api;
    if (root.document.currentScript && root.document.currentScript.getAttribute("data-vc-manual") !== "true") init(root.document.currentScript);
  }
})(typeof window !== "undefined" ? window : globalThis);
