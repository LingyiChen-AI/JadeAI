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

const PRIMARY = '#1a1a1a';
const ACCENT = '#dc2626';
const SECONDARY = '#44403c';

export function MagazineTemplate({ resume }: { resume: Resume }) {
  const personalInfo = resume.sections.find((s) => s.type === 'personal_info');
  const pi = (personalInfo?.content || {}) as PersonalInfoContent;

  const contacts = [pi.age, pi.politicalStatus, pi.gender, pi.ethnicity, pi.hometown, pi.maritalStatus, pi.yearsOfExperience, pi.educationLevel, pi.email, pi.phone, pi.wechat, pi.location, pi.website].filter(Boolean);

  return (
    <div className="mx-auto max-w-[210mm] bg-white shadow-lg" style={{ fontFamily: 'Georgia, serif' }}>
      {/* Header */}
      <div className="mb-6 border-b-2 pb-4" style={{ borderColor: ACCENT }}>
        <div className="flex items-end gap-4">
          {pi.avatar && (
            <AvatarImage src={pi.avatar} avatarStyle={resume.themeConfig?.avatarStyle} size={80} className="shrink-0" />
          )}
          <div>
            <h1 className="text-4xl font-black uppercase tracking-tight" style={{ color: PRIMARY, letterSpacing: '-0.02em' }}>
              {pi.fullName || 'Your Name'}
            </h1>
            {pi.jobTitle && (
              <p className="mt-1 text-sm font-medium uppercase tracking-widest" style={{ color: ACCENT }}>
                {pi.jobTitle}
              </p>
            )}
          </div>
        </div>
        {contacts.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs" style={{ color: SECONDARY }}>
            {contacts.map((c, i) => (
              <span key={i} className="flex items-center gap-1.5">
                {c}
                {i < contacts.length - 1 && <span style={{ color: ACCENT }}>|</span>}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Sections */}
      {resume.sections
        .filter((s) => s.visible && s.type !== 'personal_info' && !isSectionEmpty(s))
        .map((section) => (
          <div key={section.id} className="mb-5" data-section>
            <div className="mb-2 flex items-center gap-2">
              <div className="h-4 w-4 shrink-0" style={{ backgroundColor: ACCENT }} />
              <h2 className="text-xs font-bold uppercase tracking-[0.2em]" style={{ color: PRIMARY }}>
                {section.title}
              </h2>
              <div className="h-px flex-1" style={{ backgroundColor: '#e5e5e5' }} />
            </div>
            <MagazineSectionContent section={section} resume={resume} />
          </div>
        ))}
    </div>
  );
}

function MagazineSectionContent({ section, resume }: { section: any; resume: Resume }) {
  const content = section.content;
  if (!content) return null;

  if (section.type === 'summary') {
    const text = (content as SummaryContent).text || '';
    return (
      <p className="text-sm leading-relaxed" style={{ color: SECONDARY }}>
        {text.length > 0 && (
          <span className="float-left mr-1 text-3xl font-black leading-none" style={{ color: ACCENT }}>
            {text[0]}
          </span>
        )}
        <span dangerouslySetInnerHTML={{ __html: md(text.slice(1)) }} />
      </p>
    );
  }

  if (section.type === 'work_experience') {
    const items = (content as WorkExperienceContent).items || [];
    return (
      <div className="space-y-4">
        {items.map((item: any) => (
          <div key={item.id} className="border-l-2 pl-4" style={{ borderColor: ACCENT }}>
            <div className="flex items-baseline justify-between">
              <h3 className="text-sm font-bold" style={{ color: PRIMARY }}>{item.position}</h3>
              <span className="shrink-0 text-xs font-medium" style={{ color: ACCENT }}>
                {item.startDate} - {item.endDate || (item.current ? (resume.language === 'zh' ? '至今' : 'Present') : '')}
              </span>
            </div>
            {item.company && <p className="text-sm font-medium italic" style={{ color: SECONDARY }}>{item.company}{item.location ? `, ${item.location}` : ''}</p>}
            {item.description && <p className="mt-1 text-sm" style={{ color: SECONDARY }} dangerouslySetInnerHTML={{ __html: md(item.description) }} />}
            {item.technologies?.length > 0 && (
              <p className="mt-1 text-xs italic" style={{ color: ACCENT }}>
                {item.technologies.join(', ')}
              </p>
            )}
            {item.highlights?.length > 0 && (
              <ul className="mt-1.5 space-y-0.5">
                {item.highlights.map((h: string, i: number) => (
                  <li key={i} className="flex items-start gap-2 text-sm" style={{ color: SECONDARY }}>
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
    const items = (content as EducationContent).items || [];
    return (
      <div className="space-y-3">
        {items.map((item: any) => (
          <div key={item.id} className="border-l-2 pl-4" style={{ borderColor: ACCENT }}>
            <div className="flex items-baseline justify-between">
              <h3 className="text-sm font-bold" style={{ color: PRIMARY }}>{item.institution}</h3>
              <span className="text-xs" style={{ color: SECONDARY }}>{item.startDate} - {item.endDate || (resume.language === 'zh' ? '至今' : 'Present')}</span>
            </div>
            <p className="text-sm" style={{ color: SECONDARY }}>{degreeField(item.degree, item.field)}{item.location ? ` — ${item.location}` : ''}</p>
            {item.gpa && <p className="text-xs" style={{ color: SECONDARY }}>GPA: {item.gpa}</p>}
            {item.highlights?.length > 0 && (
              <ul className="mt-1 space-y-0.5">
                {item.highlights.map((h: string, i: number) => (
                  <li key={i} className="flex items-start gap-2 text-sm" style={{ color: SECONDARY }}>
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
    const categories = (content as SkillsContent).categories || [];
    return (
      <div className="grid grid-cols-2 gap-x-6 gap-y-3">
        {categories.map((cat: any) => (
          <div key={cat.id}>
            <p className="mb-1 text-xs font-bold uppercase tracking-wider" style={{ color: ACCENT }}>{cat.name}</p>
            {cat.skills?.length > 0 && (
              <ul className="list-disc pl-4">
                {cat.skills.map((skill: string, i: number) => (
                  <li key={i} className="text-sm" style={{ color: SECONDARY }}>{skill}</li>
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
      <div className="grid grid-cols-2 gap-4">
        {items.map((item: any) => (
          <div key={item.id} className="border-l-2 pl-4" style={{ borderColor: ACCENT }}>
            <div className="flex items-baseline justify-between">
              <h3 className="text-sm font-bold" style={{ color: PRIMARY }}>{item.name}</h3>
              {item.startDate && (
                <span className="text-xs" style={{ color: SECONDARY }}>
                  {item.startDate} - {item.endDate || (resume.language === 'zh' ? '至今' : 'Present')}
                </span>
              )}
            </div>
            {item.description && <p className="mt-0.5 text-sm" style={{ color: SECONDARY }} dangerouslySetInnerHTML={{ __html: md(item.description) }} />}
            {item.technologies?.length > 0 && (
              <p className="mt-1 text-xs italic" style={{ color: ACCENT }}>
                {item.technologies.join(', ')}
              </p>
            )}
            {item.highlights?.length > 0 && (
              <ul className="mt-1 space-y-0.5">
                {item.highlights.map((h: string, i: number) => (
                  <li key={i} className="flex items-start gap-2 text-sm" style={{ color: SECONDARY }}>
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
    const items = (content as CertificationsContent).items || [];
    return (
      <div className="space-y-1.5">
        {items.map((item: any) => (
          <div key={item.id} className="flex items-baseline gap-2">
            <span className="h-1.5 w-1.5 shrink-0 rotate-45" style={{ backgroundColor: ACCENT }} />
            <span className="text-sm font-bold" style={{ color: PRIMARY }}>{item.name}</span>
            {(item.issuer || item.date) && <span className="text-xs" style={{ color: SECONDARY }}>{item.issuer}{item.issuer && item.date ? ' | ' : ''}{item.date}</span>}
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
            <span className="text-xs uppercase tracking-wider" style={{ color: ACCENT }}>{item.proficiency}</span>
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
              <span className="text-xs" style={{ color: SECONDARY }}>{'\u2B50'} {item.stars?.toLocaleString()}</span>
            </div>
            {item.language && <span className="text-xs" style={{ color: ACCENT }}>{item.language}</span>}
            {item.description && <p className="mt-1 text-sm" style={{ color: SECONDARY }} dangerouslySetInnerHTML={{ __html: md(item.description) }} />}
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
          <div key={item.id} className="border-l-2 pl-4" style={{ borderColor: ACCENT }}>
            <div className="flex items-baseline justify-between">
              <h3 className="text-sm font-bold" style={{ color: PRIMARY }}>{item.title}</h3>
              {item.date && <span className="text-xs" style={{ color: SECONDARY }}>{item.date}</span>}
            </div>
            {item.subtitle && <p className="text-sm italic" style={{ color: SECONDARY }}>{item.subtitle}</p>}
            {item.description && <p className="mt-1 text-sm" style={{ color: SECONDARY }} dangerouslySetInnerHTML={{ __html: md(item.description) }} />}
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
          <div key={item.id} className="border-l-2 pl-4" style={{ borderColor: ACCENT }}>
            <span className="text-sm font-bold" style={{ color: PRIMARY }}>{item.name || item.title || item.language}</span>
            {item.description && <p className="text-sm" style={{ color: SECONDARY }} dangerouslySetInnerHTML={{ __html: md(item.description) }} />}
          </div>
        ))}
      </div>
    );
  }

  return null;
}
