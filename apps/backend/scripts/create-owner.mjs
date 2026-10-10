import { createInterface } from 'node:readline/promises';
import { firebaseAuth, firestore, requireFirebaseConfig } from '../src/firebase.mjs';
import { createEmailDomainValidator, nameError, normalizeEmail, passwordError, passwordMatchError, validationFailure } from '../src/account-validation.mjs';

async function hiddenQuestion(prompt) {
  if (!process.stdin.isTTY) throw new Error('Run this command in an interactive VS Code terminal.');
  process.stdout.write(prompt);
  return new Promise((resolve, reject) => { let value = ''; process.stdin.setRawMode(true); process.stdin.resume(); const cleanup = () => { process.stdin.setRawMode(false); process.stdin.pause(); process.stdin.off('data', listener); process.stdout.write('\n'); }; const listener = chunk => { for (const char of chunk.toString()) { if (char === '\u0003') { cleanup(); reject(new Error('Account creation cancelled.')); return; } if (char === '\r' || char === '\n') { cleanup(); resolve(value); return; } if (char === '\u007f' || char === '\b') value = value.slice(0, -1); else if (char >= ' ' && char !== '\u001b') value += char; } }; process.stdin.on('data', listener); });
}

let created;
try {
  requireFirebaseConfig();
  if (!(await firestore.collection('users').limit(1).get()).empty) throw new Error('User profiles already exist. This command only creates the first owner and never overwrites accounts.');
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const name = (await rl.question('Owner full name: ')).trim(), email = normalizeEmail(await rl.question('Owner login email: ')); rl.close();
  validationFailure(nameError(name));
  await createEmailDomainValidator()(email);
  const password = await hiddenQuestion('Choose login password (hidden, 8+ characters, a capital letter and a number): '), repeat = await hiddenQuestion('Repeat password: ');
  validationFailure(passwordError(password)); validationFailure(passwordMatchError(password, repeat));
  created = await firebaseAuth.createUser({ displayName: name, email, password, emailVerified: true, disabled: false });
  await firestore.collection('users').doc(created.uid).create({ full_name: name, email, role: 'OWNER', is_active: true, must_change_password: true, created_at: new Date(), last_login_at: null });
  const defaults = ['Sports equipment', 'Board games', 'Card games', 'Consoles'];
  if ((await firestore.collection('item_categories').limit(1).get()).empty) { const batch = firestore.batch(); for (const category of defaults) { const ref = firestore.collection('item_categories').doc(); batch.create(ref, { name: category, created_at: new Date() }); } await batch.commit(); }
  console.log('Firebase owner account created. Sign in with this temporary password, then choose a new password to open the Owner workspace.');
} catch (error) {
  if (created) await firebaseAuth.deleteUser(created.uid).catch(() => { });
  console.error(error.code || error.message); process.exitCode = 1;
}
