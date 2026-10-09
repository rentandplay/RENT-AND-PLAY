import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import nodemailer from 'nodemailer';

const CODE_LIFETIME_MS = 10 * 60 * 1000;
const PROOF_LIFETIME_MS = 10 * 60 * 1000;
const SEND_COOLDOWN_MS = 30 * 1000;
const SEND_WINDOW_MS = 15 * 60 * 1000;
const SENDS_PER_WINDOW = 5;
const MAX_CODE_ATTEMPTS = 5;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
const timestampMs = value => {
  if (value instanceof Date) return value.getTime();
  if (typeof value?.toDate === 'function') return value.toDate().getTime();
  return Number.NaN;
};
const normalizeEmail = value => {
  if (typeof value !== 'string') fail(400, 'Enter a valid email address.');
  const email = value.trim().toLowerCase();
  const [localPart] = email.split('@');
  if (email.length > 254 || localPart?.length > 64 || !emailPattern.test(email)) {
    fail(400, 'Enter a valid email address.');
  }
  return email;
};
const emailKey = email => createHash('sha256').update(email).digest('hex');
const constantTimeMatch = (left, right) => {
  if (typeof left !== 'string' || typeof right !== 'string' || left.length !== right.length) return false;
  return timingSafeEqual(Buffer.from(left, 'hex'), Buffer.from(right, 'hex'));
};

