import { firestore, requireFirebaseConfig } from '../src/firebase.mjs';
import { inventoryList } from '../src/inventory.mjs';
import { mobileCatalog, resolveMobileItem } from '../src/mobile.mjs';

try {
  requireFirebaseConfig();
  const [admin, mobile] = await Promise.all([inventoryList(firestore), mobileCatalog(firestore)]);
  const activeUnits = admin.items.filter(item => item.is_active !== false && typeof item.name === 'string' && item.name.trim());
  const expected = new Map(activeUnits.map(item => [String(item.stock_group_id || item.id), item]));
  const mobileIds = mobile.items.map(item => String(item.stock_group_id || item.id));
  if (new Set(mobileIds).size !== mobileIds.length || mobileIds.some(id => !expected.has(id))) throw Error('Mobile catalog includes duplicated groups or equipment absent from active admin inventory.');
  for (const item of mobile.items) {
    if (item.can_rent && item.status !== 'AVAILABLE') throw Error(`Unavailable equipment is rentable: ${item.id}`);
    if (item.qr_token && mobile.items.filter(row => row.qr_token?.toLowerCase() === item.qr_token.toLowerCase()).length !== 1) throw Error(`Equipment QR token is ambiguous: ${item.id}`);
    const group = expected.get(String(item.stock_group_id || item.id));
    for (const field of ['total_quantity', 'available_quantity', 'reserved_quantity', 'rented_quantity', 'maintenance_quantity']) {
      if (item[field] !== group[field]) throw Error(`Mobile and admin stock differ for ${item.id}: ${field}`);
    }
  }
  const labeled = activeUnits.find(item => item.qr_token && mobileIds.includes(String(item.stock_group_id || item.id)));
  if (labeled) {
    const resolved = (await resolveMobileItem(firestore, { code: labeled.qr_token })).item;
    if (resolved.id !== String(labeled.stock_group_id || labeled.id) || resolved.scanned_unit_id !== labeled.id) throw Error('Equipment QR lookup does not preserve its group and physical unit.');
  }
  console.log(`Verified Firebase project ${process.env.FIREBASE_PROJECT_ID}: ${activeUnits.length} active physical units in ${expected.size} equipment groups, ${mobile.items.length} configured customer groups; matching group IDs, stock and scanned unit IDs.`);
  const hidden = [...expected.entries()].filter(([id]) => !mobileIds.includes(id)).map(([, item]) => item);
  console.log(`${mobile.items.filter(item => item.can_rent).length} groups available and configured for rental; ${hidden.length} equipment groups hidden until rental rates are configured.`);
  if (hidden.length) console.log('Equipment requiring configuration: ' + hidden.map(item => item.name).join(', '));
  const rentals = await firestore.collection('rentals').get();
  const active = rentals.docs.map(doc => doc.data()).filter(row => ['ACTIVE', 'RETURN_PENDING_INSPECTION', 'PENDING_ESP32_RETURN', 'PENDING_RETURN_VERIFICATION'].includes(String(row.status).toUpperCase()));
  const incomplete = active.filter(row => !row.fee_breakdown?.snapshot_version);
  console.log(`${active.length} active/returning rental records; ${incomplete.length} legacy records need original fee details reviewed before final charges can be confirmed.`);
} catch (error) {
  console.error(`Integration check failed (${error.code || 'INTEGRATION'}): ${error.message}`);
  process.exitCode = 1;
} finally { await firestore.terminate(); }
