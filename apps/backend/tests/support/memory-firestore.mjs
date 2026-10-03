// Transactional in-memory fixture: staged writes, rollback, serialized contention,
// and Firestore's rule that every read must precede the first write.
export function memoryFirestore(initial = {}) {
  let sequence = 0, queue = Promise.resolve();
  let store = new Map();
  for (const [name, records] of Object.entries(initial)) for (const [id, value] of Object.entries(records)) store.set(`${name}/${id}`, structuredClone(value));
  const readDoc = reference => ({ id: reference.id, ref: reference, exists: store.has(reference.path), data: () => structuredClone(store.get(reference.path)) });
  const document = (name, id) => {
    const value = String(id ?? `record_${++sequence}`), path = `${name}/${value}`;
    return { id: value, path, get: async () => readDoc(document(name, value)), create: async data => { if (store.has(path)) throw Error('Document exists'); store.set(path, structuredClone(data)); }, set: async (data, options) => store.set(path, structuredClone(options?.merge ? { ...store.get(path), ...data } : data)), update: async data => { if (!store.has(path)) throw Error('Missing document'); store.set(path, structuredClone({ ...store.get(path), ...data })); } };
  };
  const collection = (name, filters = [], limit = Infinity) => {
    const query = {
      doc: id => document(name, id),
      where: (field, operator, value) => { if (operator !== '==') throw Error('Unsupported fixture query'); return collection(name, [...filters, [field, value]], limit); },
      limit: value => collection(name, filters, value),
      get: async () => {
        const docs = [...store].filter(([path, data]) => path.startsWith(name + '/') && filters.every(([field, value]) => data[field] === value)).slice(0, limit).map(([path]) => readDoc(document(name, path.slice(name.length + 1))));
        return { docs, empty: docs.length === 0, size: docs.length };
      }
    };
    return query;
  };
  return {
    collection,
    async runTransaction(callback) {
      const previous = queue; let unlock; queue = new Promise(resolve => { unlock = resolve; }); await previous;
      const writes = [];
      try {
        const tx = {
          get: async reference => { if (writes.length) throw Error('Transaction reads after writes'); return reference.get(); },
          create: (reference, data) => writes.push(['create', reference, data]),
          update: (reference, data) => writes.push(['update', reference, data]),
          set: (reference, data, options) => writes.push(['set', reference, data, options])
        };
        const result = await callback(tx), next = new Map(store);
        for (const [type, reference, data, options] of writes) {
          if (type === 'create' && next.has(reference.path)) throw Error('Document exists');
          if (type === 'update' && !next.has(reference.path)) throw Error('Missing document');
          next.set(reference.path, structuredClone(type === 'update' || options?.merge ? { ...next.get(reference.path), ...data } : data));
        }
        store = next; return result;
      } finally { unlock(); }
    },
    data: (name, id) => structuredClone(store.get(`${name}/${id}`)),
    records: name => [...store].filter(([path]) => path.startsWith(name + '/')).map(([path, data]) => ({ id: path.slice(name.length + 1), ...structuredClone(data) }))
  };
}
