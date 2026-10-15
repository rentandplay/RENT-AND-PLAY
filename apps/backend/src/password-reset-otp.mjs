import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import nodemailer from 'nodemailer';
import { passwordError, passwordMatchError, validateEmailFormat, validationFailure } from './account-validation.mjs';
import { stageAudit } from './audit.mjs';

const CODE_TTL_MS = 10 * 60 * 1000;
const PROOF_TTL_MS = 10 * 60 * 1000;
const SEND_COOLDOWN_MS = 30 * 1000;
const SEND_WINDOW_MS = 15 * 60 * 1000;
const MAX_SENDS_PER_WINDOW = 5;
const MAX_ATTEMPTS = 5;
const RESET_LEASE_MS = 60 * 1000;
const RETAIN_COMPLETED_MS = 24 * 60 * 60 * 1000;

const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
const asMillis = value => value instanceof Date ? value.getTime() : typeof value?.toDate === 'function' ? value.toDate().getTime() : Number.NaN;
const matches = (saved, value) => {
  if (typeof saved !== 'string' || !/^[a-f0-9]{64}$/.test(saved) || typeof value !== 'string') return false;
  return timingSafeEqual(Buffer.from(saved, 'hex'), Buffer.from(value, 'hex'));
};
const escapeHtml = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));

function resetEmail(code) {
  return {
    subject: 'Your Rent & Play password reset code',
    text: `You requested to reset your Rent & Play password.\n\nYour verification code is ${code}.\n\nEnter it in the app or website to continue. The code expires in 10 minutes and can only be used once. Do not share it with anyone. Rent & Play staff will never ask for this code.\n\nIf you did not request a password reset, you can safely ignore this email. Your current password will remain unchanged.`,
    html: `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>Password reset code</title></head><body style="margin:0;background:#f2f5f9;font-family:Arial,Helvetica,sans-serif;color:#182438"><div style="display:none;max-height:0;overflow:hidden;opacity:0">Your secure Rent &amp; Play password reset code expires in 10 minutes.</div><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f2f5f9;padding:32px 12px"><tr><td align="center"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:560px;background:#ffffff;border:1px solid #e1e7ef;border-radius:18px;overflow:hidden"><tr><td style="background:#142033;padding:26px 34px"><div style="font-size:12px;letter-spacing:2px;font-weight:700;color:#f48a35">RENT <span style="color:#ffffff">&amp;</span> PLAY</div><div style="margin-top:8px;color:#c8d3e2;font-size:12px">ACCOUNT SECURITY</div></td></tr><tr><td style="padding:36px 34px 22px"><div style="width:46px;height:46px;line-height:46px;text-align:center;border-radius:14px;background:#fff1e6;color:#df762d;font-size:23px">&#128274;</div><h1 style="margin:22px 0 10px;font-size:25px;line-height:1.25;color:#182438">Reset your password</h1><p style="margin:0;color:#59677a;font-size:15px;line-height:1.65">Use the one-time code below to verify your email and choose a new password for your Rent &amp; Play account.</p><div style="margin:26px 0 18px;padding:20px 12px;text-align:center;background:#f5f7fa;border:1px solid #e5eaf1;border-radius:14px"><div style="font-size:11px;font-weight:700;letter-spacing:1.5px;color:#68778a">YOUR VERIFICATION CODE</div><div style="margin-top:10px;color:#182438;font-size:34px;font-weight:700;letter-spacing:10px;font-variant-numeric:tabular-nums">${escapeHtml(code)}</div></div><p style="margin:0;color:#59677a;font-size:14px;line-height:1.6"><strong style="color:#182438">This code expires in 10 minutes</strong> and can only be used once.</p><div style="margin-top:24px;padding:15px 16px;background:#fff8f2;border-left:3px solid #ed7e2d;border-radius:6px;color:#59677a;font-size:13px;line-height:1.6"><strong style="color:#182438">Keep your account safe.</strong> Never share this code. Rent &amp; Play staff will never ask you for it.</div><p style="margin:24px 0 0;color:#68778a;font-size:13px;line-height:1.6">If you did not request a password reset, ignore this email. Your current password will remain unchanged.</p></td></tr><tr><td style="padding:18px 34px 26px;border-top:1px solid #edf0f4;color:#7a8798;font-size:12px;line-height:1.6">Rent &amp; Play · Los Baños, Laguna<br>This is an automated account security message. Please do not reply.</td></tr></table><div style="max-width:520px;padding:16px 8px;color:#8a95a4;text-align:center;font-size:11px;line-height:1.5">You received this email because a password reset was requested for your account.</div></td></tr></table></body></html>`
  };
}

