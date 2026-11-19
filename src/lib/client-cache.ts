// Session-memory only: never persist financial records to browser storage.
const TTL = 60_000;
const MAX_ENTRIES = 24;
const entries = new Map<string, { value: unknown; time: number }>();
const pending = new Map<string, { promise: Promise<unknown>; controller: AbortController }>();

export function cachedData<T>(key: string): T | undefined {
  return entries.get(key)?.value as T | undefined;
}

export function clearDataCache() {
  entries.clear();
  for (const request of pending.values()) request.controller.abort();
  pending.clear();
}

export function readData<T>(key: string): Promise<T> {
  const entry = entries.get(key);
  if (entry && Date.now() - entry.time < TTL) return Promise.resolve(entry.value as T);
  const existing = pending.get(key);
  if (existing) return existing.promise as Promise<T>;
  const controller = new AbortController();
  const promise = (async () => {
    const response = await fetch(key, { signal: controller.signal, cache: "no-store" });
    if (response.status === 401) {
      clearDataCache();
      if (typeof window !== "undefined") window.location.reload();
      throw new Error("Your session has expired.");
    }
    const value = await response.json();
    if (!response.ok) throw new Error(value.error || "Could not load your data.");
    // A save can invalidate a request while its response is being decoded.
    if (controller.signal.aborted) throw new DOMException("Invalidated", "AbortError");
    entries.delete(key);
    entries.set(key, { value, time: Date.now() });
    while (entries.size > MAX_ENTRIES) entries.delete(entries.keys().next().value!);
    return value as T;
  })().finally(() => {
    if (pending.get(key)?.controller === controller) pending.delete(key);
  });
  pending.set(key, { promise, controller });
  return promise;
}
