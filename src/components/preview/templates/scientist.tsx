'use client';

import type { Resume, PersonalInfoContent, SummaryContent, WorkExperienceContent, EducationContent, SkillsContent, ProjectsContent, CertificationsContent, LanguagesContent, GitHubContent, CustomContent } from '@/types/resume';
import { AvatarImage } from '../avatar-image';
import { degreeField, isSectionEmpty, md } from '../utils';
import { QrCodesPreview } from '../qr-codes-preview';

const PRIMARY = '#0f172a';
const ACCENT = '#0891b2';
const GRID_LINE = '#e2e8f0';
const BODY_TEXT = '#334155';
const MUTED = '#64748b';

export function ScientistTemplate({ resume }: { resume: Resume }) {
  const personalInfo = resume.sections.find((s) => s.type === 'personal_info');
  const pi = (personalInfo?.content || {}) as PersonalInfoContent;

  const filteredSections = resume.sections.filter(
    (s) => s.visible && s.type !== 'personal_info' && !isSectionEmpty(s)
  );

  return (
    <div className="mx-auto max-w-[210mm] bg-white shadow-lg" style={{ fontFamily: 'Georgia, serif' }}>
      {/* Header - scientific paper style */}
      <div className="mb-6 text-center">
        {pi.avatar && (
          <AvatarImage src={pi.avatar} avatarStyle={resume.themeConfig?.avatarStyle} size={56} className="mx-auto mb-3" style={{ border: `2px solid ${ACCENT}` }} />
        )}
        <h1 className="text-2xl font-bold" style={{ color: PRIMARY }}>
          {pi.fullName || 'Your Name'}
        </h1>
        {pi.jobTitle && (
          <p className="mt-1 text-sm italic" style={{ color: ACCENT }}>{pi.jobTitle}</p>
        )}
        <div className="mt-2 flex flex-wrap items-center justify-center gap-3 text-xs" style={{ color: MUTED }}>
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
          {pi.linkedin && <span>{pi.linkedin}</span>}
          {pi.github && <span>{pi.github}</span>}
        </div>
      </div>

      {/* Divider line */}
      <div className="mb-6 h-px w-full" style={{ backgroundColor: PRIMARY }} />

      {/* Sections with numbering */}
      {filteredSections.map((section, idx) => (
        <div key={section.id} className="mb-6" data-section>
          <div className="mb-2 flex items-baseline gap-2">
            <span className="text-sm font-bold" style={{ color: ACCENT }}>{idx + 1}.</span>
            <h2 className="text-sm font-bold uppercase tracking-wider" style={{ color: PRIMARY }}>
              {section.title}
            </h2>
          </div>
          <div className="h-px w-full" style={{ backgroundColor: GRID_LINE }} />
          <div className="mt-2">
            <ScientistSectionContent section={section} resume={resume} />
          </div>
        </div>
      ))}

      {/* Footer reference line */}
      <div className="mt-8 h-px w-full" style={{ backgroundColor: PRIMARY }} />
    </div>
  );
}

