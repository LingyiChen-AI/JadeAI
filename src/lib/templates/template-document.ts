import { SECTION_TYPES } from '@/lib/constants';
import { renderRichTextInlineHtml } from '@/lib/resume/rich-text';
import type { DeclarativeTemplateManifest, TemplateManifestV1, TemplateManifestV2 } from '@/types/template';
import type { ResumeFieldSource } from '@/types/editable-resume';
import { resolveEffectiveTemplateStyle } from './effective-template-style';
import type { EffectiveTemplateStyle } from './effective-template-style';

const MAX_VIEW_NODES = 4_000;
const MAX_VIEW_DEPTH = 8;
const MAX_TEXT_LENGTH = 20_000;
const INTERNAL_KEYS = new Set(['resumeId', 'userId', 'revision', 'createdAt', 'updatedAt', 'sharePassword', 'shareToken']);
const NON_RENDERED_KEYS = new Set([...INTERNAL_KEYS, 'id']);
const LINK_KEYS = new Set(['url', 'website', 'linkedin', 'github', 'repoUrl']);
const SECTION_CONTENT_KEYS: Record<string, readonly string[]> = {
  personal_info: ['fullName', 'jobTitle', 'age', 'gender', 'politicalStatus', 'ethnicity', 'hometown', 'maritalStatus', 'yearsOfExperience', 'educationLevel', 'email', 'phone', 'wechat', 'location', 'website', 'linkedin', 'github', 'customLinks', 'avatar'],
  summary: ['text'],
  work_experience: ['items'],
  education: ['items'],
  skills: ['categories'],
  projects: ['items'],
  certifications: ['items'],
  languages: ['items'],
  custom: ['items'],
  github: ['items'],
  qr_codes: ['items'],
};
const SECTION_ITEM_KEYS: Record<string, readonly string[]> = {
  personal_info: ['label', 'url'],
  summary: [],
  work_experience: ['company', 'position', 'location', 'startDate', 'endDate', 'current', 'description', 'technologies', 'highlights'],
  education: ['institution', 'degree', 'field', 'location', 'startDate', 'endDate', 'gpa', 'highlights'],
  skills: ['name', 'skills'],
  projects: ['name', 'url', 'startDate', 'endDate', 'description', 'technologies', 'highlights'],
  certifications: ['name', 'issuer', 'date', 'url'],
  languages: ['language', 'proficiency', 'description'],
  custom: ['title', 'subtitle', 'date', 'description'],
  github: ['repoUrl', 'name', 'stars', 'language', 'description'],
  qr_codes: ['label', 'url'],
};

export type TemplateViewSection = {
  id: string;
  type: string;
  title: string;
  sortOrder: number;
  content: unknown;
};

export type TemplateResumeViewModel = {
  title: string;
  language: string;
  sections: TemplateViewSection[];
};

type TemplateResumeSource = {
  title: string;
  language: string;
  sections: readonly {
    id?: string;
    type: string;
    title: string;
    sortOrder: number;
    visible: boolean;
    content: unknown;
  }[];
};

export type TemplateDocumentTextRun = {
  text: string;
  html?: string;
  tone: 'default' | 'muted' | 'accent';
  placeholder?: boolean;
  source?: ResumeFieldSource;
};

export type TemplateDocumentLink = {
  label: string;
  href: string;
  placeholder?: boolean;
  source?: ResumeFieldSource;
};

export type TemplateDocumentImage = {
  src: string;
  alt: string;
  role: 'avatar' | 'qr';
};

export type TemplateDocumentBlock = {
  kind: 'heading' | 'paragraph' | 'list' | 'contact' | 'qr';
  textRuns: TemplateDocumentTextRun[];
  links: TemplateDocumentLink[];
  images: TemplateDocumentImage[];
};

export type TemplateDocumentBuildOptions = {
  qrImagesByUrl?: Readonly<Record<string, string>>;
  themeConfig?: Record<string, unknown> | null;
  placeholderPaths?: ReadonlySet<string>;
  includeEmptyEditableFields?: boolean;
};

