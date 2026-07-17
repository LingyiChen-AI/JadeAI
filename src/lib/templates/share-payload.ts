import type { ResolvedTemplate } from './resolve-template';

type SharedResumeSource = {
  title: string;
  template: string;
  themeConfig: unknown;
  language: string;
  templateSource: string;
  templateSnapshot: unknown;
  sections: Array<{
    type: string;
    title: string;
    sortOrder: number;
    visible: boolean;
    content: unknown;
  }>;
};

export function sanitizeSharedResume(resume: SharedResumeSource, resolvedTemplate: ResolvedTemplate) {
  return {
    title: resume.title,
    template: resume.template,
    themeConfig: resume.themeConfig,
    language: resume.language,
    templateSource: resume.templateSource,
    templateSnapshot: resolvedTemplate.source === 'local-snapshot' ? resume.templateSnapshot : null,
    resolvedTemplate,
    sections: resume.sections
      .filter((section) => section.visible)
      .sort((left, right) => left.sortOrder - right.sortOrder)
      .map((section) => ({
        type: section.type,
        title: section.title,
        sortOrder: section.sortOrder,
        visible: true,
        content: section.content,
      })),
  };
}
