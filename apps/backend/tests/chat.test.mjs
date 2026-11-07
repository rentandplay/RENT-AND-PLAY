import test from 'node:test';
import assert from 'node:assert/strict';
import { memoryFirestore } from './support/memory-firestore.mjs';
import { openChat, listChats, chatMessages, sendChatMessage, readChat, setChatStatus } from '../src/chat.mjs';
import { listNotifications } from '../src/notifications.mjs';
import { createApi, createFirebaseServices } from '../src/server.mjs';

const customer = { id: 'alice', role: 'USER', full_name: 'Alice', is_active: true };
const other = { ...customer, id: 'bob' }, admin = { id: 'staff', role: 'ADMIN', full_name: 'Support', is_active: true };
const now = new Date('2026-11-07T12:00:00Z');
const input = (n, text = 'Rental question') => ({ text, requestKey: n.toString(16).padStart(32, '0') });
const status = value => e => e.status === value;
const fixture = () => memoryFirestore({ users: { alice: customer, bob: other, staff: admin }, rentals: { r1: { customer_id: 'alice', item_name: 'Console', rental_code: 'RN-001' } } });

test('one conversation per customer and rental; other customer rentals stay private', async () => {
  const db = fixture();
  const [a,b] = await Promise.all([openChat(db, customer, {}, now), openChat(db, customer, {}, now)]);
  assert.equal(a.thread.id, b.thread.id); assert.equal(db.records('chat_threads').length, 1);
  const rental = await openChat(db, customer, { rentalId: 'r1' }, now);
  assert.equal(rental.thread.rental_code, 'RN-001');
  await assert.rejects(openChat(db, other, { rentalId: 'r1' }, now), status(404));
  await assert.rejects(openChat(db, admin, {}, now), status(403));
  assert.equal((await listChats(db, other)).threads.length, 0);
  for (const action of [() => chatMessages(db, other, a.thread.id), () => sendChatMessage(db, other, a.thread.id, input(1)), () => readChat(db, other, a.thread.id, { through: 1 })]) await assert.rejects(action(), status(404));
  await assert.rejects(setChatStatus(db, customer, a.thread.id, { status: 'RESOLVED' }), status(403));
});

test('persist before acknowledgement; retries create one message and one durable alert', async () => {
  const db = fixture(), { thread } = await openChat(db, customer, {}, now);
  const [a,b] = await Promise.all([sendChatMessage(db, customer, thread.id, input(1), now), sendChatMessage(db, customer, thread.id, input(1), now)]);
  assert.equal(a.message.id, b.message.id); assert.equal(b.duplicate, true);
  assert.equal(db.records('chat_messages').length, 1); assert.equal(db.records('notification_outbox').length, 1);
  assert.equal(db.data('chat_limits', db.records('chat_limits').find(row => row.id.startsWith('send_')).id).count, 1);
  await assert.rejects(sendChatMessage(db, customer, thread.id, input(1, 'Changed text'), now), status(409));
  const inbox = await listNotifications(db, admin);
  assert.equal(inbox.notifications[0].thread_id, thread.id);
  assert.equal(inbox.notifications[0].page, 'Messages');
  assert.equal(inbox.notifications[0].message.includes('Rental question'), false);
});

test('concurrent sends have strict sequence, sender identity comes from authenticated actor', async () => {
  const db = fixture(), { thread } = await openChat(db, customer, {}, now);
  await Promise.all(Array.from({ length: 15 }, (_, i) => sendChatMessage(db, customer, thread.id, { ...input(i), sender_id: admin.id, sender_role: 'STAFF' }, now)));
  const result = await chatMessages(db, admin, thread.id);
  assert.deepEqual(result.messages.map(r => r.seq), Array.from({ length: 15 }, (_, i) => i+1));
  assert.ok(result.messages.every(r => r.sender_id === customer.id && r.sender_role === 'CUSTOMER'));
  assert.equal(result.thread.unread_count, 15);
});

test('read cursors are monotonic and only mark loaded messages, staff reads are shared', async () => {
  const db = fixture(), { thread } = await openChat(db, customer, {}, now);
  await sendChatMessage(db, customer, thread.id, input(1), now);
  await sendChatMessage(db, admin, thread.id, input(2), now);
  assert.equal((await listChats(db, customer)).threads[0].unread_count, 1);
  await readChat(db, customer, thread.id, { through: 2 });
  await readChat(db, customer, thread.id, { through: 1 });
  const page = await chatMessages(db, admin, thread.id);
  assert.equal(page.thread.customer_read_seq, 2);
  await assert.rejects(readChat(db, customer, thread.id, { through: 3 }), status(400));
  await sendChatMessage(db, admin, thread.id, input(3), now);
  assert.equal((await listChats(db, customer)).threads[0].unread_count, 1);
  await readChat(db, admin, thread.id, { through: 1 });
  assert.equal((await listChats(db, { ...admin, id: 'secondStaff' })).threads[0].unread_count, 0);
});