export type TemplateDocumentSection = {
  type: string;
  title: string;
  titleSource?: ResumeFieldSource;
  placement: 'header' | 'main' | 'sidebar' | 'footer';
  order: number;
  headingVariant: 'default' | 'compact' | 'accent' | 'muted' | 'bordered';
  styleVariants: Partial<Record<TemplateManifestV1['sectionStyles'][number]['element'], TemplateManifestV1['sectionStyles'][number]['variant']>>;
  blocks: TemplateDocumentBlock[];
};

export type TemplateDocument = {
  kind: 'template-document-v1' | 'template-document-v2';
  title: string;
  language: string;
  page: { sizes: Array<'a4' | 'letter'>; marginMm: EffectiveTemplateStyle['pageMarginMm']; maxPages: number; showPageNumbers: boolean };
  headingColor: string;
  fontFamily: EffectiveTemplateStyle['fontFamily'];
  avatarStyle: EffectiveTemplateStyle['avatarStyle'];
  layout: TemplateManifestV1['layout'];
  typography: TemplateManifestV1['typography'];
  colors: TemplateManifestV1['colors'];
  spacing: TemplateManifestV1['spacing'];
  presentation?: {
    header: TemplateManifestV2['header'];
    entry: TemplateManifestV2['entry'];
    section: TemplateManifestV2['section'];
    skills: TemplateManifestV2['skills'];
    decoration: TemplateManifestV2['decoration'];
    density: TemplateManifestV2['density'];
    palette: TemplateManifestV2['palette'];
    border: TemplateManifestV2['border'];
  };
  sections: TemplateDocumentSection[];
};

function boundedClone(
  value: unknown,
  state: { nodes: number },
  depth: number,
  allowedKeys: ReadonlySet<string> | null,
  nestedAllowedKeys: ReadonlySet<string> | null,
): unknown {
  state.nodes += 1;
  if (state.nodes > MAX_VIEW_NODES || depth > MAX_VIEW_DEPTH) return null;
  if (typeof value === 'string') return value.slice(0, MAX_TEXT_LENGTH);
  if (typeof value === 'number' || typeof value === 'boolean' || value === null) return value;
  if (Array.isArray(value)) {
    return value.slice(0, 500).map((item) => boundedClone(item, state, depth + 1, allowedKeys, nestedAllowedKeys));
  }
  if (typeof value !== 'object') return null;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => (key === 'id' || allowedKeys === null || allowedKeys.has(key)) && !INTERNAL_KEYS.has(key) && !key.startsWith('_'))
      .slice(0, 100)
      .map(([key, item]) => [key, boundedClone(item, state, depth + 1, nestedAllowedKeys, nestedAllowedKeys)]),
  );
}

export function normalizeResumeForTemplate(
  resume: TemplateResumeSource,
): TemplateResumeViewModel {
  const state = { nodes: 0 };
  return {
    title: String(resume.title ?? '').slice(0, 500),
    language: resume.language === 'zh' ? 'zh' : 'en',
    sections: [...(resume.sections ?? [])]
      .filter((section) => section.visible)
      .sort((left, right) => left.sortOrder - right.sortOrder)
      .slice(0, 256)
      .map((section) => {
        const known = (SECTION_TYPES as readonly string[]).includes(section.type);
        const contentKeys = known ? new Set(SECTION_CONTENT_KEYS[section.type] ?? []) : null;
        const itemKeys = known ? new Set(SECTION_ITEM_KEYS[section.type] ?? []) : null;
        return {
          id: String(section.id ?? ''),
          type: section.type,
          title: String(section.title ?? '').slice(0, 500),
          sortOrder: section.sortOrder,
          content: boundedClone(section.content, state, 0, contentKeys, itemKeys),
        };
      }),
  };
}

function safeLink(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 2_048) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

function safeAvatar(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 5 * 1024 * 1024) return null;
  return /^data:image\/(?:png|jpeg|webp);base64,[a-z0-9+/=]+$/i.test(value) ? value : null;
}

function pathIsPlaceholder(path: string, placeholderPaths?: ReadonlySet<string>): boolean {
  if (!placeholderPaths) return false;
  for (const placeholderPath of placeholderPaths) {
    if (path === placeholderPath || path.startsWith(`${placeholderPath}.`)) return true;
  }
  return false;
}

