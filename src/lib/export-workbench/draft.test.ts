import { describe, expect, it } from 'vitest';
import type { Resume, ResumeSection, WorkExperienceContent } from '@/types/resume';
import {
  acceptSavedResume,
  addDraftSection,
  createExportDraft,
  isExportDraftDirty,
  removeDraftSection,
  reorderDraftSections,
  setDraftTemplateBinding,
  toggleDraftSectionVisibility,
  updateDraftField,
  updateDraftSectionTitle,
  updateDraftTheme,
  validateExportDraft,
} from './draft';

function section(overrides: Partial<ResumeSection> = {}): ResumeSection {
  return {
    id: 'work-1',
    resumeId: 'resume-1',
    type: 'work_experience',
    title: 'Work',
    sortOrder: 0,
    visible: true,
    content: {
      items: [{
        id: 'job-1',
        company: 'Jade',
        position: 'Engineer',
        startDate: '2025-01',
        endDate: null,
        current: true,
        description: '**Built** the product',
        technologies: ['TypeScript'],
        highlights: ['original'],
      }],
    },
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

function resume(): Resume {
  return {
    id: 'resume-1',
    userId: 'user-1',
    title: 'Resume',
    template: 'classic',
    templateVersionId: null,
    templateSource: 'legacy',
    templateSnapshot: null,
    resolvedTemplate: {
      kind: 'legacy-react',
      source: 'legacy',
      slug: 'classic',
      degraded: false,
      capabilities: {
        supportedSections: ['work_experience'],
        paperSizes: ['a4'],
        supportsAvatar: true,
        atsCompatible: true,
        supportsZh: true,
        supportsEn: true,
        supportsHtml: true,
        supportsPdf: true,
        docxFidelity: 'high-fidelity',
      },
    },
    themeConfig: {
      primaryColor: '#111111',
      accentColor: '#2563eb',
      fontFamily: 'sans',
      fontSize: 'medium',
      lineSpacing: 1.5,
      margin: { top: 12, right: 12, bottom: 12, left: 12 },
      sectionSpacing: 6,
    },
    isDefault: false,
    language: 'en',
    revision: 2,
    sections: [section()],
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
  };
}

function workContent(value: Resume): WorkExperienceContent {
  return value.sections[0].content as WorkExperienceContent;
}

describe('export workbench draft', () => {
  it('deep-clones baseline and draft so nested edits cannot pollute formal data', () => {
    const source = resume();
    const session = createExportDraft(source);

    workContent(session.draft).items[0].highlights[0] = 'changed';
    session.draft.themeConfig.margin.top = 8;

    expect(workContent(source).items[0].highlights[0]).toBe('original');
    expect(workContent(session.baseline).items[0].highlights[0]).toBe('original');
    expect(session.draft.sections).not.toBe(source.sections);
    expect(session.draft.themeConfig.margin).not.toBe(source.themeConfig.margin);
    expect(isExportDraftDirty(session)).toBe(true);
  });

  it('normalizes malformed list content without changing the loaded resume', () => {
    const source = resume();
    (source.sections[0].content as unknown as { items: unknown }).items = null;

    const session = createExportDraft(source);

    expect((source.sections[0].content as unknown as { items: unknown }).items).toBeNull();
    expect(workContent(session.draft).items).toEqual([]);
    expect(isExportDraftDirty(session)).toBe(false);
  });

  it('accepts a server-confirmed resume as a clean, independently cloned baseline', () => {
    const source = resume();
    const edited = updateDraftField(createExportDraft(source), {
      sectionId: 'work-1',
      itemId: 'job-1',
      fieldPath: ['highlights', 0],
      value: 'saved',
    });
    const saved = structuredClone(edited.draft);
    saved.revision = 3;

    const accepted = acceptSavedResume(edited, saved);
    workContent(accepted.draft).items[0].highlights[0] = 'new edit';

    expect(accepted.baseline.revision).toBe(3);
    expect(workContent(accepted.baseline).items[0].highlights[0]).toBe('saved');
    expect(isExportDraftDirty(acceptSavedResume(edited, saved))).toBe(false);
  });

  it('updates nested item fields immutably using stable section and item ids', () => {
    const session = createExportDraft(resume());
    const updated = updateDraftField(session, {
      sectionId: 'work-1',
      itemId: 'job-1',
      fieldPath: ['highlights', 0],
      value: 'new',
    });

    expect(workContent(updated.draft).items[0].highlights[0]).toBe('new');
    expect(workContent(session.draft).items[0].highlights[0]).toBe('original');
    expect(updated.baseline).toBe(session.baseline);
  });

  it('locates stable item ids below nested category collections', () => {
    const source = resume();
    source.sections[0] = section({
      id: 'skills-1',
      type: 'skills',
      title: 'Skills',
      content: {
        categories: [{
          id: 'category-1',
          name: 'Frontend',
          skills: ['TypeScript'],
        }],
      },
    });

    const session = createExportDraft(source);
    const updated = updateDraftField(session, {
      sectionId: 'skills-1',
      itemId: 'category-1',
      fieldPath: ['name'],
      value: 'Engineering',
    });
    const nested = updated.draft.sections[0].content as unknown as {
      categories: Array<{ name: string }>;
    };
    const original = session.draft.sections[0].content as unknown as typeof nested;

    expect(nested.categories[0].name).toBe('Engineering');
    expect(original.categories[0].name).toBe('Frontend');
  });

  it('updates theme, title, visibility, order, additions, removals, and template binding immutably', () => {
    const original = createExportDraft(resume());
    const summary = section({
      id: 'summary-1',
      type: 'summary',
      title: 'Summary',
      sortOrder: 1,
      content: { text: 'Hello' },
    });

    const withSection = addDraftSection(original, summary);
    const titled = updateDraftSectionTitle(withSection, 'summary-1', 'Profile');
    const hidden = toggleDraftSectionVisibility(titled, 'summary-1');
    const reordered = reorderDraftSections(hidden, ['summary-1', 'work-1']);
    const themed = updateDraftTheme(reordered, { margin: { top: 8, right: 9, bottom: 10, left: 11 } });
    const templated = setDraftTemplateBinding(themed, { kind: 'legacy', templateSlug: 'minimal' });
    const removed = removeDraftSection(templated, 'work-1');

    expect(removed.draft.sections.map((value) => value.id)).toEqual(['summary-1']);
    expect(removed.draft.sections[0]).toMatchObject({ title: 'Profile', visible: false, sortOrder: 0 });
    expect(removed.draft.themeConfig.margin).toEqual({ top: 8, right: 9, bottom: 10, left: 11 });
    expect(removed.draft.template).toBe('minimal');
    expect(removed.pendingBinding).toEqual({ kind: 'legacy', templateSlug: 'minimal' });
    expect(original.draft.sections).toHaveLength(1);
  });

  it('reports persistence-shape validation issues without throwing', () => {
    const invalid = createExportDraft(resume());
    invalid.draft.sections[0].id = '';
    invalid.draft.sections.push(section({ id: 'duplicate', sortOrder: 1 }));
    invalid.draft.sections.push(section({ id: 'duplicate', sortOrder: 2 }));

    expect(validateExportDraft(invalid.draft).issues).toEqual(expect.arrayContaining([
      { code: 'missing_section_id', sectionIndex: 0 },
      { code: 'duplicate_section_id', sectionIndex: 2 },
    ]));
  });
});
