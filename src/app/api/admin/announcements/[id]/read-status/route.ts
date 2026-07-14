import { NextResponse } from 'next/server';
import { getAdminSession } from '@/lib/admin-auth';
import { announcementRepository } from '@/lib/db/repositories/announcement.repository';
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) { if (!await getAdminSession()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 }); const url = new URL(request.url); const limit = Math.min(100, Number(url.searchParams.get('pageSize') || 20)); const page = Math.max(1, Number(url.searchParams.get('page') || 1)); return NextResponse.json({ items: await announcementRepository.readStatus((await params).id, limit, (page - 1) * limit), page, pageSize: limit }); }
