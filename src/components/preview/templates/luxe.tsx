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

const GOLD = '#d4af37';
const TEXT = '#000000';
const BG = '#fafaf9';

export function LuxeTemplate({ resume }: { resume: Resume }) {
  const personalInfo = resume.sections.find((s) => s.type === 'personal_info');
  const pi = (personalInfo?.content || {}) as PersonalInfoContent;

  return (
    <div className="mx-auto max-w-[210mm] shadow-lg" style={{ fontFamily: 'Georgia, serif', backgroundColor: BG }}>
      {/* Header */}
      <div className="mb-8 border-b-2 pb-6" style={{ borderColor: GOLD }}>
        <div className="text-center">
          {pi.avatar && (
            <AvatarImage src={pi.avatar} size={80} avatarStyle={resume.themeConfig?.avatarStyle} className="mx-auto mb-3 border-2" style={{ borderColor: GOLD }} />
          )}
          <h1 className="text-3xl font-bold tracking-wider uppercase" style={{ color: TEXT, letterSpacing: '0.15em' }}>{pi.fullName || 'Your Name'}</h1>
          {pi.jobTitle && (
            <p className="mt-2 text-sm tracking-[0.2em] uppercase" style={{ color: GOLD }}>{pi.jobTitle}</p>
          )}
          {/* Gold divider ornament */}
          <div className="mx-auto mt-4 flex items-center justify-center gap-2">
            <div className="h-px w-16" style={{ backgroundColor: GOLD }} />
            <div className="h-2 w-2 rotate-45" style={{ backgroundColor: GOLD }} />
            <div className="h-px w-16" style={{ backgroundColor: GOLD }} />
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-center gap-4 text-xs" style={{ color: '#78716c' }}>
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
      </div>

      {/* Sections */}
      {resume.sections
        .filter((s) => s.visible && s.type !== 'personal_info' && !isSectionEmpty(s))
        .map((section) => (
          <div key={section.id} className="mb-7" data-section>
            {/* Section header with gold borders */}
            <div className="mb-4 flex items-center gap-3">
              <div className="h-px flex-1" style={{ backgroundColor: GOLD }} />
              <h2 className="shrink-0 text-xs font-bold uppercase tracking-[0.2em]" style={{ color: GOLD }}>{section.title}</h2>
              <div className="h-px flex-1" style={{ backgroundColor: GOLD }} />
            </div>
            <LuxeSectionContent section={section} lang={resume.language} />
          </div>
        ))}
    </div>
  );
}

