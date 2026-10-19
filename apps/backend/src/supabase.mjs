import { randomBytes } from 'node:crypto';

const IMAGE_COLLECTIONS = new Set([
  'rental_payment_proofs',
  'item_condition_photos',
  'maintenance_photos',
  'settings'
]);

export function normalizeSupabaseUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return '';
  return rawUrl.trim().replace(/\/rest\/v1\/?$/i, '').replace(/\/+$/, '');
}

export function parseCollectionPath(name) {
  const parts = String(name || '').split('/').filter(Boolean);
  if (parts.length <= 1) {
    const raw = parts[0] || 'default';
    return {
      tableName: raw.toLowerCase().replace(/[^a-z0-9_]/g, '_'),
      scopePrefix: '',
      isSubcollection: false
    };
  }
  if (parts.length === 3) {
    const [parent, parentId, sub] = parts;
    const cleanParent = parent.toLowerCase().replace(/[^a-z0-9_]/g, '_');
    const cleanSub = sub.toLowerCase().replace(/[^a-z0-9_]/g, '_');
    return {
      tableName: `${cleanParent}_${cleanSub}`,
      scopePrefix: `${parentId}__`,
      isSubcollection: true,
      parentId
    };
  }
  const collectionParts = [];
  const idParts = [];
  for (let i = 0; i < parts.length; i++) {
    if (i % 2 === 0) collectionParts.push(parts[i]);
    else idParts.push(parts[i]);
  }
  const cleanTable = collectionParts.join('_').toLowerCase().replace(/[^a-z0-9_]/g, '_');
  const scopePrefix = idParts.length ? `${idParts.join('__')}__` : '';
  return {
    tableName: cleanTable,
    scopePrefix,
    isSubcollection: true
  };
}

export function resolveCollectionAndId(rawCollection, rawId) {
  const { tableName, scopePrefix } = parseCollectionPath(rawCollection);
  return {
    collection: tableName,
    id: scopePrefix ? `${scopePrefix}${rawId}` : String(rawId)
  };
}

export function isSupabaseConfigured(env = process.env) {
  const url = normalizeSupabaseUrl(env.SUPABASE_URL);
  const key = (env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SECRET_KEY || '').trim();
  return Boolean(url && key);
}

export function encodeSupabaseValue(value) {
  if (value === undefined) return undefined;
  if (value === null || typeof value !== 'object') return value;
  if (value instanceof Date) return { __timestamp__: value.toISOString() };
  if (typeof value.toDate === 'function') return { __timestamp__: value.toDate().toISOString() };
  if (Array.isArray(value)) {
    return value.map(item => (item === undefined ? null : encodeSupabaseValue(item)));
  }
  const result = {};
  for (const [key, child] of Object.entries(value)) {
    if (child !== undefined) {
      result[key] = encodeSupabaseValue(child);
    }
  }
  return result;
}

export function decodeSupabaseValue(value) {
  if (value === null || value === undefined || typeof value !== 'object') return value;
  if (value instanceof Date) return new Date(value.getTime());
  if (Array.isArray(value)) return value.map(decodeSupabaseValue);
  if (typeof value.__timestamp__ === 'string' && Object.keys(value).length === 1) {
    return new Date(value.__timestamp__);
  }
  if (typeof value._seconds === 'number' && ('_nanoseconds' in value || Object.keys(value).length <= 2)) {
    return new Date(value._seconds * 1000 + Math.floor((value._nanoseconds || 0) / 1e6));
  }
  const result = {};
  for (const [key, child] of Object.entries(value)) {
    result[key] = decodeSupabaseValue(child);
  }
  return result;
}

function generateDocId() {
  return randomBytes(15).toString('base64url').slice(0, 20);
}

function comparableValue(value) {
  if (value instanceof Date) return value.getTime();
  if (typeof value?.toDate === 'function') return value.toDate().getTime();
  return value;
}

