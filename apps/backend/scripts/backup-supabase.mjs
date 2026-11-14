import { mkdir, writeFile } from 'node:fs/promises';
import nodePath from 'node:path';
import { fileURLToPath } from 'node:url';
import { firebaseAuth, supabaseFirestore } from '../src/firebase.mjs';
import { decodeSupabaseValue, encodeSupabaseValue, isSupabaseConfigured, normalizeSupabaseUrl } from '../src/supabase.mjs';

const KNOWN_TABLES = [
  // Accounts, Auth & Directory
  'users',
  'customers',
  'customer_identity_keys',
  'email_registration_otps',
  'password_reset_otps',

  // Equipment & Inventory
  'items',
  'item_categories',
  'item_rates',
  'item_codes',
  'item_status_history',
  'item_condition_records',
  'item_condition_photos',
  'stock_groups',

  // Rentals, Verification & Hardware Terminals
  'rentals',
  'rental_payment_proofs',
  'rental_extension_operations',
  'voided_rentals',
  'verification_requests',
  'terminals',

  // Maintenance
  'maintenance_records',
  'maintenance_photos',

  // Finance, Payments & Analytics Summaries
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

  // Notifications & Live Updates
  'notification_devices',
  'notification_inboxes',
  'notification_inboxes_messages',
  'notification_outbox',

  // Chat
  'chat_threads',
  'chat_messages',
  'chat_operations',
  'chat_limits',

  // Security & System
  'security_alerts',
  'counters',
  'audit_logs',
  'settings'
];

function timestampTag(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate())
  ].join('-') + '_' + [
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds())
  ].join('');
}

function authHeaders(apiKey) {
  return {
    apikey: apiKey,
    ...(!apiKey.startsWith('sb_secret_') ? { Authorization: `Bearer ${apiKey}` } : {}),
    'Content-Type': 'application/json'
  };
}

async function discoverSupabaseTables(baseUrl, apiKey) {
  try {
    const res = await fetch(`${baseUrl}/rest/v1/`, {
      headers: {
        ...authHeaders(apiKey),
        Accept: 'application/openapi+json'
      }
    });
    if (!res.ok) return [];
    const spec = await res.json();
    const defs = Object.keys(spec?.definitions || {});
    const paths = Object.keys(spec?.paths || {})
      .filter((p) => p.startsWith('/') && !p.startsWith('/rpc/'))
      .map((p) => p.slice(1))
      .filter(Boolean);
    return [...new Set([...defs, ...paths])].filter((name) => /^[a-z0-9_]+$/.test(name));
  } catch {
    return [];
  }
}

async function listAllStorageObjects(baseUrl, apiKey, bucket, prefix = '') {
  const files = [];
  let offset = 0;
  const limit = 100;
  while (true) {
    const res = await fetch(`${baseUrl}/storage/v1/object/list/${bucket}`, {
      method: 'POST',
      headers: authHeaders(apiKey),
      body: JSON.stringify({
        prefix,
        limit,
        offset,
        sortBy: { column: 'name', order: 'asc' }
      })
    });
    if (!res.ok) break;
    const entries = await res.json();
    if (!Array.isArray(entries) || entries.length === 0) break;

    for (const entry of entries) {
      const fullPath = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.id === null) {
        const nested = await listAllStorageObjects(baseUrl, apiKey, bucket, fullPath);
        files.push(...nested);
      } else {
        files.push({ ...entry, path: fullPath });
      }
    }
    if (entries.length < limit) break;
    offset += limit;
  }
  return files;
}

async function fetchTableDocsViaRpc(baseUrl, apiKey, table) {
  const res = await fetch(`${baseUrl}/rest/v1/rpc/app_list_docs`, {
    method: 'POST',
    headers: authHeaders(apiKey),
    body: JSON.stringify({ p_collection: table })
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`RPC app_list_docs failed (${res.status}): ${text}`);
  }
  const rows = await res.json();
  return Array.isArray(rows) ? rows : [];
}

async function exportAuthUsers() {
  const users = [];
  let nextPageToken;
  do {
    const page = await firebaseAuth.listUsers(1000, nextPageToken);
    for (const user of page.users) {
      users.push(user.toJSON());
    }
    nextPageToken = page.pageToken;
  } while (nextPageToken);
  return users;
}

