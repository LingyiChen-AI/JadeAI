import { eq, desc, sql } from 'drizzle-orm';
import { db } from '../index';
import { resumeShares } from '../pg-schema';

export const shareRepository = {
  async findByResumeId(resumeId: string) {
    return db
      .select()
      .from(resumeShares)
      .where(eq(resumeShares.resumeId, resumeId))
      .orderBy(desc(resumeShares.createdAt));
  },

  async findByToken(token: string) {
    const rows = await db
      .select()
      .from(resumeShares)
      .where(eq(resumeShares.token, token))
      .limit(1);
    return rows[0] ?? null;
  },

  async findById(id: string) {
    const rows = await db
      .select()
      .from(resumeShares)
      .where(eq(resumeShares.id, id))
      .limit(1);
    return rows[0] ?? null;
  },

  async create(data: {
    resumeId: string;
    token: string;
    label?: string;
    password?: string | null;
  }) {
    const id = crypto.randomUUID();
    await db.insert(resumeShares).values({
      id,
      resumeId: data.resumeId,
      token: data.token,
      label: data.label || '',
      password: data.password ?? null,
    } as any);
    const rows = await db.select().from(resumeShares).where(eq(resumeShares.id, id)).limit(1);
    return rows[0];
  },

  async update(id: string, data: {
    label?: string;
    password?: string | null;
    isActive?: boolean;
  }) {
    const setClause: Record<string, unknown> = { updatedAt: new Date() };
    if (data.label !== undefined) setClause.label = data.label;
    if (data.password !== undefined) setClause.password = data.password;
    if (data.isActive !== undefined) setClause.isActive = data.isActive;

    await db.update(resumeShares).set(setClause as any).where(eq(resumeShares.id, id));
    const rows = await db.select().from(resumeShares).where(eq(resumeShares.id, id)).limit(1);
    return rows[0] ?? null;
  },

  async delete(id: string) {
    await db.delete(resumeShares).where(eq(resumeShares.id, id));
  },

  async incrementViewCount(id: string) {
    await db
      .update(resumeShares)
      .set({ viewCount: sql`${resumeShares.viewCount} + 1` })
      .where(eq(resumeShares.id, id));
  },
};