function run(
  text: unknown,
  tone: TemplateDocumentTextRun['tone'] = 'default',
  placeholder = false,
  source?: ResumeFieldSource,
  allowEmpty = false,
): TemplateDocumentTextRun | null {
  if (typeof text !== 'string' && typeof text !== 'number') return null;
  const normalized = String(text).trim();
  return normalized || (allowEmpty && source) ? {
    text: normalized,
    html: renderRichTextInlineHtml(normalized),
    tone,
    ...(placeholder ? { placeholder: true } : {}),
    ...(source ? { source } : {}),
  } : null;
}

type SourceContext = {
  sectionId: string;
  itemId?: string;
  fieldPath: readonly (string | number)[];
  placeholderPath: string;
};

function fieldKind(key: string, listValue = false): ResumeFieldSource['kind'] {
  if (listValue) return 'list-value';
  if (/description|text|highlight/i.test(key)) return 'rich-text';
  if (/date/i.test(key)) return 'date';
  if (LINK_KEYS.has(key)) return 'url';
  return 'text';
}

function sourceFor(
  context: SourceContext,
  fieldPath: readonly (string | number)[],
  key: string,
  listValue = false,
): ResumeFieldSource {
  return {
    sectionId: context.sectionId,
    ...(context.itemId ? { itemId: context.itemId } : {}),
    fieldPath,
    kind: fieldKind(key, listValue),
    label: key,
  };
}

function collectRecordBlocks(
  value: unknown,
  blocks: TemplateDocumentBlock[],
  placeholderPaths: ReadonlySet<string> | undefined,
  context: SourceContext,
  depth = 0,
  skipAvatar = false,
  includeEmptyEditableFields = false,
): void {
  if (depth > MAX_VIEW_DEPTH || value === null || value === undefined) return;
  if (Array.isArray(value)) {
    const key = String(context.fieldPath.at(-1) ?? 'value');
    const textRuns = value.map((item, index) => run(
      item,
      'default',
      pathIsPlaceholder(`${context.placeholderPath}.${index}`, placeholderPaths),
      sourceFor(context, [...context.fieldPath, index], key, true),
      includeEmptyEditableFields,
    ))
      .filter((item): item is TemplateDocumentTextRun => item !== null);
    if (textRuns.length === value.length && textRuns.length > 0) {
      blocks.push({ kind: 'list', textRuns, links: [], images: [] });
      return;
    }
    value.forEach((item, index) => {
      const record = item && typeof item === 'object' ? item as Record<string, unknown> : null;
      const itemId = typeof record?.id === 'string' ? record.id : undefined;
      collectRecordBlocks(item, blocks, placeholderPaths, {
        sectionId: context.sectionId,
        itemId: itemId ?? context.itemId,
        fieldPath: itemId ? [] : [...context.fieldPath, index],
        placeholderPath: `${context.placeholderPath}.${index}`,
      }, depth + 1, skipAvatar, includeEmptyEditableFields);
    });
    return;
  }
  if (typeof value !== 'object') {
    const key = String(context.fieldPath.at(-1) ?? 'value');
    const text = run(
      value,
      'default',
      pathIsPlaceholder(context.placeholderPath, placeholderPaths),
      sourceFor(context, context.fieldPath, key),
      includeEmptyEditableFields,
    );
    if (text) blocks.push({ kind: 'paragraph', textRuns: [text], links: [], images: [] });
    return;
  }

  const textRuns: TemplateDocumentTextRun[] = [];
  const links: TemplateDocumentLink[] = [];
  const nested: Array<{ key: string; value: unknown; placeholderPath: string }> = [];
  for (const [key, item] of Object.entries(value)) {
    const itemPath = `${context.placeholderPath}.${key}`;
    if (NON_RENDERED_KEYS.has(key) || key.startsWith('_') || (skipAvatar && key === 'avatar')) continue;
    if (Array.isArray(item) || (item !== null && typeof item === 'object')) {
      nested.push({ key, value: item, placeholderPath: itemPath });
      continue;
    }
    if (LINK_KEYS.has(key)) {
      const href = safeLink(item);
      const source = sourceFor(context, [...context.fieldPath, key], key);
      if (href || (includeEmptyEditableFields && item === '')) links.push({
        label: typeof item === 'string' ? item : href ?? '',
        href: href ?? '',
        source,
        ...(pathIsPlaceholder(itemPath, placeholderPaths) ? { placeholder: true } : {}),
      });
      continue;
    }
    if (key === 'email' && typeof item === 'string' && item.includes('@')) {
      links.push({
        label: item,
        href: `mailto:${item}`,
        source: sourceFor(context, [...context.fieldPath, key], key),
        ...(pathIsPlaceholder(itemPath, placeholderPaths) ? { placeholder: true } : {}),
      });
      continue;
    }
    const fieldPath = [...context.fieldPath, key];
    const text = run(
      item,
      /date|location|technology|proficiency/i.test(key) ? 'muted' : 'default',
      pathIsPlaceholder(itemPath, placeholderPaths),
      sourceFor(context, fieldPath, key),
      includeEmptyEditableFields,
    );
    if (text) textRuns.push(text);
  }
  if (textRuns.length || links.length) blocks.push({ kind: links.length ? 'contact' : 'paragraph', textRuns, links, images: [] });
  for (const item of nested) {
    collectRecordBlocks(item.value, blocks, placeholderPaths, {
      ...context,
      fieldPath: [...context.fieldPath, item.key],
      placeholderPath: item.placeholderPath,
    }, depth + 1, skipAvatar, includeEmptyEditableFields);
  }
}

