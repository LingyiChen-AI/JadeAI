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
  GitHubContent,
  CustomContent,
} from '@/types/resume';
import { AvatarImage } from '../avatar-image';
import { degreeField, isSectionEmpty, md } from '../utils';
import { QrCodesPreview } from '../qr-codes-preview';

export function AtsTemplate({ resume }: { resume: Resume }) {
  const personalInfo = resume.sections.find((s) => s.type === 'personal_info');
  const pi = (personalInfo?.content || {}) as PersonalInfoContent;

  const contacts = [pi.age, pi.politicalStatus, pi.gender, pi.ethnicity, pi.hometown, pi.maritalStatus, pi.yearsOfExperience, pi.educationLevel, pi.email, pi.phone, pi.wechat, pi.location, pi.website].filter(Boolean);

  return (
    <div className="mx-auto max-w-[210mm] bg-white shadow-lg" style={{ fontFamily: 'Arial, Helvetica, sans-serif' }}>
      {/* Header — plain, minimal graphics */}
      <div className={`mb-4 ${pi.avatar ? 'flex items-center gap-4' : 'text-center'}`}>
        {pi.avatar && (
          <AvatarImage
            src={pi.avatar}
            size={64}
            avatarStyle={resume.themeConfig?.avatarStyle}
            wrapperClassName="shrink-0 overflow-hidden"
          />
        )}
        <div className={pi.avatar ? '' : ''}>
          <h1 className="text-2xl font-bold text-black">{pi.fullName || 'Your Name'}</h1>
          {pi.jobTitle && <p className="mt-0.5 text-base text-zinc-800">{pi.jobTitle}</p>}
          {contacts.length > 0 && (
            <p className="mt-1 text-sm text-zinc-700">
              {contacts.join(' | ')}
            </p>
          )}
          {(pi.linkedin || pi.github) && (
            <p className="mt-0.5 text-sm text-zinc-700">
              {[pi.linkedin && `LinkedIn: ${pi.linkedin}`, pi.github && `GitHub: ${pi.github}`].filter(Boolean).join(' | ')}
            </p>
          )}
        </div>
      </div>

      <hr className="mb-4 border-black" />

      {/* Sections */}
      {resume.sections
        .filter((s) => s.visible && s.type !== 'personal_info' && !isSectionEmpty(s))
        .map((section) => (
          <div key={section.id} className="mb-4" data-section>
            <h2 className="mb-1.5 border-b border-black pb-0.5 text-base font-bold uppercase text-black">
              {section.title}
            </h2>
            <AtsSectionContent section={section} resume={resume} />
          </div>
        ))}
    </div>
  );
}

