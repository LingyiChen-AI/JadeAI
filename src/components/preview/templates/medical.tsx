'use client';

import type { Resume, PersonalInfoContent, SummaryContent, WorkExperienceContent, EducationContent, SkillsContent, ProjectsContent, CertificationsContent, LanguagesContent, CustomContent, GitHubContent } from '@/types/resume';
import { AvatarImage } from '../avatar-image';
import { degreeField, isSectionEmpty, md } from '../utils';
import { QrCodesPreview } from '../qr-codes-preview';

const TEAL_800 = '#115e59';
const TEAL_500 = '#0d9488';
const TEAL_50 = '#f0fdfa';

export function MedicalTemplate({ resume }: { resume: Resume }) {
  const personalInfo = resume.sections.find((s) => s.type === 'personal_info');
  const pi = (personalInfo?.content || {}) as PersonalInfoContent;

  return (
    <div className="mx-auto max-w-[210mm] bg-white shadow-lg" style={{ fontFamily: 'Inter, sans-serif' }}>
      {/* Header */}
      <div className="mb-6 border-b-2 pb-5" style={{ borderColor: TEAL_500 }}>
        <div className="flex items-center gap-5">
          {pi.avatar && (
            <AvatarImage
              src={pi.avatar}
              size={72}
              avatarStyle={resume.themeConfig?.avatarStyle}
              className="shrink-0"
              style={{ border: `3px solid ${TEAL_500}` }}
            />
          )}
          <div className="flex-1">
            <h1 className="text-2xl font-bold" style={{ color: TEAL_800 }}>{pi.fullName || 'Your Name'}</h1>
            {pi.jobTitle && <p className="mt-1 text-sm font-medium" style={{ color: TEAL_500 }}>{pi.jobTitle}</p>}
            <div className="mt-2 flex flex-wrap gap-4 text-sm text-gray-500">
              {pi.age && <span>{pi.age}</span>}
              {pi.politicalStatus && <span>{pi.politicalStatus}</span>}
              {pi.gender && <span>{pi.gender}</span>}
              {pi.ethnicity && <span>{pi.ethnicity}</span>}
              {pi.hometown && <span>{pi.hometown}</span>}
              {pi.maritalStatus && <span>{pi.maritalStatus}</span>}
              {pi.yearsOfExperience && <span>{pi.yearsOfExperience}</span>}
              {pi.educationLevel && <span>{pi.educationLevel}</span>}
              {pi.email && <span>{pi.email}</span>}
              {pi.phone && <span>{pi.phone}</span>}
              {pi.wechat && <span>{pi.wechat}</span>}
              {pi.location && <span>{pi.location}</span>}
              {pi.website && <span>{pi.website}</span>}
              {pi.linkedin && <span>LinkedIn: {pi.linkedin}</span>}
              {pi.github && <span>GitHub: {pi.github}</span>}
            </div>
          </div>
        </div>
      </div>

      {/* Sections */}
      {resume.sections
        .filter((s) => s.visible && s.type !== 'personal_info' && !isSectionEmpty(s))
        .map((section) => (
          <div key={section.id} className="mb-6" data-section>
            <h2
              className="mb-3 inline-block rounded-full px-4 py-1 text-xs font-bold uppercase tracking-wider text-white"
              style={{ backgroundColor: TEAL_500 }}
            >
              {section.title}
            </h2>
            <MedicalSectionContent section={section} resume={resume} />
          </div>
        ))}
    </div>
  );
}

