// Local UI preview only: in-memory identities, no Firebase changes or emails.
import { createApi } from '../../src/server.mjs';
import { loadDashboard } from '../../src/dashboard.mjs';
import { loadWorkspace, createWorkspaceUser, createMobileCustomerAccount } from '../../src/workspace.mjs';
import { changeWorkspacePassword } from '../../src/auth.mjs';
import { emailError, validationFailure, validateEmailFormat } from '../../src/account-validation.mjs';
import { memoryFirestore } from './memory-firestore.mjs';

const db = memoryFirestore({ users: {
  owner: { full_name: 'Preview Owner', email: 'owner@school.edu.ph', role: 'OWNER', is_active: true },
  operator: { full_name: 'Preview Operator', email: 'operator@school.edu.ph', role: 'OPERATOR', is_active: true, must_change_password: true }
} });
const passwords = new Map([['owner', 'OwnerPass8'], ['operator', 'Operator8']]), cookies = new Map();
let sequence = 0;
const previewLoginDelay = Math.max(0, Math.min(10000, Number(process.env.AUTH_UI_LOGIN_DELAY_MS || 350)));
const previewDashboardDelay = Math.max(0, Math.min(10000, Number(process.env.AUTH_UI_DASHBOARD_DELAY_MS || 0)));
const auth = {
  createUser: async value => { const uid = 'preview-' + ++sequence; passwords.set(uid, value.password); return { uid }; },
  updateUser: async (uid, value) => { if (value.password) passwords.set(uid, value.password); },
  deleteUser: async uid => passwords.delete(uid),
  revokeRefreshTokens: async uid => { for (const [cookie, id] of cookies) if (id === uid) cookies.delete(cookie); }
};
const sessions = {
  verifyPassword: async (email, password) => { const user = db.records('users').find(user => user.email === email); return user && passwords.get(user.id) === password ? { localId: user.id } : null; },
  signIn: async (email, password) => {
    await new Promise(resolve => setTimeout(resolve, previewLoginDelay));
    const credential = await sessions.verifyPassword(email, password); if (!credential) return null;
    const cookie = 'preview-cookie-' + ++sequence; cookies.set(cookie, credential.localId); return { uid: credential.localId, cookie, seconds: 28800 };
  },
  verify: async cookie => cookies.has(cookie) ? { uid: cookies.get(cookie) } : null,
  revoke: cookie => cookies.delete(cookie), sendPasswordReset: async () => {}
};
const validateEmail = async value => {
  validationFailure(emailError(value));
  if (value.endsWith('@unknown.example')) throw Object.assign(new Error('This email domain cannot receive email. Check the spelling or use another address.'), { status: 400, code: 'INVALID_EMAIL_DOMAIN' });
  return value.toLowerCase();
};
const services = {
  firebaseProjectId: 'local-auth-preview', validateEmail, health: async () => {},
  getUser: async id => db.data('users', id) ? { id, ...db.data('users', id) } : null, touchLogin: async () => {},
  dashboard: async () => { await new Promise(resolve => setTimeout(resolve, previewDashboardDelay)); return loadDashboard(db); }, workspace: role => loadWorkspace(db, role),
  createUser: (actor, input) => createWorkspaceUser(auth, db, actor, input, new Date(), { validateEmail: validateEmailFormat, sendCredentials: async () => {} }),
  createMobileCustomerAccount: (actor, input) => createMobileCustomerAccount(auth, db, actor, input, new Date(), { validateEmail: validateEmailFormat }),
  changeStaffPassword: (user, input) => changeWorkspacePassword(auth, db, user, input, sessions),
  listNotifications: async () => ({ notifications: [], unread_count: 0, revision: 0 })
};
const server = createApi({ services, sessions, expiryWorker: false, notificationWorker: false });
server.listen(Number(process.argv[2] || 5485), '127.0.0.1', () => console.log(`Auth UI preview: http://127.0.0.1:${server.address().port}`));
