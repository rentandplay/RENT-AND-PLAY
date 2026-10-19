import { readFile, writeFile } from 'node:fs/promises';
import nodePath from 'node:path';
import { fileURLToPath } from 'node:url';
import { nativeFirestore, supabaseFirestore } from '../src/firebase.mjs';
import { decodeSupabaseValue, isSupabaseConfigured, normalizeSupabaseUrl } from '../src/supabase.mjs';

const COLLECTIONS = [
  'users',
  'customers',
  'customer_identity_keys',
  'email_registration_otps',
  'password_reset_otps',
  'items',
  'item_categories',
  'item_rates',
  'item_codes',
  'item_status_history',
  'item_condition_records',
  'item_condition_photos',
  'stock_groups',
  'rentals',
  'rental_payment_proofs',
  'rental_extension_operations',
  'voided_rentals',
  'verification_requests',
  'terminals',
  'maintenance_records',
  'maintenance_photos',
  'payment_ledger',
  'financial_daily',
  'rental_financial_daily',
  'rental_payment_totals',
  'rental_daily',
  'equipment_rental_totals',
  'equipment_rental_daily',
  'rental_report_snapshots',
  'customer_report_summaries',
  'report_jobs',
  'report_summary_state',
  'notification_devices',
  'notification_inboxes',
  'notification_outbox',
  'counters',
  'audit_logs',
  'settings'
];

const backupPath = nodePath.resolve(
  fileURLToPath(new URL('../backups/firestore-full-export.json', import.meta.url))
);

async function loadExportData() {
  try {
    const raw = await readFile(backupPath, 'utf8');
    console.log(`Loaded local backup from ${backupPath}`);
    return JSON.parse(raw);
  } catch {
    console.log('No local backup found; exporting directly from Firebase Firestore...');
    const exported = {};
    for (const col of COLLECTIONS) {
      const snap = await nativeFirestore.collection(col).get();
      exported[col] = {};
      for (const doc of snap.docs) {
        exported[col][doc.id] = doc.data();
      }
    }
    await writeFile(
      backupPath,
      JSON.stringify(
        exported,
        (_k, v) => (v && typeof v.toDate === 'function' ? { __timestamp__: v.toDate().toISOString() } : v),
        2
      )
    );
    return JSON.parse(await readFile(backupPath, 'utf8'));
  }
}

try {
  if (!isSupabaseConfigured()) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in apps/backend/.env');
  }

  console.log(`Connecting to Supabase at ${normalizeSupabaseUrl(process.env.SUPABASE_URL)}...`);
  const data = await loadExportData();

  let totalMigrated = 0;
  for (const collectionName of COLLECTIONS) {
    const records = data[collectionName] || {};
    const entries = Object.entries(records);
    if (!entries.length) {
      console.log(`  - ${collectionName.padEnd(28)} : 0 records`);
      continue;
    }

    // Commit in batches of 50 records for clean progress and fast execution
    const chunkSize = 50;
    for (let i = 0; i < entries.length; i += chunkSize) {
      const chunk = entries.slice(i, i + chunkSize);
      const batch = supabaseFirestore.batch();
      for (const [id, rawDoc] of chunk) {
        const ref = supabaseFirestore.collection(collectionName).doc(id);
        batch.set(ref, decodeSupabaseValue(rawDoc), { merge: false });
      }
      await batch.commit();
    }

    totalMigrated += entries.length;
    console.log(`  ✔ ${collectionName.padEnd(28)} : ${entries.length} records migrated`);
  }

  console.log(`\nMigration complete! Successfully migrated ${totalMigrated} records to Supabase.`);
} catch (error) {
  console.error(`\nSupabase migration failed: ${error.message}`);
  if (error.code === 'SUPABASE_SCHEMA_MISSING') {
    console.error('\nACTION REQUIRED:');
    console.error('1. Open your Supabase Dashboard -> SQL Editor -> New Query');
    console.error('2. Paste the contents of infrastructure/supabase-schema.sql and click Run');
    console.error('3. Run "npm run supabase:migrate" again.');
  }
  process.exitCode = 1;
} finally {
  await nativeFirestore.terminate().catch(() => {});
}