export function createRegistrationOtpService({ db, auth, now = () => new Date() }) {
  const pepper = String(process.env.REGISTRATION_OTP_PEPPER || '').trim();
  let transporter;

  function getTransporter() {
    const user = String(process.env.SMTP_USER || '').trim().toLowerCase();
    const password = String(process.env.SMTP_PASSWORD || '').replace(/\s/g, '');
    if (!user || !password || !pepper) {
      fail(503, 'Email verification is not configured. Please contact support.');
    }
    if (!transporter) {
      transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: { user, pass: password },
        connectionTimeout: 10000,
        greetingTimeout: 10000,
        socketTimeout: 15000
      });
    }
    return { transporter, user };
  }

  const otpDigest = (email, value) => createHmac('sha256', pepper).update(`${email}\n${value}`).digest('hex');

  async function sendCode(emailValue) {
    const email = normalizeEmail(emailValue);
    const { transporter: mailer, user } = getTransporter();
    const ref = db.collection('email_registration_otps').doc(emailKey(email));
    const sentAt = now();
    const sentAtMs = sentAt.getTime();
    const code = String(randomInt(100000, 1000000));
    const generation = randomBytes(16).toString('hex');
    let rateLimitedSeconds = 0;

    await db.runTransaction(async tx => {
      rateLimitedSeconds = 0;
      const snapshot = await tx.get(ref);
      const previous = snapshot.exists ? snapshot.data() : {};
      const lastSentAt = timestampMs(previous.last_sent_at);
      const windowStartedAt = timestampMs(previous.send_window_started_at);
      const sameWindow = Number.isFinite(windowStartedAt) && sentAtMs - windowStartedAt < SEND_WINDOW_MS;
      const sends = sameWindow ? Number(previous.sends_in_window || 0) : 0;
      const windowStart = sameWindow ? previous.send_window_started_at : sentAt;

      if (Number.isFinite(lastSentAt) && sentAtMs - lastSentAt < SEND_COOLDOWN_MS) {
        rateLimitedSeconds = Math.ceil((SEND_COOLDOWN_MS - (sentAtMs - lastSentAt)) / 1000);
        return;
      }
      if (sends >= SENDS_PER_WINDOW) {
        rateLimitedSeconds = Math.ceil((SEND_WINDOW_MS - (sentAtMs - windowStartedAt)) / 1000);
        return;
      }

      tx.set(ref, {
        code_digest: otpDigest(email, code),
        code_expires_at: new Date(sentAtMs + CODE_LIFETIME_MS),
        expires_at: new Date(Math.max(sentAtMs + CODE_LIFETIME_MS, timestampMs(windowStart) + SEND_WINDOW_MS)),
        attempts: 0,
        status: 'PENDING',
        last_sent_at: sentAt,
        send_window_started_at: windowStart,
        sends_in_window: sends + 1,
        generation,
        proof_digest: null,
        proof_expires_at: null,
        updated_at: sentAt
      });
    });

    if (rateLimitedSeconds) {
      fail(429, `Please wait ${rateLimitedSeconds} seconds before requesting another code.`);
    }

    try {
      await mailer.sendMail({
        from: { name: 'Rent & Play', address: user },
        to: email,
        subject: 'Your Rent & Play verification code',
        text: `Your Rent & Play verification code is ${code}. Enter it in the app to finish creating your account. This code expires in 10 minutes. If you did not request it, you can ignore this email.`,
        html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;padding:32px;color:#0f172a"><p style="color:#df762d;font-weight:bold;letter-spacing:2px">RENT &amp; PLAY</p><h1>Verify your email</h1><p>Enter this code in the app to finish creating your account.</p><p style="background:#1f2937;border-radius:16px;color:#fff;font-size:36px;font-weight:bold;letter-spacing:12px;text-align:center;padding:24px">${code}</p><p>This code expires in 10 minutes. If you did not request it, ignore this email.</p></div>`
      });
    } catch {
      await db.runTransaction(async tx => {
        const snapshot = await tx.get(ref);
        if (snapshot.exists && snapshot.data().generation === generation) tx.delete(ref);
      }).catch(() => {});
      fail(503, 'We could not send the verification email. Please try again shortly.');
    }

    return { ok: true };
  }

  async function verifyCode(emailValue, codeValue) {
    const email = normalizeEmail(emailValue);
    if (typeof codeValue !== 'string' || !/^\d{6}$/.test(codeValue)) {
      fail(400, 'Enter the 6-digit code from your email.');
    }
    const ref = db.collection('email_registration_otps').doc(emailKey(email));
    const at = now();
    const proof = randomBytes(32).toString('base64url');
    let outcome = 'INVALID';

    await db.runTransaction(async tx => {
      outcome = 'INVALID';
      const snapshot = await tx.get(ref);
      if (!snapshot.exists) return;
      const record = snapshot.data();
      const expiresAt = timestampMs(record.code_expires_at);
      if (!Number.isFinite(expiresAt) || expiresAt <= at.getTime()) {
        outcome = 'EXPIRED';
        return;
      }
      if (!['PENDING', 'VERIFIED'].includes(record.status)) {
        outcome = record.status === 'LOCKED' ? 'LOCKED' : 'INVALID';
        return;
      }
      const attempts = Number(record.attempts || 0);
      if (attempts >= MAX_CODE_ATTEMPTS) {
        outcome = 'LOCKED';
        return;
      }
      if (!constantTimeMatch(record.code_digest, otpDigest(email, codeValue))) {
        const nextAttempts = attempts + 1;
        tx.update(ref, { attempts: nextAttempts, status: nextAttempts >= MAX_CODE_ATTEMPTS ? 'LOCKED' : 'PENDING', updated_at: at });
        outcome = nextAttempts >= MAX_CODE_ATTEMPTS ? 'LOCKED' : 'INVALID';
        return;
      }
      tx.update(ref, {
        status: 'VERIFIED',
        proof_digest: otpDigest(email, proof),
        proof_expires_at: new Date(at.getTime() + PROOF_LIFETIME_MS),
        expires_at: new Date(at.getTime() + PROOF_LIFETIME_MS),
        updated_at: at
      });
      outcome = 'VERIFIED';
    });

    if (outcome === 'EXPIRED') fail(400, 'That code has expired. Request a new one.');
    if (outcome === 'LOCKED') fail(429, 'Too many incorrect codes. Request a new code and try again.');
    if (outcome !== 'VERIFIED') fail(400, 'That code is incorrect. Check it and try again.');
    return { verificationToken: proof };
  }

  async function completeRegistration({ claims, input, completeProfile }) {
    const email = normalizeEmail(input?.email);
    const claimEmail = normalizeEmail(claims?.email);
    const uid = typeof claims?.uid === 'string' ? claims.uid : '';
    const proof = typeof input?.verificationToken === 'string' ? input.verificationToken : '';
    const name = typeof input?.name === 'string' ? input.name.trim().replace(/\s+/g, ' ') : '';
    const phone = typeof input?.phone === 'string' ? input.phone.trim() : '';
    if (!uid || email !== claimEmail) fail(403, 'The verified email must match your account.');
    if (!proof || proof.length > 128) fail(400, 'Verify your email before creating the account.');
    if (name.length < 2 || name.length > 120 || !/^[\p{L}\p{M}]+(?:[ '\u2019.\-][\p{L}\p{M}]+)*$/u.test(name)) {
      fail(400, 'Enter a valid first and last name.');
    }
    if (!/^\+639\d{9}$/.test(phone)) fail(400, 'Enter a valid Philippine mobile number.');

    const ref = db.collection('email_registration_otps').doc(emailKey(email));
    const at = now();
    const digest = otpDigest(email, proof);
    let state = 'INVALID';
    await db.runTransaction(async tx => {
      state = 'INVALID';
      const snapshot = await tx.get(ref);
      if (!snapshot.exists) return;
      const record = snapshot.data();
      const proofExpiresAt = timestampMs(record.proof_expires_at);
      if (!constantTimeMatch(record.proof_digest, digest) || !Number.isFinite(proofExpiresAt) || proofExpiresAt <= at.getTime()) return;
      if (record.status === 'COMPLETED' && record.completed_uid === uid) {
        state = 'COMPLETED';
        return;
      }
      if (record.status === 'COMPLETING' && record.completing_uid === uid) {
        state = 'COMPLETING';
        return;
      }
      if (record.status !== 'VERIFIED') return;
      tx.update(ref, { status: 'COMPLETING', completing_uid: uid, updated_at: at });
      state = 'COMPLETING';
    });

    if (state === 'INVALID') fail(403, 'Your email verification expired. Request a new code.');
    if (state !== 'COMPLETED') {
      try {
        await auth.updateUser(uid, { emailVerified: true });
      } catch {
        fail(503, 'We could not finish creating your account. Please try again.');
      }
      const result = await completeProfile({
        ...claims,
        email_verified: true
      }, { name, phone });
      await db.runTransaction(async tx => {
        const snapshot = await tx.get(ref);
        if (snapshot.exists && snapshot.data().proof_digest === digest && snapshot.data().completing_uid === uid) {
          tx.update(ref, {
            status: 'COMPLETED',
            completed_uid: uid,
            expires_at: new Date(at.getTime() + 60 * 60 * 1000),
            updated_at: now()
          });
        }
      });
      return result;
    }
    return completeProfile({ ...claims, email_verified: true }, { name, phone });
  }

  return { sendCode, verifyCode, completeRegistration };
}
