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

const SIDEBAR_BG = '#1e40af';
const ACCENT = '#3b82f6';

// Section types that go in the sidebar
const SIDEBAR_TYPES = new Set(['skills', 'languages', 'certifications', 'custom']);

export function SidebarTemplate({ resume }: { resume: Resume }) {
  const personalInfo = resume.sections.find((s) => s.type === 'personal_info');
  const pi = (personalInfo?.content || {}) as PersonalInfoContent;

  const visibleSections = resume.sections.filter(
    (s) => s.visible && s.type !== 'personal_info' && !isSectionEmpty(s)
  );

  const sidebarSections = visibleSections.filter((s) => SIDEBAR_TYPES.has(s.type));
  const mainSections = visibleSections.filter((s) => !SIDEBAR_TYPES.has(s.type));

  return (
    <div className="mx-auto flex max-w-[210mm] overflow-hidden bg-white shadow-lg" style={{ fontFamily: 'Inter, sans-serif', minHeight: '297mm' }}>
      {/* Sidebar */}
      <div className="w-[35%] shrink-0 p-6 text-white" style={{ backgroundColor: SIDEBAR_BG }}>
        {/* Avatar & Name */}
        <div className="mb-6 text-center">
          {pi.avatar && (
            <AvatarImage
              src={pi.avatar}
              size={80}
              avatarStyle={resume.themeConfig?.avatarStyle}
              wrapperClassName="mx-auto mb-3 w-fit overflow-hidden"
            />
          )}
          <h1 className="text-xl font-bold tracking-tight text-white">{pi.fullName || 'Your Name'}</h1>
          {pi.jobTitle && <p className="mt-1 text-sm font-light text-blue-200">{pi.jobTitle}</p>}
        </div>

        {/* Contact Info */}
        <div className="mb-6 space-y-1.5 text-xs">
          {pi.age && (
            <div className="flex items-start gap-2 text-blue-100">
              <span className="shrink-0 text-blue-300">Age:</span>
              <span>{pi.age}</span>
            </div>
          )}
          {pi.politicalStatus && (
            <div className="flex items-start gap-2 text-blue-100">
              <span className="shrink-0 text-blue-300">Political:</span>
              <span>{pi.politicalStatus}</span>
            </div>
          )}
          {pi.gender && (
            <div className="flex items-start gap-2 text-blue-100">
              <span className="shrink-0 text-blue-300">Gender:</span>
              <span>{pi.gender}</span>
            </div>
          )}
          {pi.ethnicity && (
            <div className="flex items-start gap-2 text-blue-100">
              <span className="shrink-0 text-blue-300">Ethnicity:</span>
              <span>{pi.ethnicity}</span>
            </div>
          )}
          {pi.hometown && (
            <div className="flex items-start gap-2 text-blue-100">
              <span className="shrink-0 text-blue-300">Hometown:</span>
              <span>{pi.hometown}</span>
            </div>
          )}
          {pi.maritalStatus && (
            <div className="flex items-start gap-2 text-blue-100">
              <span className="shrink-0 text-blue-300">Marital:</span>
              <span>{pi.maritalStatus}</span>
            </div>
          )}
          {pi.yearsOfExperience && (
            <div className="flex items-start gap-2 text-blue-100">
              <span className="shrink-0 text-blue-300">Experience:</span>
              <span>{pi.yearsOfExperience}</span>
            </div>
          )}
          {pi.educationLevel && (
            <div className="flex items-start gap-2 text-blue-100">
              <span className="shrink-0 text-blue-300">Education:</span>
              <span>{pi.educationLevel}</span>
            </div>
          )}
          {pi.email && (
            <div className="flex items-start gap-2 text-blue-100">
              <span className="shrink-0 text-blue-300">Email:</span>
              <span className="break-all">{pi.email}</span>
            </div>
          )}
          {pi.phone && (
            <div className="flex items-start gap-2 text-blue-100">
              <span className="shrink-0 text-blue-300">Phone:</span>
              <span>{pi.phone}</span>
            </div>
          )}
          {pi.wechat && (
            <div className="flex items-start gap-2 text-blue-100">
              <span className="shrink-0 text-blue-300">WeChat:</span>
              <span>{pi.wechat}</span>
            </div>
          )}
          {pi.location && (
            <div className="flex items-start gap-2 text-blue-100">
              <span className="shrink-0 text-blue-300">Location:</span>
              <span>{pi.location}</span>
            </div>
          )}
          {pi.website && (
            <div className="flex items-start gap-2 text-blue-100">
              <span className="shrink-0 text-blue-300">Web:</span>
              <span className="break-all">{pi.website}</span>
            </div>
          )}
          {pi.linkedin && (
            <div className="flex items-start gap-2 text-blue-100">
              <span className="shrink-0 text-blue-300">LinkedIn:</span>
              <span className="break-all">{pi.linkedin}</span>
            </div>
          )}
          {pi.github && (
            <div className="flex items-start gap-2 text-blue-100">
              <span className="shrink-0 text-blue-300">GitHub:</span>
              <span className="break-all">{pi.github}</span>
            </div>
          )}
        </div>

        {/* Sidebar Sections */}
        {sidebarSections.map((section) => (
          <div key={section.id} className="mb-5" data-section>
            <h2 className="mb-2 border-b border-white/20 pb-1 text-xs font-bold uppercase tracking-wider text-white">
              {section.title}
            </h2>
            <SidebarSectionContent section={section} />
          </div>
        ))}
      </div>

      {/* Main Content */}
      <div className="flex-1 p-6">
        {mainSections.map((section) => (
          <div key={section.id} className="mb-5" data-section>
            <h2 className="mb-2 border-b-2 pb-1 text-sm font-bold uppercase tracking-wider" style={{ color: SIDEBAR_BG, borderColor: ACCENT }}>
              {section.title}
            </h2>
            <MainSectionContent section={section} resume={resume} />
          </div>
        ))}
      </div>
    </div>
  );
}

