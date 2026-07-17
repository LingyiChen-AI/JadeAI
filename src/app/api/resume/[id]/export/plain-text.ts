import type {
  PersonalInfoContent,
  WorkExperienceContent,
  EducationContent,
  SkillsContent,
  ProjectsContent,
  CertificationsContent,
  LanguagesContent,
  SummaryContent,
  CustomContent,
} from '@/types/resume';
import { safe, type ResumeWithSections } from './utils';

export function generatePlainText(resume: Pick<ResumeWithSections, 'sections'>): string {
  const lines: string[] = [];

  for (const section of resume.sections) {
    if (!section.visible) continue;

    switch (section.type) {
      case 'personal_info': {
        const info = section.content as PersonalInfoContent;
        if (info.fullName) lines.push(info.fullName);
        if (info.jobTitle) lines.push(info.jobTitle);
        const infoParts: string[] = [];
        if (info.age) infoParts.push(info.age);
        if (info.gender) infoParts.push(info.gender);
        if (info.politicalStatus) infoParts.push(info.politicalStatus);
        if (info.ethnicity) infoParts.push(info.ethnicity);
        if (info.hometown) infoParts.push(info.hometown);
        if (info.maritalStatus) infoParts.push(info.maritalStatus);
        if (info.yearsOfExperience) infoParts.push(info.yearsOfExperience);
        if (info.educationLevel) infoParts.push(info.educationLevel);
        if (infoParts.length > 0) lines.push(infoParts.join(' | '));
        const contactParts: string[] = [];
        if (info.email) contactParts.push(info.email);
        if (info.phone) contactParts.push(info.phone);
        if (info.wechat) contactParts.push(info.wechat);
        if (info.location) contactParts.push(info.location);
        if (contactParts.length > 0) lines.push(contactParts.join(' | '));
        if (info.website) lines.push(info.website);
        lines.push('');
        break;
      }
      case 'summary': {
        const summary = section.content as SummaryContent;
        lines.push(`== ${section.title} ==`);
        if (summary.text) lines.push(summary.text);
        lines.push('');
        break;
      }
      case 'work_experience': {
        const work = section.content as WorkExperienceContent;
        lines.push(`== ${section.title} ==`);
        for (const item of work.items || []) {
          lines.push(`- ${safe(item.position)} at ${safe(item.company)}`);
          const dateRange = item.current ? `${safe(item.startDate)} - Present` : `${safe(item.startDate)} - ${safe(item.endDate)}`;
          lines.push(`  ${dateRange}${item.location ? ` | ${item.location}` : ''}`);
          if (item.description) lines.push(`  ${item.description}`);
          for (const h of item.highlights || []) {
            if (h) lines.push(`  * ${h}`);
          }
        }
        lines.push('');
        break;
      }
      case 'education': {
        const edu = section.content as EducationContent;
        lines.push(`== ${section.title} ==`);
        for (const item of edu.items || []) {
          lines.push(`- ${safe(item.degree)} in ${safe(item.field)}, ${safe(item.institution)}`);
          lines.push(`  ${safe(item.startDate)} - ${safe(item.endDate)}${item.location ? ` | ${item.location}` : ''}`);
          if (item.gpa) lines.push(`  GPA: ${item.gpa}`);
          for (const h of item.highlights || []) {
            if (h) lines.push(`  * ${h}`);
          }
        }
        lines.push('');
        break;
      }
      case 'skills': {
        const skills = section.content as SkillsContent;
        lines.push(`== ${section.title} ==`);
        for (const cat of skills.categories || []) {
          lines.push(`- ${safe(cat.name)}: ${(cat.skills || []).join(', ')}`);
        }
        lines.push('');
        break;
      }
      case 'projects': {
        const projects = section.content as ProjectsContent;
        lines.push(`== ${section.title} ==`);
        for (const item of projects.items || []) {
          lines.push(`- ${safe(item.name)}${item.url ? ` (${item.url})` : ''}`);
          if (item.startDate) {
            lines.push(`  ${item.startDate}${item.endDate ? ` - ${item.endDate}` : ''}`);
          }
          if (item.description) lines.push(`  ${item.description}`);
          if (item.technologies?.length) lines.push(`  Technologies: ${item.technologies.join(', ')}`);
          for (const h of item.highlights || []) {
            if (h) lines.push(`  * ${h}`);
          }
        }
        lines.push('');
        break;
      }
      case 'certifications': {
        const certs = section.content as CertificationsContent;
        lines.push(`== ${section.title} ==`);
        for (const item of certs.items || []) {
          lines.push(`- ${safe(item.name)}${item.issuer ? `, ${safe(item.issuer)}` : ''}${item.date ? ` (${safe(item.date)})` : ''}`);
        }
        lines.push('');
        break;
      }
      case 'languages': {
        const langs = section.content as LanguagesContent;
        lines.push(`== ${section.title} ==`);
        for (const item of langs.items || []) {
          lines.push(`- ${safe(item.language)}: ${safe(item.proficiency)}`);
        }
        lines.push('');
        break;
      }
      default: {
        const custom = section.content as CustomContent;
        lines.push(`== ${section.title} ==`);
        for (const item of (custom as any).items || []) {
          lines.push(`- ${safe(item.title)}${item.subtitle ? ` - ${item.subtitle}` : ''}`);
          if (item.date) lines.push(`  ${item.date}`);
          if (item.description) lines.push(`  ${item.description}`);
        }
        lines.push('');
        break;
      }
    }
  }

  return lines.join('\n');
}
