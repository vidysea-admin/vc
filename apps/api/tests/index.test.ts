import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { apiStatus, startApi } from "../src/index.js";
import { createFakeMongoClient } from "@vc/db/testing";
import { COLLECTION_NAMES, erasureFenceKey, MINIMUM_FENCE_HOLD_MS } from "@vc/db";

test("apiStatus reports the scaffold placeholder", () => {
  assert.match(apiStatus(), /not yet implemented/);
});

// ---------------------------------------------------------------------------
// T-014 / ISS-t-011-c3-rev-3: startApi is the one place in this scaffold that owns a live Mongo
// client, so it is where releaseExpiredErasureFences (packages/db) finally gets a real, scheduled
// caller. Proven end-to-end here with fake timers and the shared @vc/db/testing fake — never a
// real Mongo connection (client.connect/close are stubbed on the fake, contract B8).
// ---------------------------------------------------------------------------

interface FakeConnectable {
  connect: () => Promise<unknown>;
  close: () => Promise<unknown>;
}

test("T-014/ISS-t-011-c3-rev-3: startApi connects via connectFromEnv (B12: virtual_counsellor only) and wires the erasure-fence sweep so a scheduled tick actually releases an expired fence", async () => {
  mock.timers.enable({ apis: ["setInterval"] });
  try {
    const { client, dbFor, dbCalls } = createFakeMongoClient();
    const fakeClient = client as unknown as FakeConnectable;
    let connected = 0;
    const realConnect = fakeClient.connect.bind(fakeClient);
    fakeClient.connect = async () => {
      connected += 1;
      return realConnect();
    };

    const api = await startApi({ MONGODB_URL: "mongodb://fake-host/ignored" }, { clientFactory: () => client, intervalMs: 1000 });
    try {
      assert.equal(connected, 1, "startApi must actually call client.connect(), not just construct it");
      assert.deepEqual(dbCalls, ["virtual_counsellor"], "B12: only ever opens virtual_counsellor, never another database");

      const fences = dbFor("virtual_counsellor").collection<{
        _id: string;
        studentKey: string;
        requestId: string;
        createdAt: string;
        releaseAfter?: string;
      }>(COLLECTION_NAMES.erasure_fences);
      const studentId = "stu-rev3";
      const longAgo = new Date(Date.now() - MINIMUM_FENCE_HOLD_MS - 60_000).toISOString();
      fences.seed({ _id: erasureFenceKey(studentId), studentKey: erasureFenceKey(studentId), requestId: "r-gone", createdAt: longAgo, releaseAfter: longAgo });
      assert.equal(fences.size(), 1, "the fence is seeded before the first tick");

      mock.timers.tick(1000); // fires the interval synchronously; the tick's own work is async
      await new Promise((resolve) => setTimeout(resolve, 0));
      await new Promise((resolve) => setTimeout(resolve, 0));

      assert.equal(fences.size(), 0, "the sweep wired by startApi released the expired fence");
    } finally {
      const realClose = fakeClient.close.bind(fakeClient);
      let closed = 0;
      fakeClient.close = async () => {
        closed += 1;
        return realClose();
      };
      await api.stop();
      assert.equal(closed, 1, "stop() closes the Mongo client");
    }

    // stop() must actually stop the interval too: reseed and advance well past more ticks.
    const fences2 = dbFor("virtual_counsellor").collection<{
      _id: string;
      studentKey: string;
      requestId: string;
      createdAt: string;
      releaseAfter?: string;
    }>(COLLECTION_NAMES.erasure_fences);
    const studentId2 = "stu-rev3b";
    const longAgo2 = new Date(Date.now() - MINIMUM_FENCE_HOLD_MS - 60_000).toISOString();
    fences2.seed({ _id: erasureFenceKey(studentId2), studentKey: erasureFenceKey(studentId2), requestId: "r-gone-2", createdAt: longAgo2, releaseAfter: longAgo2 });
    mock.timers.tick(10_000);
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(fences2.size(), 1, "stop() must have cleared the sweep interval: no further sweeps run after it");
  } finally {
    mock.timers.reset();
  }
});

// ---------------------------------------------------------------------------
// T-015 / ISS-t-014-rev-2: startApi's default onError is a structured log line, not a silent no-op.
// ---------------------------------------------------------------------------

