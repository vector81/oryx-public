import { test } from "node:test";
import assert from "node:assert/strict";
import { readData, cachedData, clearDataCache } from "../src/lib/client-cache";

test("client cache deduplicates, expires, isolates filters, and invalidates pending responses", async () => {
  const originalFetch = globalThis.fetch;
  const originalNow = Date.now;
  let time = 1000;
  let calls = 0;
  Date.now = () => time;
  globalThis.fetch = async () => {
    calls++;
    return Response.json({ revision: calls });
  };
  try {
    clearDataCache();
    const [first, duplicate] = await Promise.all([readData("/me"), readData("/me")]);
    assert.deepEqual(first, duplicate);
    assert.equal(calls, 1);
    await readData("/me");
    assert.equal(calls, 1);
    await readData("/business");
    assert.equal(calls, 2);
    time += 60_001;
    await readData("/me");
    assert.equal(calls, 3);
    clearDataCache();
    assert.equal(cachedData("/me"), undefined);

    let finish!: (response: Response) => void;
    globalThis.fetch = () => new Promise(resolve => { finish = resolve; });
    const obsolete = readData("/me");
    clearDataCache();
    finish(Response.json({ revision: "old" }));
    await assert.rejects(obsolete, { name: "AbortError" });
    assert.equal(cachedData("/me"), undefined);

    globalThis.fetch = async () => Response.json({ error: "Try again" }, { status: 500 });
    await assert.rejects(readData("/me"), /Try again/);
    assert.equal(cachedData("/me"), undefined);
    globalThis.fetch = async () => Response.json({ ok: true });
    for (let i = 0; i < 25; i++) await readData(`/entry/${i}`);
    assert.equal(cachedData("/entry/0"), undefined);
    assert.deepEqual(cachedData("/entry/24"), { ok: true });
  } finally {
    clearDataCache();
    globalThis.fetch = originalFetch;
    Date.now = originalNow;
  }
});
