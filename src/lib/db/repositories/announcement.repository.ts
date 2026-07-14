import { and, desc, eq, gte, isNull, lte, lt, or, sql } from 'drizzle-orm';
import { db } from '../index';
import { announcementReads, announcements } from '../pg-schema';

const asDate = (value: Date | number | null | undefined) => value == null ? null : value instanceof Date ? value : new Date(value * 1000);

export const announcementRepository = {
  async listAdmin(filters: { status?: string; notifyMode?: string; search?: string; limit: number; offset: number }) {
    const where = [] as any[];
    if (filters.status) where.push(eq(announcements.status, filters.status));
    if (filters.notifyMode) where.push(eq(announcements.notifyMode, filters.notifyMode));
    if (filters.search) where.push(or(sql`${announcements.title} like ${`%${filters.search}%`}`, sql`${announcements.content} like ${`%${filters.search}%`}`));
    return db.select().from(announcements).where(where.length ? and(...where) : undefined).orderBy(desc(announcements.createdAt), desc(announcements.id)).limit(filters.limit).offset(filters.offset);
  },
  async findById(id: string) { return (await db.select().from(announcements).where(eq(announcements.id, id)).limit(1))[0] || null; },
  async create(data: any) { const id = crypto.randomUUID(); await db.insert(announcements).values({ id, ...data }); return this.findById(id); },
  async update(id: string, data: any) { await db.update(announcements).set({ ...data, updatedAt: new Date() } as any).where(eq(announcements.id, id)); return this.findById(id); },
  async delete(id: string) { await db.delete(announcements).where(eq(announcements.id, id)); },
  async listForUser(userId: string) {
    const now = Math.floor(Date.now() / 1000);
    const rows = await db.select({ announcement: announcements, readAt: announcementReads.readAt })
      .from(announcements).leftJoin(announcementReads, and(eq(announcementReads.announcementId, announcements.id), eq(announcementReads.userId, userId)))
      .where(and(eq(announcements.status, 'active'), or(isNull(announcements.startsAt), lte(announcements.startsAt, now)), or(isNull(announcements.endsAt), gte(announcements.endsAt, now))))
      .orderBy(desc(announcements.createdAt), desc(announcements.id)).limit(200);
    return rows.map((row: any) => ({ ...row.announcement, readAt: asDate(row.readAt) }));
  },
  async markRead(announcementId: string, userId: string) {
    await db.insert(announcementReads).values({ id: crypto.randomUUID(), announcementId, userId }).onConflictDoNothing();
  },
  async readStatus(announcementId: string, limit: number, offset: number) { return db.select().from(announcementReads).where(eq(announcementReads.announcementId, announcementId)).orderBy(desc(announcementReads.readAt)).limit(limit).offset(offset); },
};
