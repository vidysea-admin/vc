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
