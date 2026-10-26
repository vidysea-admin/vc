// VA8/VA9 fetch side: fetchRepoFiles with a fake GithubPort. Scenario: an admin presses Sync on a GitHub
// source; the route test injects a fake port, so these tests pin what that fetch does with tree entries,
// binaries, oversize blobs, port failures and secrets. No network, no token, no real GitHub.
import assert from "node:assert/strict";
import { test } from "node:test";
import { fetchRepoFiles, GithubFetchError } from "../src/ingest/github.js";
import type { GithubPort, GithubTreeEntry } from "../src/ingest/github.js";

const b64 = (s: string | Buffer) => Buffer.from(s).toString("base64");
const SRC = { owner: "pathlynks", repo: "web", branch: "main" };
const TOKEN = "ghp_FAKEFAKEFAKEFAKEFAKEFAKEFAKEFAKE1234";

interface FakeFile {
  path: string;
  data: Buffer | string;
  /** Size the tree claims (defaults to the real byte length). */
  size?: number;
  noSize?: boolean;
}

function fakeRepo(files: FakeFile[], extra: GithubTreeEntry[] = []) {
  const calls = { listTree: [] as string[][], getBlob: [] as string[][] };
  const bySha = new Map<string, FakeFile>();
  const tree: GithubTreeEntry[] = files.map((f, i) => {
    const sha = `sha${i}`;
    bySha.set(sha, f);
    const bytes = Buffer.from(f.data);
    return f.noSize ? { path: f.path, type: "blob", sha } : { path: f.path, type: "blob", sha, size: f.size ?? bytes.length };
  });
  const port: GithubPort = {
    async listTree(owner, repo, branch) {
      calls.listTree.push([owner, repo, branch]);
      return [...tree, ...extra];
    },
    async getBlob(owner, repo, sha) {
      calls.getBlob.push([owner, repo, sha]);
      const f = bySha.get(sha);
      if (!f) throw new Error(`no blob ${sha}`);
      const bytes = Buffer.from(f.data);
      return { content: b64(bytes), encoding: "base64", size: bytes.length };
    },
  };
  return { port, calls, bySha };
}

const FILES: FakeFile[] = [
  { path: "src/app/page.tsx", data: "export default function Home() {}\n" },
  { path: "src/app/(admin)/users/page.tsx", data: "export default function Users() {}\n" },
  { path: "src/app/layout.tsx", data: "layout" },
  { path: "src/app/logo.png", data: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x01, 0x02]) },
  { path: "migrations/20240101-create-users.js", data: "module.exports = {};\n" },
  { path: "migrations/sub/20240102-add.js", data: "module.exports = {};\n" },
  { path: "migrations/readme.md", data: "# notes" },
  { path: "README.md", data: "readme" },
];

test("glob filtering: only matched files are fetched, sorted by path, content decoded", async () => {
  const { port, calls } = fakeRepo(FILES);
  const out = await fetchRepoFiles(port, SRC, ["src/app/**/page.{js,jsx,ts,tsx}", "migrations/**/*.js"]);
  assert.deepEqual(out.map((f) => f.path), [
    "migrations/20240101-create-users.js",
    "migrations/sub/20240102-add.js",
    "src/app/(admin)/users/page.tsx",
    "src/app/page.tsx",
  ]);
  assert.equal(out[3]!.content, "export default function Home() {}\n");
  assert.deepEqual(calls.listTree, [["pathlynks", "web", "main"]]);
  assert.equal(calls.getBlob.length, 4, "unmatched files (layout, png, md, README) were never fetched");
  assert.ok(calls.getBlob.every((c) => c[0] === "pathlynks" && c[1] === "web"));
});

