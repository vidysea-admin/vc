"use strict";
// W4: the nginx snippet serves the versioned file with a long immutable cache and an alias with a short one.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const W = require("../src/vc-widget.js");

const snippet = fs.readFileSync(path.join(__dirname, "..", "nginx-widget.conf.snippet"), "utf8").replace(/^\s*#.*$/gm, "");

function block(header) {
  const i = snippet.indexOf(header);
  assert.ok(i >= 0, "missing " + header);
  return snippet.slice(i, snippet.indexOf("}", i));
}

test("the versioned name comes from the file's major version", () => {
  const name = "vc-widget.v" + W.VERSION.split(".")[0] + ".js";
  const b = block("location = /widget/" + name);
  assert.match(b, /alias \/opt\/vc\/apps\/widget\/src\/vc-widget\.js;/);
  assert.match(b, /Cache-Control "public, max-age=31536000, immutable"/);
});

test("the alias vc-widget.js is the same file with a short cache", () => {
  const b = block("location = /widget/vc-widget.js");
  assert.match(b, /alias \/opt\/vc\/apps\/widget\/src\/vc-widget\.js;/);
  assert.match(b, /Cache-Control "public, max-age=300"/);
});

test("the catch-all publishes nothing else; all four asset locations use nosniff", () => {
  assert.match(block("location /widget/ {"), /return 404;/);
  assert.equal((snippet.match(/X-Content-Type-Options "nosniff"/g) || []).length, 4);
});

test("S13 release URLs keep the widget and voice on one immutable commit and reject other paths", () => {
  const pattern=snippet.match(/location ~ "([^"\n]+)"/)[1];
  const re=new RegExp(pattern),sha='a'.repeat(40),base='https://vc.example.org/widget/releases/'+sha+'/';
  for(const file of ['vc-widget.js','vc-widget.v1.js','vc-widget-voice.v1.js'])assert.ok(re.test(new URL(base+file).pathname));
  assert.equal(W.voiceScriptUrl(base+'vc-widget.v1.js'),base+'vc-widget-voice.v1.js');
  for(const p of ['/widget/releases/../.env','/widget/releases/'+sha+'/secret.txt','/widget/releases/abc/vc-widget.js','/widget/releases/'+sha+'/nested/vc-widget.js'])assert.equal(re.test(p),false,p);
  assert.match(snippet,/alias \/opt\/vc\/releases\/\$1\/widget\/\$2;/);
  const deployed=fs.readFileSync(path.join(__dirname,'../../../infra/ubuntu/nginx-vc.conf'),'utf8');
  assert.ok(deployed.includes('location ~ "'+pattern+'"'));
});
