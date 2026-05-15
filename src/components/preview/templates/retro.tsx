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

const PRIMARY = '#78350f';
const ACCENT = '#92400e';
const BG = '#fefce8';

export function RetroTemplate({ resume }: { resume: Resume }) {
  const personalInfo = resume.sections.find((s) => s.type === 'personal_info');
  const pi = (personalInfo?.content || {}) as PersonalInfoContent;

  const contacts = [pi.age, pi.politicalStatus, pi.gender, pi.ethnicity, pi.hometown, pi.maritalStatus, pi.yearsOfExperience, pi.educationLevel, pi.email, pi.phone, pi.wechat, pi.location, pi.website].filter(Boolean);

  return (
    <div className="mx-auto max-w-[210mm] shadow-lg" style={{ fontFamily: 'Georgia, serif', backgroundColor: BG }}>
      {/* Header */}
      <div className="mb-6 pb-4 text-center" style={{ borderBottom: `3px double ${PRIMARY}` }}>
        {pi.avatar && (
          <AvatarImage src={pi.avatar} avatarStyle={resume.themeConfig?.avatarStyle} size={80} className="mx-auto mb-3" style={{ border: `2px solid ${PRIMARY}` }} />
        )}
        <h1 className="text-3xl font-bold" style={{ color: PRIMARY, fontFamily: "'Courier New', monospace" }}>
          {pi.fullName || 'Your Name'}
        </h1>
        {pi.jobTitle && (
          <p className="mt-1 text-sm italic" style={{ color: ACCENT }}>{pi.jobTitle}</p>
        )}
        {contacts.length > 0 && (
          <div className="mt-2 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs" style={{ color: ACCENT }}>
            {contacts.map((c, i) => (
              <span key={i} className="flex items-center gap-1.5" style={{ fontFamily: "'Courier New', monospace" }}>
                {c}
                {i < contacts.length - 1 && <span style={{ color: `${PRIMARY}40` }}>{'\u2022'}</span>}
              </span>
            ))}
          </div>
        )}
        {/* Ornamental divider */}
        <div className="mx-auto mt-3 flex items-center justify-center gap-2 text-sm" style={{ color: `${PRIMARY}60` }}>
          <span>~</span>
          <span>{'\u2666'}</span>
          <span>~</span>
        </div>
      </div>

      {/* Sections */}
      {resume.sections
        .filter((s) => s.visible && s.type !== 'personal_info' && !isSectionEmpty(s))
        .map((section, idx, arr) => (
          <div key={section.id} data-section>
            <div className="mb-2 text-center">
              <h2 className="inline-block px-4 text-xs font-bold uppercase tracking-[0.3em]" style={{ color: PRIMARY, borderBottom: `1px solid ${PRIMARY}`, borderTop: `1px solid ${PRIMARY}`, padding: '4px 16px' }}>
                {section.title}
              </h2>
            </div>
            <div className="mb-4">
              <RetroSectionContent section={section} resume={resume} />
            </div>
            {/* Ornamental divider between sections */}
            {idx < arr.length - 1 && (
              <div className="mb-4 flex items-center justify-center gap-2 text-xs" style={{ color: `${PRIMARY}40` }}>
                <div className="h-px w-12" style={{ backgroundColor: `${PRIMARY}20` }} />
                <span>{'\u2726'}</span>
                <div className="h-px w-12" style={{ backgroundColor: `${PRIMARY}20` }} />
              </div>
            )}
          </div>
        ))}
    </div>
  );
}

