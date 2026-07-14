import { compare, hash } from 'bcryptjs';
import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import { userRepository } from '@/lib/db/repositories/user.repository';

const COOKIE = 'jade_admin_session';
const secret = () => {
  const value = process.env.ADMIN_JWT_SECRET || (process.env.NODE_ENV === 'production' ? '' : process.env.AUTH_SECRET || 'development-admin-secret-change-me');
  if (!value) throw new Error('ADMIN_JWT_SECRET is required in production');
  return new TextEncoder().encode(value);
};

export async function hashAdminPassword(password: string) { return hash(password, 12); }
export async function verifyAdminPassword(password: string, digest: string) { return compare(password, digest); }

export async function createAdminSession(user: { id: string; tokenVersion: number }) {
  const token = await new SignJWT({ role: 'admin', tokenVersion: user.tokenVersion })
    .setProtectedHeader({ alg: 'HS256' }).setSubject(user.id).setIssuedAt().setExpirationTime('8h').sign(secret());
  (await cookies()).set(COOKIE, token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 8 * 60 * 60 });
}

export async function clearAdminSession() { (await cookies()).delete(COOKIE); }

export async function getAdminSession() {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    if (payload.role !== 'admin' || !payload.sub) return null;
    const user = await userRepository.findById(payload.sub);
    if (!user || user.role !== 'admin' || user.status !== 'active' || user.tokenVersion !== Number(payload.tokenVersion)) return null;
    return user;
  } catch { return null; }
}

export const adminCookieName = COOKIE;