test("glob semantics: * stays inside a folder, ** spans folders and zero folders, parentheses are literal, ! excludes", async () => {
  const { port } = fakeRepo([
    { path: "a/x.js", data: "1" },
    { path: "a/b/x.js", data: "2" },
    { path: "x.js", data: "3" },
    { path: "a/(g)/y.js", data: "4" },
    { path: "a/gy.js", data: "5" },
    { path: "z1.txt", data: "6" },
    { path: "z12.txt", data: "7" },
  ]);
  const paths = async (globs: string[]) => (await fetchRepoFiles(port, SRC, globs)).map((f) => f.path);
  assert.deepEqual(await paths(["a/*.js"]), ["a/gy.js", "a/x.js"]);
  assert.deepEqual(await paths(["**/x.js"]), ["a/b/x.js", "a/x.js", "x.js"]);
  assert.deepEqual(await paths(["a/(g)/*.js"]), ["a/(g)/y.js"]);
  assert.deepEqual(await paths(["z?.txt"]), ["z1.txt"]);
  assert.deepEqual(await paths(["**/*.js", "!a/b/**"]), ["a/(g)/y.js", "a/gy.js", "a/x.js", "x.js"]);
  assert.deepEqual(await paths([]), [], "no globs, nothing selected");
});

test("binary blobs and invalid UTF-8 are skipped (with a reason); oversize is skipped without fetching", async () => {
  const bigSize = 2_000_000;
  const { port, calls } = fakeRepo([
    { path: "migrations/ok.js", data: "ok" },
    { path: "migrations/blob.js", data: Buffer.from([0x6d, 0x00, 0x6e]) },
    { path: "migrations/latin1.js", data: Buffer.from([0x63, 0xe9, 0x64]) },
    { path: "migrations/huge.js", data: "tiny", size: bigSize },
    { path: "migrations/liar.js", data: "z".repeat(1500), noSize: true },
  ]);
  const skipped: [string, string][] = [];
  const out = await fetchRepoFiles(port, SRC, ["migrations/*.js"], {
    maxBytes: 1000,
    onSkip: (path, reason) => skipped.push([path, reason]),
  });
  assert.deepEqual(out.map((f) => f.path), ["migrations/ok.js"]);
  assert.deepEqual(skipped.sort(), [
    ["migrations/blob.js", "binary"],
    ["migrations/huge.js", "oversize"],
    ["migrations/latin1.js", "binary"],
    ["migrations/liar.js", "oversize"],
  ]);
  assert.ok(!calls.getBlob.some((c) => c[2] === "sha3"), "tree-declared oversize blob was not downloaded");
});

test("non-blob tree entries and unsafe paths are ignored", async () => {
  const { port } = fakeRepo([{ path: "a/ok.js", data: "1" }], [
    { path: "a/dir.js", type: "tree", sha: "t1" },
    { path: "vendor", type: "commit", sha: "c1" },
    { path: "../escape.js", type: "blob", sha: "e1", size: 1 },
    { path: "/abs.js", type: "blob", sha: "e2", size: 1 },
  ]);
  const out = await fetchRepoFiles(port, SRC, ["**/*.js"]);
  assert.deepEqual(out.map((f) => f.path), ["a/ok.js"]);
});

test("listTree failure surfaces as an error and carries no token value, even when the port echoes it", async () => {
  const port: GithubPort = {
    async listTree() {
      throw Object.assign(new Error(`401 Bad credentials for Authorization: Bearer ${TOKEN}`), { status: 401 });
    },
    async getBlob() {
      throw new Error("unreachable");
    },
  };
  await assert.rejects(fetchRepoFiles(port, SRC, ["**/*.js"]), (err: unknown) => {
    assert.ok(err instanceof GithubFetchError);
    assert.equal(err.stage, "listTree");
    assert.equal(err.status, 401);
    assert.match(err.message, /pathlynks\/web@main/);
    for (const text of [err.message, String(err), err.stack ?? "", JSON.stringify(err), JSON.stringify(Object.getOwnPropertyNames(err))]) {
      assert.ok(!text.includes(TOKEN), "token leaked");
      assert.ok(!text.includes("Bearer"), "port message leaked");
    }
    assert.equal((err as { cause?: unknown }).cause, undefined);
    return true;
  });
});

test("a non-Error throw and a secret in an arbitrary shape also leave no value in the message", async () => {
  const port: GithubPort = {
    async listTree() {
      throw `boom ${TOKEN}`;
    },
    async getBlob() {
      throw new Error("x");
    },
  };
  await assert.rejects(fetchRepoFiles(port, SRC, ["*"]), (err: unknown) => {
    assert.ok(err instanceof GithubFetchError);
    assert.ok(!err.message.includes(TOKEN));
    return true;
  });
});

