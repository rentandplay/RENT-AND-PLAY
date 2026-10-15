import test from 'node:test';
import assert from 'node:assert/strict';
import { createPasswordResetOtpService } from '../src/password-reset-otp.mjs';
import { createApi } from '../src/server.mjs';
import { memoryFirestore } from './support/memory-firestore.mjs';

const email = 'owner@example.com';
const uid = 'owner-uid';
const newPassword = 'NewSecurePass9';
const requestKey = '0123456789abcdef0123456789abcdef';

function fixture() {
  const db = memoryFirestore({ users: { [uid]: { email, role: 'OWNER', is_active: true, must_change_password: true } } });
  const account = { uid, email, disabled: false };
  const changes = [];
  const auth = {
    getUserByEmail: async value => {
      if (value === email) return account;
      throw Object.assign(new Error('not found'), { code: 'auth/user-not-found' });
    },
    updateUser: async (id, input) => changes.push({ id, ...input }),
    revokeRefreshTokens: async id => changes.push({ revoked: id })
  };
  const messages = [];
  const mailer = async message => { messages.push(message); return { accepted: [message.to], rejected: [] }; };
  let clock = new Date('2026-10-15T04:00:00.000Z');
  const service = createPasswordResetOtpService({ db, auth, mailer, now: () => new Date(clock) });
  return { db, auth, changes, messages, service, advance: ms => { clock = new Date(clock.getTime() + ms); } };
}

test('password reset requires email OTP, changes the Firebase password once, and revokes sessions', async () => {
  const previousPepper = process.env.PASSWORD_RESET_OTP_PEPPER;
  process.env.PASSWORD_RESET_OTP_PEPPER = 'unit-test-only-password-reset-pepper-32-bytes';
  try {
    const { db, changes, messages, service, advance } = fixture();
    const requested = await service.requestCode(email);
    assert.match(requested.message, /If an active account exists/);
    assert.equal(messages.length, 1);
    assert.equal(messages[0].subject, 'Your Rent & Play password reset code');
    assert.match(messages[0].html, /This code expires in 10 minutes/);
    const code = messages[0].html.match(/font-variant-numeric:tabular-nums">(\d{6})<\/div>/)?.[1];
    assert.ok(code, 'email contains a six-digit verification code');
    assert.equal(JSON.stringify(db.records('password_reset_otps')).includes(code), false, 'plaintext code is not stored');

    const wrongCode = code === '000000' ? '000001' : '000000';
    for (let attempt = 0; attempt < 4; attempt++) {
      await assert.rejects(service.verifyCode(email, wrongCode), error => error.status === 400);
    }
    await assert.rejects(service.verifyCode(email, wrongCode), error => error.status === 429);
    await assert.rejects(service.verifyCode(email, code), error => error.status === 429, 'the fifth bad guess locks this code');

    advance(31_000);
    await service.requestCode(email);
    const replacement = messages[1].html.match(/font-variant-numeric:tabular-nums">(\d{6})<\/div>/)?.[1];
    const { verificationToken } = await service.verifyCode(email, replacement);
    assert.ok(verificationToken.length >= 32);
    assert.equal(db.records('password_reset_otps')[0].status, 'VERIFIED');

    const input = { email, verificationToken, requestKey, newPassword, confirmPassword: newPassword };
    await assert.rejects(service.completeReset({ ...input, newPassword: 'weak' }), error => error.status === 400);
    await service.completeReset(input);
    assert.deepEqual(changes, [{ id: uid, password: newPassword }, { revoked: uid }]);
    assert.equal(db.data('users', uid).must_change_password, false);
    assert.equal(db.data('password_reset_otps', db.records('password_reset_otps')[0].id).status, 'COMPLETED');
    assert.equal(JSON.stringify(db.records('audit_logs')).includes(newPassword), false, 'password is absent from audit history');

    await service.completeReset(input);
    assert.equal(changes.length, 2, 'a retry of the same completion is idempotent');
    await assert.rejects(service.completeReset({ ...input, newPassword: 'DifferentSecurePass8', confirmPassword: 'DifferentSecurePass8' }), error => error.status === 400);
    await assert.rejects(service.verifyCode(email, replacement), error => error.status === 400, 'a completed code cannot be replayed');
  } finally {
    if (previousPepper === undefined) delete process.env.PASSWORD_RESET_OTP_PEPPER;
    else process.env.PASSWORD_RESET_OTP_PEPPER = previousPepper;
  }
});

test('password reset sends a generic response without emailing an unknown account', async () => {
  const previousPepper = process.env.PASSWORD_RESET_OTP_PEPPER;
  process.env.PASSWORD_RESET_OTP_PEPPER = 'unit-test-only-password-reset-pepper-32-bytes';
  try {
    const { messages, service } = fixture();
    const result = await service.requestCode('unknown@example.net');
    assert.match(result.message, /If an active account exists/);
    assert.equal(messages.length, 0);
  } finally {
    if (previousPepper === undefined) delete process.env.PASSWORD_RESET_OTP_PEPPER;
    else process.env.PASSWORD_RESET_OTP_PEPPER = previousPepper;
  }
});

test('password-reset HTTP routes call the matching OTP operations and clear the web session', async () => {
  const calls = [];
  const server = createApi({
    services: {
      requestPasswordResetCode: async value => { calls.push(['request', value]); return { message: 'If an active account exists, a code was sent.' }; },
      verifyPasswordResetCode: async input => { calls.push(['verify', input]); return { verificationToken: 'proof-token-with-at-least-thirty-two-characters', expiresInSeconds: 600 }; },
      completePasswordReset: async input => { calls.push(['complete', input]); }
    },
    sessions: { sendPasswordReset: async () => { throw new Error('OTP flow must not request a Firebase link.'); } }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}/api/auth/password-reset`;
  const post = (path, input) => fetch(`${base}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
  try {
    const requested = await post('/request', { email });
    assert.equal(requested.status, 200);
    assert.match((await requested.json()).message, /If an active account exists/);
    const verified = await post('/verify', { email, code: '123456' });
    assert.equal(verified.status, 200);
    assert.equal((await verified.json()).verificationToken, 'proof-token-with-at-least-thirty-two-characters');
    const completed = await post('/complete', { email, verificationToken: 'proof', requestKey, newPassword, confirmPassword: newPassword });
    assert.equal(completed.status, 200);
    assert.match(completed.headers.get('set-cookie'), /Max-Age=0/);
    assert.deepEqual(calls.map(([operation]) => operation), ['request', 'verify', 'complete']);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});
