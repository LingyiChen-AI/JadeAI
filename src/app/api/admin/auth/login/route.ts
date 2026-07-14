import { NextResponse } from 'next/server';
import { dbReady } from '@/lib/db';
import { createAdminSession, verifyAdminPassword } from '@/lib/admin-auth';
import { userRepository } from '@/lib/db/repositories/user.repository';

export async function POST(request: Request) {
  await dbReady;
  const body = await request.json().catch(() => ({}));
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  const user = email ? await userRepository.findAdminByEmail(email) : null;
  if (!user || !user.passwordHash || user.status !== 'active' || !(await verifyAdminPassword(password, user.passwordHash))) {
    return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
  }
  await createAdminSession(user);
  return NextResponse.json({ id: user.id, email: user.email, role: user.role });
}