function matchesFilter(actualRaw, operator, expectedRaw) {
  const actual = comparableValue(actualRaw);
  if (operator === 'in') {
    return Array.isArray(expectedRaw) && expectedRaw.some(item => comparableValue(item) === actual);
  }
  const expected = comparableValue(expectedRaw);
  if (actual === undefined || actual === null) {
    return operator === '==' ? actual === expected : false;
  }
  switch (operator) {
    case '==':
      return actual === expected;
    case '<=':
      return actual <= expected;
    case '>=':
      return actual >= expected;
    case '<':
      return actual < expected;
    case '>':
      return actual > expected;
    default:
      throw new Error(`Unsupported query operator: ${operator}`);
  }
}

function compareValues(aRaw, bRaw) {
  const a = comparableValue(aRaw);
  const b = comparableValue(bRaw);
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

export function createSupabaseFirestore({
  url = process.env.SUPABASE_URL,
  serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY,
  bucket = process.env.SUPABASE_STORAGE_BUCKET || 'rental-media',
  fetcher = fetch
} = {}) {
  const baseUrl = normalizeSupabaseUrl(url);
  const apiKey = (serviceRoleKey || '').trim();
  const mediaDataUrlCache = new Map();

  function headers(extra = {}) {
    return {
      apikey: apiKey,
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      ...extra
    };
  }

  async function rpc(fnName, params = {}) {
    if (!baseUrl || !apiKey) {
      throw Object.assign(
        new Error('Supabase URL or Service Role Key is not configured.'),
        { code: 'SUPABASE_CONFIG' }
      );
    }
    const response = await fetcher(`${baseUrl}/rest/v1/rpc/${fnName}`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify(params)
    });
    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      let parsed;
      try { parsed = JSON.parse(errText); } catch { parsed = null; }
      const message = parsed?.message || parsed?.error || errText || `Supabase RPC ${fnName} failed (${response.status})`;
      if (message.includes('Could not find the function public.app_')) {
        throw Object.assign(
          new Error('Supabase schema is not initialized yet. Run infrastructure/supabase-schema.sql in the Supabase SQL Editor.'),
          { code: 'SUPABASE_SCHEMA_MISSING', status: 503 }
        );
      }
      throw Object.assign(new Error(message), {
        code: parsed?.code || 'SUPABASE_ERROR',
        status: response.status
      });
    }
    return response.json();
  }

  async function uploadDataUrlToStorage(collectionName, docId, fieldName, dataUrl) {
    if (typeof dataUrl !== 'string') return null;
    const match = /^data:image\/(png|jpeg);base64,([A-Za-z0-9+/]+={0,2})$/.exec(dataUrl);
    if (!match) return null;
    const ext = match[1] === 'png' ? 'png' : 'jpg';
    const contentType = `image/${match[1]}`;
    const bytes = Buffer.from(match[2], 'base64');
    const safeId = String(docId).replace(/[^a-zA-Z0-9_-]/g, '_');
    const objectPath = `${collectionName}/${safeId}-${fieldName}.${ext}`;

    try {
      const res = await fetcher(`${baseUrl}/storage/v1/object/${bucket}/${objectPath}`, {
        method: 'POST',
        headers: {
          apikey: apiKey,
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': contentType,
          'x-upsert': 'true'
        },
        body: bytes
      });
      if (!res.ok) return null;
      mediaDataUrlCache.set(`${bucket}/${objectPath}`, dataUrl);
      return {
        storage_bucket: bucket,
        storage_path: objectPath,
        storage_mime: contentType,
        storage_url: `${baseUrl}/storage/v1/object/public/${bucket}/${objectPath}`
      };
    } catch {
      return null;
    }
  }

  async function downloadDataUrlFromStorage(targetBucket, objectPath, mimeType = 'image/png') {
    const cacheKey = `${targetBucket}/${objectPath}`;
    if (mediaDataUrlCache.has(cacheKey)) {
      return mediaDataUrlCache.get(cacheKey);
    }
    try {
      const res = await fetcher(`${baseUrl}/storage/v1/object/public/${targetBucket}/${objectPath}`, {
        headers: { apikey: apiKey, Authorization: `Bearer ${apiKey}` }
      });
      if (!res.ok) return null;
      const arrayBuf = await res.arrayBuffer();
      const base64 = Buffer.from(arrayBuf).toString('base64');
      const dataUrl = `data:${mimeType};base64,${base64}`;
      mediaDataUrlCache.set(cacheKey, dataUrl);
      return dataUrl;
    } catch {
      return null;
    }
  }

  async function enrichWriteWithStorage(op) {
    if (op.type === 'delete' || !op.data || !IMAGE_COLLECTIONS.has(op.collection)) {
      return op;
    }
    const nextData = { ...op.data };
    const storageFields = { ...(nextData.storage_fields || {}) };
    for (const field of ['image_data_url', 'instapay_qr_data_url', 'data_url']) {
      if (typeof nextData[field] === 'string' && nextData[field].startsWith('data:image/')) {
        const uploaded = await uploadDataUrlToStorage(op.collection, op.id, field, nextData[field]);
        if (uploaded) {
          nextData.storage_bucket = uploaded.storage_bucket;
          nextData.storage_path = uploaded.storage_path;
          nextData.storage_url = uploaded.storage_url;
          storageFields[field] = {
            bucket: uploaded.storage_bucket,
            path: uploaded.storage_path,
            mime: uploaded.storage_mime,
            url: uploaded.storage_url
          };
          // Offload heavy base64 from the 500MB database table into 1GB Supabase Storage!
          nextData[field] = `__SUPABASE_STORAGE__:${uploaded.storage_path}`;
        }
      }
    }
    if (Object.keys(storageFields).length > 0) {
      nextData.storage_fields = storageFields;
    }
    return { ...op, data: nextData };
  }

  async function hydrateRowFromStorage(collectionName, rawData) {
    if (!rawData || typeof rawData !== 'object' || !IMAGE_COLLECTIONS.has(collectionName)) {
      return rawData;
    }
    let cloned = null;
    for (const field of ['image_data_url', 'instapay_qr_data_url', 'data_url']) {
      const val = rawData[field];
      if (typeof val === 'string' && val.startsWith('__SUPABASE_STORAGE__:')) {
        const meta = rawData.storage_fields?.[field];
        const targetBucket = meta?.bucket || rawData.storage_bucket || bucket;
        const objectPath = meta?.path || val.slice('__SUPABASE_STORAGE__:'.length);
        const mime = meta?.mime || (objectPath.endsWith('.jpg') ? 'image/jpeg' : 'image/png');
        const restored = await downloadDataUrlFromStorage(targetBucket, objectPath, mime);
        if (restored) {
          if (!cloned) cloned = { ...rawData };
          cloned[field] = restored;
        }
      }
    }
    return cloned || rawData;
  }

  async function commitOperations(writes, preconditions = []) {
    if (!writes.length) return;
    const normalizedWrites = writes.map(op => {
      const resolved = resolveCollectionAndId(op.collection, op.id);
      return { ...op, collection: resolved.collection, id: resolved.id };
    });
    const normalizedPreconditions = preconditions
      .filter(cond => cond.exists)
      .map(cond => {
        const resolved = resolveCollectionAndId(cond.collection, cond.id);
        return { ...cond, collection: resolved.collection, id: resolved.id };
      });
    const enrichedWrites = await Promise.all(normalizedWrites.map(enrichWriteWithStorage));
    await rpc('app_commit_writes', {
      p_writes: enrichedWrites,
      p_preconditions: normalizedPreconditions
    });
  }

  function makeDocSnapshot(docRef, row) {
    const exists = Boolean(row?.exists && row?.id != null && row?.data != null);
    const decoded = exists && row.data ? decodeSupabaseValue(row.data) : undefined;
    return {
      id: docRef.id,
      ref: docRef,
      exists,
      _version: Number(row?.version || 0),
      data: () => (exists ? (decodeSupabaseValue(decoded) || {}) : undefined)
    };
  }

  function document(collectionName, rawId) {
    const id = String(rawId ?? generateDocId());
    const path = `${collectionName}/${id}`;
    const resolved = resolveCollectionAndId(collectionName, id);
    const docRef = {
      id,
      path,
      collectionName,
      _storageTable: resolved.collection,
      _storageId: resolved.id,
      async get() {
        const row = await rpc('app_get_doc', { p_collection: resolved.collection, p_id: resolved.id });
        if (row?.exists && row.data) {
          row.data = await hydrateRowFromStorage(resolved.collection, row.data);
        }
        return makeDocSnapshot(docRef, row);
      },
      async create(data) {
        await commitOperations([
          { type: 'create', collection: resolved.collection, id: resolved.id, data: encodeSupabaseValue(data) }
        ]);
      },
      async set(data, options) {
        await commitOperations([
          {
            type: 'set',
            collection: resolved.collection,
            id: resolved.id,
            data: encodeSupabaseValue(data),
            merge: Boolean(options?.merge)
          }
        ]);
      },
      async update(data) {
        await commitOperations([
          { type: 'update', collection: resolved.collection, id: resolved.id, data: encodeSupabaseValue(data) }
        ]);
      },
      async delete() {
        await commitOperations([
          { type: 'delete', collection: resolved.collection, id: resolved.id }
        ]);
      }
    };
    return docRef;
  }

  function collection(name, filters = [], limitVal = Infinity, order = null, cursorId = null) {
    const { tableName, scopePrefix, isSubcollection } = parseCollectionPath(name);
    const query = {
      _isQuery: true,
      collectionName: name,
      doc: id => document(name, id),
      where: (field, operator, value) => {
        if (!['==', 'in', '<=', '>=', '<', '>'].includes(operator)) {
          throw new Error(`Unsupported query operator: ${operator}`);
        }
        return collection(name, [...filters, [field, operator, value]], limitVal, order, cursorId);
      },
      limit: value => collection(name, filters, value, order, cursorId),
      orderBy: (field, direction = 'asc') => collection(name, filters, limitVal, { field, direction }, cursorId),
      startAfter: cursorDoc => {
        const id = typeof cursorDoc === 'string' ? cursorDoc : cursorDoc?.id;
        return collection(name, filters, limitVal, order, id);
      },
      async get() {
        const rows = await rpc('app_list_docs', { p_collection: tableName });
        const hydratedRows = await Promise.all(
          (Array.isArray(rows) ? rows : []).map(async row => ({
            ...row,
            data: await hydrateRowFromStorage(tableName, row.data || {})
          }))
        );
        const scopedRows = isSubcollection && scopePrefix
          ? hydratedRows.filter(row => String(row.id).startsWith(scopePrefix))
          : hydratedRows;

        const decodedEntries = scopedRows.map(row => {
          const userDocId = isSubcollection && scopePrefix && String(row.id).startsWith(scopePrefix)
            ? String(row.id).slice(scopePrefix.length)
            : String(row.id);
          return {
            id: userDocId,
            path: `${name}/${userDocId}`,
            version: Number(row.version || 1),
            rawData: row.data,
            data: decodeSupabaseValue(row.data || {})
          };
        });

        const filtered = decodedEntries.filter(entry =>
          filters.every(([field, operator, value]) =>
            matchesFilter(field === '__name__' ? entry.id : entry.data[field], operator, value)
          ) &&
          (!order || order.field === '__name__' || entry.data[order.field] !== undefined)
        );

        if (order) {
          const dir = order.direction === 'desc' ? -1 : 1;
          filtered.sort((a, b) => {
            if (order.field === '__name__') {
              return a.path.localeCompare(b.path) * dir;
            }
            const cmp = compareValues(a.data[order.field], b.data[order.field]);
            return (cmp !== 0 ? cmp : a.path.localeCompare(b.path)) * dir;
          });
        }

        const startIdx = cursorId
          ? filtered.findIndex(entry => entry.id === String(cursorId)) + 1
          : 0;
        const sliced = filtered.slice(startIdx, startIdx + limitVal);
        const docs = sliced.map(entry => {
          const ref = document(name, entry.id);
          return makeDocSnapshot(ref, {
            id: entry.id,
            exists: true,
            data: entry.rawData,
            version: entry.version
          });
        });

        return {
          docs,
          empty: docs.length === 0,
          size: docs.length
        };
      }
    };
    return query;
  }

  let txQueue = Promise.resolve();

  return {
    collection,
    batch() {
      const writes = [];
      const writer = {
        create(ref, data) {
          const resolved = resolveCollectionAndId(ref.collectionName, ref.id);
          writes.push({ type: 'create', collection: resolved.collection, id: resolved.id, data: encodeSupabaseValue(data) });
          return writer;
        },
        update(ref, data) {
          const resolved = resolveCollectionAndId(ref.collectionName, ref.id);
          writes.push({ type: 'update', collection: resolved.collection, id: resolved.id, data: encodeSupabaseValue(data) });
          return writer;
        },
        set(ref, data, options) {
          const resolved = resolveCollectionAndId(ref.collectionName, ref.id);
          writes.push({
            type: 'set',
            collection: resolved.collection,
            id: resolved.id,
            data: encodeSupabaseValue(data),
            merge: Boolean(options?.merge)
          });
          return writer;
        },
        delete(ref) {
          const resolved = resolveCollectionAndId(ref.collectionName, ref.id);
          writes.push({ type: 'delete', collection: resolved.collection, id: resolved.id });
          return writer;
        },
        async commit() {
          await commitOperations(writes);
        }
      };
      return writer;
    },
    async runTransaction(callback) {
      const previous = txQueue;
      let unlock;
      txQueue = new Promise(resolve => { unlock = resolve; });
      await previous;

      try {
        const maxAttempts = 4;
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
          const writes = [];
          const preconditions = new Map();

          const tx = {
            async get(target) {
              if (writes.length > 0) {
                throw new Error('Firestore transactions require all reads to be executed before all writes.');
              }
              const result = await target.get();
              if (target._isQuery) {
                for (const docSnap of result.docs) {
                  const resolved = resolveCollectionAndId(docSnap.ref.collectionName, docSnap.id);
                  const key = `${resolved.collection}/${resolved.id}`;
                  if (!preconditions.has(key)) {
                    preconditions.set(key, {
                      collection: resolved.collection,
                      id: resolved.id,
                      exists: true,
                      version: docSnap._version
                    });
                  }
                }
              } else if (target.collectionName && target.id) {
                const resolved = resolveCollectionAndId(target.collectionName, target.id);
                const key = `${resolved.collection}/${resolved.id}`;
                if (!preconditions.has(key)) {
                  preconditions.set(key, {
                    collection: resolved.collection,
                    id: resolved.id,
                    exists: result.exists,
                    version: result._version
                  });
                }
              }
              return result;
            },
            create(ref, data) {
              const resolved = resolveCollectionAndId(ref.collectionName, ref.id);
              writes.push({ type: 'create', collection: resolved.collection, id: resolved.id, data: encodeSupabaseValue(data) });
            },
            update(ref, data) {
              const resolved = resolveCollectionAndId(ref.collectionName, ref.id);
              writes.push({ type: 'update', collection: resolved.collection, id: resolved.id, data: encodeSupabaseValue(data) });
            },
            set(ref, data, options) {
              const resolved = resolveCollectionAndId(ref.collectionName, ref.id);
              writes.push({
                type: 'set',
                collection: resolved.collection,
                id: resolved.id,
                data: encodeSupabaseValue(data),
                merge: Boolean(options?.merge)
              });
            },
            delete(ref) {
              const resolved = resolveCollectionAndId(ref.collectionName, ref.id);
              writes.push({ type: 'delete', collection: resolved.collection, id: resolved.id });
            }
          };

          try {
            const output = await callback(tx);
            if (writes.length > 0) {
              await commitOperations(writes, [...preconditions.values()]);
            }
            return output;
          } catch (error) {
            const isConflict = String(error?.message || '').includes('TRANSACTION_CONFLICT');
            if (isConflict && attempt < maxAttempts) {
              continue;
            }
            throw error;
          }
        }
      } finally {
        unlock();
      }
    },
    settings() {},
    async terminate() {}
  };
}
