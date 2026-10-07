import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { firestore, requireFirebaseConfig } from '../src/firebase.mjs';
import { equipmentItemCode } from '../src/inventory.mjs';

const applying = process.argv.includes('--apply');
const timestampSafe = value => JSON.parse(JSON.stringify(value, (_key, child) => typeof child?.toDate === 'function' ? child.toDate().toISOString() : child));

async function readCollection(name) {
  const snapshot = await firestore.collection(name).get();
  return snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));
}

async function commitOperations(operations) {
  for (let start = 0; start < operations.length; start += 400) {
    const batch = firestore.batch();
    for (const operation of operations.slice(start, start + 400)) operation(batch);
    await batch.commit();
  }
}

function makeBackupPath() {
  const stamp = new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-');
  return join(process.cwd(), 'backups', `equipment-codes-before-rent-format-${stamp}.json`);
}

async function main() {
  requireFirebaseConfig();
  const [items, codes, counterSnapshot] = await Promise.all([
    readCollection('items'),
    readCollection('item_codes'),
    firestore.collection('counters').doc('item_codes_RENT').get()
  ]);
  const orderedItems = items.sort((a, b) =>
    String(a.name || '').localeCompare(String(b.name || ''), 'en') || String(a.id).localeCompare(String(b.id), 'en'));
  const itemIds = new Set(orderedItems.map(item => String(item.id)));
  const codeById = new Map(codes.map(code => [String(code.id), code]));
  const targetCodes = new Set(orderedItems.map((_item, index) => equipmentItemCode(index + 1)));

  for (const code of targetCodes) {
    const registered = codeById.get(code);
    if (registered?.item_id && !itemIds.has(String(registered.item_id))) {
      throw new Error(`Cannot assign ${code}; it is reserved for equipment ${registered.item_id}, which is not in the current inventory.`);
    }
  }

  const highestReservedSequence = codes.reduce((highest, row) => {
    const match = /^RENT-(\d+)$/i.exec(String(row.id));
    return match ? Math.max(highest, Number(match[1])) : highest;
  }, 0);
  const nextSequence = Math.max(orderedItems.length, highestReservedSequence) + 1;
  console.log(`Found ${orderedItems.length} equipment items and ${codes.length} registered item codes.`);
  console.log('Planned equipment codes (alphabetical by item name):');
  orderedItems.forEach((item, index) => {
    const nextCode = equipmentItemCode(index + 1);
    console.log(`  ${item.item_code || item.qrCode || '(no code)'} -> ${nextCode}  ${item.name || item.id}`);
  });
  console.log(`The shared web/mobile counter will continue at ${equipmentItemCode(nextSequence)}.`);
  if (!applying) {
    console.log('Dry run only. Review the mapping, then rerun with --apply to write the changes.');
    return;
  }

  const backupPath = makeBackupPath();
  await mkdir(dirname(backupPath), { recursive: true });
  await writeFile(backupPath, `${JSON.stringify(timestampSafe({
    created_at: new Date(),
    collections: { items, item_codes: codes },
    rent_counter: counterSnapshot.exists ? counterSnapshot.data() : null
  }), null, 2)}\n`, 'utf8');
  console.log(`Saved a backup to ${backupPath}.`);

  const now = new Date();
  await firestore.collection('counters').doc('item_codes_RENT').set({ next_sequence: nextSequence, updated_at: now }, { merge: true });

  const writes = [];
  orderedItems.forEach((item, index) => {
    const nextCode = equipmentItemCode(index + 1);
    const oldCodes = new Set([item.item_code, item.qrCode].filter(value => typeof value === 'string' && value));
    const oldQrToken = typeof item.qr_token === 'string' && item.qr_token ? item.qr_token : item.qrCode || item.item_code || nextCode;
    writes.push(batch => batch.update(firestore.collection('items').doc(item.id), {
      item_code: nextCode,
      qrCode: nextCode,
      qr_token: oldQrToken,
      updated_at: now
    }));
    const codeRef = firestore.collection('item_codes').doc(nextCode);
    writes.push(batch => batch.set(codeRef, { item_id: item.id, created_at: now }));
    for (const oldCode of oldCodes) {
      if (!targetCodes.has(oldCode) && codeById.get(oldCode)?.item_id === item.id) {
        writes.push(batch => batch.delete(firestore.collection('item_codes').doc(oldCode)));
      }
    }
    const auditRef = firestore.collection('audit_logs').doc();
    writes.push(batch => batch.create(auditRef, {
      user_id: 'equipment-code-migration', actor_type: 'SYSTEM',
      action: 'ITEM_CODE_CHANGED', entity_type: 'ITEM', entity_id: item.id,
      old_values: { item_code: item.item_code || null, qrCode: item.qrCode || null },
      new_values: { item_code: nextCode, qrCode: nextCode, preserved_qr_token: oldQrToken },
      created_at: now
    }));
  });
  await commitOperations(writes);
  console.log(`Updated ${orderedItems.length} equipment items. Existing QR scan tokens remain valid.`);
}

try {
  await main();
} catch (error) {
  console.error(`Equipment code migration failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  await firestore.terminate();
}
