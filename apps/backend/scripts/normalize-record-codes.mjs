import { firestore, requireFirebaseConfig } from '../src/firebase.mjs';
import { createRecordCodeService, recordTypes } from '../src/record-codes.mjs';

requireFirebaseConfig();
const apply = process.argv.includes('--apply');
const references = createRecordCodeService(firestore);
console.log(JSON.stringify({ project: process.env.FIREBASE_PROJECT_ID || 'rent-and-play', mode: apply ? 'apply' : 'preview' }));
for (const [collection, type] of Object.entries(recordTypes)) {
  const snapshot = await firestore.collection(collection).get();
  const records = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  const before = records.map(row => row[type.field]);
  const after = apply ? await references.ensureMany(collection, records) : records;
  console.log(JSON.stringify({ collection, records: records.length, changed: apply ? after.filter((row, index) => row[type.field] !== before[index]).length : null }));
}
