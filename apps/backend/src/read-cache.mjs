// Only display models use this reader. Authentication, quotes, and transaction
// checks continue to read the authoritative database directly.
export function createReadCache(db, { ttlMs = 30000, now = Date.now } = {}) {
  const entries = new Map();
  const cached = (collection, clauses, read) => {
    const key = JSON.stringify([collection, clauses]);
    const existing = entries.get(key);
    if (existing && existing.expiresAt > now()) return existing.promise;
    const entry = { collection, expiresAt: Infinity };
    entry.promise = Promise.resolve().then(read).then(snapshot => {
      entry.expiresAt = now() + ttlMs;
      return snapshot;
    }).catch(error => { if (entries.get(key) === entry) entries.delete(key); throw error; });
    entries.set(key, entry);
    return entry.promise;
  };
  const query = (name, reference, clauses = []) => ({
    get: () => cached(name, clauses, () => reference.get()),
    where: (...args) => query(name, reference.where(...args), [...clauses, ['where', ...args]]),
    orderBy: (...args) => query(name, reference.orderBy(...args), [...clauses, ['orderBy', ...args]]),
    limit: (...args) => query(name, reference.limit(...args), [...clauses, ['limit', ...args]]),
    doc: id => ({ get: () => cached(name, [['doc', String(id)]], () => reference.doc(id).get()) })
  });
  return {
    database: { collection: name => query(name, db.collection(name)) },
    invalidate(collection) { for (const [key, entry] of entries) if (!collection || entry.collection === collection) entries.delete(key); }
  };
}
