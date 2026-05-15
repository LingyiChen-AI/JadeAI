'use client';

import type { Resume, PersonalInfoContent, SummaryContent, WorkExperienceContent, EducationContent, SkillsContent, ProjectsContent, CertificationsContent, LanguagesContent, CustomContent, GitHubContent } from '@/types/resume';
import { AvatarImage } from '../avatar-image';
import { isSectionEmpty, md, degreeField } from '../utils';
import { QrCodesPreview } from '../qr-codes-preview';

const LEFT_TYPES = new Set(['skills', 'languages', 'certifications', 'custom']);

export function CompactTemplate({ resume }: { resume: Resume }) {
  const personalInfo = resume.sections.find((s) => s.type === 'personal_info');
  const pi = (personalInfo?.content || {}) as PersonalInfoContent;

  const visibleSections = resume.sections.filter(
    (s) => s.visible && s.type !== 'personal_info' && !isSectionEmpty(s)
  );
  const leftSections = visibleSections.filter((s) => LEFT_TYPES.has(s.type));
  const rightSections = visibleSections.filter((s) => !LEFT_TYPES.has(s.type));

  return (
    <div className="mx-auto max-w-[210mm] bg-white shadow-lg" style={{ fontFamily: 'Inter, sans-serif' }}>
      {/* Compact header */}
      <div className="border-b border-zinc-200 px-6 py-4">
        <div className="flex items-center gap-3">
          {pi.avatar && <AvatarImage src={pi.avatar} avatarStyle={resume.themeConfig?.avatarStyle} size={48} className="shrink-0" />}
          <div className="flex-1">
            <h1 className="text-xl font-bold text-zinc-900">{pi.fullName || 'Your Name'}</h1>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-zinc-500">
              {pi.jobTitle && <span className="font-medium text-zinc-700">{pi.jobTitle}</span>}
              {pi.age && <><span className="text-zinc-300">|</span><span>{pi.age}</span></>}
              {pi.politicalStatus && <><span className="text-zinc-300">|</span><span>{pi.politicalStatus}</span></>}
              {pi.gender && <><span className="text-zinc-300">|</span><span>{pi.gender}</span></>}
              {pi.ethnicity && <><span className="text-zinc-300">|</span><span>{pi.ethnicity}</span></>}
              {pi.hometown && <><span className="text-zinc-300">|</span><span>{pi.hometown}</span></>}
              {pi.maritalStatus && <><span className="text-zinc-300">|</span><span>{pi.maritalStatus}</span></>}
              {pi.yearsOfExperience && <><span className="text-zinc-300">|</span><span>{pi.yearsOfExperience}</span></>}
              {pi.educationLevel && <><span className="text-zinc-300">|</span><span>{pi.educationLevel}</span></>}
              {pi.email && <><span className="text-zinc-300">|</span><span>{pi.email}</span></>}
              {pi.phone && <><span className="text-zinc-300">|</span><span>{pi.phone}</span></>}
              {pi.wechat && <><span className="text-zinc-300">|</span><span>{pi.wechat}</span></>}
              {pi.location && <><span className="text-zinc-300">|</span><span>{pi.location}</span></>}
              {pi.website && <><span className="text-zinc-300">|</span><span>{pi.website}</span></>}
            </div>
          </div>
        </div>
      </div>

      {/* Two-column body */}
      <div className="flex">
        {/* Left - sidebar sections */}
        <div className="w-[32%] shrink-0 border-r border-zinc-100 bg-zinc-50 p-4">
          {leftSections.map((section) => (
            <div key={section.id} className="mb-4" data-section>
              <h2 className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-zinc-500">{section.title}</h2>
              <CompactLeftContent section={section} />
            </div>
          ))}
        </div>
        {/* Right - main sections */}
        <div className="flex-1 p-4">
          {rightSections.map((section) => (
            <div key={section.id} className="mb-4" data-section>
              <h2 className="mb-1.5 border-b border-zinc-200 pb-0.5 text-xs font-bold uppercase tracking-wider text-zinc-700">{section.title}</h2>
              <CompactRightContent section={section} resume={resume} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function CompactLeftContent({ section }: { section: any }) {
  const content = section.content;
  if (!content) return null;

  if (section.type === 'skills') {
    return (
      <div className="space-y-1.5">
        {((content as SkillsContent).categories || []).map((cat: any) => (
          <div key={cat.id}>
            <p className="text-[10px] font-semibold text-zinc-600">{cat.name}</p>
            {(cat.skills || []).length > 0 && (
              <ul className="mt-0.5 list-disc pl-3">
                {(cat.skills || []).map((skill: string, i: number) => (
                  <li key={i} className="text-[10px] text-zinc-500">{skill}</li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
    );
  }

  if (section.type === 'languages') {
    return (
      <div className="space-y-0.5">
        {((content as LanguagesContent).items || []).map((item: any) => (
          <div key={item.id} className="flex items-center justify-between text-[10px]">
            <span className="font-medium text-zinc-700">{item.language}</span>
            <span className="text-zinc-400">{item.proficiency}</span>
          </div>
        ))}
      </div>
    );
  }

  if (section.type === 'certifications') {
    return (
      <div className="space-y-1">
        {((content as CertificationsContent).items || []).map((item: any) => (
          <div key={item.id}>
            <p className="text-[10px] font-semibold text-zinc-700">{item.name}</p>
            {(item.issuer || item.date) && <p className="text-[9px] text-zinc-400">{item.issuer}{item.date ? ` (${item.date})` : ''}</p>}
          </div>
        ))}
      </div>
    );
  }

  if (section.type === 'custom') {
    return (
      <div className="space-y-1.5">
        {((content as CustomContent).items || []).map((item: any) => (
          <div key={item.id}>
            <p className="text-[10px] font-semibold text-zinc-700">{item.title}</p>
            {item.subtitle && <p className="text-[9px] text-zinc-500">{item.subtitle}</p>}
            {item.date && <p className="text-[9px] text-zinc-400">{item.date}</p>}
            {item.description && <p className="text-[9px] text-zinc-400" dangerouslySetInnerHTML={{ __html: md(item.description) }} />}
          </div>
        ))}
      </div>
    );
  }

  if (section.type === 'qr_codes') {
    return <QrCodesPreview items={(content as any).items || []} />;
  }

  if (content?.items) {
    return (
      <div className="space-y-1">
        {content.items.map((item: any) => (
          <div key={item.id}>
            <span className="text-[10px] font-medium text-zinc-700">{item.name || item.title || item.language}</span>
            {item.description && <p className="text-[9px] text-zinc-400" dangerouslySetInnerHTML={{ __html: md(item.description) }} />}
          </div>
        ))}
      </div>
    );
  }

  return null;
}

function CompactRightContent({ section, resume }: { section: any; resume: Resume }) {
  const content = section.content;
  if (!content) return null;

  if (section.type === 'summary') {
    return <p className="text-xs leading-relaxed text-zinc-600" dangerouslySetInnerHTML={{ __html: md((content as SummaryContent).text) }} />;
  }

  if (section.type === 'work_experience') {
    return (
      <div className="space-y-2.5">
        {((content as WorkExperienceContent).items || []).map((item: any) => (
          <div key={item.id}>
            <div className="flex items-baseline justify-between">
              <div>
                <span className="text-xs font-bold text-zinc-800">{item.position}</span>
                {item.company && <span className="text-xs text-zinc-500"> | {item.company}</span>}
                {item.location && <span className="text-xs text-zinc-400">, {item.location}</span>}
              </div>
              <span className="shrink-0 text-[10px] text-zinc-400">{item.startDate} – {item.endDate || (item.current ? (resume.language === 'zh' ? '至今' : 'Present') : '')}</span>
            </div>
            {item.description && <p className="mt-0.5 text-xs text-zinc-600" dangerouslySetInnerHTML={{ __html: md(item.description) }} />}
            {item.technologies?.length > 0 && (
              <p className="mt-0.5 text-[10px] text-zinc-400">{resume.language === 'zh' ? '技术栈' : 'Tech'}: {item.technologies.join(', ')}</p>
            )}
            {item.highlights?.length > 0 && (
              <ul className="mt-0.5 list-disc pl-3.5">
                {item.highlights.map((h: string, i: number) => <li key={i} className="text-xs text-zinc-600" dangerouslySetInnerHTML={{ __html: md(h) }} />)}
              </ul>
            )}
          </div>
        ))}
      </div>
    );
  }

  if (section.type === 'education') {
    return (
      <div className="space-y-2">
        {((content as EducationContent).items || []).map((item: any) => (
          <div key={item.id}>
            <div className="flex items-baseline justify-between">
              <div>
                <span className="text-xs font-bold text-zinc-800">{degreeField(item.degree, item.field)}</span>
                {item.institution && <span className="text-xs text-zinc-500"> — {item.institution}</span>}
                {item.location && <span className="text-xs text-zinc-400">, {item.location}</span>}
              </div>
              <span className="shrink-0 text-[10px] text-zinc-400">{item.startDate} – {item.endDate || (resume.language === 'zh' ? '至今' : 'Present')}</span>
            </div>
            {item.gpa && <p className="text-[10px] text-zinc-500">GPA: {item.gpa}</p>}
            {item.highlights?.length > 0 && (
              <ul className="mt-0.5 list-disc pl-3.5">
                {item.highlights.map((h: string, i: number) => <li key={i} className="text-xs text-zinc-600" dangerouslySetInnerHTML={{ __html: md(h) }} />)}
              </ul>
            )}
          </div>
        ))}
      </div>
    );
  }

  if (section.type === 'projects') {
    return (
      <div className="space-y-2">
        {((content as ProjectsContent).items || []).map((item: any) => (
          <div key={item.id}>
            <div className="flex items-baseline justify-between">
              <span className="text-xs font-bold text-zinc-800">{item.name}</span>
              {item.startDate && <span className="shrink-0 text-[10px] text-zinc-400">{item.startDate} – {item.endDate || (resume.language === 'zh' ? '至今' : 'Present')}</span>}
            </div>
            {item.description && <p className="mt-0.5 text-xs text-zinc-600" dangerouslySetInnerHTML={{ __html: md(item.description) }} />}
            {item.technologies?.length > 0 && (
              <p className="mt-0.5 text-[10px] text-zinc-400">{resume.language === 'zh' ? '技术栈' : 'Tech'}: {item.technologies.join(', ')}</p>
            )}
            {item.highlights?.length > 0 && (
              <ul className="mt-0.5 list-disc pl-3.5">
                {item.highlights.map((h: string, i: number) => <li key={i} className="text-xs text-zinc-600" dangerouslySetInnerHTML={{ __html: md(h) }} />)}
              </ul>
            )}
          </div>
        ))}
      </div>
    );
  }

  if (section.type === 'github') {
    const items = (content as GitHubContent).items || [];
    return (
      <div className="space-y-2">
        {items.map((item: any) => (
          <div key={item.id}>
            <div className="flex items-baseline justify-between">
              <span className="text-xs font-bold text-zinc-800">{item.name}</span>
              <span className="text-[10px] text-zinc-400">{'\u2B50'} {item.stars?.toLocaleString()}</span>
            </div>
            {item.language && <span className="text-[10px] text-zinc-500">{item.language}</span>}
            {item.description && <p className="mt-0.5 text-xs text-zinc-600" dangerouslySetInnerHTML={{ __html: md(item.description) }} />}
          </div>
        ))}
      </div>
    );
  }

  if (section.type === 'qr_codes') {
    return <QrCodesPreview items={(content as any).items || []} />;
  }

  if (content?.items) {
    return (
      <div className="space-y-1.5">
        {content.items.map((item: any) => (
          <div key={item.id}>
            <span className="text-xs font-medium text-zinc-700">{item.name || item.title || item.language}</span>
            {item.description && <p className="text-xs text-zinc-600" dangerouslySetInnerHTML={{ __html: md(item.description) }} />}
          </div>
        ))}
      </div>
    );
  }

  return null;
}