function RetroSectionContent({ section, resume }: { section: any; resume: Resume }) {
  const content = section.content;
  if (!content) return null;

  if (section.type === 'summary') {
    return (
      <p className="text-center text-sm italic leading-relaxed" style={{ color: ACCENT }}>
        &ldquo;<span dangerouslySetInnerHTML={{ __html: md((content as SummaryContent).text) }} />&rdquo;
      </p>
    );
  }

  if (section.type === 'work_experience') {
    const items = (content as WorkExperienceContent).items || [];
    return (
      <div className="space-y-4">
        {items.map((item: any) => (
          <div key={item.id}>
            <div className="flex items-baseline justify-between">
              <h3 className="text-sm font-bold" style={{ color: PRIMARY }}>{item.position}</h3>
              <span className="shrink-0 text-xs" style={{ color: ACCENT, fontFamily: "'Courier New', monospace" }}>
                {item.startDate} - {item.endDate || (item.current ? (resume.language === 'zh' ? '至今' : 'Present') : '')}
              </span>
            </div>
            {item.company && <p className="text-sm italic" style={{ color: ACCENT }}>{item.company}</p>}
            {item.description && <p className="mt-1 text-sm" style={{ color: '#57534e' }} dangerouslySetInnerHTML={{ __html: md(item.description) }} />}
            {item.technologies?.length > 0 && (
              <p className="mt-1 text-xs italic" style={{ color: ACCENT }}>
                Technologies: {item.technologies.join(', ')}
              </p>
            )}
            {item.highlights?.length > 0 && (
              <ul className="mt-1.5 space-y-0.5">
                {item.highlights.map((h: string, i: number) => (
                  <li key={i} className="flex items-start gap-2 text-sm" style={{ color: '#57534e' }}>
                    <span className="mt-1 shrink-0 text-xs" style={{ color: PRIMARY }}>{'\u2022'}</span>
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
    const items = (content as EducationContent).items || [];
    return (
      <div className="space-y-3">
        {items.map((item: any) => (
          <div key={item.id}>
            <div className="flex items-baseline justify-between">
              <h3 className="text-sm font-bold" style={{ color: PRIMARY }}>{item.institution}</h3>
              <span className="text-xs" style={{ color: ACCENT, fontFamily: "'Courier New', monospace" }}>{item.startDate} - {item.endDate || (resume.language === 'zh' ? '至今' : 'Present')}</span>
            </div>
            <p className="text-sm" style={{ color: '#57534e' }}>{degreeField(item.degree, item.field)}</p>
            {item.gpa && <p className="text-xs" style={{ color: ACCENT }}>GPA: {item.gpa}</p>}
            {item.highlights?.length > 0 && (
              <ul className="mt-1 space-y-0.5">
                {item.highlights.map((h: string, i: number) => (
                  <li key={i} className="flex items-start gap-2 text-sm" style={{ color: '#57534e' }}>
                    <span className="mt-1 shrink-0 text-xs" style={{ color: PRIMARY }}>{'\u2022'}</span>
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
    const categories = (content as SkillsContent).categories || [];
    return (
      <div className="space-y-2">
        {categories.map((cat: any) => (
          <div key={cat.id}>
            <p className="text-sm font-bold" style={{ color: PRIMARY, fontFamily: "'Courier New', monospace" }}>{cat.name}</p>
            {cat.skills?.length > 0 && (
              <ul className="mt-0.5 list-disc pl-4">
                {cat.skills.map((skill: string, i: number) => (
                  <li key={i} className="text-sm" style={{ color: '#57534e' }}>{skill}</li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
    );
  }

  if (section.type === 'projects') {
    const items = (content as ProjectsContent).items || [];
    return (
      <div className="space-y-3">
        {items.map((item: any) => (
          <div key={item.id}>
            <div className="flex items-baseline justify-between">
              <h3 className="text-sm font-bold" style={{ color: PRIMARY }}>{item.name}</h3>
              {item.startDate && (
                <span className="text-xs" style={{ color: ACCENT, fontFamily: "'Courier New', monospace" }}>
                  {item.startDate} - {item.endDate || (resume.language === 'zh' ? '至今' : 'Present')}
                </span>
              )}
            </div>
            {item.description && <p className="mt-0.5 text-sm" style={{ color: '#57534e' }} dangerouslySetInnerHTML={{ __html: md(item.description) }} />}
            {item.technologies?.length > 0 && (
              <p className="mt-1 text-xs italic" style={{ color: ACCENT }}>
                Technologies: {item.technologies.join(', ')}
              </p>
            )}
            {item.highlights?.length > 0 && (
              <ul className="mt-1 space-y-0.5">
                {item.highlights.map((h: string, i: number) => (
                  <li key={i} className="flex items-start gap-2 text-sm" style={{ color: '#57534e' }}>
                    <span className="mt-1 shrink-0 text-xs" style={{ color: PRIMARY }}>{'\u2022'}</span>
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
    const items = (content as CertificationsContent).items || [];
    return (
      <div className="space-y-1.5">
        {items.map((item: any) => (
          <div key={item.id} className="flex items-baseline gap-2">
            <span className="shrink-0 text-xs" style={{ color: PRIMARY }}>{'\u2666'}</span>
            <span className="text-sm font-bold" style={{ color: PRIMARY }}>{item.name}</span>
            {(item.issuer || item.date) && <span className="text-xs" style={{ color: ACCENT }}>{item.issuer}{item.issuer && item.date ? ' ' : ''}{item.date && `(${item.date})`}</span>}
          </div>
        ))}
      </div>
    );
  }

  if (section.type === 'languages') {
    const items = (content as LanguagesContent).items || [];
    return (
      <div className="flex flex-wrap gap-4">
        {items.map((item: any) => (
          <div key={item.id} className="flex items-baseline gap-2">
            <span className="text-sm font-bold" style={{ color: PRIMARY }}>{item.language}</span>
            <span className="text-xs italic" style={{ color: ACCENT }}>{item.proficiency}</span>
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
          <div key={item.id}>
            <div className="flex items-baseline justify-between">
              <span className="text-sm font-bold" style={{ color: PRIMARY }}>{item.name}</span>
              <span className="text-xs" style={{ color: ACCENT, fontFamily: "'Courier New', monospace" }}>{'\u2B50'} {item.stars?.toLocaleString()}</span>
            </div>
            {item.language && <span className="text-xs italic" style={{ color: ACCENT }}>{item.language}</span>}
            {item.description && <p className="mt-1 text-sm" style={{ color: '#57534e' }} dangerouslySetInnerHTML={{ __html: md(item.description) }} />}
          </div>
        ))}
      </div>
    );
  }

  if (section.type === 'custom') {
    const items = (content as CustomContent).items || [];
    return (
      <div className="space-y-3">
        {items.map((item: any) => (
          <div key={item.id}>
            <div className="flex items-baseline justify-between">
              <h3 className="text-sm font-bold" style={{ color: PRIMARY }}>{item.title}</h3>
              {item.date && <span className="text-xs" style={{ color: ACCENT, fontFamily: "'Courier New', monospace" }}>{item.date}</span>}
            </div>
            {item.subtitle && <p className="text-sm italic" style={{ color: ACCENT }}>{item.subtitle}</p>}
            {item.description && <p className="mt-1 text-sm" style={{ color: '#57534e' }} dangerouslySetInnerHTML={{ __html: md(item.description) }} />}
          </div>
        ))}
      </div>
    );
  }

  if (section.type === 'qr_codes') {
    return <QrCodesPreview items={(content as any).items || []} />;
  }

  // Generic fallback
  if (content?.items) {
    return (
      <div className="space-y-2">
        {content.items.map((item: any) => (
          <div key={item.id}>
            <span className="text-sm font-bold" style={{ color: PRIMARY }}>{item.name || item.title || item.language}</span>
            {item.description && <p className="text-sm" style={{ color: '#57534e' }} dangerouslySetInnerHTML={{ __html: md(item.description) }} />}
          </div>
        ))}
      </div>
    );
  }

  return null;
}
