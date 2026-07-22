import type { ClientTemplateBindingChoice } from '@/lib/templates/apply-template-binding.server';
import { toResumeTemplateBindingInput } from '@/lib/templates/apply-template-binding.server';
import type { ResolvedTemplate } from '@/lib/templates/resolve-template';
import { normalizeSectionContent } from '@/lib/resume/normalize-content';
import type { Resume, ResumeSection, SectionContent, ThemeConfig } from '@/types/resume';

export interface ExportDraftSession {
  baseline: Resume;
  draft: Resume;
  pendingBinding: ClientTemplateBindingChoice | null;
}

export type DraftFieldPath = readonly (string | number)[];

export interface DraftFieldUpdate {
  sectionId: string;
  itemId?: string;
  fieldPath: DraftFieldPath;
  value: unknown;
}

export type ExportDraftValidationIssue =
  | { code: 'missing_resume_id' }
  | { code: 'missing_section_id'; sectionIndex: number }
  | { code: 'duplicate_section_id'; sectionIndex: number }
  | { code: 'invalid_section_content'; sectionIndex: number };

function cloneAndNormalizeResume(resume: Resume): Resume {
  const cloned = structuredClone(resume);
  cloned.sections = (cloned.sections || []).map((section, index) => ({
    ...section,
    sortOrder: index,
    content: normalizeSectionContent(section.type, section.content) as SectionContent,
  }));
  return cloned;
}

function canonicalResume(resume: Resume) {
  return {
    id: resume.id,
    title: resume.title,
    template: resume.template,
    templateVersionId: resume.templateVersionId,
    templateSource: resume.templateSource,
    templateSnapshot: resume.templateSnapshot,
    themeConfig: resume.themeConfig,
    language: resume.language,
    revision: resume.revision,
    sections: resume.sections.map((section, index) => ({
      id: section.id,
      resumeId: section.resumeId,
      type: section.type,
      title: section.title,
      sortOrder: index,
      visible: section.visible,
      content: section.content,
    })),
  };
}

export function createExportDraft(resume: Resume): ExportDraftSession {
  // Baseline and draft are cloned independently. Sharing either nested graph would
  // let an in-place input edit silently change the value used by dirty detection.
  return {
    baseline: cloneAndNormalizeResume(resume),
    draft: cloneAndNormalizeResume(resume),
    pendingBinding: null,
  };
}

export function isExportDraftDirty(session: ExportDraftSession): boolean {
  return JSON.stringify(canonicalResume(session.draft)) !== JSON.stringify(canonicalResume(session.baseline));
}

export function acceptSavedResume(
  _session: ExportDraftSession,
  saved: Resume,
): ExportDraftSession {
  // The response is the only authoritative post-save baseline. Clone it twice so
  // editing can resume even when the following export request fails.
  return createExportDraft(saved);
}

function replaceDraft(
  session: ExportDraftSession,
  draft: Resume,
  pendingBinding = session.pendingBinding,
): ExportDraftSession {
  return { ...session, draft, pendingBinding };
}

function setPathValue(root: unknown, path: DraftFieldPath, value: unknown): unknown {
  if (path.length === 0) return value;
  if (root === null || typeof root !== 'object') throw new Error('draft_field_parent_missing');

  const [key, ...rest] = path;
  if (Array.isArray(root)) {
    if (typeof key !== 'number' || key < 0 || key >= root.length) throw new Error('draft_field_path_invalid');
    const next = [...root];
    next[key] = setPathValue(next[key], rest, value);
    return next;
  }

  if (typeof key !== 'string') throw new Error('draft_field_path_invalid');
  const record = root as Record<string, unknown>;
  return { ...record, [key]: setPathValue(record[key], rest, value) };
}

export function updateDraftField(
  session: ExportDraftSession,
  update: DraftFieldUpdate,
): ExportDraftSession {
  let foundSection = false;
  const sections = session.draft.sections.map((section) => {
    if (section.id !== update.sectionId) return section;
    foundSection = true;

    let contentPath: DraftFieldPath = update.fieldPath;
    if (update.itemId) {
      const content = section.content as unknown as { items?: Array<{ id?: string }> };
      const itemIndex = Array.isArray(content.items)
        ? content.items.findIndex((item) => item.id === update.itemId)
        : -1;
      if (itemIndex < 0) throw new Error('draft_item_not_found');
      contentPath = ['items', itemIndex, ...update.fieldPath];
    }

    return {
      ...section,
      content: setPathValue(section.content, contentPath, update.value) as SectionContent,
    };
  });

  if (!foundSection) throw new Error('draft_section_not_found');
  return replaceDraft(session, { ...session.draft, sections });
}

