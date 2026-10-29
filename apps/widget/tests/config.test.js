"use strict";
// W1/W3: config parsing. Written first (TDD); runs against src/vc-widget.js via its CommonJS export.
const test = require("node:test");
const assert = require("node:assert/strict");
const W = require("../src/vc-widget.js");

const SRC = "https://vc.example.org/widget/vc-widget.js";

test("key mode: data-vc-key, api defaults to the script origin", () => {
  const c = W.parseConfig({ vcKey: "vck_p1_abc" }, SRC);
  assert.equal(c.ok, true);
  assert.equal(c.mode, "key");
  assert.equal(c.key, "vck_p1_abc");
  assert.equal(c.turnUrl, "https://vc.example.org/v1/public/chat/turns");
});

test("data-vc-api overrides the origin and a trailing slash is trimmed", () => {
  const c = W.parseConfig({ vcKey: "k", vcApi: "https://api.partner.test/" }, SRC);
  assert.equal(c.turnUrl, "https://api.partner.test/v1/public/chat/turns");
});

test("proxy mode: data-vc-proxy is the post target as-is and wins over a key", () => {
  const c = W.parseConfig({ vcProxy: "/api/vc", vcKey: "k" }, SRC);
  assert.equal(c.mode, "proxy");
  assert.equal(c.turnUrl, "/api/vc");
  assert.equal(c.key, "", "a key must not be kept in proxy mode");
});

test("no key and no proxy is open mode (the anonymous route without a key)", () => {
  const c = W.parseConfig({}, SRC);
  assert.equal(c.ok, true);
  assert.equal(c.mode, "open");
});

test("rejects a non-http(s) api and a protocol-relative or javascript proxy", () => {
  assert.equal(W.parseConfig({ vcApi: "javascript:alert(1)" }, SRC).ok, false);
  assert.equal(W.parseConfig({ vcApi: "ftp://x.test" }, SRC).ok, false);
  assert.equal(W.parseConfig({ vcProxy: "//evil.test/x" }, SRC).ok, false);
  assert.equal(W.parseConfig({ vcProxy: "javascript:alert(1)" }, SRC).ok, false);
  assert.equal(W.parseConfig({ vcProxy: "data:text/html,x" }, SRC).ok, false);
});

test("accepts an absolute https proxy", () => {
  const c = W.parseConfig({ vcProxy: "https://pathlynks.test/api/vc" }, SRC);
  assert.equal(c.ok, true);
  assert.equal(c.turnUrl, "https://pathlynks.test/api/vc");
});

test("title and colour have defaults, are trimmed and capped, and a bad colour falls back", () => {
  const d = W.parseConfig({}, SRC);
  assert.equal(d.title, "Career Counsellor");
  assert.equal(d.color, "#1f5fbf");
  const c = W.parseConfig({ vcTitle: "  Vidysea Help  ", vcColor: "#0a7" }, SRC);
  assert.equal(c.title, "Vidysea Help");
  assert.equal(c.color, "#0a7");
  assert.equal(W.parseConfig({ vcColor: "red; background:url(x)" }, SRC).color, "#1f5fbf");
  assert.equal(W.parseConfig({ vcColor: "#12345" }, SRC).color, "#1f5fbf");
  assert.equal(W.parseConfig({ vcTitle: "x".repeat(200) }, SRC).title.length, 60);
});

test("data-vc-voice=on is parsed (the mic itself is covered by voice.test.js); anything else is off", () => {
  assert.equal(W.parseConfig({ vcVoice: "on" }, SRC).voice, true);
  assert.equal(W.parseConfig({}, SRC).voice, false);
  assert.equal(W.parseConfig({ vcVoice: "yes" }, SRC).voice, false);
  assert.equal(W.VOICE_RENDERED, true, "pc-voice ships the mic");
});

test("contrastText picks readable text for the bubble colour", () => {
  assert.equal(W.contrastText("#ffffff"), "#1b1f23");
  assert.equal(W.contrastText("#000"), "#ffffff");
  assert.equal(W.contrastText("#1f5fbf"), "#ffffff");
});

test("Q5: explicit same-origin voice proxy enables authenticated voice without retaining browser identity or keys", () => {
  const c = W.parseConfig({ vcProxy: "/api/vc", vcVoice: "on", vcVoiceProxy: "/api/pathlynks-quest/ai/voice/session", vcKey: "ignored", vcStudentId: "spoof", vcThreadId: "spoof" }, SRC);
  assert.equal(c.ok, true);
  assert.equal(c.voiceProxy, "/api/pathlynks-quest/ai/voice/session");
  assert.equal(c.key, "");
  assert.equal(c.studentId, undefined);
  assert.equal(c.threadId, undefined);
  assert.equal(W.voiceAvailable(c), true);
  for (const voiceProxy of ["//evil.test/mint", "/\\evil.test/mint", "/api\\mint", "https://evil.test/mint", "javascript:bad", "/mint?token=bad", "/mint#bad", "/mint\npath"]) {
    const bad = W.parseConfig({ vcProxy: "/api/vc", vcVoice: "on", vcVoiceProxy: voiceProxy }, SRC);
    assert.equal(bad.ok, false, JSON.stringify(voiceProxy));
    assert.equal(W.voiceAvailable(bad), false);
  }
  assert.equal(W.voiceAvailable(W.parseConfig({ vcVoice: "on", vcVoiceProxy: "/mint" }, SRC)), false, "a proxy endpoint alone does not enable authenticated mode");
});

test("the file version matches package.json; the hosted name carries the major (vc-widget.v1.js)", () => {
  const pkg = require("../package.json");
  assert.equal(W.VERSION, pkg.version);
  assert.equal("vc-widget.v" + W.VERSION.split(".")[0] + ".js", "vc-widget.v1.js");
});

test('S12 manual SDK loading exports library without an automatic anonymous mount', () => {
  const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
  const document={currentScript:{getAttribute:name=>name==='data-vc-manual'?'true':null}};const window={document};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../src/vc-widget.js'),'utf8'),{window,URL});
  assert.equal(typeof window.VCWidget.mount,'function');assert.equal(window.__vcWidgetMounted,undefined);
  const config=window.VCWidget.parseConfig({vcProxy:'/api/v1/student/ai-counsellor/vc',vcVoice:'on'});
  assert.equal(config.mode,'proxy');assert.equal(config.voice,true);
});