function SidebarSectionContent({ section }: { section: any }) {
  const content = section.content;
  if (!content) return null;

  if (section.type === 'skills') {
    const categories = (content as SkillsContent).categories || [];
    return (
      <div className="space-y-2">
        {categories.map((cat: any) => (
          <div key={cat.id}>
            <p className="text-xs font-semibold text-blue-100">{cat.name}</p>
            <div className="mt-1 flex flex-wrap gap-1">
              {(cat.skills || []).map((skill: string, i: number) => (
                <span key={i} className="rounded-sm px-1.5 py-0.5 text-[10px] text-blue-100" style={{ backgroundColor: 'rgba(59,130,246,0.3)' }}>
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
      <div className="space-y-1.5">
        {items.map((item: any) => (
          <div key={item.id} className="flex items-center justify-between text-xs">
            <span className="text-blue-100">{item.language}</span>
            <span className="text-blue-300">{item.proficiency}</span>
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
            <p className="text-xs font-semibold text-blue-100">{item.name}</p>
            {(item.issuer || item.date) && <p className="text-[10px] text-blue-300">{item.issuer}{item.date ? ` (${item.date})` : ''}</p>}
          </div>
        ))}
      </div>
    );
  }

  if (section.type === 'custom') {
    const items = (content as CustomContent).items || [];
    return (
      <div className="space-y-1.5">
        {items.map((item: any) => (
          <div key={item.id}>
            <p className="text-xs font-semibold text-blue-100">{item.title}</p>
            {item.subtitle && <p className="text-[10px] text-blue-300">{item.subtitle}</p>}
            {item.description && <p className="text-[10px] text-blue-300" dangerouslySetInnerHTML={{ __html: md(item.description) }} />}
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
      <div className="space-y-1.5">
        {content.items.map((item: any) => (
          <div key={item.id}>
            <span className="text-xs font-medium text-blue-100">{item.name || item.title || item.language}</span>
            {item.description && <p className="text-[10px] text-blue-300" dangerouslySetInnerHTML={{ __html: md(item.description) }} />}
          </div>
        ))}
      </div>
    );
  }

  return null;
}

function MainSectionContent({ section, resume }: { section: any; resume: Resume }) {
  const content = section.content;
  if (!content) return null;

  if (section.type === 'summary') {
    return <p className="text-sm leading-relaxed text-zinc-600" dangerouslySetInnerHTML={{ __html: md((content as SummaryContent).text) }} />;
  }

  if (section.type === 'work_experience') {
    const items = (content as WorkExperienceContent).items || [];
    return (
      <div className="space-y-3">
        {items.map((item: any) => (
          <div key={item.id}>
            <div className="flex items-baseline justify-between">
              <div>
                <span className="text-sm font-semibold text-zinc-800">{item.position}</span>
                {item.company && <span className="text-sm" style={{ color: ACCENT }}> | {item.company}</span>}
              </div>
              <span className="shrink-0 text-xs text-zinc-400">{item.startDate} – {item.endDate || (item.current ? (resume.language === 'zh' ? '至今' : 'Present') : '')}</span>
            </div>
            {item.description && <p className="mt-1 text-sm text-zinc-600" dangerouslySetInnerHTML={{ __html: md(item.description) }} />}
            {item.technologies?.length > 0 && (
              <div className="mt-1 flex flex-wrap gap-1">
                {item.technologies.map((t: string, i: number) => (
                  <span key={i} className="rounded-sm px-1.5 py-0.5 text-[10px] text-white" style={{ backgroundColor: ACCENT }}>
                    {t}
                  </span>
                ))}
              </div>
            )}
            {item.highlights?.length > 0 && (
              <ul className="mt-1 list-disc pl-4">
                {item.highlights.map((h: string, i: number) => (
                  <li key={i} className="text-sm text-zinc-600" dangerouslySetInnerHTML={{ __html: md(h) }} />
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
              <span className="text-sm font-semibold text-zinc-800">{item.institution}</span>
              <span className="shrink-0 text-xs text-zinc-400">{item.startDate} – {item.endDate || (resume.language === 'zh' ? '至今' : 'Present')}</span>
            </div>
            <p className="text-sm text-zinc-600">{degreeField(item.degree, item.field)}</p>
            {item.gpa && <p className="text-xs text-zinc-500">GPA: {item.gpa}</p>}
            {item.highlights?.length > 0 && (
              <ul className="mt-1 list-disc pl-4">
                {item.highlights.map((h: string, i: number) => (
                  <li key={i} className="text-sm text-zinc-600" dangerouslySetInnerHTML={{ __html: md(h) }} />
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
              <span className="text-sm font-semibold text-zinc-800">{item.name}</span>
              {item.startDate && (
                <span className="shrink-0 text-xs text-zinc-400">
                  {item.startDate} – {item.endDate || (resume.language === 'zh' ? '至今' : 'Present')}
                </span>
              )}
            </div>
            {item.description && <p className="mt-1 text-sm text-zinc-600" dangerouslySetInnerHTML={{ __html: md(item.description) }} />}
            {item.technologies?.length > 0 && (
              <div className="mt-1 flex flex-wrap gap-1">
                {item.technologies.map((t: string, i: number) => (
                  <span key={i} className="rounded-sm px-1.5 py-0.5 text-[10px] text-white" style={{ backgroundColor: ACCENT }}>
                    {t}
                  </span>
                ))}
              </div>
            )}
            {item.highlights?.length > 0 && (
              <ul className="mt-1 list-disc pl-4">
                {item.highlights.map((h: string, i: number) => (
                  <li key={i} className="text-sm text-zinc-600" dangerouslySetInnerHTML={{ __html: md(h) }} />
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
    );
  }

  // Fallback for section types that end up in main area
  if (section.type === 'skills') {
    const categories = (content as SkillsContent).categories || [];
    return (
      <div className="space-y-1">
        {categories.map((cat: any) => (
          <div key={cat.id} className="flex text-sm">
            <span className="w-28 shrink-0 font-medium text-zinc-700">{cat.name}:</span>
            {cat.skills?.length > 0 && (
              <ul className="mt-0.5 list-disc pl-4">
                {cat.skills.map((skill: string, i: number) => (
                  <li key={i} className="text-sm zinc-600">{skill}</li>
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
          <div key={item.id} className="flex items-baseline justify-between text-sm">
            <div>
              <span className="font-semibold text-zinc-800">{item.name}</span>
              {item.issuer && <span className="text-zinc-600"> — {item.issuer}</span>}
            </div>
            {item.date && <span className="text-xs text-zinc-400">{item.date}</span>}
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
            <span className="font-medium text-zinc-800">{item.language}</span>
            <span className="text-zinc-500"> — {item.proficiency}</span>
          </span>
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
              <span className="text-sm font-semibold text-zinc-800">{item.name}</span>
              <span className="text-xs text-zinc-400">&#11088; {item.stars?.toLocaleString()}</span>
            </div>
            {item.language && <span className="text-xs" style={{ color: ACCENT }}>{item.language}</span>}
            {item.description && <p className="mt-1 text-sm text-zinc-600" dangerouslySetInnerHTML={{ __html: md(item.description) }} />}
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
              <span className="text-sm font-semibold text-zinc-800">{item.title}</span>
              {item.date && <span className="text-xs text-zinc-400">{item.date}</span>}
            </div>
            {item.subtitle && <p className="text-sm text-zinc-500">{item.subtitle}</p>}
            {item.description && <p className="text-sm text-zinc-600" dangerouslySetInnerHTML={{ __html: md(item.description) }} />}
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
            <span className="text-sm font-medium text-zinc-700">{item.name || item.title || item.language}</span>
            {item.description && <p className="text-sm text-zinc-600" dangerouslySetInnerHTML={{ __html: md(item.description) }} />}
          </div>
        ))}
      </div>
    );
  }

  return null;
}
