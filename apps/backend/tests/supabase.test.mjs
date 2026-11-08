import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createSupabaseFirestore,
  decodeSupabaseValue,
  encodeSupabaseValue,
  normalizeSupabaseUrl
} from '../src/supabase.mjs';

function createMockSupabaseServer() {
  const tables = new Map();
  const storageObjects = new Map();

  function getTable(name) {
    if (!name || !/^[a-z0-9_]+$/.test(name)) {
      throw new Error(`Invalid collection name: ${name}`);
    }
    if (!tables.has(name)) tables.set(name, new Map());
    return tables.get(name);
  }

  async function fetcher(url, options = {}) {
    const parsed = new URL(url);

    // Storage upload endpoint: /storage/v1/object/<bucket>/<path>
    if (parsed.pathname.startsWith('/storage/v1/object/')) {
      const rest = parsed.pathname.slice('/storage/v1/object/'.length);
      storageObjects.set(rest, {
        contentType: options.headers?.['Content-Type'],
        size: options.body?.length || 0
      });
      return {
        ok: true,
        status: 200,
        json: async () => ({ Key: rest }),
        text: async () => JSON.stringify({ Key: rest })
      };
    }

    // RPC endpoints: /rest/v1/rpc/<fnName>
    if (parsed.pathname.startsWith('/rest/v1/rpc/')) {
      const fnName = parsed.pathname.slice('/rest/v1/rpc/'.length);
      const body = JSON.parse(options.body || '{}');

      if (fnName === 'app_get_doc') {
        const table = getTable(body.p_collection);
        const row = table.get(body.p_id);
        const payload = row
          ? { id: body.p_id, exists: true, data: structuredClone(row.data), version: row.version }
          : { id: body.p_id, exists: false, data: null, version: 0 };
        return { ok: true, status: 200, json: async () => payload, text: async () => JSON.stringify(payload) };
      }

      if (fnName === 'app_list_docs') {
        const table = getTable(body.p_collection);
        const rows = [...table.entries()]
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([id, row]) => ({ id, data: structuredClone(row.data), version: row.version }));
        return { ok: true, status: 200, json: async () => rows, text: async () => JSON.stringify(rows) };
      }

      if (fnName === 'app_commit_writes') {
        for (const cond of body.p_preconditions || []) {
          const table = getTable(cond.collection);
          const row = table.get(cond.id);
          const exists = Boolean(row);
          const version = row?.version || 0;
          if (exists !== Boolean(cond.exists) || (exists && version !== Number(cond.version))) {
            const err = { message: `TRANSACTION_CONFLICT: ${cond.collection}/${cond.id} changed` };
            return { ok: false, status: 409, json: async () => err, text: async () => JSON.stringify(err) };
          }
        }

        for (const op of body.p_writes || []) {
          const table = getTable(op.collection);
          if (op.type === 'delete') {
            table.delete(op.id);
          } else if (op.type === 'create') {
            if (table.has(op.id)) {
              const err = { message: `Document exists: ${op.collection}/${op.id}` };
              return { ok: false, status: 409, json: async () => err, text: async () => JSON.stringify(err) };
            }
            table.set(op.id, { data: structuredClone(op.data), version: 1 });
          } else if (op.type === 'update') {
            if (!table.has(op.id)) {
              const err = { message: `Missing document: ${op.collection}/${op.id}` };
              return { ok: false, status: 404, json: async () => err, text: async () => JSON.stringify(err) };
            }
            const current = table.get(op.id);
            table.set(op.id, {
              data: structuredClone({ ...current.data, ...op.data }),
              version: current.version + 1
            });
          } else if (op.type === 'set') {
            const current = table.get(op.id);
            const nextData = op.merge && current ? { ...current.data, ...op.data } : op.data;
            table.set(op.id, {
              data: structuredClone(nextData),
              version: (current?.version || 0) + 1
            });
          }
        }

        const out = { ok: true, committed: (body.p_writes || []).length };
        return { ok: true, status: 200, json: async () => out, text: async () => JSON.stringify(out) };
      }
    }

    return { ok: false, status: 404, json: async () => ({}), text: async () => 'Not found' };
  }

  return { fetcher, tables, storageObjects };
}

