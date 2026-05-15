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

const RED = '#dc2626';
const TEXT = '#18181b';

export function SwissTemplate({ resume }: { resume: Resume }) {
  const personalInfo = resume.sections.find((s) => s.type === 'personal_info');
  const pi = (personalInfo?.content || {}) as PersonalInfoContent;

  return (
    <div className="mx-auto max-w-[210mm] bg-white shadow-lg" style={{ fontFamily: 'Helvetica Neue, Helvetica, Arial, sans-serif' }}>
      {/* Header - strict grid alignment */}
      <div className="mb-8">
        <div className="flex items-start gap-6">
          {pi.avatar && (
            <AvatarImage src={pi.avatar} size={64} avatarStyle={resume.themeConfig?.avatarStyle} className="shrink-0" />
          )}
          <div className="flex-1">
            <h1 className="text-3xl font-bold uppercase tracking-tight" style={{ color: TEXT }}>{pi.fullName || 'Your Name'}</h1>
            {pi.jobTitle && <p className="mt-1 text-sm font-light uppercase tracking-[0.15em]" style={{ color: '#52525b' }}>{pi.jobTitle}</p>}
          </div>
        </div>
        {/* Contact info - grid row */}
        <div className="mt-4 flex flex-wrap gap-x-6 gap-y-1 border-t border-black pt-3 text-xs" style={{ color: TEXT }}>
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

      {/* Sections */}
      {resume.sections
        .filter((s) => s.visible && s.type !== 'personal_info' && !isSectionEmpty(s))
        .map((section) => (
          <div key={section.id} className="mb-6" data-section>
            {/* Section header with red square */}
            <div className="mb-3 flex items-center gap-2 border-b border-zinc-200 pb-2">
              <span className="inline-block h-2.5 w-2.5 shrink-0" style={{ backgroundColor: RED }} />
              <h2 className="text-xs font-bold uppercase tracking-[0.2em]" style={{ color: TEXT }}>{section.title}</h2>
            </div>
            <SwissSectionContent section={section} lang={resume.language} />
          </div>
        ))}
    </div>
  );
}

