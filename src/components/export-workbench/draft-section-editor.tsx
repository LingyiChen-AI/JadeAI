'use client';

import type { ComponentType } from 'react';
import { CertificationsSection } from '@/components/editor/sections/certifications';
import { CustomSection } from '@/components/editor/sections/custom-section';
import { EducationSection } from '@/components/editor/sections/education';
import { GitHubSection } from '@/components/editor/sections/github';
import { LanguagesSection } from '@/components/editor/sections/languages';
import { PersonalInfoSection } from '@/components/editor/sections/personal-info';
import { ProjectsSection } from '@/components/editor/sections/projects';
import { QrCodesSection } from '@/components/editor/sections/qr-codes';
import { SkillsSection } from '@/components/editor/sections/skills';
import { SummarySection } from '@/components/editor/sections/summary';
import { WorkExperienceSection } from '@/components/editor/sections/work-experience';
import type { ResumeSection, SectionContent } from '@/types/resume';

const sectionEditors: Record<string, ComponentType<{
  section: ResumeSection;
  onUpdate: (content: Partial<SectionContent>) => void;
}>> = {
  personal_info: PersonalInfoSection,
  summary: SummarySection,
  work_experience: WorkExperienceSection,
  education: EducationSection,
  skills: SkillsSection,
  projects: ProjectsSection,
  certifications: CertificationsSection,
  languages: LanguagesSection,
  github: GitHubSection,
  qr_codes: QrCodesSection,
  custom: CustomSection,
};

export function DraftSectionEditor({
  section,
  onUpdate,
}: {
  section: ResumeSection;
  onUpdate: (content: Partial<SectionContent>) => void;
}) {
  const Editor = sectionEditors[section.type];
  if (!Editor) return null;
  // Existing section editors are pure controlled forms. Reusing them here also
  // preserves entry add/remove/reorder behavior without mounting resume-store.
  return <Editor section={section} onUpdate={onUpdate} />;
}