function qrLink(value: unknown): string | null {
  const direct = safeLink(value);
  if (direct || typeof value !== 'string') return direct;
  return safeLink(`https://${value.trim()}`);
}

function sectionBlocks(
  section: TemplateViewSection,
  showAvatar: boolean,
  options: TemplateDocumentBuildOptions,
): TemplateDocumentBlock[] {
  if (section.type === 'summary' && section.content && typeof section.content === 'object') {
    const text = run(
      (section.content as Record<string, unknown>).text,
      'default',
      pathIsPlaceholder(`${section.type}.text`, options.placeholderPaths),
      { sectionId: section.id, fieldPath: ['text'], kind: 'rich-text', label: 'text' },
      options.includeEmptyEditableFields,
    );
    return text ? [{ kind: 'paragraph', textRuns: [text], links: [], images: [] }] : [];
  }
  if (section.type === 'qr_codes' && section.content && typeof section.content === 'object') {
    const items = (section.content as Record<string, unknown>).items;
    if (!Array.isArray(items)) return [];
    return items.flatMap((item) => {
      if (!item || typeof item !== 'object') return [];
      const record = item as Record<string, unknown>;
      const href = qrLink(record.url);
      if (!href && !options.includeEmptyEditableFields) return [];
      const itemPath = `${section.type}.items.${items.indexOf(item)}`;
      const itemId = typeof record.id === 'string' ? record.id : undefined;
      const label = run(
        record.label,
        'default',
        pathIsPlaceholder(`${itemPath}.label`, options.placeholderPaths),
        { sectionId: section.id, ...(itemId ? { itemId } : {}), fieldPath: ['label'], kind: 'text', label: 'label' },
        options.includeEmptyEditableFields,
      );
      const resolvedHref = href ?? '';
      const image = href ? options.qrImagesByUrl?.[href] : undefined;
      return [{
        kind: 'qr' as const,
        textRuns: label ? [label] : [],
        links: [{
          label: label?.text ?? resolvedHref,
          href: resolvedHref,
          source: { sectionId: section.id, ...(itemId ? { itemId } : {}), fieldPath: ['url'], kind: 'url', label: 'url' },
          ...(pathIsPlaceholder(`${itemPath}.url`, options.placeholderPaths) ? { placeholder: true } : {}),
        }],
        images: image ? [{ src: image, alt: label?.text ?? '', role: 'qr' as const }] : [],
      }];
    });
  }
  const blocks: TemplateDocumentBlock[] = [];
  collectRecordBlocks(section.content, blocks, options.placeholderPaths, {
    sectionId: section.id,
    fieldPath: [],
    placeholderPath: section.type,
  }, 0, section.type === 'personal_info', options.includeEmptyEditableFields);
  if (showAvatar && section.type === 'personal_info' && section.content && typeof section.content === 'object') {
    const avatar = safeAvatar((section.content as Record<string, unknown>).avatar);
    if (avatar) {
      const target = blocks[0] ?? { kind: 'contact' as const, textRuns: [], links: [], images: [] };
      if (!blocks.length) blocks.push(target);
      target.images.push({ src: avatar, alt: '', role: 'avatar' });
    }
  }
  return blocks;
}

