import { and, desc, eq, sql } from 'drizzle-orm';
import { db } from '../index';
import { resumes, resumeSections } from '../pg-schema';

type ResumeMutationTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type ResumeRow = typeof resumes.$inferSelect;
type ResumeSectionRow = typeof resumeSections.$inferSelect;

export interface ResumeMutationSnapshot extends ResumeRow {
  sections: ResumeSectionRow[];
}

export class ResumeRevisionConflictError extends Error {
  constructor(public readonly currentRevision: number) {
    super('Resume revision conflict');
    this.name = 'ResumeRevisionConflictError';
  }
}

export class InvalidResumeRevisionError extends Error {
  constructor(public readonly revision: unknown) {
    super('Resume revision is invalid');
    this.name = 'InvalidResumeRevisionError';
  }
}

function assertRevision(revision: unknown): asserts revision is number {
  if (!Number.isSafeInteger(revision) || (revision as number) < 0) {
    throw new InvalidResumeRevisionError(revision);
  }
}

function valuesEqual(left: unknown, right: unknown) {
  return JSON.stringify(left) === JSON.stringify(right);
}

async function loadSnapshot(tx: ResumeMutationTransaction, id: string, lock = false) {
  let query = tx.select().from(resumes).where(eq(resumes.id, id)).limit(1);
  if (lock) query = query.for('update') as typeof query;
  const resume = await query;
  if (!resume[0]) return null;
  const sections = await tx
    .select()
    .from(resumeSections)
    .where(eq(resumeSections.resumeId, id))
    .orderBy(resumeSections.sortOrder);
  return { ...resume[0], sections };
}

export async function mutateResume(
  id: string,
  expectedRevision: number | undefined,
  mutation: (
    tx: ResumeMutationTransaction,
    snapshot: ResumeMutationSnapshot,
  ) => Promise<boolean | void>,
) {
  return db.transaction(async (tx) => {
    const snapshot = await loadSnapshot(tx, id, true);
    if (!snapshot) return null;

    assertRevision(snapshot.revision);
    if (expectedRevision !== undefined && snapshot.revision !== expectedRevision) {
      throw new ResumeRevisionConflictError(snapshot.revision);
    }

    const changed = await mutation(tx, snapshot);
    if (changed === false) return snapshot;
    if (snapshot.revision === Number.MAX_SAFE_INTEGER) {
      throw new InvalidResumeRevisionError(snapshot.revision);
    }

    const updated = await tx
      .update(resumes)
      .set({
        revision: sql`${resumes.revision} + 1`,
        updatedAt: new Date(),
      })
      .where(and(eq(resumes.id, id), eq(resumes.revision, snapshot.revision)))
      .returning({ revision: resumes.revision });

    if (!updated[0]) {
      const latest = await tx
        .select({ revision: resumes.revision })
        .from(resumes)
        .where(eq(resumes.id, id))
        .limit(1);
      throw new ResumeRevisionConflictError(latest[0]?.revision ?? snapshot.revision);
    }

    return loadSnapshot(tx, id);
  });
}