function LuxeSectionContent({ section, lang }: { section: any; lang?: string }) {
  const content = section.content;
  if (!content) return null;

  if (section.type === 'summary') {
    return (
      <p className="text-center text-sm italic leading-relaxed" style={{ color: '#44403c' }} dangerouslySetInnerHTML={{ __html: md((content as SummaryContent).text) }} />
    );
  }

  if (section.type === 'work_experience') {
    return (
      <div className="space-y-5">
        {((content as WorkExperienceContent).items || []).map((item: any) => (
          <div key={item.id} className="border-l-2 pl-4" style={{ borderColor: GOLD }}>
            <div className="flex items-baseline justify-between">
              <h3 className="text-sm font-bold" style={{ color: TEXT }}>{item.position}</h3>
              <span className="shrink-0 text-xs italic" style={{ color: '#a8a29e' }}>{item.startDate} &ndash; {item.endDate || (item.current ? (lang === 'zh' ? '至今' : 'Present') : '')}</span>
            </div>
            {item.company && <p className="text-sm" style={{ color: GOLD }}>{item.company}{item.location ? `, ${item.location}` : ''}</p>}
            {item.description && <p className="mt-1 text-sm" style={{ color: '#44403c' }} dangerouslySetInnerHTML={{ __html: md(item.description) }} />}
            {item.technologies?.length > 0 && (
              <p className="mt-0.5 text-xs italic" style={{ color: '#a8a29e' }}>{lang === 'zh' ? '技术栈' : 'Tech'}: {item.technologies.join(', ')}</p>
            )}
            {item.highlights?.length > 0 && (
              <ul className="mt-1.5 list-none space-y-0.5">
                {item.highlights.map((h: string, i: number) => (
                  <li key={i} className="flex items-start gap-2 text-sm" style={{ color: '#44403c' }}>
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rotate-45" style={{ backgroundColor: GOLD }} />
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
      <div className="space-y-4">
        {((content as EducationContent).items || []).map((item: any) => (
          <div key={item.id} className="border-l-2 pl-4" style={{ borderColor: GOLD }}>
            <div className="flex items-baseline justify-between">
              <h3 className="text-sm font-bold" style={{ color: TEXT }}>{degreeField(item.degree, item.field)}</h3>
              <span className="shrink-0 text-xs italic" style={{ color: '#a8a29e' }}>{item.startDate} &ndash; {item.endDate || (lang === 'zh' ? '至今' : 'Present')}</span>
            </div>
            {item.institution && <p className="text-sm" style={{ color: GOLD }}>{item.institution}{item.location ? `, ${item.location}` : ''}</p>}
            {item.gpa && <p className="text-xs" style={{ color: '#a8a29e' }}>GPA: {item.gpa}</p>}
            {item.highlights?.length > 0 && (
              <ul className="mt-1 list-none space-y-0.5">
                {item.highlights.map((h: string, i: number) => (
                  <li key={i} className="flex items-start gap-2 text-sm" style={{ color: '#44403c' }}>
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rotate-45" style={{ backgroundColor: GOLD }} />
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
          <div key={cat.id} className="flex text-sm">
            <span className="w-32 shrink-0 font-bold" style={{ color: GOLD }}>{cat.name}:</span>
            {(cat.skills || []).length > 0 && (
              <ul className="mt-0.5 list-disc pl-4">
                {(cat.skills || []).map((skill: string, i: number) => (
                  <li key={i} className="text-sm" style={{ color: '#44403c' }}>{skill}</li>
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
      <div className="space-y-4">
        {((content as ProjectsContent).items || []).map((item: any) => (
          <div key={item.id} className="border-l-2 pl-4" style={{ borderColor: GOLD }}>
            <div className="flex items-baseline justify-between">
              <h3 className="text-sm font-bold" style={{ color: TEXT }}>{item.name}</h3>
              {item.startDate && (
                <span className="shrink-0 text-xs italic" style={{ color: '#a8a29e' }}>{item.startDate} {'\u2013'} {item.endDate || (lang === 'zh' ? '至今' : 'Present')}</span>
              )}
            </div>
            {item.description && <p className="mt-0.5 text-sm" style={{ color: '#44403c' }} dangerouslySetInnerHTML={{ __html: md(item.description) }} />}
            {item.technologies?.length > 0 && (
              <p className="mt-0.5 text-xs italic" style={{ color: '#a8a29e' }}>{lang === 'zh' ? '技术栈' : 'Tech'}: {item.technologies.join(', ')}</p>
            )}
            {item.highlights?.length > 0 && (
              <ul className="mt-1 list-none space-y-0.5">
                {item.highlights.map((h: string, i: number) => (
                  <li key={i} className="flex items-start gap-2 text-sm" style={{ color: '#44403c' }}>
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rotate-45" style={{ backgroundColor: GOLD }} />
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
              <span className="text-sm font-bold" style={{ color: TEXT }}>{item.name}</span>
              {item.issuer && <span className="text-sm" style={{ color: '#a8a29e' }}> &mdash; {item.issuer}</span>}
            </div>
            {item.date && <span className="shrink-0 text-xs italic" style={{ color: GOLD }}>{item.date}</span>}
          </div>
        ))}
      </div>
    );
  }

  if (section.type === 'languages') {
    return (
      <div className="flex flex-wrap gap-4">
        {((content as LanguagesContent).items || []).map((item: any) => (
          <div key={item.id} className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rotate-45" style={{ backgroundColor: GOLD }} />
            <span className="text-sm font-bold" style={{ color: TEXT }}>{item.language}</span>
            <span className="text-xs" style={{ color: '#a8a29e' }}>{item.proficiency}</span>
          </div>
        ))}
      </div>
    );
  }

  if (section.type === 'github') {
    const items = (content as GitHubContent).items || [];
    return (
      <div className="space-y-4">
        {items.map((item: any) => (
          <div key={item.id} className="border-l-2 pl-4" style={{ borderColor: GOLD }}>
            <div className="flex items-baseline justify-between">
              <h3 className="text-sm font-bold" style={{ color: TEXT }}>{item.name}</h3>
              <span className="shrink-0 text-xs italic" style={{ color: '#a8a29e' }}>&#11088; {item.stars?.toLocaleString()}</span>
            </div>
            {item.language && <span className="text-xs" style={{ color: GOLD }}>{item.language}</span>}
            {item.description && <p className="mt-0.5 text-sm" style={{ color: '#44403c' }} dangerouslySetInnerHTML={{ __html: md(item.description) }} />}
          </div>
        ))}
      </div>
    );
  }

  if (section.type === 'custom') {
    return (
      <div className="space-y-4">
        {((content as CustomContent).items || []).map((item: any) => (
          <div key={item.id} className="border-l-2 pl-4" style={{ borderColor: GOLD }}>
            <div className="flex items-baseline justify-between">
              <h3 className="text-sm font-bold" style={{ color: TEXT }}>{item.title}</h3>
              {item.date && <span className="shrink-0 text-xs italic" style={{ color: GOLD }}>{item.date}</span>}
            </div>
            {item.subtitle && <p className="text-sm" style={{ color: GOLD }}>{item.subtitle}</p>}
            {item.description && <p className="mt-0.5 text-sm" style={{ color: '#44403c' }} dangerouslySetInnerHTML={{ __html: md(item.description) }} />}
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
            {item.description && <p className="text-sm" style={{ color: '#44403c' }} dangerouslySetInnerHTML={{ __html: md(item.description) }} />}
          </div>
        ))}
      </div>
    );
  }

  return null;
}
