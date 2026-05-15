'use client';

import type {
  Resume,
  PersonalInfoContent,
  SummaryContent,
  WorkExperienceContent,
  EducationContent,
  SkillsContent,
  ProjectsContent,
  CertificationsContent,
  LanguagesContent,
  CustomContent,
  GitHubContent,
} from '@/types/resume';
import { AvatarImage } from '../avatar-image';
import { degreeField, isSectionEmpty, md } from '../utils';
import { QrCodesPreview } from '../qr-codes-preview';

const PRIMARY = '#1c1917';
const ACCENT = '#44403c';
const SUBTLE = '#f5f5f4';

export function JapaneseTemplate({ resume }: { resume: Resume }) {
  const personalInfo = resume.sections.find((s) => s.type === 'personal_info');
  const pi = (personalInfo?.content || {}) as PersonalInfoContent;

  return (
    <div className="mx-auto max-w-[210mm] bg-white shadow-lg" style={{ fontFamily: 'Inter, sans-serif' }}>
      {/* Header - generous whitespace */}
      <div className="mb-12 pt-4 text-center">
        {pi.avatar && (
          <AvatarImage src={pi.avatar} size={64} avatarStyle={resume.themeConfig?.avatarStyle} className="mx-auto mb-4" style={{ border: `1px solid ${ACCENT}` }} />
        )}
        <h1 className="text-2xl font-normal tracking-wide" style={{ color: PRIMARY }}>{pi.fullName || 'Your Name'}</h1>
        {pi.jobTitle && <p className="mt-2 text-xs font-normal tracking-[0.2em] uppercase" style={{ color: PRIMARY }}>{pi.jobTitle}</p>}
        <div className="mt-6 flex flex-wrap items-center justify-center gap-6 text-xs" style={{ color: PRIMARY }}>
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
        </div>
      </div>

      {/* Thin delicate line */}
      <div className="mx-auto mb-10 h-px" style={{ backgroundColor: ACCENT, opacity: 0.4 }} />

      {/* Sections */}
      {resume.sections
        .filter((s) => s.visible && s.type !== 'personal_info' && !isSectionEmpty(s))
        .map((section) => (
          <div key={section.id} className="mb-8" data-section>
            {/* Section header with subtle dot */}
            <div className="mb-4 flex items-center gap-2">
              <span className="inline-block h-1 w-1 rounded-full" style={{ backgroundColor: ACCENT }} />
              <h2 className="text-xs font-medium uppercase tracking-[0.2em]" style={{ color: PRIMARY }}>{section.title}</h2>
            </div>
            <JapaneseSectionContent section={section} lang={resume.language} />
          </div>
        ))}
    </div>
  );
}

