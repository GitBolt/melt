/** Cache wallet metadata only. Access tokens must still be verified on every request. */
export function createWalletLookup(
  load: (userId: string) => Promise<string>,
  { ttlMs = 10_000, maxEntries = 500, now = Date.now } = {},
) {
  const entries = new Map<
    string,
    { expiresAt: number; promise: Promise<string> }
  >();
  return (userId: string): Promise<string> => {
    const existing = entries.get(userId);
    if (existing && existing.expiresAt > now()) return existing.promise;
    entries.delete(userId);
    while (entries.size >= maxEntries)
      entries.delete(entries.keys().next().value!);

    const entry = {
      expiresAt: Infinity,
      promise: Promise.resolve().then(() => load(userId)),
    };
    entries.set(userId, entry);
    entry.promise = entry.promise.then(
      (owner) => {
        entry.expiresAt = now() + ttlMs;
        return owner;
      },
      (error: unknown) => {
        if (entries.get(userId) === entry) entries.delete(userId);
        throw error;
      },
    );
    return entry.promise;
  };
}
