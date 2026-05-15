'use client';

import type { Resume, PersonalInfoContent, SummaryContent, WorkExperienceContent, EducationContent, SkillsContent, ProjectsContent, CertificationsContent, LanguagesContent, GitHubContent, CustomContent } from '@/types/resume';
import { AvatarImage } from '../avatar-image';
import { degreeField, isSectionEmpty, md } from '../utils';
import { QrCodesPreview } from '../qr-codes-preview';

const PRIMARY = '#1e3a5f';
const ACCENT = '#1d4ed8';
const GRID = '#dbeafe';
const BODY_TEXT = '#374151';
const MUTED = '#6b7280';

export function ArchitectTemplate({ resume }: { resume: Resume }) {
  const personalInfo = resume.sections.find((s) => s.type === 'personal_info');
  const pi = (personalInfo?.content || {}) as PersonalInfoContent;

  return (
    <div
      className="mx-auto max-w-[210mm] bg-white shadow-lg"
      style={{
        fontFamily: 'Inter, sans-serif',
        backgroundImage: `linear-gradient(${GRID} 1px, transparent 1px), linear-gradient(90deg, ${GRID} 1px, transparent 1px)`,
        backgroundSize: '40px 40px',
      }}
    >
      {/* Header */}
      <div className="mb-6 border-b-2 pb-5" style={{ borderColor: PRIMARY }}>
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            {pi.avatar && (
              <AvatarImage src={pi.avatar} size={64} avatarStyle={resume.themeConfig?.avatarStyle} className="shrink-0" style={{ border: `2px solid ${PRIMARY}` }} />
            )}
            <div>
              <h1
                className="text-2xl font-bold uppercase tracking-wider"
                style={{ fontFamily: 'JetBrains Mono, Consolas, monospace', color: PRIMARY }}
              >
                {pi.fullName || 'Your Name'}
              </h1>
              {pi.jobTitle && (
                <p className="mt-1 text-sm font-medium uppercase tracking-widest" style={{ color: ACCENT }}>
                  {pi.jobTitle}
                </p>
              )}
            </div>
          </div>
          <div className="shrink-0 border-l-2 pl-4 text-right" style={{ borderColor: ACCENT }}>
            <div className="space-y-0.5 text-xs" style={{ color: MUTED }}>
              {pi.age && <p>{pi.age}</p>}
              {pi.politicalStatus && <p>{pi.politicalStatus}</p>}
              {pi.gender && <p>{pi.gender}</p>}
              {pi.ethnicity && <p>{pi.ethnicity}</p>}
              {pi.hometown && <p>{pi.hometown}</p>}
              {pi.maritalStatus && <p>{pi.maritalStatus}</p>}
              {pi.yearsOfExperience && <p>{pi.yearsOfExperience}</p>}
              {pi.educationLevel && <p>{pi.educationLevel}</p>}
              {pi.email && <p>{pi.email}</p>}
              {pi.phone && <p>{pi.phone}</p>}
              {pi.wechat && <p>{pi.wechat}</p>}
              {pi.location && <p>{pi.location}</p>}
              {pi.website && <p>{pi.website}</p>}
              {pi.linkedin && <p>{pi.linkedin}</p>}
              {pi.github && <p>{pi.github}</p>}
            </div>
          </div>
        </div>
      </div>

      {/* Sections */}
      {resume.sections
        .filter((s) => s.visible && s.type !== 'personal_info' && !isSectionEmpty(s))
        .map((section) => (
          <div key={section.id} className="mb-6" data-section>
            <div className="mb-3 flex items-center gap-3">
              <div className="h-2.5 w-2.5 rotate-45" style={{ backgroundColor: ACCENT }} />
              <h2
                className="text-sm font-bold uppercase tracking-[0.15em]"
                style={{ fontFamily: 'JetBrains Mono, Consolas, monospace', color: PRIMARY }}
              >
                {section.title}
              </h2>
              <div className="h-px flex-1" style={{ backgroundColor: PRIMARY, opacity: 0.3 }} />
            </div>
            <ArchitectSectionContent section={section} resume={resume} />
          </div>
        ))}
    </div>
  );
}