test('chat queries send ownership, ordering and limits to PostgreSQL instead of listing all messages', async () => {
  const calls = [];
  const db = createSupabaseFirestore({ url: 'https://example.supabase.co', serviceRoleKey: 'test-key', fetcher: async (url, options) => {
    calls.push({ url, body: JSON.parse(options.body) });
    return { ok: true, json: async () => [{ id:'m2', version:1, data:{thread_id:'c_1',seq:2,text:'Saved'} }] };
  } });
  const result = await db.collection('chat_messages').where('thread_id','==','c_1').where('seq','>',1).orderBy('seq','asc').limit(51).get();
  assert.equal(calls.length,1); assert.match(calls[0].url,/app_chat_list_docs$/);
  assert.deepEqual(calls[0].body, { p_collection:'chat_messages',p_filters:[['thread_id','==','c_1'],['seq','>',1]],p_order:{field:'seq',direction:'asc'},p_limit:51 });
  assert.equal(result.docs[0].data().seq,2);
});

test('nonexistent document reads do not produce failing nonexistence preconditions and retry on document existence conflicts', async () => {
  const commits = [];
  let attempts = 0;
  const db = createSupabaseFirestore({ url: 'https://example.supabase.co', serviceRoleKey: 'test-key', fetcher: async (url, options) => {
    const input = JSON.parse(options.body);
    if (url.endsWith('/app_commit_writes')) {
      commits.push(input);
      attempts++;
      return { ok: false, status: 409, json: async () => ({ message: 'Document exists: chat_threads/c_1' }), text: async () => JSON.stringify({ message: 'Document exists: chat_threads/c_1' }) };
    }
    return { ok: true, json: async () => (attempts > 0 ? { id: input.p_id, exists: true, data: { status: 'OPEN' }, version: 1 } : { id: input.p_id, exists: false, data: null, version: 0 }) };
  } });
  let loopCount = 0;
  const result = await db.runTransaction(async tx => {
    loopCount++;
    const ref = db.collection('chat_threads').doc('c_1');
    const existing = await tx.get(ref);
    if (existing.exists) return existing.data();
    tx.create(ref, { id: 'c_1', status: 'OPEN' });
    return { id: 'c_1' };
  });
  assert.deepEqual(commits[0].p_preconditions, []);
  assert.equal(loopCount, 2);
  assert.equal(result.status, 'OPEN');
});

test('opaque secret keys use the apikey header without being sent as a JWT', async () => {
  const calls = [];
  const db = createSupabaseFirestore({ url: 'https://example.supabase.co', serviceRoleKey: 'sb_secret_fixture_only', fetcher: async (url, options) => {
    calls.push(options.headers);
    return { ok:true,json:async()=>({id:'u1',exists:false,data:null,version:0}) };
  } });
  await db.collection('users').doc('u1').get();
  assert.equal(calls[0].apikey,'sb_secret_fixture_only');
  assert.equal(calls[0].Authorization,undefined);
});

test('normalizeSupabaseUrl strips trailing /rest/v1/ and slashes', () => {
  assert.equal(
    normalizeSupabaseUrl('https://yuhforhnrnfpzzhulgzt.supabase.co/rest/v1/'),
    'https://yuhforhnrnfpzzhulgzt.supabase.co'
  );
});

test('encodeSupabaseValue and decodeSupabaseValue preserve Dates and strip undefined properties', () => {
  const now = new Date('2026-10-18T08:00:00.000Z');
  const encoded = encodeSupabaseValue({
    name: 'PS5 Bundle',
    created_at: now,
    ignored: undefined,
    nested: { updated_at: now, skipped: undefined }
  });

  assert.deepEqual(encoded, {
    name: 'PS5 Bundle',
    created_at: { __timestamp__: '2026-10-18T08:00:00.000Z' },
    nested: { updated_at: { __timestamp__: '2026-10-18T08:00:00.000Z' } }
  });

  const decoded = decodeSupabaseValue(encoded);
  assert.ok(decoded.created_at instanceof Date);
  assert.equal(decoded.created_at.toISOString(), '2026-10-18T08:00:00.000Z');
  assert.ok(decoded.nested.updated_at instanceof Date);
  assert.equal('ignored' in decoded, false);
});