export function createPasswordResetOtpService({ db, auth, now = () => new Date(), validateEmail = validateEmailFormat, mailer = null } = {}) {
  if (!db || !auth) throw new TypeError('Password reset requires the account database and authentication provider.');
  const pepper = String(process.env.PASSWORD_RESET_OTP_PEPPER || process.env.REGISTRATION_OTP_PEPPER || '').trim();
  const pepperReady = Buffer.byteLength(pepper, 'utf8') >= 32;
  let transporter;
  const digest = (email, value, purpose) => createHmac('sha256', pepper).update(`${purpose}\n${email}\n${value}`).digest('hex');
  const recordRef = email => db.collection('password_reset_otps').doc(createHash('sha256').update(email).digest('hex'));

  function emailSender() {
    if (mailer) return mailer;
    const user = String(process.env.SMTP_USER || '').trim();
    const password = String(process.env.SMTP_PASSWORD || '').replace(/\s/g, '');
    if (!user || !password || !pepperReady) fail(503, 'Password reset email is not configured. Please contact support.');
    transporter ||= nodemailer.createTransport({ service: 'gmail', auth: { user, pass: password }, connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 15000 });
    return message => transporter.sendMail({ from: { name: 'Rent & Play Account Security', address: user }, ...message });
  }

  async function requestCode(emailValue) {
    const email = await validateEmail(emailValue);
    if (!pepperReady) fail(503, 'Password reset email is not configured. Please contact support.');
    const send = emailSender();
    const ref = recordRef(email), at = now(), atMs = at.getTime();
    const code = String(randomInt(100000, 1000000)), generation = randomBytes(16).toString('hex');
    let limitedSeconds = 0;
    await db.runTransaction(async tx => {
      limitedSeconds = 0;
      const snap = await tx.get(ref), previous = snap.exists ? snap.data() : {};
      const last = asMillis(previous.last_sent_at), windowStartMs = asMillis(previous.send_window_started_at);
      const inWindow = Number.isFinite(windowStartMs) && atMs >= windowStartMs && atMs - windowStartMs < SEND_WINDOW_MS;
      const sendCount = inWindow ? Number(previous.sends_in_window || 0) : 0;
      const nextWindowStart = inWindow ? previous.send_window_started_at : at;
      if (Number.isFinite(last) && atMs >= last && atMs - last < SEND_COOLDOWN_MS) {
        limitedSeconds = Math.ceil((SEND_COOLDOWN_MS - (atMs - last)) / 1000); return;
      }
      if (sendCount >= MAX_SENDS_PER_WINDOW) {
        limitedSeconds = Math.max(1, Math.ceil((SEND_WINDOW_MS - (atMs - windowStartMs)) / 1000)); return;
      }
      tx.set(ref, {
        status: 'CHECKING_ACCOUNT', code_digest: digest(email, code, 'code'), code_expires_at: new Date(atMs + CODE_TTL_MS),
        expires_at: new Date(atMs + CODE_TTL_MS), attempts: 0, generation, proof_digest: null, proof_expires_at: null,
        last_sent_at: at, send_window_started_at: nextWindowStart, sends_in_window: sendCount + 1, updated_at: at
      });
    });
    if (limitedSeconds) fail(429, `Please wait ${limitedSeconds} seconds before requesting another code.`);

    let account = null;
    try { account = await auth.getUserByEmail(email); }
    catch (error) { if (!['auth/user-not-found', 'user-not-found'].includes(error?.code)) throw error; }
    if (!account || account.disabled) {
      await db.runTransaction(async tx => {
        const snap = await tx.get(ref);
        if (snap.exists && snap.data().generation === generation) tx.update(ref, { status: 'UNAVAILABLE', updated_at: now() });
      });
      return { ok: true, message: 'If an active account exists for this email, a verification code has been sent.' };
    }
    const profile = await db.collection('users').doc(String(account.uid)).get();
    if (!profile.exists || profile.data()?.is_active === false) {
      await db.runTransaction(async tx => {
        const snap = await tx.get(ref);
        if (snap.exists && snap.data().generation === generation) tx.update(ref, { status: 'UNAVAILABLE', updated_at: now() });
      });
      return { ok: true, message: 'If an active account exists for this email, a verification code has been sent.' };
    }
    try {
      const message = resetEmail(code);
      const result = await send({ to: email, ...message });
      if (result?.accepted && (!result.accepted.length || result.rejected?.length)) throw new Error('The reset email was not accepted.');
      await db.runTransaction(async tx => {
        const snap = await tx.get(ref);
        if (snap.exists && snap.data().generation === generation) tx.update(ref, { status: 'PENDING', updated_at: now() });
      });
    } catch {
      await db.runTransaction(async tx => {
        const snap = await tx.get(ref);
        if (snap.exists && snap.data().generation === generation) tx.update(ref, {
          status: 'SEND_FAILED', code_digest: null, proof_digest: null, proof_expires_at: null,
          expires_at: new Date(now().getTime() + CODE_TTL_MS), updated_at: now()
        });
      }).catch(() => {});
      fail(503, 'We could not send the verification email. Please try again shortly.');
    }
    return { ok: true, message: 'If an active account exists for this email, a verification code has been sent.' };
  }

  async function verifyCode(emailValue, codeValue) {
    const email = await validateEmail(emailValue);
    if (typeof codeValue !== 'string' || !/^\d{6}$/.test(codeValue)) fail(400, 'Enter the 6-digit code from your email.');
    const ref = recordRef(email), at = now(), proof = randomBytes(32).toString('base64url');
    let result = 'INVALID';
    await db.runTransaction(async tx => {
      result = 'INVALID';
      const snap = await tx.get(ref); if (!snap.exists) return;
      const record = snap.data(), expires = asMillis(record.code_expires_at);
      if (!Number.isFinite(expires) || expires <= at.getTime()) { result = 'EXPIRED'; return; }
      if (record.status === 'LOCKED' || Number(record.attempts || 0) >= MAX_ATTEMPTS) { result = 'LOCKED'; return; }
      if (!['PENDING', 'UNAVAILABLE'].includes(record.status)) return;
      const attempts = Number(record.attempts || 0);
      if (!matches(record.code_digest, digest(email, codeValue, 'code'))) {
        const next = attempts + 1;
        tx.update(ref, { attempts: next, status: next >= MAX_ATTEMPTS ? 'LOCKED' : record.status, updated_at: at });
        result = next >= MAX_ATTEMPTS ? 'LOCKED' : 'INVALID'; return;
      }
      if (record.status !== 'PENDING') {
        tx.update(ref, { attempts: attempts + 1, updated_at: at }); return;
      }
      tx.update(ref, { status: 'VERIFIED', proof_digest: digest(email, proof, 'proof'), proof_expires_at: new Date(at.getTime() + PROOF_TTL_MS), expires_at: new Date(at.getTime() + PROOF_TTL_MS), updated_at: at });
      result = 'VERIFIED';
    });
    if (result === 'EXPIRED') fail(400, 'That code has expired. Request a new one.');
    if (result === 'LOCKED') fail(429, 'Too many incorrect codes. Request a new code and try again.');
    if (result !== 'VERIFIED') fail(400, 'That code is incorrect or expired. Check it and try again.');
    return { verificationToken: proof, expiresInSeconds: PROOF_TTL_MS / 1000 };
  }

  async function completeReset(input = {}) {
    const email = await validateEmail(input.email);
    const verificationToken = typeof input.verificationToken === 'string' ? input.verificationToken : '';
    const requestKey = typeof input.requestKey === 'string' ? input.requestKey : '';
    if (verificationToken.length < 32 || verificationToken.length > 128) fail(400, 'Verify the email code before choosing a new password.');
    if (!/^[A-Za-z0-9_-]{20,100}$/.test(requestKey)) fail(400, 'Please submit the password change again.');
    validationFailure(passwordError(input.newPassword));
    validationFailure(passwordMatchError(input.newPassword, input.confirmPassword));
    if (!pepperReady) fail(503, 'Password reset is temporarily unavailable. Please try again later.');

    let account;
    try { account = await auth.getUserByEmail(email); }
    catch { fail(400, 'That verification has expired. Request a new code.'); }
    if (!account || account.disabled) fail(400, 'That verification has expired. Request a new code.');
    const profileRef = db.collection('users').doc(String(account.uid)), profile = await profileRef.get();
    if (!profile.exists || profile.data()?.is_active === false) fail(400, 'That verification has expired. Request a new code.');
    const ref = recordRef(email), at = now(), tokenDigest = digest(email, verificationToken, 'proof');
    const passwordFingerprint = digest(email, `${requestKey}\n${input.newPassword}`, 'completion');
    let action = 'INVALID';
    await db.runTransaction(async tx => {
      action = 'INVALID';
      const snap = await tx.get(ref); if (!snap.exists) return;
      const record = snap.data();
      if (!matches(record.proof_digest, tokenDigest)) return;
      if (record.status === 'COMPLETED') {
        if (record.completion_request_key === requestKey && matches(record.completion_digest, passwordFingerprint)) action = 'COMPLETED';
        return;
      }
      const proofExpiry = asMillis(record.proof_expires_at);
      if (!Number.isFinite(proofExpiry) || proofExpiry <= at.getTime()) { action = 'EXPIRED'; return; }
      if (record.status === 'RESETTING') {
        if (record.completion_request_key !== requestKey || !matches(record.completion_digest, passwordFingerprint)) { action = 'BUSY'; return; }
        const leaseAt = asMillis(record.completion_started_at);
        if (Number.isFinite(leaseAt) && at.getTime() - leaseAt < RESET_LEASE_MS) { action = 'BUSY'; return; }
      } else if (record.status !== 'VERIFIED') return;
      tx.update(ref, { status: 'RESETTING', completion_request_key: requestKey, completion_digest: passwordFingerprint, completion_started_at: at, expires_at: new Date(at.getTime() + RETAIN_COMPLETED_MS), updated_at: at });
      action = 'RESET';
    });
    if (action === 'INVALID' || action === 'EXPIRED') fail(400, 'That verification has expired. Request a new code.');
    if (action === 'BUSY') fail(409, 'Your password change is already processing. Wait a moment, then try again.');
    if (action === 'COMPLETED') return { ok: true, message: 'Your password has been updated. Please sign in with your new password.' };

    try {
      await auth.updateUser(String(account.uid), { password: input.newPassword });
      await auth.revokeRefreshTokens(String(account.uid));
      const batch = db.batch();
      batch.update(profileRef, { must_change_password: false, password_reset_at: at, updated_at: at });
      batch.update(ref, { status: 'COMPLETED', code_digest: null, proof_digest: tokenDigest, completion_digest: passwordFingerprint, completion_started_at: null, expires_at: new Date(at.getTime() + RETAIN_COMPLETED_MS), updated_at: at });
      stageAudit(batch, db, account.uid, 'PASSWORD_RESET', 'USER', account.uid, { after: { password_reset: true }, now: at });
      await batch.commit();
    } catch (error) {
      if (Number.isInteger(error?.status)) throw error;
      fail(503, 'We could not finish updating your password. Your code is still protected; please try again.');
    }
    return { ok: true, message: 'Your password has been updated. Please sign in with your new password.' };
  }

  return { requestCode, verifyCode, completeReset };
}