function ScientistSectionContent({ section, resume }: { section: any; resume: Resume }) {
  const content = section.content;
  if (!content) return null;

  if (section.type === 'summary') {
    return (
      <p className="text-sm italic leading-relaxed" style={{ color: BODY_TEXT }} dangerouslySetInnerHTML={{ __html: md((content as SummaryContent).text) }} />
    );
  }

  if (section.type === 'work_experience') {
    return (
      <div className="space-y-4">
        {((content as WorkExperienceContent).items || []).map((item: any, idx: number) => (
          <div key={item.id}>
            <div className="flex items-baseline justify-between">
              <div>
                <span className="text-xs font-bold" style={{ color: ACCENT }}>[{idx + 1}]</span>
                <span className="ml-1.5 text-sm font-bold" style={{ color: PRIMARY }}>{item.position}</span>
                {item.company && <span className="text-sm" style={{ color: MUTED }}>, {item.company}</span>}
              </div>
              <span className="shrink-0 text-xs" style={{ color: MUTED }}>
                {item.startDate} - {item.endDate || (item.current ? (resume.language === 'zh' ? '至今' : 'Present') : '')}
              </span>
            </div>
            {item.description && <p className="mt-1 pl-6 text-sm" style={{ color: BODY_TEXT }} dangerouslySetInnerHTML={{ __html: md(item.description) }} />}
            {item.technologies?.length > 0 && (
              <p className="pl-6 text-xs italic" style={{ color: MUTED }}>{resume.language === 'zh' ? '技术栈' : 'Methods/Tools'}: {item.technologies.join(', ')}</p>
            )}
            {item.highlights?.length > 0 && (
              <ul className="mt-1 pl-6 space-y-0.5">
                {item.highlights.map((h: string, i: number) => (
                  <li key={i} className="flex items-start gap-2 text-sm" style={{ color: BODY_TEXT }}>
                    <span className="mt-1.5 shrink-0 text-xs" style={{ color: ACCENT }}>-</span>
                    <span dangerouslySetInnerHTML={{ __html: md(h) }} />
                  </li>
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
        {((content as EducationContent).items || []).map((item: any, idx: number) => (
          <div key={item.id}>
            <div className="flex items-baseline justify-between">
              <div>
                <span className="text-xs font-bold" style={{ color: ACCENT }}>[{idx + 1}]</span>
                <span className="ml-1.5 text-sm font-bold" style={{ color: PRIMARY }}>
                  {degreeField(item.degree, item.field)}
                </span>
                {item.institution && <span className="text-sm" style={{ color: MUTED }}>, {item.institution}</span>}
              </div>
              <span className="shrink-0 text-xs" style={{ color: MUTED }}>
                {item.startDate} - {item.endDate || (resume.language === 'zh' ? '至今' : 'Present')}
              </span>
            </div>
            {item.gpa && <p className="pl-6 text-xs" style={{ color: MUTED }}>GPA: {item.gpa}</p>}
            {item.highlights?.length > 0 && (
              <ul className="mt-1 pl-6 space-y-0.5">
                {item.highlights.map((h: string, i: number) => (
                  <li key={i} className="flex items-start gap-2 text-sm" style={{ color: BODY_TEXT }}>
                    <span className="mt-1.5 shrink-0 text-xs" style={{ color: ACCENT }}>-</span>
                    <span dangerouslySetInnerHTML={{ __html: md(h) }} />
                  </li>
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
          <div key={cat.id} className="text-sm">
            <span className="font-bold italic" style={{ color: PRIMARY }}>{cat.name}: </span>
            {(cat.skills || []).length > 0 && (
              <ul className="mt-0.5 list-disc pl-4">
                {(cat.skills || []).map((skill: string, i: number) => (
                  <li key={i} className="text-sm" style={{ color: BODY_TEXT }}>{skill}</li>
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
        {((content as ProjectsContent).items || []).map((item: any, idx: number) => (
          <div key={item.id}>
            <div className="flex items-baseline justify-between">
              <div>
                <span className="text-xs font-bold" style={{ color: ACCENT }}>[{idx + 1}]</span>
                <span className="ml-1.5 text-sm font-bold" style={{ color: PRIMARY }}>{item.name}</span>
              </div>
              {item.startDate && (
                <span className="shrink-0 text-xs" style={{ color: MUTED }}>
                  {item.startDate} - {item.endDate || (resume.language === 'zh' ? '至今' : 'Present')}
                </span>
              )}
            </div>
            {item.description && <p className="mt-1 pl-6 text-sm" style={{ color: BODY_TEXT }} dangerouslySetInnerHTML={{ __html: md(item.description) }} />}
            {item.technologies?.length > 0 && (
              <p className="pl-6 text-xs italic" style={{ color: MUTED }}>{resume.language === 'zh' ? '技术栈' : 'Methods/Tools'}: {item.technologies.join(', ')}</p>
            )}
            {item.highlights?.length > 0 && (
              <ul className="mt-1 pl-6 space-y-0.5">
                {item.highlights.map((h: string, i: number) => (
                  <li key={i} className="flex items-start gap-2 text-sm" style={{ color: BODY_TEXT }}>
                    <span className="mt-1.5 shrink-0 text-xs" style={{ color: ACCENT }}>-</span>
                    <span dangerouslySetInnerHTML={{ __html: md(h) }} />
                  </li>
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
        {((content as CertificationsContent).items || []).map((item: any, idx: number) => (
          <div key={item.id} className="text-sm">
            <span className="text-xs font-bold" style={{ color: ACCENT }}>[{idx + 1}]</span>
            <span className="ml-1.5 font-medium" style={{ color: PRIMARY }}>{item.name}</span>
            {(item.issuer || item.date) && <span style={{ color: MUTED }}>{item.issuer && <>, {item.issuer}</>}{item.date && <>, {item.date}</>}</span>}
          </div>
        ))}
      </div>
    );
  }

  if (section.type === 'languages') {
    return (
      <div className="space-y-1">
        {((content as LanguagesContent).items || []).map((item: any) => (
          <div key={item.id} className="text-sm">
            <span className="font-bold italic" style={{ color: PRIMARY }}>{item.language}</span>
            <span style={{ color: MUTED }}> — {item.proficiency}</span>
          </div>
        ))}
      </div>
    );
  }

  if (section.type === 'github') {
    const items = (content as GitHubContent).items || [];
    return (
      <div className="space-y-3">
        {items.map((item: any, idx: number) => (
          <div key={item.id}>
            <div className="flex items-baseline justify-between">
              <div>
                <span className="text-xs font-bold" style={{ color: ACCENT }}>[{idx + 1}]</span>
                <span className="ml-1.5 text-sm font-bold" style={{ color: PRIMARY }}>{item.name}</span>
              </div>
              <span className="shrink-0 text-xs" style={{ color: MUTED }}>⭐ {item.stars?.toLocaleString()}</span>
            </div>
            {item.language && (
              <span className="pl-6 text-xs italic" style={{ color: ACCENT }}>{item.language}</span>
            )}
            {item.description && <p className="mt-0.5 pl-6 text-sm" style={{ color: BODY_TEXT }} dangerouslySetInnerHTML={{ __html: md(item.description) }} />}
          </div>
        ))}
      </div>
    );
  }

  if (section.type === 'custom') {
    return (
      <div className="space-y-3">
        {((content as CustomContent).items || []).map((item: any, idx: number) => (
          <div key={item.id}>
            <div className="flex items-baseline justify-between">
              <div>
                <span className="text-xs font-bold" style={{ color: ACCENT }}>[{idx + 1}]</span>
                <span className="ml-1.5 text-sm font-bold" style={{ color: PRIMARY }}>{item.title}</span>
                {item.subtitle && <span className="text-sm" style={{ color: MUTED }}>, {item.subtitle}</span>}
              </div>
              {item.date && <span className="shrink-0 text-xs" style={{ color: MUTED }}>{item.date}</span>}
            </div>
            {item.description && <p className="mt-0.5 pl-6 text-sm" style={{ color: BODY_TEXT }} dangerouslySetInnerHTML={{ __html: md(item.description) }} />}
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
            <span className="text-sm font-medium" style={{ color: PRIMARY }}>{item.name || item.title || item.language}</span>
            {item.description && <p className="text-sm" style={{ color: BODY_TEXT }} dangerouslySetInnerHTML={{ __html: md(item.description) }} />}
          </div>
        ))}
      </div>
    );
  }

  return null;
}
