import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import bcrypt from 'bcryptjs';

const derive = promisify(scrypt);
export async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const key = await derive(password, salt, 64);
  return `scrypt$${salt}$${key.toString('hex')}`;
}
export async function verifyPassword(password, hash) {
  if (typeof hash !== 'string' || typeof password !== 'string') return false;
  if (/^\$2[aby]\$/.test(hash)) return bcrypt.compare(password, hash.replace(/^\$2y\$/, '$2b$'));
  const [method, salt, encoded] = hash.split('$');
  if (method !== 'scrypt' || !/^[a-f0-9]{32}$/.test(salt || '') || !/^[a-f0-9]{128}$/.test(encoded || '')) return false;
  const expected = Buffer.from(encoded, 'hex');
  const actual = await derive(password, salt, 64);
  return timingSafeEqual(expected, actual);
}
export const publicUser = row => ({ id: String(row.id), name: row.full_name, email: row.email, role: row.role });

export class Sessions {
  #values = new Map();
  create(userId, remember = false) {
    this.prune();
    const token = randomBytes(32).toString('hex');
    const seconds = remember ? 30 * 86400 : 8 * 3600;
    this.#values.set(token, { userId, expires: Date.now() + seconds * 1000 });
    return {token,seconds};
  }
  get(token) {
    const session = this.#values.get(token);
    if (!session || session.expires <= Date.now()) { this.#values.delete(token); return null; }
    return session;
  }
  delete(token) { this.#values.delete(token); }
  prune() { for(const [token, session] of this.#values) if(session.expires <= Date.now()) this.#values.delete(token); }
}