try {
  if (!isSupabaseConfigured() || !supabaseFirestore) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in apps/backend/.env');
  }

  const baseUrl = normalizeSupabaseUrl(process.env.SUPABASE_URL);
  const apiKey = (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  const bucket = (process.env.SUPABASE_STORAGE_BUCKET || 'rental-media').trim();

  const discoveredTables = await discoverSupabaseTables(baseUrl, apiKey);
  const allTables = [...new Set([...KNOWN_TABLES, ...discoveredTables])].sort();

  const tag = timestampTag();
  const backupDir = nodePath.resolve(
    fileURLToPath(new URL(`../backups/supabase-backup-${tag}`, import.meta.url))
  );
  const tablesDir = nodePath.join(backupDir, 'tables');
  const storageDir = nodePath.join(backupDir, 'storage', bucket);
  await mkdir(tablesDir, { recursive: true });
  await mkdir(storageDir, { recursive: true });

  console.log(`Connecting to Supabase at ${baseUrl}...`);
  console.log(`Discovered ${discoveredTables.length} tables via OpenAPI; backing up ${allTables.length} total tables.`);
  console.log(`Saving backup to: ${backupDir}\n`);

  const exported = {};
  const counts = {};
  const skipped = [];
  let totalRecords = 0;

  for (const table of allTables) {
    try {
      // Use app_list_docs directly for chat tables too so nothing is capped at 51/101 rows,
      // and use supabaseFirestore.collection(table).get() for hydration of IMAGE_COLLECTIONS.
      let rows;
      if (table === 'chat_threads' || table === 'chat_messages') {
        rows = await fetchTableDocsViaRpc(baseUrl, apiKey, table);
      } else {
        const snap = await supabaseFirestore.collection(table).get();
        rows = snap.docs.map((doc) => ({ id: doc.id, data: doc.data() }));
      }

      const records = {};
      for (const row of rows) {
        const decoded = decodeSupabaseValue(row.data || {});
        records[row.id] = encodeSupabaseValue(decoded);
      }

      exported[table] = records;
      const count = rows.length;
      counts[table] = count;
      totalRecords += count;

      await writeFile(
        nodePath.join(tablesDir, `${table}.json`),
        JSON.stringify(records, null, 2),
        'utf8'
      );

      if (count > 0) {
        console.log(`  ✔ ${table.padEnd(32)} : ${count} records`);
      } else {
        console.log(`  - ${table.padEnd(32)} : 0 records`);
      }
    } catch (error) {
      skipped.push({ table, error: error.message });
      console.warn(`  ! ${table.padEnd(32)} : skipped (${error.message})`);
    }
  }

  // Backup Supabase Storage objects (images, attachments, profile photos, payment proofs)
  console.log(`\nChecking Supabase Storage bucket "${bucket}"...`);
  const storageObjects = await listAllStorageObjects(baseUrl, apiKey, bucket);
  const storageDownloaded = [];
  const storageFailed = [];

  for (const obj of storageObjects) {
    const encodedPath = obj.path.split('/').map(encodeURIComponent).join('/');
    const objectUrl = `${baseUrl}/storage/v1/object/${bucket}/${encodedPath}`;
    try {
      const res = await fetch(objectUrl, { headers: authHeaders(apiKey) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      const outPath = nodePath.join(storageDir, ...obj.path.split('/'));
      await mkdir(nodePath.dirname(outPath), { recursive: true });
      await writeFile(outPath, buf);
      storageDownloaded.push({ path: obj.path, bytes: buf.length });
    } catch (error) {
      storageFailed.push({ path: obj.path, error: error.message });
    }
  }
  console.log(`  ✔ Storage files downloaded: ${storageDownloaded.length} (failed: ${storageFailed.length})`);

  // Backup Firebase Auth users metadata
  let authUsersCount = 0;
  let authError = null;
  try {
    const authUsers = await exportAuthUsers();
    authUsersCount = authUsers.length;
    await writeFile(
      nodePath.join(backupDir, 'auth-users.json'),
      JSON.stringify(authUsers, null, 2),
      'utf8'
    );
    console.log(`  ✔ Firebase Auth users exported: ${authUsersCount}`);
  } catch (error) {
    authError = error.message;
    console.warn(`  ! Firebase Auth users export skipped: ${error.message}`);
  }

  const fullBackupPath = nodePath.join(backupDir, 'full-backup.json');
  await writeFile(fullBackupPath, JSON.stringify(exported, null, 2), 'utf8');

  const manifest = {
    createdAt: new Date().toISOString(),
    supabaseUrl: baseUrl,
    discoveredTables,
    totalTablesChecked: allTables.length,
    totalRecords,
    tableCounts: counts,
    skipped,
    storage: {
      bucket,
      totalObjects: storageObjects.length,
      downloaded: storageDownloaded.length,
      failed: storageFailed
    },
    authUsers: {
      count: authUsersCount,
      error: authError
    }
  };
  await writeFile(nodePath.join(backupDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');

  console.log(`\nVerified full backup complete! ${totalRecords} DB records + ${storageDownloaded.length} storage files + ${authUsersCount} auth users saved to:\n${backupDir}`);
} catch (error) {
  console.error(`\nBackup failed: ${error.message}`);
  process.exitCode = 1;
}