export function buildTemplateDocument(
  view: TemplateResumeViewModel,
  manifest: DeclarativeTemplateManifest,
  options: TemplateDocumentBuildOptions = {},
): TemplateDocument {
  const effectiveStyle = resolveEffectiveTemplateStyle(manifest, options.themeConfig);
  const slots = new Map<string, TemplateManifestV1['sectionSlots'][number]>(
    manifest.sectionSlots.map((slot) => [slot.sectionType, slot] as const),
  );
  const styles = new Map<string, TemplateDocumentSection['styleVariants']>();
  for (const style of manifest.sectionStyles) {
    styles.set(style.sectionType, { ...styles.get(style.sectionType), [style.element]: style.variant });
  }
  const visibleSections = manifest.features.showQrCodes
    ? view.sections
    : view.sections.filter((section) => section.type !== 'qr_codes');
  const configured = visibleSections.filter((section) => slots.has(section.type));
  const fallback = visibleSections.filter((section) => !slots.has(section.type));
  const ordered = [
    ...configured.sort((left, right) => slots.get(left.type)!.order - slots.get(right.type)!.order),
    ...fallback.sort((left, right) => left.sortOrder - right.sortOrder),
  ];

  return {
    kind: manifest.rendererKind === 'declarative-v2' ? 'template-document-v2' : 'template-document-v1',
    title: view.title,
    language: view.language,
    page: {
      sizes: ['a4', 'letter'],
      marginMm: effectiveStyle.pageMarginMm,
      maxPages: manifest.features.maxPages,
      showPageNumbers: manifest.features.showPageNumbers,
    },
    headingColor: effectiveStyle.headingColor,
    fontFamily: effectiveStyle.fontFamily,
    avatarStyle: effectiveStyle.avatarStyle,
    layout: manifest.layout,
    typography: effectiveStyle.typography,
    colors: effectiveStyle.colors,
    spacing: effectiveStyle.spacing,
    ...(effectiveStyle.presentation ? { presentation: effectiveStyle.presentation } : {}),
    sections: ordered.map((section, index) => ({
      type: section.type,
      title: section.title,
      titleSource: {
        sectionId: section.id,
        fieldPath: ['title'],
        kind: 'text',
        label: `${section.title} title`,
      },
      placement: slots.get(section.type)?.placement ?? 'main',
      order: slots.get(section.type)?.order ?? manifest.sectionSlots.length + index,
      headingVariant: styles.get(section.type)?.heading ?? 'default',
      styleVariants: styles.get(section.type) ?? {},
      blocks: sectionBlocks(section, manifest.features.showAvatar, options),
    })),
  };
}

export function collectTemplateDocumentText(document: TemplateDocument): string[] {
  return document.sections.flatMap((section) => [
    section.title,
    ...section.blocks.flatMap((block) => [
      ...block.textRuns.map((textRun) => textRun.text),
      ...block.links.map((link) => link.label),
    ]),
  ]);
}

export function collectTemplateDocumentLinks(document: TemplateDocument): string[] {
  return document.sections.flatMap((section) => section.blocks.flatMap((block) => block.links.map((link) => link.href)));
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]!);
}

function cssNumber(value: number): string {
  return String(Number(value.toFixed(3)));
}

