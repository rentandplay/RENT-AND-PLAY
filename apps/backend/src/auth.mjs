import {firebaseAuth,requireFirebaseConfig} from './firebase.mjs';
import { normalizeRole } from './roles.mjs';
import { passwordError, passwordMatchError, validationFailure } from './account-validation.mjs';
import { stageAudit } from './audit.mjs';

export const publicUser = row => ({ id: String(row.id), name: row.full_name, email: row.email, role: normalizeRole(row.role) || row.role, mustChangePassword: row.must_change_password === true });

export class FirebaseSessions {
  constructor(auth=firebaseAuth,fetcher=fetch){this.auth=auth;this.fetcher=fetcher;this.revoked=new Set();}
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
    try{return await this.auth.verifySessionCookie(cookie,true);}catch{return null;}
  }
  revoke(cookie){if(cookie)this.revoked.add(cookie);}
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
  const batch = db.batch();
  batch.update(db.collection('users').doc(String(user.id)), { must_change_password: false, password_changed_at: now, updated_at: now });
  stageAudit(batch, db, user.id, 'STAFF_PASSWORD_CHANGED', 'USER', user.id, { after: { must_change_password: false }, now });
  await batch.commit();
  return { ...user, must_change_password: false };
}
