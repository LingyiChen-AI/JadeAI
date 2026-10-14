import type { Resume, ResumeSection, ThemeConfig } from '@/types/resume';
import { parseThemeConfig } from '@/lib/resume/parse-theme-config';

export interface ResumePdfSnapshot {
  title: string;
  language: string;
  template: string;
  themeConfig: Partial<ThemeConfig> | null;
  sections: Pick<ResumeSection, 'id' | 'type' | 'title' | 'sortOrder' | 'visible' | 'content'>[];
}

/** Array order is the editor's current order, including unsaved drag operations. */
export function createPdfSnapshot(
  resume: Pick<Resume, 'title' | 'language' | 'template' | 'sections'> & { themeConfig: unknown },
): ResumePdfSnapshot {
  return structuredClone({
    title: resume.title,
    language: resume.language,
    template: resume.template,
    themeConfig: parseThemeConfig(resume.themeConfig),
    sections: resume.sections.map(({ id, type, title, visible, content }, sortOrder) => ({
      id, type, title, sortOrder, visible, content,
    })),
  });
}
