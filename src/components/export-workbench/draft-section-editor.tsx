'use client';

import type { ComponentType } from 'react';
import { CertificationsSection } from '@/components/editor/sections/certifications';
import { CustomSection } from '@/components/editor/sections/custom-section';
import { EducationSection } from '@/components/editor/sections/education';
import { GitHubSection } from '@/components/editor/sections/github';
import { LanguagesSection } from '@/components/editor/sections/languages';
import { PersonalInfoFields } from '@/components/editor/sections/personal-info';
import { ProjectsSection } from '@/components/editor/sections/projects';
import { QrCodesFields } from '@/components/editor/sections/qr-codes';
import { SkillsSection } from '@/components/editor/sections/skills';
import { SummarySection } from '@/components/editor/sections/summary';
import { WorkExperienceSection } from '@/components/editor/sections/work-experience';
import type { ResumeSection, SectionContent, ThemeConfig } from '@/types/resume';

const sectionEditors: Record<string, ComponentType<{
  section: ResumeSection;
  onUpdate: (content: Partial<SectionContent>) => void;
}>> = {
  summary: SummarySection,
  work_experience: WorkExperienceSection,
  education: EducationSection,
  skills: SkillsSection,
  projects: ProjectsSection,
  certifications: CertificationsSection,
  languages: LanguagesSection,
  github: GitHubSection,
  custom: CustomSection,
};

export function DraftSectionEditor({
  section,
  draftSections,
  themeConfig,
  onThemeChange,
  onUpdate,
}: {
  section: ResumeSection;
  draftSections: ResumeSection[];
  themeConfig?: ThemeConfig;
  onThemeChange?: (updates: Partial<ThemeConfig>) => void;
  onUpdate: (content: Partial<SectionContent>) => void;
}) {
  if (section.type === 'personal_info') {
    return (
      <PersonalInfoFields
        section={section}
        onUpdate={onUpdate}
        avatarStyle={themeConfig?.avatarStyle || 'oneInch'}
        onAvatarStyleChange={(avatarStyle) => onThemeChange?.({ avatarStyle })}
      />
    );
  }
  if (section.type === 'qr_codes') {
    return <QrCodesFields section={section} onUpdate={onUpdate} sourceSections={draftSections} />;
  }
  const Editor = sectionEditors[section.type];
  if (!Editor) return null;
  return <Editor section={section} onUpdate={onUpdate} />;
}
