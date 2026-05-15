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

const DARK = '#0d1117';
const BLUE = '#58a6ff';
const GREEN = '#3fb950';
const BORDER = '#21262d';

// Sidebar section types
const SIDEBAR_TYPES = new Set(['skills', 'languages', 'certifications']);

export function CoderTemplate({ resume }: { resume: Resume }) {
  const personalInfo = resume.sections.find((s) => s.type === 'personal_info');
  const pi = (personalInfo?.content || {}) as PersonalInfoContent;

  const visibleSections = resume.sections.filter(
    (s) => s.visible && s.type !== 'personal_info' && !isSectionEmpty(s)
  );

  const sidebarSections = visibleSections.filter((s) => SIDEBAR_TYPES.has(s.type));
  const mainSections = visibleSections.filter((s) => !SIDEBAR_TYPES.has(s.type));

  return (
    <div className="mx-auto flex max-w-[210mm] overflow-hidden bg-white shadow-lg" style={{ fontFamily: '"JetBrains Mono", "Fira Code", monospace', minHeight: '297mm' }}>
      {/* Dark sidebar */}
      <div className="w-[32%] shrink-0 p-5" style={{ backgroundColor: DARK }}>
        {/* Terminal dots */}
        <div className="mb-4 flex items-center gap-1.5">
          <div className="h-2.5 w-2.5 rounded-full bg-[#ff5f56]" />
          <div className="h-2.5 w-2.5 rounded-full bg-[#ffbd2e]" />
          <div className="h-2.5 w-2.5 rounded-full bg-[#27c93f]" />
          <span className="ml-2 text-[10px]" style={{ color: '#484f58' }}>~/whoami</span>
        </div>

        {/* Avatar & Name */}
        <div className="mb-5">
          {pi.avatar && (
            <AvatarImage
              src={pi.avatar}
              avatarStyle={resume.themeConfig?.avatarStyle}
              size={80}
              wrapperClassName="mx-auto mb-3 w-fit overflow-hidden"
            />
          )}
          <h1 className="text-lg font-bold" style={{ color: GREEN }}>{pi.fullName || 'Your Name'}</h1>
          {pi.jobTitle && (
            <p className="mt-0.5 text-xs" style={{ color: BLUE }}>
              {'// '}{pi.jobTitle}
            </p>
          )}
        </div>

        {/* Contact */}
        <div className="mb-5 space-y-1.5 text-[11px]" style={{ borderTop: `1px solid ${BORDER}`, paddingTop: '12px' }}>
          {pi.age && (
            <div className="flex items-start gap-2">
              <span style={{ color: GREEN }}>$</span>
              <span style={{ color: '#8b949e' }}>{pi.age}</span>
            </div>
          )}
          {pi.politicalStatus && (
            <div className="flex items-start gap-2">
              <span style={{ color: GREEN }}>$</span>
              <span style={{ color: '#8b949e' }}>{pi.politicalStatus}</span>
            </div>
          )}
          {pi.gender && (
            <div className="flex items-start gap-2">
              <span style={{ color: GREEN }}>$</span>
              <span style={{ color: '#8b949e' }}>{pi.gender}</span>
            </div>
          )}
          {pi.ethnicity && (
            <div className="flex items-start gap-2">
              <span style={{ color: GREEN }}>$</span>
              <span style={{ color: '#8b949e' }}>{pi.ethnicity}</span>
            </div>
          )}
          {pi.hometown && (
            <div className="flex items-start gap-2">
              <span style={{ color: GREEN }}>$</span>
              <span style={{ color: '#8b949e' }}>{pi.hometown}</span>
            </div>
          )}
          {pi.maritalStatus && (
            <div className="flex items-start gap-2">
              <span style={{ color: GREEN }}>$</span>
              <span style={{ color: '#8b949e' }}>{pi.maritalStatus}</span>
            </div>
          )}
          {pi.yearsOfExperience && (
            <div className="flex items-start gap-2">
              <span style={{ color: GREEN }}>$</span>
              <span style={{ color: '#8b949e' }}>{pi.yearsOfExperience}</span>
            </div>
          )}
          {pi.educationLevel && (
            <div className="flex items-start gap-2">
              <span style={{ color: GREEN }}>$</span>
              <span style={{ color: '#8b949e' }}>{pi.educationLevel}</span>
            </div>
          )}
          {pi.email && (
            <div className="flex items-start gap-2">
              <span style={{ color: GREEN }}>$</span>
              <span className="break-all" style={{ color: '#8b949e' }}>{pi.email}</span>
            </div>
          )}
          {pi.phone && (
            <div className="flex items-start gap-2">
              <span style={{ color: GREEN }}>$</span>
              <span style={{ color: '#8b949e' }}>{pi.phone}</span>
            </div>
          )}
          {pi.wechat && (
            <div className="flex items-start gap-2">
              <span style={{ color: GREEN }}>$</span>
              <span style={{ color: '#8b949e' }}>{pi.wechat}</span>
            </div>
          )}
          {pi.location && (
            <div className="flex items-start gap-2">
              <span style={{ color: GREEN }}>$</span>
              <span style={{ color: '#8b949e' }}>{pi.location}</span>
            </div>
          )}
          {pi.website && (
            <div className="flex items-start gap-2">
              <span style={{ color: GREEN }}>$</span>
              <span className="break-all" style={{ color: '#8b949e' }}>{pi.website}</span>
            </div>
          )}
          {pi.github && (
            <div className="flex items-start gap-2">
              <span style={{ color: GREEN }}>$</span>
              <span className="break-all" style={{ color: '#8b949e' }}>{pi.github}</span>
            </div>
          )}
          {pi.linkedin && (
            <div className="flex items-start gap-2">
              <span style={{ color: GREEN }}>$</span>
              <span className="break-all" style={{ color: '#8b949e' }}>{pi.linkedin}</span>
            </div>
          )}
        </div>

        {/* Sidebar sections */}
        {sidebarSections.map((section) => (
          <div key={section.id} className="mb-5" data-section style={{ borderTop: `1px solid ${BORDER}`, paddingTop: '12px' }}>
            <h2 className="mb-2 text-[10px] font-bold uppercase tracking-wider" style={{ color: BLUE }}>
              {'> '}{section.title}
            </h2>
            <CoderSidebarContent section={section} />
          </div>
        ))}
      </div>

      {/* Main content */}
      <div className="flex-1 p-6">
        {mainSections.map((section) => (
          <div key={section.id} className="mb-5" data-section>
            <h2 className="mb-2 text-xs font-bold" style={{ color: DARK }}>
              <span style={{ color: GREEN }}>{'> '}</span>
              <span className="uppercase tracking-wider">{section.title}</span>
            </h2>
            <div className="border-l-2 pl-4" style={{ borderColor: BORDER }}>
              <CoderMainContent section={section} resume={resume} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function CoderSidebarContent({ section }: { section: any }) {
  const content = section.content;
  if (!content) return null;

  if (section.type === 'skills') {
    const categories = (content as SkillsContent).categories || [];
    return (
      <div className="space-y-2">
        {categories.map((cat: any) => (
          <div key={cat.id}>
            <p className="text-[10px] font-semibold" style={{ color: '#c9d1d9' }}>{cat.name}</p>
            <div className="mt-1 flex flex-wrap gap-1">
              {(cat.skills || []).map((skill: string, i: number) => (
                <span
                  key={i}
                  className="rounded-sm px-1.5 py-0.5 text-[9px] font-medium"
                  style={{ backgroundColor: '#161b22', color: BLUE, border: `1px solid ${BORDER}` }}
                >
                  {skill}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (section.type === 'languages') {
    const items = (content as LanguagesContent).items || [];
    return (
      <div className="space-y-1">
        {items.map((item: any) => (
          <div key={item.id} className="flex items-center justify-between text-[10px]">
            <span style={{ color: '#c9d1d9' }}>{item.language}</span>
            <span style={{ color: '#484f58' }}>{item.proficiency}</span>
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
          <div key={item.id}>
            <p className="text-[10px] font-semibold" style={{ color: '#c9d1d9' }}>{item.name}</p>
            {(item.issuer || item.date) && <p className="text-[9px]" style={{ color: '#484f58' }}>{item.issuer}{item.date ? ` (${item.date})` : ''}</p>}
          </div>
        ))}
      </div>
    );
  }

  if (section.type === 'qr_codes') {
    return <QrCodesPreview items={(content as any).items || []} />;
  }

  // Generic fallback for sidebar
  if (content?.items) {
    return (
      <div className="space-y-1.5">
        {content.items.map((item: any) => (
          <div key={item.id}>
            <span className="text-[10px] font-medium" style={{ color: '#c9d1d9' }}>{item.name || item.title || item.language}</span>
            {item.description && <p className="text-[9px]" style={{ color: '#484f58' }} dangerouslySetInnerHTML={{ __html: md(item.description) }} />}
          </div>
        ))}
      </div>
    );
  }

  return null;
}

function CoderMainContent({ section, resume }: { section: any; resume: Resume }) {
  const content = section.content;
  if (!content) return null;

  if (section.type === 'summary') {
    return <p className="text-sm leading-relaxed text-zinc-600" dangerouslySetInnerHTML={{ __html: md((content as SummaryContent).text) }} />;
  }

  if (section.type === 'work_experience') {
    const items = (content as WorkExperienceContent).items || [];
    return (
      <div className="space-y-4">
        {items.map((item: any) => (
          <div key={item.id}>
            <div className="flex items-baseline justify-between">
              <div>
                <span className="text-sm font-bold" style={{ color: DARK }}>{item.position}</span>
                {item.company && <span className="text-sm" style={{ color: BLUE }}>{' @ '}{item.company}</span>}
                {item.location && <span className="text-xs text-zinc-400">, {item.location}</span>}
              </div>
              <span className="shrink-0 rounded px-2 py-0.5 text-[10px] font-medium" style={{ backgroundColor: '#f6f8fa', color: '#57606a' }}>
                {item.startDate} - {item.endDate || (item.current ? (resume.language === 'zh' ? '至今' : 'Present') : '')}
              </span>
            </div>
            {item.description && <p className="mt-1 text-sm text-zinc-600" dangerouslySetInnerHTML={{ __html: md(item.description) }} />}
            {item.technologies?.length > 0 && (
              <div className="mt-1 flex flex-wrap gap-1">
                {item.technologies.map((t: string, i: number) => (
                  <span key={i} className="rounded-sm px-1.5 py-0.5 text-[10px] font-medium" style={{ backgroundColor: '#f6f8fa', color: '#57606a', border: '1px solid #d0d7de' }}>
                    {t}
                  </span>
                ))}
              </div>
            )}
            {item.highlights?.length > 0 && (
              <ul className="mt-1 space-y-0.5">
                {item.highlights.map((h: string, i: number) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-zinc-600">
                    <span className="mt-1 shrink-0 text-xs" style={{ color: GREEN }}>$</span>
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
              <h3 className="text-sm font-bold" style={{ color: DARK }}>{item.institution}</h3>
              <span className="text-xs text-zinc-400">{item.startDate} - {item.endDate || (resume.language === 'zh' ? '至今' : 'Present')}</span>
            </div>
            <p className="text-sm text-zinc-600">
              {degreeField(item.degree, item.field)}
              {item.location && <span className="text-zinc-400">, {item.location}</span>}
            </p>
            {item.gpa && <p className="text-xs text-zinc-500">GPA: {item.gpa}</p>}
            {item.highlights?.length > 0 && (
              <ul className="mt-1 space-y-0.5">
                {item.highlights.map((h: string, i: number) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-zinc-600">
                    <span className="mt-1 shrink-0 text-xs" style={{ color: GREEN }}>$</span>
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

  if (section.type === 'projects') {
    const items = (content as ProjectsContent).items || [];
    return (
      <div className="space-y-3">
        {items.map((item: any) => (
          <div key={item.id}>
            <div className="flex items-baseline justify-between">
              <h3 className="text-sm font-bold" style={{ color: BLUE }}>{item.name}</h3>
              {item.startDate && (
                <span className="text-xs text-zinc-400">
                  {item.startDate} - {item.endDate || (resume.language === 'zh' ? '至今' : 'Present')}
                </span>
              )}
            </div>
            {item.description && <p className="mt-1 text-sm text-zinc-600" dangerouslySetInnerHTML={{ __html: md(item.description) }} />}
            {item.technologies?.length > 0 && (
              <div className="mt-1 flex flex-wrap gap-1">
                {item.technologies.map((t: string, i: number) => (
                  <span key={i} className="rounded-sm px-1.5 py-0.5 text-[10px] font-medium" style={{ backgroundColor: '#f6f8fa', color: '#57606a', border: '1px solid #d0d7de' }}>
                    {t}
                  </span>
                ))}
              </div>
            )}
            {item.highlights?.length > 0 && (
              <ul className="mt-1 space-y-0.5">
                {item.highlights.map((h: string, i: number) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-zinc-600">
                    <span className="mt-1 shrink-0 text-xs" style={{ color: GREEN }}>$</span>
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

  if (section.type === 'github') {
    const items = (content as GitHubContent).items || [];
    return (
      <div className="space-y-3">
        {items.map((item: any) => (
          <div key={item.id}>
            <div className="flex items-baseline justify-between">
              <h3 className="text-sm font-bold" style={{ color: BLUE }}>{item.name}</h3>
              <span className="text-xs text-zinc-400">{'\u2B50'} {item.stars?.toLocaleString()}</span>
            </div>
            {item.language && (
              <span className="rounded-sm px-1.5 py-0.5 text-[10px] font-medium" style={{ backgroundColor: '#f6f8fa', color: '#57606a', border: '1px solid #d0d7de' }}>
                {item.language}
              </span>
            )}
            {item.description && <p className="mt-1 text-sm text-zinc-600" dangerouslySetInnerHTML={{ __html: md(item.description) }} />}
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
              <h3 className="text-sm font-bold" style={{ color: DARK }}>{item.title}</h3>
              {item.date && <span className="text-xs text-zinc-400">{item.date}</span>}
            </div>
            {item.subtitle && <p className="text-sm text-zinc-500">{item.subtitle}</p>}
            {item.description && <p className="mt-1 text-sm text-zinc-600" dangerouslySetInnerHTML={{ __html: md(item.description) }} />}
          </div>
        ))}
      </div>
    );
  }

  // Fallback for any section type that ends up in main
  if (section.type === 'skills') {
    const categories = (content as SkillsContent).categories || [];
    return (
      <div className="space-y-2">
        {categories.map((cat: any) => (
          <div key={cat.id}>
            <span className="text-xs font-bold" style={{ color: BLUE }}>{cat.name}: </span>
            {(cat.skills || []).length > 0 && (
              <ul className="mt-0.5 list-disc pl-4">
                {(cat.skills || []).map((skill: string, i: number) => (
                  <li key={i} className="text-sm text-sm text-zinc-600">{skill}</li>
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
          <div key={item.id}>
            <span className="text-sm font-bold" style={{ color: DARK }}>{item.name}</span>
            {(item.issuer || item.date) && <span className="text-xs text-zinc-500">{item.issuer && <>{' - '}{item.issuer}</>}{item.date && <> ({item.date})</>}</span>}
          </div>
        ))}
      </div>
    );
  }

  if (section.type === 'languages') {
    const items = (content as LanguagesContent).items || [];
    return (
      <div className="flex flex-wrap gap-x-6 gap-y-1">
        {items.map((item: any) => (
          <span key={item.id} className="text-sm">
            <span className="font-medium" style={{ color: DARK }}>{item.language}</span>
            <span className="text-zinc-500">{' - '}{item.proficiency}</span>
          </span>
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
            <span className="text-sm font-medium" style={{ color: DARK }}>{item.name || item.title || item.language}</span>
            {item.description && <p className="text-sm text-zinc-600" dangerouslySetInnerHTML={{ __html: md(item.description) }} />}
          </div>
        ))}
      </div>
    );
  }

  return null;
}