function JapaneseSectionContent({ section, lang }: { section: any; lang?: string }) {
  const content = section.content;
  if (!content) return null;

  if (section.type === 'summary') {
    return <p className="text-sm font-light leading-loose" style={{ color: PRIMARY }} dangerouslySetInnerHTML={{ __html: md((content as SummaryContent).text) }} />;
  }

  if (section.type === 'work_experience') {
    return (
      <div className="space-y-6">
        {((content as WorkExperienceContent).items || []).map((item: any) => (
          <div key={item.id}>
            <div className="flex items-baseline justify-between">
              <h3 className="text-sm font-normal" style={{ color: PRIMARY }}>{item.position}</h3>
              <span className="shrink-0 text-[10px] font-light" style={{ color: ACCENT }}>{item.startDate} &ndash; {item.endDate || (item.current ? (lang === 'zh' ? '至今' : 'Present') : '')}</span>
            </div>
            {item.company && <p className="mt-0.5 text-xs font-light" style={{ color: ACCENT }}>{item.company}{item.location ? `, ${item.location}` : ''}</p>}
            {item.description && <p className="mt-2 text-sm font-light leading-relaxed" style={{ color: PRIMARY }} dangerouslySetInnerHTML={{ __html: md(item.description) }} />}
            {item.technologies?.length > 0 && (
              <p className="mt-1 text-xs font-light" style={{ color: ACCENT }}>{item.technologies.join(' \u00b7 ')}</p>
            )}
            {item.highlights?.length > 0 && (
              <ul className="mt-2 space-y-1">
                {item.highlights.map((h: string, i: number) => (
                  <li key={i} className="flex items-start gap-3 text-sm font-light" style={{ color: PRIMARY }}>
                    <span className="mt-2 inline-block h-px w-3 shrink-0" style={{ backgroundColor: ACCENT }} />
                    <span dangerouslySetInnerHTML={{ __html: md(h) }} />
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-4 h-px" style={{ backgroundColor: ACCENT, opacity: 0.2 }} />
          </div>
        ))}
      </div>
    );
  }

  if (section.type === 'education') {
    return (
      <div className="space-y-5">
        {((content as EducationContent).items || []).map((item: any) => (
          <div key={item.id}>
            <div className="flex items-baseline justify-between">
              <h3 className="text-sm font-normal" style={{ color: PRIMARY }}>{degreeField(item.degree, item.field)}</h3>
              <span className="shrink-0 text-[10px] font-light" style={{ color: ACCENT }}>{item.startDate} &ndash; {item.endDate || (lang === 'zh' ? '至今' : 'Present')}</span>
            </div>
            {item.institution && <p className="mt-0.5 text-xs font-light" style={{ color: ACCENT }}>{item.institution}{item.location ? `, ${item.location}` : ''}</p>}
            {item.gpa && <p className="mt-1 text-xs font-light" style={{ color: ACCENT }}>GPA: {item.gpa}</p>}
            {item.highlights?.length > 0 && (
              <ul className="mt-2 space-y-1">
                {item.highlights.map((h: string, i: number) => (
                  <li key={i} className="flex items-start gap-3 text-sm font-light" style={{ color: PRIMARY }}>
                    <span className="mt-2 inline-block h-px w-3 shrink-0" style={{ backgroundColor: ACCENT }} />
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
          <div key={cat.id}>
            <p className="text-sm font-normal" style={{ color: PRIMARY }}>{cat.name}</p>
            {(cat.skills || []).length > 0 && (
              <ul className="mt-0.5 list-disc pl-4">
                {(cat.skills || []).map((skill: string, i: number) => (
                  <li key={i} className="text-sm font-light" style={{ color: PRIMARY }}>{skill}</li>
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
      <div className="space-y-5">
        {((content as ProjectsContent).items || []).map((item: any) => (
          <div key={item.id}>
            <div className="flex items-baseline justify-between">
              <h3 className="text-sm font-normal" style={{ color: PRIMARY }}>{item.name}</h3>
              {item.startDate && (
                <span className="shrink-0 text-[10px] font-light" style={{ color: ACCENT }}>{item.startDate} {'\u2013'} {item.endDate || (lang === 'zh' ? '至今' : 'Present')}</span>
              )}
            </div>
            {item.description && <p className="mt-1 text-sm font-light leading-relaxed" style={{ color: PRIMARY }} dangerouslySetInnerHTML={{ __html: md(item.description) }} />}
            {item.technologies?.length > 0 && (
              <p className="mt-1 text-xs font-light" style={{ color: ACCENT }}>{item.technologies.join(' \u00b7 ')}</p>
            )}
            {item.highlights?.length > 0 && (
              <ul className="mt-2 space-y-1">
                {item.highlights.map((h: string, i: number) => (
                  <li key={i} className="flex items-start gap-3 text-sm font-light" style={{ color: PRIMARY }}>
                    <span className="mt-2 inline-block h-px w-3 shrink-0" style={{ backgroundColor: ACCENT }} />
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
      <div className="space-y-2">
        {((content as CertificationsContent).items || []).map((item: any) => (
          <div key={item.id} className="flex items-baseline justify-between">
            <div>
              <span className="text-sm font-normal" style={{ color: PRIMARY }}>{item.name}</span>
              {item.issuer && <span className="text-xs font-light" style={{ color: ACCENT }}> &mdash; {item.issuer}</span>}
            </div>
            {item.date && <span className="shrink-0 text-[10px] font-light" style={{ color: ACCENT }}>{item.date}</span>}
          </div>
        ))}
      </div>
    );
  }

  if (section.type === 'languages') {
    return (
      <div className="flex flex-wrap gap-x-8 gap-y-2">
        {((content as LanguagesContent).items || []).map((item: any) => (
          <div key={item.id} className="text-sm">
            <span className="font-normal" style={{ color: PRIMARY }}>{item.language}</span>
            <span className="font-light" style={{ color: ACCENT }}> &mdash; {item.proficiency}</span>
          </div>
        ))}
      </div>
    );
  }

  if (section.type === 'github') {
    const items = (content as GitHubContent).items || [];
    return (
      <div className="space-y-5">
        {items.map((item: any) => (
          <div key={item.id}>
            <div className="flex items-baseline justify-between">
              <h3 className="text-sm font-normal" style={{ color: PRIMARY }}>{item.name}</h3>
              <span className="shrink-0 text-[10px] font-light" style={{ color: ACCENT }}>&#11088; {item.stars?.toLocaleString()}</span>
            </div>
            {item.language && <p className="mt-0.5 text-xs font-light" style={{ color: ACCENT }}>{item.language}</p>}
            {item.description && <p className="mt-1 text-sm font-light leading-relaxed" style={{ color: PRIMARY }} dangerouslySetInnerHTML={{ __html: md(item.description) }} />}
          </div>
        ))}
      </div>
    );
  }

  if (section.type === 'custom') {
    return (
      <div className="space-y-4">
        {((content as CustomContent).items || []).map((item: any) => (
          <div key={item.id}>
            <div className="flex items-baseline justify-between">
              <div>
                <h3 className="text-sm font-normal" style={{ color: PRIMARY }}>{item.title}</h3>
                {item.subtitle && <span className="text-xs font-light" style={{ color: ACCENT }}>{item.subtitle}</span>}
              </div>
              {item.date && <span className="shrink-0 text-[10px] font-light" style={{ color: ACCENT }}>{item.date}</span>}
            </div>
            {item.description && <p className="mt-1 text-sm font-light leading-relaxed" style={{ color: PRIMARY }} dangerouslySetInnerHTML={{ __html: md(item.description) }} />}
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
            <span className="text-sm font-normal" style={{ color: PRIMARY }}>{item.name || item.title || item.language}</span>
            {item.description && <p className="text-sm font-light" style={{ color: PRIMARY }} dangerouslySetInnerHTML={{ __html: md(item.description) }} />}
          </div>
        ))}
      </div>
    );
  }

  return null;
}
