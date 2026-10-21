// Minimal student chat. Stateless: POST /v1/public/chat/turns takes exactly {text}; the API returns no thread id.
(function () {
  "use strict";
  var API = "/v1/public/chat/turns";
  var HELP = "Tele-MANAS 14416 (24x7) \u00b7 Emergency 112";
  var log = document.getElementById("log"), form = document.getElementById("form");
  var msg = document.getElementById("msg"), send = document.getElementById("send"), status = document.getElementById("status");

  function add(cls, text) {
    var d = document.createElement("div");
    d.className = "m " + cls;
    d.textContent = text; // never innerHTML
    log.appendChild(d);
    log.scrollTop = log.scrollHeight;
    return d;
  }

  // Grounding links on a no-source answer (kind "web", https only). Built with DOM calls, never innerHTML; the link text is the source title.
  function webLinks(r, parent) {
    var list = (r.sources || []).filter(function (s) { return s && s.kind === "web" && typeof s.url === "string" && /^https:\/\//i.test(s.url); });
    if (!list.length) return;
    var box = document.createElement("div");
    box.appendChild(document.createTextNode("Sources: "));
    list.forEach(function (s, i) {
      if (i) box.appendChild(document.createTextNode(" \u00b7 "));
      var a = document.createElement("a");
      a.href = s.url;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.textContent = s.title || s.url;
      box.appendChild(a);
    });
    parent.appendChild(box);
  }

  function sources(r) {
    var t = (r.sources || []).map(function (s) { return s.title; }).filter(Boolean);
    return t.length ? "\nSources: " + t.join("; ") : "";
  }

  function show(r) {
    var m = typeof r.message === "string" ? r.message : "";
    if (r.state === "escalated") add("crisis", (m || "It sounds like you may be going through a hard time.") + "\n" + HELP);
    else if (r.state === "no_sourced_answer") webLinks(r, add("note", m || "I could not find a sourced answer to that. Please ask a counsellor, or try rephrasing."));
    else if (r.state === "sign_in_required") add("note", m || "Please sign in to continue with this question.");
    else add("bot", (m || "(no reply)") + sources(r));
  }

  async function turn(text) {
    var res;
    try {
      res = await fetch(API, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: text }) });
    } catch (e) {
      return add("err", "Could not reach the service. Check your connection and try again.");
    }
    var body = null;
    try { body = await res.json(); } catch (e) { /* non-JSON body */ }
    if (res.status === 429) {
      var s = res.headers.get("retry-after");
      return add("err", "You are sending messages too fast. Please wait" + (s ? " about " + s + " seconds" : " a minute") + " and try again.");
    }
    if (!res.ok || !body) {
      var line = body && body.helpline ? "\n" + body.helpline : "";
      return add("err", (res.status === 413 ? "That message is too long. Please shorten it." : "Something went wrong (" + res.status + "). Please try again.") + line);
    }
    show(body);
  }

  form.addEventListener("submit", async function (ev) {
    ev.preventDefault();
    var text = msg.value.trim();
    if (!text || send.disabled) return;
    add("me", text);
    msg.value = "";
    send.disabled = true;
    status.textContent = "Waiting for a reply...";
    try { await turn(text); } finally { send.disabled = false; status.textContent = ""; msg.focus(); }
  });
  msg.addEventListener("keydown", function (ev) {
    if (ev.key === "Enter" && !ev.shiftKey) { ev.preventDefault(); form.requestSubmit(); }
  });
})();