export function serializeTemplateDocumentHtml(document: TemplateDocument): string {
  const presentation = document.presentation;
  const pageMargin = document.page.marginMm;
  const style = [
    `--template-text:${document.colors.text}`,
    `--template-heading:${document.headingColor}`,
    `--template-muted:${document.colors.muted}`,
    `--template-accent:${document.colors.accent}`,
    `--template-background:${document.colors.background}`,
    `--template-font-size:${cssNumber(document.typography.baseFontSizePt)}pt`,
    `--template-line-height:${document.typography.lineHeight}`,
    `--template-page-margin-top:${pageMargin.top}mm`,
    `--template-page-margin-right:${pageMargin.right}mm`,
    `--template-page-margin-bottom:${pageMargin.bottom}mm`,
    `--template-page-margin-left:${pageMargin.left}mm`,
    `--template-section-gap:${document.spacing.sectionGapMm}mm`,
    `--template-column-gap:${document.layout.columnGapMm}mm`,
    `--template-sidebar-width:${document.layout.sidebarWidthPercent}%`,
    ...(presentation ? [
      `--template-secondary:${presentation.palette.secondary}`,
      `--template-surface:${presentation.palette.surface}`,
      `--template-border:${presentation.palette.border}`,
      `--template-border-width:${presentation.border.widthPt}pt`,
      `--template-radius:${presentation.border.radiusMm}mm`,
    ] : []),
    'grid-auto-flow:row dense',
  ].join(';');
  const sections = document.sections.map((section) => {
    const blocks = section.blocks.map((block) => {
      const text = block.textRuns.map((textRun) => `<span data-tone="${textRun.tone}"${textRun.placeholder ? ' data-placeholder="true" style="opacity:0.58"' : ''}>${renderRichTextInlineHtml(textRun.text)}</span>`).join(' ');
      const links = block.links.map((link, linkIndex) => {
        const placeholder = link.placeholder || (block.kind === 'qr' && block.textRuns[linkIndex]?.placeholder);
        return `<a href="${escapeHtml(link.href)}" rel="noreferrer noopener"${placeholder ? ' data-placeholder="true" style="opacity:0.58"' : ''}>${escapeHtml(link.label)}</a>`;
      }).join(' ');
      const images = block.images.map((image) => `<img src="${escapeHtml(image.src)}" alt="${escapeHtml(image.alt)}" data-image-role="${image.role}">`).join('');
      if (block.kind === 'list') {
        const items = block.textRuns.map((textRun) => `<li data-tone="${textRun.tone}"${textRun.placeholder ? ' data-placeholder="true" style="opacity:0.58"' : ''}>${renderRichTextInlineHtml(textRun.text)}</li>`).join('');
        return `<ul data-block="list">${items}</ul>`;
      }
      if (block.kind === 'qr') {
        return `<div data-block="qr">${images}${links}</div>`;
      }
      return `<p data-block="${block.kind}">${images}${text}${text && links ? ' ' : ''}${links}</p>`;
    }).join('');
    const styleAttributes = Object.entries(section.styleVariants)
      .map(([element, variant]) => ` data-style-${element}="${variant}"`)
      .join('');
    return `<section data-section="${escapeHtml(section.type)}" data-placement="${section.placement}" data-heading-variant="${section.headingVariant}"${styleAttributes}><h2>${escapeHtml(section.title)}</h2>${blocks}</section>`;
  }).join('');
  const pageNumber = document.page.showPageNumbers ? '<footer data-page-number="1">1</footer>' : '';
  const presentationAttributes = presentation
    ? ` data-renderer-kind="declarative-v2" data-header-variant="${presentation.header.variant}" data-contact-layout="${presentation.header.contactLayout}" data-entry-variant="${presentation.entry.variant}" data-section-heading="${presentation.section.headingVariant}" data-skills-variant="${presentation.skills.variant}" data-decoration="${presentation.decoration.variant}" data-density="${presentation.density}"`
    : '';
  return `<article class="declarative-resume"${presentationAttributes} data-layout="${document.layout.type}" data-avatar-style="${document.avatarStyle}" data-sidebar-position="${document.layout.sidebarPosition}" data-page-numbers="${document.page.showPageNumbers}" data-max-pages="${document.page.maxPages}" style="${style}">${sections}${pageNumber}</article>`;
}
