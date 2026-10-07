import { firestore, requireFirebaseConfig } from '../src/firebase.mjs';
import { inventoryList } from '../src/inventory.mjs';
import { mobileCatalog, resolveMobileItem } from '../src/mobile.mjs';

try {
  requireFirebaseConfig();
  const [admin, mobile] = await Promise.all([inventoryList(firestore), mobileCatalog(firestore)]);
  const expected = admin.items.filter(item => item.is_active !== false && typeof item.name === 'string' && item.name.trim());
  const expectedIds = expected.map(item => item.id).sort(), mobileIds = mobile.items.map(item => item.id).sort();
  if (new Set(mobileIds).size !== mobileIds.length || mobileIds.some(id => !expectedIds.includes(id))) throw Error('Mobile catalog includes duplicated IDs or equipment absent from active admin inventory.');
  for (const item of mobile.items) {
    if (item.can_rent && item.status !== 'AVAILABLE') throw Error(`Unavailable equipment is rentable: ${item.id}`);
    if (item.qr_token && mobile.items.filter(row => row.qr_token?.toLowerCase() === item.qr_token.toLowerCase()).length !== 1) throw Error(`Equipment QR token is ambiguous: ${item.id}`);
  }
  const labeled = mobile.items.find(item => item.qr_token);
  if (labeled && (await resolveMobileItem(firestore, { code: labeled.qr_token })).item.id !== labeled.id) throw Error('Equipment QR lookup failed.');
  console.log(`Verified Firebase project ${process.env.FIREBASE_PROJECT_ID}: ${admin.items.length} admin records, ${mobile.items.length} configured customer catalog records, matching admin equipment IDs.`);
  const hidden = expected.filter(item => !mobileIds.includes(item.id));
  console.log(`${mobile.items.filter(item => item.can_rent).length} available and configured for rental; ${hidden.length} active records hidden from customers until rates and required deposits are configured.`);
  if (hidden.length) console.log('Equipment requiring configuration: ' + hidden.map(item => item.name).join(', '));
  const rentals = await firestore.collection('rentals').get();
  const active = rentals.docs.map(doc => doc.data()).filter(row => ['ACTIVE', 'PENDING_ESP32_RETURN', 'PENDING_RETURN_VERIFICATION'].includes(String(row.status).toUpperCase()));
  const incomplete = active.filter(row => !row.fee_breakdown?.snapshot_version);
  console.log(`${active.length} active/returning rental records; ${incomplete.length} legacy records need original fee details reviewed before final charges can be confirmed.`);
} catch (error) {
  console.error(`Integration check failed (${error.code || 'INTEGRATION'}): ${error.message}`);
  process.exitCode = 1;
} finally { await firestore.terminate(); }