test('resolve/reopen workflow keeps history and permits customer follow-up', async () => {
  const db = fixture(), { thread } = await openChat(db, customer, {}, now);
  await sendChatMessage(db, customer, thread.id, input(1), now);
  await setChatStatus(db, admin, thread.id, { status: 'RESOLVED' }, now);
  await assert.rejects(sendChatMessage(db, admin, thread.id, input(2), now), status(409));
  assert.equal((await listChats(db, admin, { status: 'RESOLVED' })).threads.length, 1);
  await sendChatMessage(db, customer, thread.id, input(3), now);
  assert.equal((await chatMessages(db, customer, thread.id)).thread.status, 'OPEN');
  assert.equal(db.records('chat_messages').length, 2);
});

test('durable rate limits reject floods without partial messages or notifications', async () => {
  const db = fixture(), { thread } = await openChat(db, customer, {}, now);
  for (let n=0;n<20;n++) await sendChatMessage(db, customer, thread.id, input(n), now);
  await assert.rejects(sendChatMessage(db, customer, thread.id, input(21), now), status(429));
  assert.equal(db.records('chat_messages').length, 20); assert.equal(db.records('notification_outbox').length, 20);
  assert.equal((await sendChatMessage(db, customer, thread.id, input(0), now)).duplicate, true);
  await sendChatMessage(db, customer, thread.id, input(21), new Date(now.getTime()+60000));
});

test('paged history and reconnect catch-up have no gaps or duplicate ordering', async () => {
  const db = fixture(), { thread } = await openChat(db, customer, {}, now);
  for (let n=1;n<=115;n++) await sendChatMessage(db, admin, thread.id, input(n), new Date(now.getTime()+n*60000));
  const latest = await chatMessages(db, customer, thread.id);
  assert.equal(latest.messages[0].seq, 66); assert.equal(latest.next_cursor, '66');
  const old = await chatMessages(db, customer, thread.id, { before: latest.next_cursor });
  assert.equal(old.messages[0].seq, 16); assert.equal(old.messages.at(-1).seq, 65);
  const catchup = await chatMessages(db, customer, thread.id, { after: '1' });
  assert.equal(catchup.messages[0].seq, 2); assert.equal(catchup.messages.at(-1).seq, 51); assert.equal(catchup.has_more, true);
  const next = await chatMessages(db, customer, thread.id, { after: catchup.next_cursor });
  assert.equal(next.messages[0].seq, 52);
});

test('validates content and cursors; HTML stays inert text', async () => {
  const db = fixture(), { thread } = await openChat(db, customer, {}, now);
  for (const text of ['', ' ', 'x'.repeat(2001), '\u0000']) await assert.rejects(sendChatMessage(db, customer, thread.id, input(1,text), now), status(400));
  await assert.rejects(sendChatMessage(db, customer, thread.id, { text: 'Hello' }, now), status(400));
  await assert.rejects(chatMessages(db, customer, thread.id, { after: '-1' }), status(400));
  const result = await sendChatMessage(db, customer, thread.id, input(1,'<script>alert(1)</script>'), now);
  assert.equal(result.message.text, '<script>alert(1)</script>');
});

test('HTTP endpoints support bearer and cookie auth, deny anonymous, inactive and cross-origin writes', async () => {
  const db = fixture(), services = createFirebaseServices({ db, auth: {}, now: () => now });
  services.verifyMobileToken = async token => token === 'alice' ? { uid: 'alice' } : null;
  let uploadUid;
  services.uploadProfilePhoto = async uid => { uploadUid = uid; return 'https://example.supabase.co/photo.png'; };
  const server = createApi({ services, sessions: { verify: async token => token === 'staff' ? { uid: 'staff' } : null }, expiryWorker: false, notificationWorker: false });
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
  const base = `http://127.0.0.1:${server.address().port}/api/chat/threads`;
  const headers = { Authorization: 'Bearer alice', 'Content-Type':'application/json' };
  try {
    assert.equal((await fetch(base)).status,401);
    assert.equal((await fetch(base,{ method:'POST',headers:{...headers,Origin:'https://evil.example'},body:'{}' })).status,403);
    const result = await fetch(base,{ method:'POST',headers,body:'{}' }); assert.equal(result.status,200);
    const {thread} = await result.json();
    assert.equal((await fetch(`${base}/${thread.id}/messages`,{ method:'POST',headers,body:JSON.stringify(input(1)) })).status,201);
    const staffResponse = await fetch(base,{ headers:{Cookie:'rent_play_session=staff'} });
    assert.equal(staffResponse.status,200); assert.equal((await staffResponse.json()).threads[0].unread_count,1);
    const photoUrl = `http://127.0.0.1:${server.address().port}/api/mobile/profile/photo`;
    assert.equal((await fetch(photoUrl, { method:'POST',headers:{'Content-Type':'application/json'},body:'{}' })).status,401);
    assert.equal((await fetch(photoUrl, { method:'POST',headers,body:JSON.stringify({dataUrl:'data:image/png;base64,YmFk'}) })).status,400);
    const photo = await fetch(photoUrl, { method:'POST',headers,body:JSON.stringify({uid:'bob',dataUrl:'data:image/png;base64,iVBORw0KGgo='}) });
    assert.equal(photo.status,200); assert.equal(uploadUid,'alice');
    await db.collection('users').doc('alice').update({ is_active:false }); services.invalidateReadCache(['users']);
    assert.equal((await fetch(base,{headers})).status,403);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
