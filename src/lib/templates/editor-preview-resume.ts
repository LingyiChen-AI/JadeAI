import type { Resume, ResumeSection } from '@/types/resume';

export type EditorPreviewResume = {
  resume: Resume;
  placeholderPaths: ReadonlySet<string>;
};

function isMissingScalar(value: unknown): boolean {
  return value === undefined || value === null || (typeof value === 'string' && value.trim() === '');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function mergeSectionContent(
  sectionType: string,
  realContent: ResumeSection['content'],
  fixtureContent: ResumeSection['content'],
  placeholderPaths: Set<string>,
): ResumeSection['content'] {
  if (!isRecord(realContent) || !isRecord(fixtureContent)) return structuredClone(realContent);

  const merged = structuredClone(realContent) as Record<string, unknown>;
  for (const [field, fixtureValue] of Object.entries(fixtureContent)) {
    const realValue = merged[field];
    if (field === 'items' || field === 'categories') {
      if (Array.isArray(realValue) && realValue.length === 0 && Array.isArray(fixtureValue)) {
        merged[field] = structuredClone(fixtureValue);
        placeholderPaths.add(`${sectionType}.${field}`);
      }
      continue;
    }
    if (isMissingScalar(realValue) && !Array.isArray(fixtureValue) && !isRecord(fixtureValue)) {
      merged[field] = structuredClone(fixtureValue);
      placeholderPaths.add(`${sectionType}.${field}`);
    }
  }
  return merged as unknown as ResumeSection['content'];
}

export function buildEditorPreviewResume(real: Resume, fixture: Resume): EditorPreviewResume {
  const placeholderPaths = new Set<string>();
  const fixtureByType = new Map(fixture.sections.map((section) => [section.type, section]));
  const sections = real.sections.map((section) => {
    const cloned = structuredClone(section);
    if (!section.visible || section.type === 'custom') return cloned;
    const sample = fixtureByType.get(section.type);
    if (!sample) return cloned;
    return {
      ...cloned,
      content: mergeSectionContent(section.type, section.content, sample.content, placeholderPaths),
    };
  });

  return {
    resume: { ...structuredClone(real), sections },
    placeholderPaths,
  };
}