test("the caller's redact list is scrubbed from repo coordinates in the message", async () => {
  const port: GithubPort = {
    async listTree() {
      throw new Error("down");
    },
    async getBlob() {
      throw new Error("x");
    },
  };
  await assert.rejects(fetchRepoFiles(port, { owner: "o", repo: "r", branch: `b-${TOKEN}` }, ["*"], { redact: [TOKEN] }), (err: unknown) => {
    assert.ok(err instanceof GithubFetchError);
    assert.ok(!err.message.includes(TOKEN));
    return true;
  });
});

test("getBlob failure fails the whole fetch (no silent partial catalogue) and leaks no secret", async () => {
  const { port } = fakeRepo([
    { path: "migrations/a.js", data: "1" },
    { path: "migrations/b.js", data: "2" },
  ]);
  const flaky: GithubPort = {
    listTree: port.listTree,
    async getBlob(o, r, sha) {
      if (sha === "sha1") throw new Error(`rate limited ${TOKEN}`);
      return port.getBlob(o, r, sha);
    },
  };
  await assert.rejects(fetchRepoFiles(flaky, SRC, ["migrations/*.js"]), (err: unknown) => {
    assert.ok(err instanceof GithubFetchError);
    assert.equal(err.stage, "getBlob");
    assert.match(err.message, /migrations\/b\.js/);
    assert.ok(!err.message.includes(TOKEN));
    return true;
  });
});

test("a truncated tree listing fails closed instead of returning a partial repo", async () => {
  const port: GithubPort = {
    async listTree() {
      return { tree: [{ path: "a.js", type: "blob", sha: "s", size: 1 }], truncated: true };
    },
    async getBlob() {
      return "x";
    },
  };
  await assert.rejects(fetchRepoFiles(port, SRC, ["*.js"]), (err: unknown) => err instanceof GithubFetchError && err.stage === "listTree");
});

test("more matched files than maxFiles fails closed", async () => {
  const { port } = fakeRepo(Array.from({ length: 5 }, (_, i) => ({ path: `m/${i}.js`, data: "x" })));
  await assert.rejects(fetchRepoFiles(port, SRC, ["m/*.js"], { maxFiles: 4 }), (err: unknown) => err instanceof GithubFetchError && err.stage === "limit");
  assert.equal((await fetchRepoFiles(port, SRC, ["m/*.js"], { maxFiles: 5 })).length, 5);
});

test("port variants: a plain-string blob and a utf-8 encoded blob object are accepted", async () => {
  const port: GithubPort = {
    async listTree() {
      return [
        { path: "a.js", type: "blob", sha: "1" },
        { path: "b.js", type: "blob", sha: "2" },
      ];
    },
    async getBlob(_o, _r, sha) {
      return sha === "1" ? "plain text" : { content: "utf8 text", encoding: "utf-8" };
    },
  };
  const out = await fetchRepoFiles(port, SRC, ["*.js"]);
  assert.deepEqual(out, [
    { path: "a.js", content: "plain text" },
    { path: "b.js", content: "utf8 text" },
  ]);
});

test("hostile globs: over-long and pathological patterns are rejected or run in bounded time", async () => {
  const { port } = fakeRepo([{ path: "a/b.js", data: "1" }]);
  await assert.rejects(fetchRepoFiles(port, SRC, ["a".repeat(1000)]), (err: unknown) => err instanceof GithubFetchError && err.stage === "glob");
  await assert.rejects(
    fetchRepoFiles(port, SRC, ["**/**/**/**/**/**/**/**/**/**/*x*x*x*x*x*x*x*x*x*x*y"]),
    (err: unknown) => err instanceof GithubFetchError && err.stage === "glob",
  );
  const t0 = performance.now();
  const long = "a/".repeat(400) + "b.js";
  const { port: p2 } = fakeRepo([{ path: long, data: "1" }]);
  assert.deepEqual(await fetchRepoFiles(p2, SRC, ["**/*x*x*y"]), []);
  assert.ok(performance.now() - t0 < 1000);
});