function SwissSectionContent({ section, lang }: { section: any; lang?: string }) {
  const content = section.content;
  if (!content) return null;

  if (section.type === 'summary') {
    return <p className="text-sm leading-relaxed" style={{ color: '#3f3f46' }} dangerouslySetInnerHTML={{ __html: md((content as SummaryContent).text) }} />;
  }

  if (section.type === 'work_experience') {
    return (
      <div className="space-y-4">
        {((content as WorkExperienceContent).items || []).map((item: any) => (
          <div key={item.id} className="grid grid-cols-[140px_1fr] gap-4">
            <div className="text-xs" style={{ color: '#52525b' }}>
              <span>{item.startDate} &ndash; {item.endDate || (item.current ? (lang === 'zh' ? '至今' : 'Present') : '')}</span>
            </div>
            <div>
              <h3 className="text-sm font-bold" style={{ color: TEXT }}>{item.position}</h3>
              {item.company && <p className="text-sm" style={{ color: RED }}>{item.company}</p>}
              {item.description && <p className="mt-1 text-sm" style={{ color: '#3f3f46' }} dangerouslySetInnerHTML={{ __html: md(item.description) }} />}
              {item.technologies?.length > 0 && (
                <p className="mt-0.5 text-xs" style={{ color: '#52525b' }}>{lang === 'zh' ? '技术栈' : 'Tech'}: {item.technologies.join(', ')}</p>
              )}
              {item.highlights?.length > 0 && (
                <ul className="mt-1 list-none space-y-0.5">
                  {item.highlights.map((h: string, i: number) => (
                    <li key={i} className="flex items-start gap-2 text-sm" style={{ color: '#3f3f46' }}>
                      <span className="mt-1.5 inline-block h-1 w-1 shrink-0" style={{ backgroundColor: RED }} />
                      <span dangerouslySetInnerHTML={{ __html: md(h) }} />
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (section.type === 'education') {
    return (
      <div className="space-y-3">
        {((content as EducationContent).items || []).map((item: any) => (
          <div key={item.id} className="grid grid-cols-[140px_1fr] gap-4">
            <span className="text-xs" style={{ color: '#52525b' }}>{item.startDate} &ndash; {item.endDate || (lang === 'zh' ? '至今' : 'Present')}</span>
            <div>
              <h3 className="text-sm font-bold" style={{ color: TEXT }}>{degreeField(item.degree, item.field)}</h3>
              {item.institution && <p className="text-sm" style={{ color: RED }}>{item.institution}</p>}
              {item.gpa && <p className="text-xs" style={{ color: '#52525b' }}>GPA: {item.gpa}</p>}
              {item.highlights?.length > 0 && (
                <ul className="mt-1 list-none space-y-0.5">
                  {item.highlights.map((h: string, i: number) => (
                    <li key={i} className="flex items-start gap-2 text-sm" style={{ color: '#3f3f46' }}>
                      <span className="mt-1.5 inline-block h-1 w-1 shrink-0" style={{ backgroundColor: RED }} />
                      <span dangerouslySetInnerHTML={{ __html: md(h) }} />
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (section.type === 'skills') {
    return (
      <div className="space-y-1.5">
        {((content as SkillsContent).categories || []).map((cat: any) => (
          <div key={cat.id} className="grid grid-cols-[140px_1fr] gap-4 text-sm">
            <span className="font-bold" style={{ color: TEXT }}>{cat.name}</span>
            {(cat.skills || []).length > 0 && (
              <ul className="mt-0.5 list-disc pl-4">
                {(cat.skills || []).map((skill: string, i: number) => (
                  <li key={i} className="text-sm" style={{ color: '#3f3f46' }}>{skill}</li>
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
          <div key={item.id} className="grid grid-cols-[140px_1fr] gap-4">
            {item.startDate ? (
              <span className="text-xs" style={{ color: '#52525b' }}>{item.startDate} {'\u2013'} {item.endDate || (lang === 'zh' ? '至今' : 'Present')}</span>
            ) : <span />}
            <div>
              <h3 className="text-sm font-bold" style={{ color: TEXT }}>{item.name}</h3>
              {item.description && <p className="mt-0.5 text-sm" style={{ color: '#3f3f46' }} dangerouslySetInnerHTML={{ __html: md(item.description) }} />}
              {item.technologies?.length > 0 && (
                <p className="mt-0.5 text-xs" style={{ color: '#52525b' }}>{lang === 'zh' ? '技术栈' : 'Tech'}: {item.technologies.join(', ')}</p>
              )}
              {item.highlights?.length > 0 && (
                <ul className="mt-1 list-none space-y-0.5">
                  {item.highlights.map((h: string, i: number) => (
                    <li key={i} className="flex items-start gap-2 text-sm" style={{ color: '#3f3f46' }}>
                      <span className="mt-1.5 inline-block h-1 w-1 shrink-0" style={{ backgroundColor: RED }} />
                      <span dangerouslySetInnerHTML={{ __html: md(h) }} />
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (section.type === 'certifications') {
    return (
      <div className="space-y-1.5">
        {((content as CertificationsContent).items || []).map((item: any) => (
          <div key={item.id} className="grid grid-cols-[140px_1fr] gap-4">
            <span className="text-xs" style={{ color: '#52525b' }}>{item.date || '\u00A0'}</span>
            <div>
              <span className="text-sm font-bold" style={{ color: TEXT }}>{item.name}</span>
              {item.issuer && <span className="text-sm" style={{ color: '#3f3f46' }}> &mdash; {item.issuer}</span>}
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (section.type === 'languages') {
    return (
      <div className="flex flex-wrap gap-x-6 gap-y-1.5">
        {((content as LanguagesContent).items || []).map((item: any) => (
          <div key={item.id} className="text-sm">
            <span className="font-bold" style={{ color: TEXT }}>{item.language}</span>
            <span style={{ color: '#52525b' }}> &mdash; {item.proficiency}</span>
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
          <div key={item.id} className="grid grid-cols-[140px_1fr] gap-4">
            <span className="text-xs" style={{ color: '#52525b' }}>&#11088; {item.stars?.toLocaleString()}</span>
            <div>
              <h3 className="text-sm font-bold" style={{ color: TEXT }}>{item.name}</h3>
              {item.language && <span className="text-xs" style={{ color: RED }}>{item.language}</span>}
              {item.description && <p className="mt-0.5 text-sm" style={{ color: '#3f3f46' }} dangerouslySetInnerHTML={{ __html: md(item.description) }} />}
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (section.type === 'custom') {
    return (
      <div className="space-y-3">
        {((content as CustomContent).items || []).map((item: any) => (
          <div key={item.id} className="grid grid-cols-[140px_1fr] gap-4">
            {item.date ? <span className="text-xs" style={{ color: '#52525b' }}>{item.date}</span> : <span />}
            <div>
              <h3 className="text-sm font-bold" style={{ color: TEXT }}>{item.title}</h3>
              {item.subtitle && <p className="text-sm" style={{ color: RED }}>{item.subtitle}</p>}
              {item.description && <p className="mt-0.5 text-sm" style={{ color: '#3f3f46' }} dangerouslySetInnerHTML={{ __html: md(item.description) }} />}
            </div>
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
            <span className="text-sm font-bold" style={{ color: TEXT }}>{item.name || item.title || item.language}</span>
            {item.description && <p className="text-sm" style={{ color: '#3f3f46' }} dangerouslySetInnerHTML={{ __html: md(item.description) }} />}
          </div>
        ))}
      </div>
    );
  }

  return null;
}
