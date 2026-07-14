import { NextResponse } from 'next/server';
import { resolveUser, getUserIdFromRequest } from '@/lib/auth/helpers';
import { announcementRepository } from '@/lib/db/repositories/announcement.repository';
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) { const user = await resolveUser(getUserIdFromRequest(request)); if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 }); await announcementRepository.markRead((await params).id, user.id); return NextResponse.json({ ok: true }); }