export function addDraftSection(
  session: ExportDraftSession,
  section: ResumeSection,
): ExportDraftSession {
  if (session.draft.sections.some((value) => value.id === section.id)) throw new Error('draft_section_id_duplicate');
  const nextSection = structuredClone(section);
  nextSection.resumeId = session.draft.id;
  nextSection.sortOrder = session.draft.sections.length;
  nextSection.content = normalizeSectionContent(nextSection.type, nextSection.content) as SectionContent;
  return replaceDraft(session, {
    ...session.draft,
    sections: [...session.draft.sections, nextSection],
  });
}

export function removeDraftSection(
  session: ExportDraftSession,
  sectionId: string,
): ExportDraftSession {
  const sections = session.draft.sections
    .filter((section) => section.id !== sectionId)
    .map((section, index) => ({ ...section, sortOrder: index }));
  if (sections.length === session.draft.sections.length) throw new Error('draft_section_not_found');
  return replaceDraft(session, { ...session.draft, sections });
}

export function reorderDraftSections(
  session: ExportDraftSession,
  orderedIds: readonly string[],
): ExportDraftSession {
  if (orderedIds.length !== session.draft.sections.length || new Set(orderedIds).size !== orderedIds.length) {
    throw new Error('draft_section_order_invalid');
  }
  const sectionsById = new Map(session.draft.sections.map((section) => [section.id, section]));
  const sections = orderedIds.map((id, index) => {
    const section = sectionsById.get(id);
    if (!section) throw new Error('draft_section_order_invalid');
    return { ...section, sortOrder: index };
  });
  return replaceDraft(session, { ...session.draft, sections });
}

export function updateDraftSectionTitle(
  session: ExportDraftSession,
  sectionId: string,
  title: string,
): ExportDraftSession {
  let found = false;
  const sections = session.draft.sections.map((section) => {
    if (section.id !== sectionId) return section;
    found = true;
    return { ...section, title };
  });
  if (!found) throw new Error('draft_section_not_found');
  return replaceDraft(session, { ...session.draft, sections });
}

export function toggleDraftSectionVisibility(
  session: ExportDraftSession,
  sectionId: string,
): ExportDraftSession {
  let found = false;
  const sections = session.draft.sections.map((section) => {
    if (section.id !== sectionId) return section;
    found = true;
    return { ...section, visible: !section.visible };
  });
  if (!found) throw new Error('draft_section_not_found');
  return replaceDraft(session, { ...session.draft, sections });
}

export function updateDraftTheme(
  session: ExportDraftSession,
  updates: Partial<ThemeConfig>,
): ExportDraftSession {
  return replaceDraft(session, {
    ...session.draft,
    themeConfig: { ...session.draft.themeConfig, ...structuredClone(updates) },
  });
}

export function setDraftTemplateBinding(
  session: ExportDraftSession,
  binding: ClientTemplateBindingChoice,
  resolvedTemplate?: ResolvedTemplate,
): ExportDraftSession {
  const input = toResumeTemplateBindingInput(binding);
  const draft: Resume = {
    ...session.draft,
    template: binding.kind === 'local-snapshot' ? 'classic' : binding.templateSlug,
    templateSource: binding.kind,
    templateVersionId: null,
    templateSnapshot: input.kind === 'local-snapshot' ? input.snapshot : null,
    resolvedTemplate,
  };
  return replaceDraft(session, draft, structuredClone(binding));
}

export function validateExportDraft(resume: Resume): { issues: ExportDraftValidationIssue[] } {
  const issues: ExportDraftValidationIssue[] = [];
  if (!resume.id.trim()) issues.push({ code: 'missing_resume_id' });
  const seenIds = new Set<string>();
  resume.sections.forEach((section, sectionIndex) => {
    if (!section.id.trim()) {
      issues.push({ code: 'missing_section_id', sectionIndex });
    } else if (seenIds.has(section.id)) {
      issues.push({ code: 'duplicate_section_id', sectionIndex });
    } else {
      seenIds.add(section.id);
    }
    if (!section.content || typeof section.content !== 'object' || Array.isArray(section.content)) {
      issues.push({ code: 'invalid_section_content', sectionIndex });
    }
  });
  return { issues };
}
