import { NextResponse } from 'next/server';
import { getAdminSession } from '@/lib/admin-auth';
export async function GET() { const user = await getAdminSession(); return user ? NextResponse.json({ id: user.id, email: user.email, role: user.role }) : NextResponse.json({ error: 'Unauthorized' }, { status: 401 }); }
