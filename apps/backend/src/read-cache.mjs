// Only display models use this reader. Authentication, quotes, and transaction
// checks continue to read the authoritative database directly.
export function createReadCache(db, { ttlMs = 30000, maxEntries = 512, now = Date.now } = {}) {
  const entries = new Map();
  const stats = { cacheHits: 0, firestoreReads: 0, documentsReturned: 0, byCollection: Object.create(null) };
  const trim = () => {
    for (const [key, entry] of entries) if (entry.expiresAt <= now()) entries.delete(key);
    while (entries.size > maxEntries) {
      const removable = [...entries].find(([, entry]) => Number.isFinite(entry.expiresAt));
      if (!removable) break;
      entries.delete(removable[0]);
    }
  };
  const cached = (collection, clauses, read) => {
    const key = JSON.stringify([collection, clauses]);
    const existing = entries.get(key);
    if (existing && existing.expiresAt > now()) {
      stats.cacheHits++;
      entries.delete(key);
      entries.set(key, existing);
      return existing.promise;
    }
    if (existing) entries.delete(key);
    const entry = { collection, clauses, expiresAt: Infinity };
    entry.promise = Promise.resolve().then(() => {
      stats.firestoreReads++;
      return read();
    }).then(snapshot => {
      const count = Number.isFinite(snapshot?.size) ? snapshot.size : snapshot?.exists ? 1 : 0;
      stats.documentsReturned += count;
      const collectionStats = stats.byCollection[collection] ||= { firestoreReads: 0, documentsReturned: 0 };
      collectionStats.firestoreReads++;
      collectionStats.documentsReturned += count;
      entry.expiresAt = now() + ttlMs;
      trim();
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
    invalidate(collection, predicate) {
      for (const [key, entry] of entries) {
        if ((!collection || entry.collection === collection) && (!predicate || predicate(entry.clauses))) entries.delete(key);
      }
    },
    getStats({ reset = false } = {}) {
      const result = { ...stats, byCollection: Object.fromEntries(Object.entries(stats.byCollection).map(([name, value]) => [name, { ...value }])) };
      if (reset) { stats.cacheHits = 0; stats.firestoreReads = 0; stats.documentsReturned = 0; stats.byCollection = Object.create(null); }
      return result;
    }
  };
}
