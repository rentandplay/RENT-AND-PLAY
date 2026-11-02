import { createHash } from 'node:crypto';
import {firebaseAuth,requireFirebaseConfig} from './firebase.mjs';
import { normalizeRole } from './roles.mjs';
import { passwordError, passwordMatchError, validationFailure } from './account-validation.mjs';
import { stageAudit } from './audit.mjs';

export const publicUser = row => ({ id: String(row.id), name: row.full_name, ...(row.account_code ? { account_code: row.account_code } : {}), email: row.email, role: normalizeRole(row.role) || row.role, mustChangePassword: row.must_change_password === true });

export function sessionFingerprint(cookie) {
  return createHash('sha256').update(String(cookie || '')).digest('hex').slice(0, 24);
}

export function describeUserAgent(ua = '') {
  const text = String(ua || '');
  if (!text) return 'Web Browser';
  const browser = /Edg\//i.test(text) ? 'Edge'
    : /OPR\/|Opera/i.test(text) ? 'Opera'
    : /Chrome\//i.test(text) ? 'Chrome'
    : /Firefox\//i.test(text) ? 'Firefox'
    : /Safari\//i.test(text) ? 'Safari'
    : 'Browser';
  const os = /Windows/i.test(text) ? 'Windows'
    : /Android/i.test(text) ? 'Android'
    : /iPhone|iPad|iOS/i.test(text) ? 'iOS'
    : /Mac OS X|Macintosh/i.test(text) ? 'macOS'
    : /Linux/i.test(text) ? 'Linux'
    : 'Device';
  return `${browser} on ${os}`;
}