function ArchitectSectionContent({ section, resume }: { section: any; resume: Resume }) {
  const content = section.content;
  if (!content) return null;

  if (section.type === 'summary') {
    return (
      <p className="border-l-2 pl-4 text-sm leading-relaxed" style={{ color: BODY_TEXT, borderColor: GRID }} dangerouslySetInnerHTML={{ __html: md((content as SummaryContent).text) }} />
    );
  }

  if (section.type === 'work_experience') {
    return (
      <div className="space-y-4">
        {((content as WorkExperienceContent).items || []).map((item: any) => (
          <div key={item.id} className="border-l-2 pl-4" style={{ borderColor: ACCENT }}>
            <div className="flex items-baseline justify-between">
              <div>
                <span className="text-sm font-bold" style={{ color: PRIMARY }}>{item.position}</span>
                {item.company && <span className="text-sm" style={{ color: ACCENT }}> | {item.company}</span>}
                {item.location && <span className="text-sm" style={{ color: MUTED }}>, {item.location}</span>}
              </div>
              <span
                className="shrink-0 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider"
                style={{ fontFamily: 'JetBrains Mono, Consolas, monospace', color: MUTED, backgroundColor: GRID }}
              >
                {item.startDate} - {item.endDate || (item.current ? (resume.language === 'zh' ? '至今' : 'Present') : '')}
              </span>
            </div>
            {item.description && <p className="mt-1 text-sm" style={{ color: BODY_TEXT }} dangerouslySetInnerHTML={{ __html: md(item.description) }} />}
            {item.technologies?.length > 0 && (
              <div className="mt-1 flex flex-wrap gap-1.5">
                {item.technologies.map((t: string, i: number) => (
                  <span
                    key={i}
                    className="px-1.5 py-0.5 text-[10px] font-medium"
                    style={{ backgroundColor: GRID, color: ACCENT, fontFamily: 'JetBrains Mono, Consolas, monospace' }}
                  >
                    {t}
                  </span>
                ))}
              </div>
            )}
            {item.highlights?.length > 0 && (
              <ul className="mt-1.5 space-y-0.5">
                {item.highlights.map((h: string, i: number) => (
                  <li key={i} className="flex items-start gap-2 text-sm" style={{ color: BODY_TEXT }}>
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rotate-45" style={{ backgroundColor: ACCENT }} />
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
        {((content as EducationContent).items || []).map((item: any) => (
          <div key={item.id} className="border-l-2 pl-4" style={{ borderColor: ACCENT }}>
            <div className="flex items-baseline justify-between">
              <div>
                <span className="text-sm font-bold" style={{ color: PRIMARY }}>
                  {degreeField(item.degree, item.field)}
                </span>
                {item.institution && <span className="text-sm" style={{ color: MUTED }}> — {item.institution}</span>}
                {item.location && <span className="text-sm" style={{ color: MUTED }}>, {item.location}</span>}
              </div>
              <span className="shrink-0 text-xs" style={{ fontFamily: 'JetBrains Mono, Consolas, monospace', color: MUTED }}>
                {item.startDate} - {item.endDate || (resume.language === 'zh' ? '至今' : 'Present')}
              </span>
            </div>
            {item.gpa && <p className="text-xs" style={{ color: MUTED }}>GPA: {item.gpa}</p>}
            {item.highlights?.length > 0 && (
              <ul className="mt-1 space-y-0.5">
                {item.highlights.map((h: string, i: number) => (
                  <li key={i} className="flex items-start gap-2 text-sm" style={{ color: BODY_TEXT }}>
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rotate-45" style={{ backgroundColor: ACCENT }} />
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
      <div className="space-y-2">
        {((content as SkillsContent).categories || []).map((cat: any) => (
          <div key={cat.id} className="flex text-sm">
            <span
              className="w-32 shrink-0 font-bold uppercase tracking-wider"
              style={{ fontFamily: 'JetBrains Mono, Consolas, monospace', color: PRIMARY, fontSize: '11px' }}
            >
              {cat.name}:
            </span>
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
        {((content as ProjectsContent).items || []).map((item: any) => (
          <div key={item.id} className="border-l-2 pl-4" style={{ borderColor: ACCENT }}>
            <div className="flex items-baseline justify-between">
              <span className="text-sm font-bold" style={{ color: PRIMARY }}>{item.name}</span>
              {item.startDate && (
                <span className="shrink-0 text-xs" style={{ fontFamily: 'JetBrains Mono, Consolas, monospace', color: MUTED }}>
                  {item.startDate} - {item.endDate || (resume.language === 'zh' ? '至今' : 'Present')}
                </span>
              )}
            </div>
            {item.description && <p className="mt-1 text-sm" style={{ color: BODY_TEXT }} dangerouslySetInnerHTML={{ __html: md(item.description) }} />}
            {item.technologies?.length > 0 && (
              <div className="mt-1 flex flex-wrap gap-1.5">
                {item.technologies.map((t: string, i: number) => (
                  <span
                    key={i}
                    className="px-1.5 py-0.5 text-[10px] font-medium"
                    style={{ backgroundColor: GRID, color: ACCENT, fontFamily: 'JetBrains Mono, Consolas, monospace' }}
                  >
                    {t}
                  </span>
                ))}
              </div>
            )}
            {item.highlights?.length > 0 && (
              <ul className="mt-1.5 space-y-0.5">
                {item.highlights.map((h: string, i: number) => (
                  <li key={i} className="flex items-start gap-2 text-sm" style={{ color: BODY_TEXT }}>
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rotate-45" style={{ backgroundColor: ACCENT }} />
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
        {((content as CertificationsContent).items || []).map((item: any) => (
          <div key={item.id} className="flex items-baseline gap-2">
            <span className="h-1.5 w-1.5 shrink-0 rotate-45" style={{ backgroundColor: ACCENT }} />
            <span className="text-sm font-medium" style={{ color: PRIMARY }}>{item.name}</span>
            {(item.issuer || item.date) && <span className="text-sm" style={{ color: MUTED }}>{item.issuer && <> — {item.issuer}</>}{item.date && <> ({item.date})</>}</span>}
          </div>
        ))}
      </div>
    );
  }

  if (section.type === 'languages') {
    return (
      <div className="space-y-1.5">
        {((content as LanguagesContent).items || []).map((item: any) => (
          <div key={item.id} className="flex items-baseline gap-2">
            <span className="h-1.5 w-1.5 shrink-0 rotate-45" style={{ backgroundColor: ACCENT }} />
            <span className="text-sm font-medium" style={{ color: PRIMARY }}>{item.language}</span>
            <span className="text-sm" style={{ color: MUTED }}> — {item.proficiency}</span>
          </div>
        ))}
      </div>
    );
  }

  if (section.type === 'github') {
    const items = (content as GitHubContent).items || [];
    return (
      <div className="space-y-3">
        {items.map((item: any) => (
          <div key={item.id} className="border-l-2 pl-4" style={{ borderColor: ACCENT }}>
            <div className="flex items-baseline justify-between">
              <span className="text-sm font-bold" style={{ color: PRIMARY }}>{item.name}</span>
              <span
                className="shrink-0 px-1.5 py-0.5 text-[10px] font-medium"
                style={{ fontFamily: 'JetBrains Mono, Consolas, monospace', color: MUTED, backgroundColor: GRID }}
              >
                ⭐ {item.stars?.toLocaleString()}
              </span>
            </div>
            {item.language && (
              <span className="text-xs" style={{ color: ACCENT }}>{item.language}</span>
            )}
            {item.description && <p className="mt-1 text-sm" style={{ color: BODY_TEXT }} dangerouslySetInnerHTML={{ __html: md(item.description) }} />}
          </div>
        ))}
      </div>
    );
  }

  if (section.type === 'custom') {
    return (
      <div className="space-y-3">
        {((content as CustomContent).items || []).map((item: any) => (
          <div key={item.id} className="border-l-2 pl-4" style={{ borderColor: ACCENT }}>
            <div className="flex items-baseline justify-between">
              <div>
                <span className="text-sm font-bold" style={{ color: PRIMARY }}>{item.title}</span>
                {item.subtitle && <span className="text-sm" style={{ color: MUTED }}> — {item.subtitle}</span>}
              </div>
              {item.date && (
                <span className="shrink-0 text-xs" style={{ fontFamily: 'JetBrains Mono, Consolas, monospace', color: MUTED }}>
                  {item.date}
                </span>
              )}
            </div>
            {item.description && <p className="mt-1 text-sm" style={{ color: BODY_TEXT }} dangerouslySetInnerHTML={{ __html: md(item.description) }} />}
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
          <div key={item.id} className="flex items-start gap-2">
            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rotate-45" style={{ backgroundColor: ACCENT }} />
            <div>
              <span className="text-sm font-medium" style={{ color: PRIMARY }}>{item.name || item.title || item.language}</span>
              {item.description && <p className="text-sm" style={{ color: BODY_TEXT }} dangerouslySetInnerHTML={{ __html: md(item.description) }} />}
            </div>
          </div>
        ))}
      </div>
    );
  }

  return null;
}