export const resumeRepository = {
  async findAllByUserId(userId: string) {
    return db.select().from(resumes).where(eq(resumes.userId, userId)).orderBy(desc(resumes.updatedAt));
  },

  async findById(id: string) {
    const resume = await db.select().from(resumes).where(eq(resumes.id, id)).limit(1);
    if (!resume[0]) return null;
    assertRevision(resume[0].revision);
    const sections = await db.select().from(resumeSections).where(eq(resumeSections.resumeId, id)).orderBy(resumeSections.sortOrder);
    return { ...resume[0], sections };
  },

  async create(data: { userId: string; title?: string; template?: string; language?: string; themeConfig?: unknown }) {
    const id = crypto.randomUUID();
    await db.insert(resumes).values({
      id,
      userId: data.userId,
      title: data.title || '未命名简历',
      template: data.template || 'classic',
      language: data.language || 'zh',
      ...(data.themeConfig !== undefined ? { themeConfig: data.themeConfig } : {}),
    });
    return this.findById(id);
  },

  async update(id: string, data: Partial<{ title: string; template: string; themeConfig: unknown; language: string }>) {
    await db.update(resumes).set({ ...data, updatedAt: new Date() }).where(eq(resumes.id, id));
    return this.findById(id);
  },

  async replaceContent(id: string, expectedRevision: number, data: {
    title?: string;
    template?: string;
    themeConfig?: unknown;
    sections?: Array<{
      id: string;
      type: string;
      title: string;
      sortOrder: number;
      visible: boolean;
      content: unknown;
    }>;
  }) {
    assertRevision(expectedRevision);
    return mutateResume(id, expectedRevision, async (tx, snapshot) => {
      const metadata: Partial<{ title: string; template: string; themeConfig: unknown }> = {};
      if (data.title !== undefined && data.title !== snapshot.title) metadata.title = data.title;
      if (data.template !== undefined && data.template !== snapshot.template) metadata.template = data.template;
      if (data.themeConfig !== undefined && !valuesEqual(data.themeConfig, snapshot.themeConfig)) metadata.themeConfig = data.themeConfig;

      let changed = Object.keys(metadata).length > 0;
      if (changed) await tx.update(resumes).set(metadata).where(eq(resumes.id, id));

      if (data.sections) {
        const existingById = new Map(snapshot.sections.map((section) => [section.id, section]));
        const incomingIds = new Set(data.sections.map((section) => section.id));

        for (const existing of snapshot.sections) {
          if (!incomingIds.has(existing.id)) {
            changed = true;
            await tx.delete(resumeSections).where(and(eq(resumeSections.id, existing.id), eq(resumeSections.resumeId, id)));
          }
        }

        for (const section of data.sections) {
          const existing = existingById.get(section.id);
          if (!existing) {
            changed = true;
            await tx.insert(resumeSections).values({ ...section, resumeId: id });
            continue;
          }

          const sectionChanged = existing.title !== section.title
            || existing.sortOrder !== section.sortOrder
            || existing.visible !== section.visible
            || !valuesEqual(existing.content, section.content);
          if (sectionChanged) {
            changed = true;
            await tx
              .update(resumeSections)
              .set({
                title: section.title,
                sortOrder: section.sortOrder,
                visible: section.visible,
                content: section.content,
                updatedAt: new Date(),
              })
              .where(and(eq(resumeSections.id, section.id), eq(resumeSections.resumeId, id)));
          }
        }
      }

      return changed;
    });
  },

  async updateSectionWithRevision(id: string, expectedRevision: number, sectionId: string, data: Partial<{ title: string; sortOrder: number; visible: boolean; content: unknown }>) {
    assertRevision(expectedRevision);
    return mutateResume(id, expectedRevision, async (tx, snapshot) => {
      if (!snapshot.sections.some((section) => section.id === sectionId)) return false;
      await tx.update(resumeSections)
        .set({ ...data, updatedAt: new Date() })
        .where(and(eq(resumeSections.id, sectionId), eq(resumeSections.resumeId, id)));
      return true;
    });
  },

  async createSectionWithRevision(id: string, expectedRevision: number, data: { id: string; type: string; title: string; sortOrder: number; visible?: boolean; content?: unknown }) {
    assertRevision(expectedRevision);
    return mutateResume(id, expectedRevision, async (tx) => {
      await tx.insert(resumeSections).values({
        id: data.id,
        resumeId: id,
        type: data.type,
        title: data.title,
        sortOrder: data.sortOrder,
        visible: data.visible ?? true,
        content: data.content || {},
      });
      return true;
    });
  },

  async updateSectionsWithRevision(id: string, expectedRevision: number, sections: Array<{ sectionId: string; title?: string; content: unknown }>, language?: string) {
    assertRevision(expectedRevision);
    return mutateResume(id, expectedRevision, async (tx, snapshot) => {
      const existingIds = new Set(snapshot.sections.map((section) => section.id));
      for (const section of sections) {
        if (!existingIds.has(section.sectionId)) continue;
        await tx.update(resumeSections)
          .set({
            ...(section.title !== undefined ? { title: section.title } : {}),
            content: section.content,
            updatedAt: new Date(),
          })
          .where(and(eq(resumeSections.id, section.sectionId), eq(resumeSections.resumeId, id)));
      }
      if (language !== undefined) await tx.update(resumes).set({ language });
      return sections.length > 0 || language !== undefined;
    });
  },

  async delete(id: string) {
    await db.delete(resumes).where(eq(resumes.id, id));
  },

  async duplicate(id: string, userId: string, titleOverride?: string) {
    const original = await this.findById(id);
    if (!original) return null;

    const newId = crypto.randomUUID();
    await db.insert(resumes).values({
      id: newId,
      userId,
      title: titleOverride ?? `${original.title} (副本)`,
      template: original.template,
      themeConfig: original.themeConfig,
      language: original.language,
    });

    for (const section of original.sections) {
      await db.insert(resumeSections).values({
        id: crypto.randomUUID(),
        resumeId: newId,
        type: section.type,
        title: section.title,
        sortOrder: section.sortOrder,
        visible: section.visible,
        content: section.content,
      });
    }

    return this.findById(newId);
  },

  async findByShareToken(token: string) {
    const resume = await db.select().from(resumes).where(eq(resumes.shareToken, token)).limit(1);
    if (!resume[0]) return null;
    const sections = await db.select().from(resumeSections).where(eq(resumeSections.resumeId, resume[0].id)).orderBy(resumeSections.sortOrder);
    return { ...resume[0], sections };
  },

  async incrementViewCount(id: string) {
    await db.update(resumes).set({ viewCount: sql`${resumes.viewCount} + 1` }).where(eq(resumes.id, id));
  },

  async updateShareSettings(id: string, settings: { isPublic?: boolean; shareToken?: string | null; sharePassword?: string | null }) {
    await db.update(resumes).set({ ...settings, updatedAt: new Date() }).where(eq(resumes.id, id));
  },

  async createSection(data: { id?: string; resumeId: string; type: string; title: string; sortOrder: number; visible?: boolean; content?: unknown }) {
    const id = data.id || crypto.randomUUID();
    await db.insert(resumeSections).values({
      id,
      resumeId: data.resumeId,
      type: data.type,
      title: data.title,
      sortOrder: data.sortOrder,
      visible: data.visible ?? true,
      content: data.content || {},
    });
    return db.select().from(resumeSections).where(eq(resumeSections.id, id)).limit(1).then((rows) => rows[0]);
  },

  async updateSection(id: string, data: Partial<{ title: string; sortOrder: number; visible: boolean; content: unknown }>) {
    await db.update(resumeSections).set({ ...data, updatedAt: new Date() }).where(eq(resumeSections.id, id));
  },

  async deleteSection(id: string) {
    await db.delete(resumeSections).where(eq(resumeSections.id, id));
  },

  async updateSectionOrder(sections: { id: string; sortOrder: number }[]) {
    for (const section of sections) {
      await db.update(resumeSections).set({ sortOrder: section.sortOrder, updatedAt: new Date() }).where(eq(resumeSections.id, section.id));
    }
  },
};
