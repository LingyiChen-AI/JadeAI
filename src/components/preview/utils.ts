import type { ResumeSection, SummaryContent, SkillsContent } from '@/types/resume';
import { renderRichTextHostHtml } from '@/lib/resume/rich-text';

export function md(text: unknown): string {
  return renderRichTextHostHtml(text);
}

/** Join degree and field with separator */
export function degreeField(degree: string, field: string | undefined): string {
  if (!field) return degree;
  return `${degree} - ${field}`;
}

export function isSectionEmpty(section: ResumeSection): boolean {
  const content = section.content as any;
  // Malformed content (null / primitive) — treat as empty rather than throwing
  // on the `'items' in content` check below (issue #87).
  if (!content || typeof content !== 'object') return true;

  if (section.type === 'summary') {
    return !(content as SummaryContent).text;
  }

  if (section.type === 'skills') {
    const categories = (content as SkillsContent).categories;
    return !categories?.length || categories.every((cat) => !cat.skills?.length);
  }

  // work_experience, education, projects, certifications, languages, custom
  if ('items' in content) {
    return !content.items?.length;
  }

  return false;
}
