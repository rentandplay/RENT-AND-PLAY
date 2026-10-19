import { firebaseAuth, firestore, nativeFirestore, requireFirebaseConfig } from '../src/firebase.mjs';
import { firebaseFailure } from '../src/firebase-errors.mjs';
import { isSupabaseConfigured, normalizeSupabaseUrl } from '../src/supabase.mjs';

try {
  requireFirebaseConfig();
  const [users, items, rentals, authUsers] = await Promise.all([
    firestore.collection('users').limit(10).get(),
    firestore.collection('items').limit(100).get(),
    firestore.collection('rentals').limit(100).get(),
    firebaseAuth.listUsers(1)
  ]);
  const engine = isSupabaseConfigured()
    ? `Supabase (${normalizeSupabaseUrl(process.env.SUPABASE_URL)})`
    : `Firebase Firestore (${process.env.FIREBASE_PROJECT_ID})`;
  console.log(`Connected to database engine: ${engine}`);
  console.log(`Profiles: ${users.size} | Equipment items: ${items.size} | Rentals: ${rentals.size} | Auth users: ${authUsers.users.length}${authUsers.pageToken ? '+' : ''}`);
  if (users.empty) console.log('Run "npm run supabase:migrate" to import your existing records, or "npm run user:create" to create a new owner.');
} catch (error) {
  console.error(`Database check failed (${error.code || 'DB_ERROR'}): ${error.message}`);
  console.error(firebaseFailure(error).error);
  process.exitCode = 1;
} finally {
  await firestore.terminate().catch(() => {});
  await nativeFirestore.terminate().catch(() => {});
}
