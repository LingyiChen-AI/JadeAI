import { NextResponse } from 'next/server';
import { getAdminSession } from '@/lib/admin-auth';
import { announcementRepository } from '@/lib/db/repositories/announcement.repository';

export async function GET(request: Request) {
  if (!await getAdminSession()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const url = new URL(request.url); const page = Math.max(1, Number(url.searchParams.get('page') || 1)); const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('pageSize') || 20)));
  const items = await announcementRepository.listAdmin({ status: url.searchParams.get('status') || undefined, notifyMode: url.searchParams.get('notifyMode') || undefined, search: url.searchParams.get('search') || undefined, limit, offset: (page - 1) * limit });
  return NextResponse.json({ items, page, pageSize: limit });
}

export async function POST(request: Request) {
  const admin = await getAdminSession(); if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await request.json().catch(() => ({})); const title = typeof body.title === 'string' ? body.title.trim() : ''; const content = typeof body.content === 'string' ? body.content.trim() : '';
  if (!title || title.length > 200 || !content || content.length > 200000) return NextResponse.json({ error: 'Invalid announcement' }, { status: 400 });
  if (body.startsAt && body.endsAt && Number(body.endsAt) <= Number(body.startsAt)) return NextResponse.json({ error: 'Invalid time range' }, { status: 400 });
  const item = await announcementRepository.create({ title, content, status: ['draft', 'active', 'archived'].includes(body.status) ? body.status : 'draft', notifyMode: body.notifyMode === 'popup' ? 'popup' : 'silent', startsAt: body.startsAt ? Number(body.startsAt) : null, endsAt: body.endsAt ? Number(body.endsAt) : null, createdBy: admin.id, updatedBy: admin.id });
  return NextResponse.json(item, { status: 201 });
}
