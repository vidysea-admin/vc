/*! vc-widget voice add-on v1.0.0 (pc-voice V3, D-111). Loaded by vc-widget.js only when the page sets data-vc-voice="on".
 * A mic button starts and stops an anonymous voice session: the visitor's page key (X-VC-Key) mints a single-use token, the browser opens the
 * WebSocket (token as a subprotocol, never in the URL), streams 16 kHz PCM16 mic audio and plays the counsellor's 24 kHz PCM16 reply.
 * This file holds the session logic and the browser audio glue. It draws nothing: vc-widget.js owns the DOM and passes handlers in.
 * Safety: nothing is stored (no localStorage, sessionStorage, cookies or IndexedDB); the mic is asked for BEFORE a session is minted and is
 * released on every way out; a denied or missing mic, or any refusal, hands control back to the text chat ("fallback").
 */
(function (root) {
  "use strict";

  var VERSION = "1.0.0";
  var SESSION_PATH = "/v1/public/voice/sessions";
  var TURN_PATH_RE = /\/v1\/public\/chat\/turns$/;
  var THREAD_ID = "anonymous"; // the only thread an anonymous visitor has; the server refuses anything else
  var WS_SUBPROTOCOL = "vc-voice-v1";
  var TOKEN_PROTOCOL = "vc-token.";
  var INPUT_RATE = 16000;
  var OUTPUT_RATE = 24000;
  var HELP = "Tele-MANAS 14416 (24x7) · Emergency 112"; // same text as vc-widget.js HELP (a test keeps them equal)
  // Shown on screen when the server flags a crisis. The spoken message is the server's fixed pre-rendered audio and plays regardless.
  var CRISIS_TEXT = "It sounds like you may be going through a hard time. You are not alone, and help is available right now.";

  // ---- pure helpers -----------------------------------------------------------------------------------------

  // The voice session URL for a key-mode config, else "". Derived from the chat URL so data-vc-api and the script origin are honoured.
  function sessionUrl(cfg) {
    if (!cfg || cfg.mode !== "key" || !cfg.key || typeof cfg.turnUrl !== "string") return "";
    if (!TURN_PATH_RE.test(cfg.turnUrl)) return "";
    return cfg.turnUrl.replace(TURN_PATH_RE, "") + SESSION_PATH;
  }

  // Float32 mic samples at `ratio` times 16 kHz -> PCM16 little-endian at 16 kHz (block average, clamped; NaN becomes silence).
  function downsampleToPcm16(f32, ratio) {
    var r = ratio >= 1 ? ratio : 1;
    var n = Math.floor(f32.length / r);
    var out = new Int16Array(n);
    for (var i = 0; i < n; i++) {
      var from = Math.floor(i * r), to = Math.min(f32.length, Math.floor((i + 1) * r)), sum = 0, c = 0;
      for (var j = from; j < to; j++) { sum += f32[j]; c++; }
      var v = c ? sum / c : 0;
      if (!(v === v)) v = 0;
      v = Math.max(-1, Math.min(1, v));
      out[i] = v < 0 ? Math.round(v * 32768) : Math.round(v * 32767);
    }
    return out.buffer;
  }

  // PCM16 little-endian bytes -> Float32 in -1..1 (an odd trailing byte is dropped).
  function pcm16ToFloat32(buf) {
    var len = buf.byteLength - (buf.byteLength % 2);
    var dv = new DataView(buf, 0, len);
    var out = new Float32Array(len / 2);
    for (var i = 0; i < out.length; i++) out[i] = dv.getInt16(i * 2, true) / 32768;
    return out;
  }

  function httpUrlOrNull(u) {
    try {
      var p = new URL(u);
      return p.protocol === "http:" || p.protocol === "https:" ? p : null;
    } catch (e) {
      return null;
    }
  }
  function safeHref(u) {
    if (typeof u !== "string" || u.length > 2048 || /[\u0000-\u001f\u007f]/.test(u)) return null;
    var p = httpUrlOrNull(u.trim());
    return p && p.hostname ? p.href : null;
  }
  function normalizeSources(list) {
    var out = [];
    (Array.isArray(list) ? list : []).slice(0, 20).forEach(function (s) {
      if (!s || typeof s !== "object") return;
      var href = safeHref(s.url);
      var title = typeof s.title === "string" && s.title ? s.title.slice(0, 500) : href || "";
      if (title) out.push({ title: title, href: href });
    });
    return out;
  }

  // ---- browser audio (not exercised by the node tests; see the manifest's live-browser step) -------------------------

  function browserAudio(r) {
    var Ctx = r && (r.AudioContext || r.webkitAudioContext);
    if (!Ctx) return null;
    var ctx = null, head = 0;
    function ensure() {
      if (!ctx) ctx = new Ctx();
      if (ctx.state === "suspended" && ctx.resume) ctx.resume();
      return ctx;
    }
    return {
      capture: function (stream, onChunk) {
        var c = ensure();
        var src = c.createMediaStreamSource(stream);
        var proc = c.createScriptProcessor(4096, 1, 1);
        var ratio = c.sampleRate / INPUT_RATE;
        proc.onaudioprocess = function (ev) { onChunk(downsampleToPcm16(ev.inputBuffer.getChannelData(0), ratio)); };
        src.connect(proc);
        proc.connect(c.destination); // the node must be connected to run; it writes no output, so nothing is heard
        return function () {
          proc.onaudioprocess = null;
          try { src.disconnect(); proc.disconnect(); } catch (e) { /* already gone */ }
        };
      },
      play: function (buf) {
        var c = ensure();
        var f = pcm16ToFloat32(buf);
        if (!f.length) return;
        var ab = c.createBuffer(1, f.length, OUTPUT_RATE);
        ab.copyToChannel(f, 0);
        var node = c.createBufferSource();
        node.buffer = ab;
        node.connect(c.destination);
        var t = Math.max(c.currentTime, head);
        node.start(t);
        head = t + ab.duration;
      },
      close: function () {
        head = 0;
        if (ctx) { try { ctx.close(); } catch (e) { /* ignore */ } ctx = null; }
      }
    };
  }

  // ---- the session ------------------------------------------------------------------------------------------

  var FATAL_NONE = { not_started: 1 }; // frames sent in the moment before the provider session is ready; harmless

  // opts: { cfg, on: {state, transcript, crisis, error, fallback, ended, sources}, fetch?, WebSocket?, mediaDevices?, audio? }
  function create(opts) {
    var o = opts || {};
    var h = o.on || {};
    var cfg = o.cfg;
    var f = o.fetch || (root.fetch && root.fetch.bind(root));
    var WS = o.WebSocket || root.WebSocket;
    var md = o.mediaDevices !== undefined ? o.mediaDevices : root.navigator && root.navigator.mediaDevices;
    var audio = o.audio || browserAudio(root);

    var state = "idle"; // idle | connecting | listening
    var gen = 0; // bumps on every stop, so a start that was cancelled while waiting finds out
    var ws = null, stream = null, stopCapture = null, crisisShown = false, ended = false, opened = false;

    function emit(name, arg) {
      try { if (h[name]) h[name](arg); } catch (e) { /* a handler must not break the session */ }
    }
    function setState(s) {
      if (state === s) return;
      state = s;
      emit("state", s);
    }
    function releaseMic() {
      if (stopCapture) { try { stopCapture(); } catch (e) { /* ignore */ } stopCapture = null; }
      if (stream) {
        try { stream.getTracks().forEach(function (t) { t.stop(); }); } catch (e) { /* ignore */ }
        stream = null;
      }
      if (audio && audio.close) { try { audio.close(); } catch (e) { /* ignore */ } }
    }
    function closeSocket(code) {
      var w = ws;
      ws = null;
      if (w) {
        w.onopen = w.onmessage = w.onerror = w.onclose = null;
        try { w.close(code || 1000); } catch (e) { /* already closed */ }
      }
    }
    function fail(detail) {
      releaseMic();
      closeSocket(1000);
      setState("idle");
      emit("fallback", detail);
      return false;
    }

    function micFailure(err) {
      var n = err && err.name;
      if (n === "NotAllowedError" || n === "SecurityError" || n === "PermissionDeniedError") return "permission";
      if (n === "NotFoundError" || n === "DevicesNotFoundError" || n === "OverconstrainedError") return "no_mic";
      return "no_mic";
    }

    async function start() {
      if (state !== "idle") return false;
      var url = sessionUrl(cfg);
      if (!url || !f || !WS || !audio || !md || typeof md.getUserMedia !== "function") {
        emit("fallback", { reason: "unsupported" });
        return false;
      }
      var mine = ++gen;
      setState("connecting");
      ended = false;
      crisisShown = false;
      opened = false;
      // 1. The microphone first: a visitor who says no never costs a session.
      try {
        stream = await md.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 } });
      } catch (err) {
        if (mine !== gen) return false;
        setState("idle");
        emit("fallback", { reason: micFailure(err) });
        return false;
      }
      if (mine !== gen) { releaseMic(); return false; }
      // 2. Mint the single-use token with the page key.
      var res;
      try {
        res = await f(url, { method: "POST", headers: { "X-VC-Key": cfg.key }, credentials: "omit" });
      } catch (e) {
        if (mine !== gen) { releaseMic(); return false; }
        return fail({ reason: "network" });
      }
      if (mine !== gen) { releaseMic(); return false; }
      if (res.status === 401 || res.status === 403) return fail({ reason: "unavailable" });
      if (res.status === 429) {
        var ra = res.headers && res.headers.get && res.headers.get("retry-after");
        var wait = /^\d+$/.test(String(ra === null || ra === undefined ? "" : ra).trim()) ? Math.min(300, Math.max(1, parseInt(ra, 10))) : 60;
        return fail({ reason: "rate", wait: wait });
      }
      var body = null;
      try { body = await res.json(); } catch (e) { /* not JSON */ }
      if (mine !== gen) { releaseMic(); return false; }
      if (!res.ok || res.status !== 201) {
        var d = { reason: "error", status: res.status };
        if (body && typeof body.helpline === "string") d.helpline = body.helpline.slice(0, 300);
        return fail(d);
      }
      if (!body || typeof body !== "object" || typeof body.token !== "string" || !body.token || typeof body.wsUrl !== "string" || !/^wss?:\/\/[^\s/]+/.test(body.wsUrl)) {
        return fail({ reason: "error", status: res.status });
      }
      // 3. Open the socket. Audio starts only once it is open.
      var sock;
      try {
        sock = new WS(body.wsUrl, [WS_SUBPROTOCOL, TOKEN_PROTOCOL + body.token]);
      } catch (e) {
        return fail({ reason: "network" });
      }
      ws = sock;
      try { sock.binaryType = "arraybuffer"; } catch (e) { /* fake sockets */ }
      sock.onopen = function () {
        if (ws !== sock) return;
        opened = true;
        try { sock.send(JSON.stringify({ type: "start", threadId: THREAD_ID })); } catch (e) { /* closing */ }
        stopCapture = audio.capture(stream, function (chunk) {
          if (ws === sock && sock.readyState === 1) {
            try { sock.send(chunk); } catch (e) { /* closing */ }
          }
        });
        setState("listening");
      };
      sock.onmessage = function (ev) {
        if (ws !== sock) return;
        onMessage(ev && ev.data);
      };
      sock.onerror = function () { /* the close event follows and carries the outcome */ };
      sock.onclose = function () {
        if (ws !== sock) return;
        ws = null;
        releaseMic();
        setState("idle");
        if (opened) {
          if (!ended) { ended = true; emit("ended", { reason: "closed" }); }
        } else {
          emit("fallback", { reason: "network" });
        }
      };
      return true;
    }

    function crisis() {
      if (crisisShown) return;
      crisisShown = true;
      emit("crisis", { text: CRISIS_TEXT, help: HELP });
    }

    function onMessage(data) {
      if (typeof data !== "string") {
        // A binary frame is the counsellor's audio (PCM16, 24 kHz): play it as it comes.
        if (data && typeof data.byteLength === "number" && audio && audio.play) {
          try { audio.play(data); } catch (e) { /* a playback hiccup must not end the session */ }
        }
        return;
      }
      var m;
      try { m = JSON.parse(data); } catch (e) { return; }
      if (!m || typeof m !== "object" || Array.isArray(m) || typeof m.type !== "string") return;
      switch (m.type) {
        case "transcript.partial":
        case "transcript.final":
          if ((m.role === "user" || m.role === "assistant") && typeof m.text === "string") {
            emit("transcript", { role: m.role, text: m.text.slice(0, 8000), final: m.type === "transcript.final" });
          }
          return;
        case "answer.sources":
          emit("sources", normalizeSources(m.sources));
          return;
        case "state":
          if (m.state === "escalated") crisis();
          return;
        case "flag":
          if (m.reason === "crisis_detected") crisis();
          return;
        case "error":
          if (typeof m.code === "string" && !FATAL_NONE[m.code]) {
            emit("error", { code: m.code.slice(0, 64), message: typeof m.message === "string" ? m.message.slice(0, 500) : "", help: HELP });
          }
          return;
        default:
          return; // confirm (no profile for a visitor) and anything unknown are ignored
      }
    }

    async function stop() {
      gen++;
      if (state === "idle" && !ws && !stream) return;
      var w = ws;
      var wasOpen = opened && !!w;
      if (w && w.readyState === 1) {
        try { w.send(JSON.stringify({ type: "end" })); } catch (e) { /* closing */ }
      }
      closeSocket(1000);
      releaseMic();
      setState("idle");
      if (wasOpen && !ended) { ended = true; emit("ended", { reason: "stopped" }); }
    }

    return { start: start, stop: stop, state: function () { return state; } };
  }

  var api = {
    VERSION: VERSION, HELP: HELP, CRISIS_TEXT: CRISIS_TEXT, THREAD_ID: THREAD_ID,
    sessionUrl: sessionUrl, downsampleToPcm16: downsampleToPcm16, pcm16ToFloat32: pcm16ToFloat32, create: create
  };

  if (typeof module === "object" && module && module.exports) module.exports = api;
  if (root && root.document) root.VCWidgetVoice = api;
})(typeof window !== "undefined" ? window : globalThis);
