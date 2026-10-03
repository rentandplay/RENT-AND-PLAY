import { createHash, randomBytes } from 'node:crypto';
import { createInterface } from 'node:readline/promises';
import { firestore, requireFirebaseConfig } from '../src/firebase.mjs';

const rl = createInterface({ input: process.stdin, output: process.stdout });
try {
  requireFirebaseConfig();
  const id = (await rl.question('Terminal document ID (existing or new): ')).trim();
  const code = (await rl.question('Terminal display code: ')).trim();
  const name = (await rl.question('Terminal name: ')).trim();
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(id) || !/^[A-Za-z0-9_-]{1,50}$/.test(code) || !name || name.length > 150) throw Error('Enter a valid terminal ID, code, and name.');
  const terminalRef = firestore.collection('terminals').doc(id);
  const current = await terminalRef.get();
  if (current.exists && current.data().auth_token_hash) throw Error('This terminal already has a credential. Provision a new terminal ID or revoke the old credential explicitly before running this command.');
  const key = randomBytes(32).toString('base64url');
  await firestore.runTransaction(async tx => {
    const latest = await tx.get(terminalRef);
    if (latest.exists && latest.data().auth_token_hash) throw Error('A credential was already provisioned for this terminal.');
    tx.set(terminalRef, { name, terminal_code: code, is_active: true, status: 'OFFLINE', auth_token_hash: createHash('sha256').update(key).digest('hex'), updated_at: new Date(), ...(latest.exists ? {} : { created_at: new Date(), last_seen_at: null }) }, { merge: true });
  });
  console.log(`Terminal ${id} registered. Configure the ESP32 with this device key; it is shown only once:\n${key}\nKeep it out of browser code, Git, screenshots, and logs.`);
} catch (error) { console.error(error.message); process.exitCode = 1; }
finally { rl.close(); }
