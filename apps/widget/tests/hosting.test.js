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

test("a location /widget/ exists and publishes nothing else; nosniff on both files", () => {
  assert.match(block("location /widget/ {"), /return 404;/);
  assert.equal((snippet.match(/X-Content-Type-Options "nosniff"/g) || []).length, 2);
});