function AtsSectionContent({ section, resume }: { section: any; resume: Resume }) {
  const content = section.content;
  if (!content) return null;

  if (section.type === 'summary') {
    return <p className="text-sm leading-relaxed text-zinc-700" dangerouslySetInnerHTML={{ __html: md((content as SummaryContent).text) }} />;
  }

  if (section.type === 'work_experience') {
    const items = (content as WorkExperienceContent).items || [];
    return (
      <div className="space-y-3">
        {items.map((item: any) => (
          <div key={item.id}>
            <div className="flex items-baseline justify-between">
              <div>
                <span className="text-sm font-bold text-black">{item.position}</span>
                {item.company && <span className="text-sm text-zinc-700">, {item.company}</span>}
                {item.location && <span className="text-sm text-zinc-500">, {item.location}</span>}
              </div>
              <span className="shrink-0 text-sm text-zinc-600">{item.startDate} - {item.endDate || (item.current ? (resume.language === 'zh' ? '至今' : 'Present') : '')}</span>
            </div>
            {item.description && <p className="mt-0.5 text-sm text-zinc-700" dangerouslySetInnerHTML={{ __html: md(item.description) }} />}
            {item.technologies?.length > 0 && (
              <p className="text-sm text-zinc-600">{resume.language === 'zh' ? '技术栈' : 'Technologies'}: {item.technologies.join(', ')}</p>
            )}
            {item.highlights?.length > 0 && (
              <ul className="mt-1 list-disc pl-5">
                {item.highlights.map((h: string, i: number) => (
                  <li key={i} className="text-sm text-zinc-700" dangerouslySetInnerHTML={{ __html: md(h) }} />
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
      <div className="space-y-2">
        {items.map((item: any) => (
          <div key={item.id}>
            <div className="flex items-baseline justify-between">
              <div>
                <span className="text-sm font-bold text-black">{degreeField(item.degree, item.field)}</span>
                {item.institution && <span className="text-sm text-zinc-700">, {item.institution}</span>}
                {item.location && <span className="text-sm text-zinc-500">, {item.location}</span>}
              </div>
              <span className="shrink-0 text-sm text-zinc-600">{item.startDate} - {item.endDate || (resume.language === 'zh' ? '至今' : 'Present')}</span>
            </div>
            {item.gpa && <p className="text-sm text-zinc-600">GPA: {item.gpa}</p>}
            {item.highlights?.length > 0 && (
              <ul className="mt-1 list-disc pl-5">
                {item.highlights.map((h: string, i: number) => (
                  <li key={i} className="text-sm text-zinc-700" dangerouslySetInnerHTML={{ __html: md(h) }} />
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
      <div className="space-y-1">
        {categories.map((cat: any) => (
          <div key={cat.id}>
            <p className="text-sm font-bold text-black">{cat.name}</p>
            {cat.skills?.length > 0 && (
              <ul className="mt-0.5 list-disc pl-4">
                {cat.skills.map((skill: string, i: number) => (
                  <li key={i} className="text-sm text-zinc-700">{skill}</li>
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
              <span className="text-sm font-bold text-black">{item.name}</span>
              {item.startDate && (
                <span className="shrink-0 text-sm text-zinc-600">
                  {item.startDate} - {item.endDate || (resume.language === 'zh' ? '至今' : 'Present')}
                </span>
              )}
            </div>
            {item.description && <p className="mt-0.5 text-sm text-zinc-700" dangerouslySetInnerHTML={{ __html: md(item.description) }} />}
            {item.technologies?.length > 0 && (
              <p className="text-sm text-zinc-600">{resume.language === 'zh' ? '技术栈' : 'Technologies'}: {item.technologies.join(', ')}</p>
            )}
            {item.highlights?.length > 0 && (
              <ul className="mt-1 list-disc pl-5">
                {item.highlights.map((h: string, i: number) => (
                  <li key={i} className="text-sm text-zinc-700" dangerouslySetInnerHTML={{ __html: md(h) }} />
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
      <div className="space-y-1">
        {items.map((item: any) => (
          <p key={item.id} className="text-sm text-zinc-700">
            <span className="font-bold text-black">{item.name}</span>
            {item.issuer && <span> - {item.issuer}</span>}
            {item.date && <span> ({item.date})</span>}
          </p>
        ))}
      </div>
    );
  }

  if (section.type === 'languages') {
    const items = (content as LanguagesContent).items || [];
    return (
      <p className="text-sm text-zinc-700">
        {items.map((item: any, i: number) => (
          <span key={item.id}>
            {item.language} ({item.proficiency}){i < items.length - 1 ? ', ' : ''}
          </span>
        ))}
      </p>
    );
  }

  if (section.type === 'github') {
    const items = (content as GitHubContent).items || [];
    return (
      <div className="space-y-3">
        {items.map((item: any) => (
          <div key={item.id}>
            <div className="flex items-baseline justify-between">
              <span className="text-sm font-bold text-black">{item.name}</span>
              <span className="text-xs text-zinc-600">{'\u2B50'} {item.stars?.toLocaleString()}</span>
            </div>
            {item.language && <span className="text-xs text-zinc-600">{item.language}</span>}
            {item.description && <p className="mt-0.5 text-sm text-zinc-700" dangerouslySetInnerHTML={{ __html: md(item.description) }} />}
          </div>
        ))}
      </div>
    );
  }

  if (section.type === 'custom') {
    const items = (content as CustomContent).items || [];
    return (
      <div className="space-y-2">
        {items.map((item: any) => (
          <div key={item.id}>
            <div className="flex items-baseline justify-between">
              <div>
                <span className="text-sm font-bold text-black">{item.title}</span>
                {item.subtitle && <span className="text-sm text-zinc-600"> - {item.subtitle}</span>}
              </div>
              {item.date && <span className="shrink-0 text-sm text-zinc-600">{item.date}</span>}
            </div>
            {item.description && <p className="mt-0.5 text-sm text-zinc-700" dangerouslySetInnerHTML={{ __html: md(item.description) }} />}
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
      <div className="space-y-1">
        {content.items.map((item: any) => (
          <div key={item.id}>
            <span className="text-sm font-bold text-black">{item.name || item.title || item.language}</span>
            {item.description && <p className="text-sm text-zinc-700" dangerouslySetInnerHTML={{ __html: md(item.description) }} />}
          </div>
        ))}
      </div>
    );
  }

  return null;
}
