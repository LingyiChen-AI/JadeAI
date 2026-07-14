import { NextResponse } from 'next/server';
import { resolveUser, getUserIdFromRequest } from '@/lib/auth/helpers';
import { announcementRepository } from '@/lib/db/repositories/announcement.repository';
export async function GET(request: Request) { const user = await resolveUser(getUserIdFromRequest(request)); if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 }); return NextResponse.json(await announcementRepository.listForUser(user.id)); }