function MedicalSectionContent({ section, resume }: { section: any; resume: Resume }) {
  const content = section.content;
  if (!content) return null;

  if (section.type === 'summary') {
    return <p className="text-sm leading-relaxed text-gray-600" dangerouslySetInnerHTML={{ __html: md((content as SummaryContent).text) }} />;
  }

  if (section.type === 'work_experience') {
    return (
      <div className="space-y-4">
        {((content as WorkExperienceContent).items || []).map((item: any) => (
          <div key={item.id} className="rounded-lg border p-3" style={{ borderColor: TEAL_500, backgroundColor: TEAL_50 }}>
            <div className="flex items-baseline justify-between">
              <div>
                <span className="text-sm font-bold" style={{ color: TEAL_800 }}>{item.position}</span>
                {item.company && <span className="text-sm text-gray-600"> | {item.company}</span>}
              </div>
              <span className="shrink-0 text-xs font-medium" style={{ color: TEAL_500 }}>{item.startDate} - {item.endDate || (item.current ? (resume.language === 'zh' ? '至今' : 'Present') : '')}</span>
            </div>
            {item.description && <p className="mt-1 text-sm text-gray-600" dangerouslySetInnerHTML={{ __html: md(item.description) }} />}
            {item.technologies?.length > 0 && (
              <p className="mt-0.5 text-xs text-gray-400">{resume.language === 'zh' ? '技术栈' : 'Tech'}: {item.technologies.join(', ')}</p>
            )}
            {item.highlights?.length > 0 && (
              <ul className="mt-1.5 list-disc pl-4">
                {item.highlights.map((h: string, i: number) => (
                  <li key={i} className="text-sm text-gray-600" dangerouslySetInnerHTML={{ __html: md(h) }} />
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
    );
  }

  if (section.type === 'education') {
    return (
      <div className="space-y-3">
        {((content as EducationContent).items || []).map((item: any) => (
          <div key={item.id} className="rounded-lg border p-3" style={{ borderColor: TEAL_500, backgroundColor: TEAL_50 }}>
            <div className="flex items-baseline justify-between">
              <div>
                <span className="text-sm font-bold" style={{ color: TEAL_800 }}>{degreeField(item.degree, item.field)}</span>
                {item.institution && <span className="text-sm text-gray-600"> - {item.institution}</span>}
              </div>
              <span className="shrink-0 text-xs font-medium" style={{ color: TEAL_500 }}>{item.startDate} - {item.endDate || (resume.language === 'zh' ? '至今' : 'Present')}</span>
            </div>
            {item.gpa && <p className="text-sm text-gray-500">GPA: {item.gpa}</p>}
            {item.highlights?.length > 0 && (
              <ul className="mt-1.5 list-disc pl-4">
                {item.highlights.map((h: string, i: number) => (
                  <li key={i} className="text-sm text-gray-600" dangerouslySetInnerHTML={{ __html: md(h) }} />
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
    );
  }

  if (section.type === 'skills') {
    return (
      <div className="space-y-1.5">
        {((content as SkillsContent).categories || []).map((cat: any) => (
          <div key={cat.id} className="flex text-sm">
            <span className="w-32 shrink-0 font-semibold" style={{ color: TEAL_800 }}>{cat.name}:</span>
            {(cat.skills || []).length > 0 && (
              <ul className="mt-0.5 list-disc pl-4">
                {(cat.skills || []).map((skill: string, i: number) => (
                  <li key={i} className="text-sm text-gray-600">{skill}</li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
    );
  }

  if (section.type === 'projects') {
    return (
      <div className="space-y-3">
        {((content as ProjectsContent).items || []).map((item: any) => (
          <div key={item.id} className="rounded-lg border p-3" style={{ borderColor: TEAL_500, backgroundColor: TEAL_50 }}>
            <div className="flex items-baseline justify-between">
              <span className="text-sm font-bold" style={{ color: TEAL_800 }}>{item.name}</span>
              {item.startDate && (
                <span className="shrink-0 text-xs font-medium" style={{ color: TEAL_500 }}>{item.startDate} - {item.endDate || (resume.language === 'zh' ? '至今' : 'Present')}</span>
              )}
            </div>
            {item.description && <p className="mt-1 text-sm text-gray-600" dangerouslySetInnerHTML={{ __html: md(item.description) }} />}
            {item.technologies?.length > 0 && (
              <p className="mt-0.5 text-xs text-gray-400">{resume.language === 'zh' ? '技术栈' : 'Tech'}: {item.technologies.join(', ')}</p>
            )}
            {item.highlights?.length > 0 && (
              <ul className="mt-1.5 list-disc pl-4">
                {item.highlights.map((h: string, i: number) => (
                  <li key={i} className="text-sm text-gray-600" dangerouslySetInnerHTML={{ __html: md(h) }} />
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
    );
  }

  if (section.type === 'certifications') {
    return (
      <div className="space-y-1.5">
        {((content as CertificationsContent).items || []).map((item: any) => (
          <div key={item.id}>
            <span className="text-sm font-bold" style={{ color: TEAL_800 }}>{item.name}</span>
            {(item.issuer || item.date) && <span className="text-sm text-gray-600">{item.issuer && <> — {item.issuer}</>}{item.date && <> ({item.date})</>}</span>}
          </div>
        ))}
      </div>
    );
  }

  if (section.type === 'languages') {
    return (
      <div className="space-y-1.5">
        {((content as LanguagesContent).items || []).map((item: any) => (
          <div key={item.id}>
            <span className="text-sm font-bold" style={{ color: TEAL_800 }}>{item.language}</span>
            <span className="text-sm text-gray-600"> — {item.proficiency}</span>
          </div>
        ))}
      </div>
    );
  }

  if (section.type === 'github') {
    const items = ((content as GitHubContent).items || []);
    return (
      <div className="space-y-3">
        {items.map((item: any) => (
          <div key={item.id} className="rounded-lg border p-3" style={{ borderColor: TEAL_500, backgroundColor: TEAL_50 }}>
            <div className="flex items-baseline justify-between">
              <span className="text-sm font-bold" style={{ color: TEAL_800 }}>{item.name}</span>
              <span className="text-xs font-medium" style={{ color: TEAL_500 }}>⭐ {item.stars?.toLocaleString()}</span>
            </div>
            {item.language && <span className="text-xs text-gray-400">{item.language}</span>}
            {item.description && <p className="mt-1 text-sm text-gray-600" dangerouslySetInnerHTML={{ __html: md(item.description) }} />}
          </div>
        ))}
      </div>
    );
  }

  if (section.type === 'custom') {
    return (
      <div className="space-y-3">
        {((content as CustomContent).items || []).map((item: any) => (
          <div key={item.id}>
            <div className="flex items-baseline justify-between">
              <div>
                <span className="text-sm font-bold" style={{ color: TEAL_800 }}>{item.title}</span>
                {item.subtitle && <span className="text-sm text-gray-500"> — {item.subtitle}</span>}
              </div>
              {item.date && <span className="shrink-0 text-xs font-medium" style={{ color: TEAL_500 }}>{item.date}</span>}
            </div>
            {item.description && <p className="mt-0.5 text-sm text-gray-600" dangerouslySetInnerHTML={{ __html: md(item.description) }} />}
          </div>
        ))}
      </div>
    );
  }

  if (section.type === 'qr_codes') {
    return <QrCodesPreview items={(content as any).items || []} />;
  }

  // Generic items fallback
  if (content?.items) {
    return (
      <div className="space-y-2">
        {content.items.map((item: any) => (
          <div key={item.id}>
            <span className="text-sm font-medium" style={{ color: TEAL_800 }}>{item.name || item.title || item.language}</span>
            {item.description && <p className="text-sm text-gray-600" dangerouslySetInnerHTML={{ __html: md(item.description) }} />}
          </div>
        ))}
      </div>
    );
  }

  return null;
}