test("T-015/ISS-t-014-rev-2: startApi's default onError logs a structured JSON line naming the failure, instead of discarding it", async () => {
  mock.timers.enable({ apis: ["setInterval"] });
  try {
    const { client, dbFor } = createFakeMongoClient();
    const api = await startApi({ MONGODB_URL: "mongodb://fake-host/ignored" }, { clientFactory: () => client, intervalMs: 1000 });
    try {
      const fences = dbFor("virtual_counsellor").collection<{ _id: string }>(COLLECTION_NAMES.erasure_fences);
      const boom = new Error("simulated sweep read failure");
      fences.find = () => {
        throw boom;
      };

      const realConsoleError = console.error;
      const logs: unknown[][] = [];
      console.error = (...args: unknown[]) => {
        logs.push(args);
      };
      try {
        mock.timers.tick(1000);
        await new Promise((resolve) => setTimeout(resolve, 0));
        await new Promise((resolve) => setTimeout(resolve, 0));
        assert.equal(logs.length, 1, "expected exactly one console.error call for the failing tick");
        const [line] = logs[0]!;
        assert.equal(typeof line, "string", "the logged line must be a plain string (JSON), not an object dump");
        const parsed = JSON.parse(line as string);
        assert.equal(parsed.event, "erasure_fence_sweep_failed");
        assert.equal(parsed.error, "Error", "ISS-t-015-c0-1: name/code label, not the raw message");
        assert.equal(parsed.message, undefined, "ISS-t-015-c0-1: the raw err.message is never logged");
        assert.equal(parsed.level, "error");
        assert.equal(typeof parsed.ts, "string");
      } finally {
        console.error = realConsoleError;
      }
    } finally {
      await api.stop();
    }
  } finally {
    mock.timers.reset();
  }
});

// ---------------------------------------------------------------------------
// ISS-t-015-c0-1: the default sweep logger must never leak err.message (a real Mongo-shaped error's
// message can embed document field values, e.g. an E11000 duplicate-key line).
// ---------------------------------------------------------------------------

test("ISS-t-015-c0-1: a Mongo-shaped error whose message embeds a value does not survive in the logged line", async () => {
  mock.timers.enable({ apis: ["setInterval"] });
  try {
    const { client, dbFor } = createFakeMongoClient();
    const api = await startApi({ MONGODB_URL: "mongodb://fake-host/ignored" }, { clientFactory: () => client, intervalMs: 1000 });
    try {
      const fences = dbFor("virtual_counsellor").collection<{ _id: string }>(COLLECTION_NAMES.erasure_fences);
      const secretValue = "student-secret-value-should-not-leak";
      const mongoShaped = Object.assign(
        new Error(`E11000 duplicate key error collection: virtual_counsellor.erasure_fences index: _id_ dup key: { _id: "${secretValue}" }`),
        { name: "MongoServerError", code: 11000, codeName: "DuplicateKey" },
      );
      fences.find = () => {
        throw mongoShaped;
      };

      const realConsoleError = console.error;
      const logs: unknown[][] = [];
      console.error = (...args: unknown[]) => logs.push(args);
      try {
        mock.timers.tick(1000);
        await new Promise((resolve) => setTimeout(resolve, 0));
        await new Promise((resolve) => setTimeout(resolve, 0));
        assert.equal(logs.length, 1);
        const [line] = logs[0]!;
        assert.equal(typeof line, "string");
        assert.ok(!(line as string).includes(secretValue), "the embedded value must never reach the logged line");
        assert.ok(!(line as string).includes("dup key"), "no raw driver message text at all, only a name:code label");
        const parsed = JSON.parse(line as string);
        assert.equal(parsed.error, "MongoServerError:DuplicateKey");
      } finally {
        console.error = realConsoleError;
      }
    } finally {
      await api.stop();
    }
  } finally {
    mock.timers.reset();
  }
});

