import { and, desc, eq, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { TEMPLATES } from '../../constants';
import {
  parseStoredTemplateSnapshot,
  type ResumeTemplateBindingInput,
} from '../../templates/apply-template-binding.server';
import { db } from '../index';
import {
  resumes,
  resumeSections,
  resumeTemplates,
  resumeTemplateVersions,
  templateCategories,
  templateRecentUsage,
} from '../pg-schema';

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

type ResolvedBinding = {
  values: Pick<ResumeRow, 'template' | 'templateSource' | 'templateVersionId' | 'templateSnapshot'>;
  publicTemplateId: string | null;
  publicVersionId: string | null;
};

const stableTemplateVersions = alias(resumeTemplateVersions, 'stable_template_version');

async function resolveBinding(
  tx: ResumeMutationTransaction,
  binding: ResumeTemplateBindingInput,
): Promise<ResolvedBinding> {
  if (binding.kind === 'legacy') {
    if (!(TEMPLATES as readonly string[]).includes(binding.templateSlug)) {
      throw new Error('unknown_legacy_template');
    }
    return {
      values: {
        template: binding.templateSlug,
        templateSource: 'legacy',
        templateVersionId: null,
        templateSnapshot: null,
      },
      publicTemplateId: null,
      publicVersionId: null,
    };
  }

  if (binding.kind === 'local-snapshot') {
    const snapshot = parseStoredTemplateSnapshot(binding.snapshot);
    return {
      values: {
        template: 'classic',
        templateSource: 'local-snapshot',
        templateVersionId: null,
        templateSnapshot: snapshot,
      },
      publicTemplateId: null,
      publicVersionId: null,
    };
  }

  const resolved = await tx
    .select({
      templateId: resumeTemplates.id,
      templateSlug: resumeTemplates.slug,
      versionId: resumeTemplateVersions.id,
    })
    .from(resumeTemplates)
    .innerJoin(templateCategories, and(
      eq(templateCategories.id, resumeTemplates.categoryId),
      eq(templateCategories.isActive, true),
    ))
    .innerJoin(stableTemplateVersions, and(
      eq(stableTemplateVersions.id, resumeTemplates.stableVersionId),
      eq(stableTemplateVersions.templateId, resumeTemplates.id),
      eq(stableTemplateVersions.status, 'published'),
      sql`${stableTemplateVersions.publishedAt} is not null`,
    ))
    .innerJoin(resumeTemplateVersions, and(
      eq(resumeTemplateVersions.templateId, resumeTemplates.id),
      eq(resumeTemplateVersions.version, binding.version),
      eq(resumeTemplateVersions.status, 'published'),
    ))
    .where(and(
      eq(resumeTemplates.slug, binding.templateSlug),
      eq(resumeTemplates.status, 'published'),
      sql`${resumeTemplates.publishedAt} is not null`,
      sql`${resumeTemplateVersions.publishedAt} is not null`,
    ))
    .limit(1);
  if (!resolved[0]) throw new Error('template_version_not_found');

  return {
    values: {
      template: resolved[0].templateSlug,
      templateSource: 'public',
      templateVersionId: resolved[0].versionId,
      templateSnapshot: null,
    },
    publicTemplateId: resolved[0].templateId,
    publicVersionId: resolved[0].versionId,
  };
}

async function recordPublicBindingUsage(
  tx: ResumeMutationTransaction,
  userId: string,
  templateId: string,
  versionId: string,
) {
  try {
    const updated = await tx
      .update(resumeTemplates)
      .set({ usageCount: sql`${resumeTemplates.usageCount} + 1`, updatedAt: new Date() })
      .where(and(
        eq(resumeTemplates.id, templateId),
        eq(resumeTemplates.status, 'published'),
        sql`${resumeTemplates.publishedAt} is not null`,
        sql`EXISTS (
          SELECT 1 FROM template_categories AS category
          WHERE category.id = ${resumeTemplates.categoryId} AND category.is_active = 1
        )`,
        sql`EXISTS (
          SELECT 1 FROM resume_template_versions AS stable
          WHERE stable.id = ${resumeTemplates.stableVersionId}
            AND stable.template_id = ${resumeTemplates.id}
            AND stable.status = 'published' AND stable.published_at IS NOT NULL
        )`,
        sql`EXISTS (
          SELECT 1 FROM resume_template_versions AS requested
          WHERE requested.id = ${versionId}
            AND requested.template_id = ${resumeTemplates.id}
            AND requested.status = 'published' AND requested.published_at IS NOT NULL
        )`,
      ))
      .returning({ id: resumeTemplates.id });
    if (updated.length !== 1) throw new Error('template_version_not_found');
    await tx
      .insert(templateRecentUsage)
      .values({ userId, templateId, useCount: 1, lastUsedAt: new Date() })
      .onConflictDoUpdate({
        target: [templateRecentUsage.userId, templateRecentUsage.templateId],
        set: {
          useCount: sql`${templateRecentUsage.useCount} + 1`,
          lastUsedAt: new Date(),
        },
      });
    await tx.execute(sql`
      DELETE FROM template_recent_usage AS recent
      WHERE recent.user_id = ${userId}
        AND recent.template_id NOT IN (
          SELECT kept.template_id FROM template_recent_usage AS kept
          WHERE kept.user_id = ${userId}
          ORDER BY kept.last_used_at DESC, kept.template_id ASC
          LIMIT 20
        )
    `);
  } catch (error) {
    if (error instanceof Error && error.cause instanceof Error) throw error.cause;
    throw error;
  }
}

function bindingValuesChanged(snapshot: ResumeRow, values: ResolvedBinding['values']) {
  return snapshot.template !== values.template
    || snapshot.templateSource !== values.templateSource
    || snapshot.templateVersionId !== values.templateVersionId
    || !valuesEqual(snapshot.templateSnapshot, values.templateSnapshot);
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

  async create(data: {
    userId: string;
    title?: string;
    template?: string;
    language?: string;
    themeConfig?: unknown;
    binding?: ResumeTemplateBindingInput;
    sections?: Array<{
      id: string;
      type: string;
      title: string;
      sortOrder: number;
      visible: boolean;
      content: unknown;
    }>;
  }) {
    const id = crypto.randomUUID();
    return db.transaction(async (tx) => {
      const binding = await resolveBinding(tx, data.binding ?? {
        kind: 'legacy',
        templateSlug: (TEMPLATES as readonly string[]).includes(data.template ?? '')
          ? data.template as (typeof TEMPLATES)[number]
          : 'classic',
      });
      await tx.insert(resumes).values({
        id,
        userId: data.userId,
        title: data.title || '未命名简历',
        language: data.language || 'zh',
        ...binding.values,
        ...(data.themeConfig !== undefined ? { themeConfig: data.themeConfig } : {}),
      });
      if (data.sections?.length) {
        await tx.insert(resumeSections).values(data.sections.map((section) => ({
          ...section,
          id: crypto.randomUUID(),
          resumeId: id,
        })));
      }
      if (binding.publicTemplateId) {
        await recordPublicBindingUsage(tx, data.userId, binding.publicTemplateId, binding.publicVersionId!);
      }
      return loadSnapshot(tx, id);
    });
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
    binding?: ResumeTemplateBindingInput;
  }) {
    assertRevision(expectedRevision);
    return mutateResume(id, expectedRevision, async (tx, snapshot) => {
      const metadata: Partial<Pick<ResumeRow, 'title' | 'template' | 'themeConfig' | 'templateSource' | 'templateVersionId' | 'templateSnapshot'>> = {};
      if (data.title !== undefined && data.title !== snapshot.title) metadata.title = data.title;
      if (data.binding !== undefined) {
        const binding = await resolveBinding(tx, data.binding);
        if (bindingValuesChanged(snapshot, binding.values)) Object.assign(metadata, binding.values);
        if (binding.publicTemplateId && bindingValuesChanged(snapshot, binding.values)) {
          await recordPublicBindingUsage(tx, snapshot.userId, binding.publicTemplateId, binding.publicVersionId!);
        }
      } else if (snapshot.templateSource === 'legacy'
        && data.template !== undefined
        && data.template !== snapshot.template
        && (TEMPLATES as readonly string[]).includes(data.template)) {
        metadata.template = data.template;
      }
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
      templateSource: original.templateSource,
      templateVersionId: original.templateVersionId,
      templateSnapshot: original.templateSnapshot,
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