test('createSupabaseFirestore supports CRUD, queries, transactions, and automatic Storage uploads', async () => {
  const mock = createMockSupabaseServer();
  const db = createSupabaseFirestore({
    url: 'https://yuhforhnrnfpzzhulgzt.supabase.co/rest/v1/',
    serviceRoleKey: 'test-service-role-key',
    bucket: 'rental-media',
    fetcher: mock.fetcher
  });

  const t1 = new Date('2026-10-18T01:00:00.000Z');
  const t2 = new Date('2026-10-18T02:00:00.000Z');

  await db.collection('rentals').doc('r1').create({
    rental_code: 'R-0001',
    status: 'PENDING',
    created_at: t1
  });
  await db.collection('rentals').doc('r2').create({
    rental_code: 'R-0002',
    status: 'ACTIVE',
    created_at: t2
  });

  const activeSnap = await db.collection('rentals').where('status', '==', 'ACTIVE').get();
  assert.equal(activeSnap.size, 1);
  assert.equal(activeSnap.docs[0].id, 'r2');
  assert.ok(activeSnap.docs[0].data().created_at instanceof Date);

  // Test transaction update
  await db.runTransaction(async tx => {
    const doc = await tx.get(db.collection('rentals').doc('r1'));
    assert.equal(doc.exists, true);
    tx.update(doc.ref, { status: 'APPROVED' });
  });

  const updated = await db.collection('rentals').doc('r1').get();
  assert.equal(updated.data().status, 'APPROVED');

  // Test automatic image upload to Supabase Storage for payment proof
  const onePixelPng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  await db.collection('rental_payment_proofs').doc('r1').set({
    rental_id: 'r1',
    image_data_url: onePixelPng,
    status: 'PENDING_REVIEW'
  });

  const proofSnap = await db.collection('rental_payment_proofs').doc('r1').get();
  assert.equal(proofSnap.data().storage_bucket, 'rental-media');
  assert.equal(proofSnap.data().storage_path, 'rental_payment_proofs/r1-image_data_url.png');
  assert.ok(mock.storageObjects.has('rental-media/rental_payment_proofs/r1-image_data_url.png'));
});

test('createSupabaseFirestore seamlessly maps nested subcollections like notification_inboxes/.../messages', async () => {
  const mock = createMockSupabaseServer();
  const db = createSupabaseFirestore({
    url: 'https://yuhforhnrnfpzzhulgzt.supabase.co/rest/v1/',
    serviceRoleKey: 'test-service-role-key',
    bucket: 'rental-media',
    fetcher: mock.fetcher
  });

  const customerKey = 'customer_walkin_3141b16136254769b815faf75da0de6a';
  const subcollectionName = `notification_inboxes/${customerKey}/messages`;

  // 1. Transactional write to subcollection
  await db.runTransaction(async tx => {
    tx.create(db.collection(subcollectionName).doc('n_msg1'), {
      type: 'BOOKING_APPROVED',
      title: 'Rental request approved',
      message: 'Your walkin rental is ready.',
      created_at: new Date('2026-10-18T10:00:00Z')
    });
    tx.create(db.collection(subcollectionName).doc('n_msg2'), {
      type: 'RENTAL_RELEASED',
      title: 'Rental started',
      message: 'Timer started.',
      created_at: new Date('2026-10-18T10:05:00Z')
    });
  });

  // Check underlying SQL table name has no slashes
  assert.ok(mock.tables.has('notification_inboxes_messages'));
  assert.equal(mock.tables.has(subcollectionName), false);

  // 2. Read single document from subcollection
  const msgDoc = await db.collection(subcollectionName).doc('n_msg1').get();
  assert.equal(msgDoc.exists, true);
  assert.equal(msgDoc.id, 'n_msg1');
  assert.equal(msgDoc.data().title, 'Rental request approved');

  // 3. Query documents in subcollection
  const listSnap = await db.collection(subcollectionName).orderBy('created_at', 'desc').get();
  assert.equal(listSnap.size, 2);
  assert.equal(listSnap.docs[0].id, 'n_msg2');
  assert.equal(listSnap.docs[1].id, 'n_msg1');

  // 4. Isolation: another customer inbox has 0 messages
  const otherSnap = await db.collection('notification_inboxes/customer_other_999/messages').get();
  assert.equal(otherSnap.size, 0);
});