test("T-015/ISS-t-014-rev-2: a caller-supplied onError still wins over the default (not double-logged)", async () => {
  mock.timers.enable({ apis: ["setInterval"] });
  try {
    const { client, dbFor } = createFakeMongoClient();
    const errors: unknown[] = [];
    const api = await startApi(
      { MONGODB_URL: "mongodb://fake-host/ignored" },
      { clientFactory: () => client, intervalMs: 1000, onError: (err) => errors.push(err) },
    );
    try {
      const fences = dbFor("virtual_counsellor").collection<{ _id: string }>(COLLECTION_NAMES.erasure_fences);
      const boom = new Error("simulated sweep read failure 2");
      fences.find = () => {
        throw boom;
      };
      const realConsoleError = console.error;
      const logs: unknown[] = [];
      console.error = (...args: unknown[]) => logs.push(args);
      try {
        mock.timers.tick(1000);
        await new Promise((resolve) => setTimeout(resolve, 0));
        await new Promise((resolve) => setTimeout(resolve, 0));
        assert.equal(errors.length, 1, "the caller's own onError received the error");
        assert.equal(errors[0], boom);
        assert.equal(logs.length, 0, "the default logger must not ALSO fire when a caller supplies its own onError");
      } finally {
        console.error = realConsoleError;
      }
    } finally {
      await api.stop();
    }
  } finally {
    mock.timers.reset();
  }
});

// ---------------------------------------------------------------------------
// T-015 / ISS-t-014-rev-3: startApi closes the Mongo client and rethrows if anything fails AFTER
// connect (a leaked, connected client if starting the sweep itself throws).
// ---------------------------------------------------------------------------

test("T-015/ISS-t-014-rev-3: startApi closes the client and rethrows when starting the sweep fails after connect", async () => {
  const { client } = createFakeMongoClient();
  const fakeClient = client as unknown as FakeConnectable;
  let connected = 0;
  let closed = 0;
  const realConnect = fakeClient.connect.bind(fakeClient);
  const realClose = fakeClient.close.bind(fakeClient);
  fakeClient.connect = async () => {
    connected += 1;
    return realConnect();
  };
  fakeClient.close = async () => {
    closed += 1;
    return realClose();
  };

  await assert.rejects(
    startApi({ MONGODB_URL: "mongodb://fake-host/ignored" }, { clientFactory: () => client, intervalMs: 0 }),
    RangeError,
  );
  assert.equal(connected, 1, "connect() was reached (the failure is AFTER connect, per the brief)");
  assert.equal(closed, 1, "the client must be closed on the post-connect error path, not leaked");
});

// ---------------------------------------------------------------------------
// ISS-t-015-c0-2: when close() ALSO throws on the post-connect error path, the ROOT error (e.g.
// startErasureFenceSweep's RangeError) must survive, not be silently replaced by the close failure.
// ---------------------------------------------------------------------------

test("ISS-t-015-c0-2: when close() throws too, the ORIGINAL error is preserved (not discarded), with the close failure attached", async () => {
  const { client } = createFakeMongoClient();
  const fakeClient = client as unknown as FakeConnectable;
  const closeErr = new Error("simulated close() failure");
  fakeClient.close = async () => {
    throw closeErr;
  };

  const err: unknown = await startApi({ MONGODB_URL: "mongodb://fake-host/ignored" }, { clientFactory: () => client, intervalMs: 0 }).catch(
    (e: unknown) => e,
  );
  assert.ok(err instanceof AggregateError, "both failures are surfaced, never just the close() one");
  assert.equal(err.errors.length, 2);
  assert.ok(err.errors[0] instanceof RangeError, "the ROOT cause (intervalMs validation) is preserved as the first error");
  assert.equal(err.errors[1], closeErr, "the close() failure is also surfaced, not silently swallowed");
});

test("T-015/ISS-t-014-rev-3 (regression): a SUCCESSFUL startApi does not close the client until stop() is called", async () => {
  const { client } = createFakeMongoClient();
  const fakeClient = client as unknown as FakeConnectable;
  let closed = 0;
  const realClose = fakeClient.close.bind(fakeClient);
  fakeClient.close = async () => {
    closed += 1;
    return realClose();
  };
  const api = await startApi({ MONGODB_URL: "mongodb://fake-host/ignored" }, { clientFactory: () => client, intervalMs: 1000 });
  assert.equal(closed, 0, "startApi itself must not close a client it successfully started");
  await api.stop();
  assert.equal(closed, 1);
});