export class FirebaseSessions {
  constructor(auth=firebaseAuth,fetcher=fetch){this.auth=auth;this.fetcher=fetcher;this.revoked=new Set();this.activeSessions=new Map();}
  async verifyPassword(email,password) {
    requireFirebaseConfig();
    const response=await this.fetcher(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(process.env.FIREBASE_WEB_API_KEY)}`,{
      method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password,returnSecureToken:true})
    });
    if(!response.ok)return null;
    return response.json();
  }
  async signIn(email,password,remember=false) {
    const result = await this.verifyPassword(email, password);
    if (!result) return null;
    const seconds=remember?14*86400:8*3600;
    const cookie=await this.auth.createSessionCookie(result.idToken,{expiresIn:seconds*1000});
    return {uid:result.localId,cookie:cookie,seconds};
  }
  async verify(cookie) {
    if(!cookie||this.revoked.has(cookie))return null;
    try{
      const claims = await this.auth.verifySessionCookie(cookie,true);
      const id = sessionFingerprint(cookie);
      const tracked = this.activeSessions.get(id);
      if (tracked) tracked.lastActiveAt = new Date().toISOString();
      return claims;
    }catch{return null;}
  }
  revoke(cookie){
    if(cookie){
      this.revoked.add(cookie);
      this.activeSessions.delete(sessionFingerprint(cookie));
    }
  }
  recordSession(uid, cookie, meta = {}) {
    if (!uid || !cookie || this.revoked.has(cookie)) return null;
    const id = sessionFingerprint(cookie);
    const now = meta.now instanceof Date ? meta.now : new Date();
    const nowIso = now.toISOString();
    const existing = this.activeSessions.get(id);
    if (existing) {
      existing.lastActiveAt = nowIso;
      if (meta.ip) existing.ip = String(meta.ip).replace(/^::ffff:/, '');
      if (meta.userAgent) {
        existing.userAgent = String(meta.userAgent).slice(0, 300);
        existing.deviceLabel = describeUserAgent(meta.userAgent);
      }
      return { ...existing, isNew: false };
    }
    const seconds = Number(meta.seconds) > 0 ? Number(meta.seconds) : (meta.remember ? 14 * 86400 : 8 * 3600);
    const entry = {
      id,
      uid: String(uid),
      cookie,
      deviceLabel: describeUserAgent(meta.userAgent),
      userAgent: String(meta.userAgent || '').slice(0, 300),
      ip: String(meta.ip || '127.0.0.1').replace(/^::ffff:/, ''),
      createdAt: nowIso,
      lastActiveAt: nowIso,
      expiresAt: new Date(now.getTime() + seconds * 1000).toISOString(),
      remember: Boolean(meta.remember)
    };
    this.activeSessions.set(id, entry);
    return { ...entry, isNew: true };
  }
  listSessions(uid, currentCookie = null, meta = {}) {
    const userId = String(uid || '');
    if (!userId) return [];
    if (currentCookie && !this.revoked.has(currentCookie)) {
      this.recordSession(userId, currentCookie, meta);
    }
    const currentId = currentCookie ? sessionFingerprint(currentCookie) : null;
    const nowMs = Date.now();
    const list = [];
    for (const [id, entry] of this.activeSessions.entries()) {
      if (this.revoked.has(entry.cookie) || new Date(entry.expiresAt).getTime() <= nowMs) {
        this.activeSessions.delete(id);
        continue;
      }
      if (entry.uid !== userId) continue;
      list.push({
        id: entry.id,
        device_label: entry.deviceLabel,
        ip: entry.ip,
        created_at: entry.createdAt,
        last_active_at: entry.lastActiveAt,
        expires_at: entry.expiresAt,
        remember: entry.remember,
        is_current: entry.id === currentId
      });
    }
    return list.sort((a, b) => (b.is_current ? 1 : 0) - (a.is_current ? 1 : 0) || String(b.last_active_at).localeCompare(String(a.last_active_at)));
  }
  revokeSessionById(uid, sessionId, currentCookie = null) {
    const entry = this.activeSessions.get(String(sessionId || ''));
    if (!entry || entry.uid !== String(uid)) return null;
    this.revoked.add(entry.cookie);
    this.activeSessions.delete(entry.id);
    return {
      revoked: true,
      id: entry.id,
      device_label: entry.deviceLabel,
      revokedCurrent: Boolean(currentCookie && entry.cookie === currentCookie)
    };
  }
  revokeOtherSessions(uid, currentCookie = null) {
    const userId = String(uid || '');
    let revokedCount = 0;
    for (const [id, entry] of this.activeSessions.entries()) {
      if (entry.uid === userId && entry.cookie !== currentCookie) {
        this.revoked.add(entry.cookie);
        this.activeSessions.delete(id);
        revokedCount++;
      }
    }
    return { revoked: true, revoked_count: revokedCount, revokedCount };
  }
  async sendPasswordReset(email) {
    requireFirebaseConfig();
    const response = await this.fetcher(`https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=${encodeURIComponent(process.env.FIREBASE_WEB_API_KEY)}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({requestType:'PASSWORD_RESET',email})});
    if (!response.ok) {
      const code = (await response.json().catch(() => ({}))).error?.message;
      // Keep unknown addresses private, while reporting real delivery/config failures.
      if (code !== 'EMAIL_NOT_FOUND') throw Object.assign(new Error('Could not send the reset email. Please try again later.'), { status: response.status === 429 ? 429 : 503 });
    }
  }
}

export async function changeWorkspacePassword(auth, db, user, input, sessions, now = new Date()) {
  validationFailure(passwordError(input?.newPassword));
  validationFailure(passwordMatchError(input.newPassword, input.confirmPassword));
  const currentPassword = typeof input.currentPassword === 'string' ? input.currentPassword : '';
  if (!currentPassword || currentPassword.length > 1024) validationFailure('Enter your current or temporary password.');
  if (input.newPassword === currentPassword) validationFailure('Choose a new password different from your temporary password.');
  const credential = await sessions.verifyPassword(user.email, currentPassword);
  if (!credential || String(credential.localId) !== String(user.id)) throw Object.assign(new Error('The current or temporary password is incorrect.'), { status: 400 });
  await auth.updateUser(String(user.id), { password: input.newPassword });
  await auth.revokeRefreshTokens(String(user.id));
  sessions.revokeOtherSessions?.(String(user.id), null);
  const batch = db.batch();
  batch.update(db.collection('users').doc(String(user.id)), { must_change_password: false, password_changed_at: now, updated_at: now });
  stageAudit(batch, db, user.id, 'STAFF_PASSWORD_CHANGED', 'USER', user.id, { after: { must_change_password: false }, now });
  await batch.commit();
  return { ...user, must_change_password: false };
}
