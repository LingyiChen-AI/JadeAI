'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';

import { DeclarativeTemplateDocument } from '@/components/preview/declarative-template-document';
import { buildTemplateDocument, normalizeResumeForTemplate } from '@/lib/templates/template-document';
import { TEMPLATE_FONT_FAMILIES, TemplateManifestV1Schema } from '@/lib/templates/schema';
import { cn } from '@/lib/utils';
import type { TemplateManifestV1 } from '@/types/template';

type LocalTemplateEditorProps = {
  value: TemplateManifestV1;
  onChange(value: TemplateManifestV1): void;
  disabled?: boolean;
};

const FIXED_PREVIEW_RESUME = {
  title: 'Jade Template',
  language: 'en',
  sections: [
    {
      type: 'personal_info', title: 'Jade Template', sortOrder: 0, visible: true,
      content: { fullName: 'Jade Template', jobTitle: 'Product Designer', email: 'template@example.com', location: 'Berlin' },
    },
    {
      type: 'summary', title: 'Profile', sortOrder: 1, visible: true,
      content: { text: 'A fixed preview fixture for local template design.' },
    },
    {
      type: 'qr_codes', title: 'Links', sortOrder: 2, visible: true,
      content: { items: [{ label: 'Portfolio', url: 'https://example.com' }] },
    },
  ],
};

const SECTION_STYLE_ELEMENTS = ['heading', 'body', 'date', 'divider', 'bullet', 'avatar', 'contact', 'qr'] as const;
const fieldClass = 'h-9 min-w-0 w-full rounded-md border border-zinc-200 bg-white px-2 text-sm dark:border-zinc-700 dark:bg-zinc-950';

export function LocalTemplateEditor({ value, onChange, disabled = false }: LocalTemplateEditorProps) {
  const t = useTranslations('templates.localEditor');
  const [paperSize, setPaperSize] = useState<'a4' | 'letter'>('a4');
  const [invalidField, setInvalidField] = useState<string | null>(null);
  const document = useMemo(
    () => buildTemplateDocument(normalizeResumeForTemplate(FIXED_PREVIEW_RESUME), value),
    [value],
  );

  const commit = (field: string, candidate: TemplateManifestV1) => {
    const parsed = TemplateManifestV1Schema.safeParse(candidate);
    if (!parsed.success) {
      setInvalidField(field);
      return;
    }
    setInvalidField(null);
    onChange(parsed.data);
  };

  const styleVariant = (
    sectionType: TemplateManifestV1['sectionSlots'][number]['sectionType'],
    element: TemplateManifestV1['sectionStyles'][number]['element'],
  ) => value.sectionStyles.find((style) => style.sectionType === sectionType && style.element === element)?.variant ?? 'default';

  const updateStyle = (
    sectionType: TemplateManifestV1['sectionSlots'][number]['sectionType'],
    element: TemplateManifestV1['sectionStyles'][number]['element'],
    variant: TemplateManifestV1['sectionStyles'][number]['variant'],
  ) => {
    const retained = value.sectionStyles.filter((style) => !(style.sectionType === sectionType && style.element === element));
    commit(`sections.${sectionType}.${element}`, {
      ...value,
      sectionStyles: [...retained, { sectionType, element, variant }],
    });
  };

  const numeric = (
    field: string,
    current: number,
    update: (next: number) => TemplateManifestV1,
    min: number,
    max: number,
    step: number,
  ) => (
    <input
      type="number"
      aria-label={field}
      aria-invalid={invalidField === field}
      disabled={disabled}
      min={min}
      max={max}
      step={step}
      value={current}
      className={fieldClass}
      onChange={(event) => commit(field, update(Number(event.target.value)))}
    />
  );

  return (
    <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(18rem,24rem)_minmax(0,1fr)]">
      <div className="min-w-0 space-y-5">
        <fieldset className="space-y-2" disabled={disabled}>
          <legend className="text-sm font-medium">{t('layout.title')}</legend>
          <div className="grid grid-cols-3 rounded-md bg-zinc-100 p-1 dark:bg-zinc-900">
            {(['single-column', 'two-column', 'sidebar'] as const).map((layout) => (
              <button
                key={layout}
                type="button"
                aria-label={t(`layout.${layout}`)}
                aria-pressed={value.layout.type === layout}
                className={cn('h-8 text-xs', value.layout.type === layout && 'rounded bg-white shadow-sm dark:bg-zinc-800')}
                onClick={() => commit('layout.type', { ...value, layout: { ...value.layout, type: layout } })}
              >
                {t(`layout.${layout}`)}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <select
              aria-label={t('layout.sidebarPosition')}
              value={value.layout.sidebarPosition}
              className={fieldClass}
              onChange={(event) => commit('layout.sidebarPosition', {
                ...value,
                layout: { ...value.layout, sidebarPosition: event.target.value as 'left' | 'right' },
              })}
            >
              <option value="left">{t('layout.left')}</option>
              <option value="right">{t('layout.right')}</option>
            </select>
            {numeric('layout.sidebarWidth', value.layout.sidebarWidthPercent, (next) => ({
              ...value, layout: { ...value.layout, sidebarWidthPercent: next },
            }), 20, 45, 1)}
            {numeric('layout.columnGap', value.layout.columnGapMm, (next) => ({
              ...value, layout: { ...value.layout, columnGapMm: next },
            }), 0, 20, 0.5)}
          </div>
        </fieldset>

        <fieldset className="space-y-2" disabled={disabled}>
          <legend className="text-sm font-medium">{t('typography.title')}</legend>
          <select
            aria-label={t('typography.fontFamily')}
            value={value.typography.fontFamily}
            className={fieldClass}
            onChange={(event) => commit('typography.fontFamily', {
              ...value,
              typography: { ...value.typography, fontFamily: event.target.value as TemplateManifestV1['typography']['fontFamily'] },
            })}
          >
            {TEMPLATE_FONT_FAMILIES.map((font) => <option key={font} value={font}>{font}</option>)}
          </select>
          <div className="grid grid-cols-3 gap-2">
            {numeric('typography.baseFontSize', value.typography.baseFontSizePt, (next) => ({
              ...value, typography: { ...value.typography, baseFontSizePt: next },
            }), 8, 18, 0.5)}
            {numeric('typography.lineHeight', value.typography.lineHeight, (next) => ({
              ...value, typography: { ...value.typography, lineHeight: next },
            }), 1, 2, 0.05)}
            {numeric('typography.headingScale', value.typography.headingScale, (next) => ({
              ...value, typography: { ...value.typography, headingScale: next },
            }), 1, 2, 0.05)}
          </div>
        </fieldset>

        <fieldset className="space-y-2" disabled={disabled}>
          <legend className="text-sm font-medium">{t('colors.title')}</legend>
          <div className="grid grid-cols-2 gap-2">
            {(['text', 'muted', 'accent', 'background'] as const).map((color) => (
              <label key={color} className="flex h-9 items-center gap-2 rounded-md border px-2 text-xs dark:border-zinc-700">
                <input
                  type="color"
                  aria-label={t(`colors.${color}`)}
                  value={value.colors[color]}
                  className="size-6 border-0 bg-transparent p-0"
                  onChange={(event) => commit(`colors.${color}`, {
                    ...value, colors: { ...value.colors, [color]: event.target.value },
                  })}
                />
                <span className="truncate">{t(`colors.${color}`)}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className="space-y-2" disabled={disabled}>
          <legend className="text-sm font-medium">{t('spacing.title')}</legend>
          <div className="grid grid-cols-2 gap-2">
            {numeric('spacing.pageMargin', value.spacing.pageMarginMm, (next) => ({
              ...value, spacing: { ...value.spacing, pageMarginMm: next },
            }), 5, 30, 0.5)}
            {numeric('spacing.sectionGap', value.spacing.sectionGapMm, (next) => ({
              ...value, spacing: { ...value.spacing, sectionGapMm: next },
            }), 0, 20, 0.5)}
          </div>
        </fieldset>

        <fieldset className="space-y-2" disabled={disabled}>
          <legend className="text-sm font-medium">{t('features.title')}</legend>
          {([
            ['avatar', 'showAvatar'],
            ['qr', 'showQrCodes'],
            ['pageNumbers', 'showPageNumbers'],
          ] as const).map(([label, property]) => (
            <label key={property} className="flex h-8 items-center gap-2 text-sm">
              <input
                type="checkbox"
                aria-label={t(`features.${label}`)}
                checked={value.features[property]}
                onChange={(event) => commit(`features.${label}`, {
                  ...value, features: { ...value.features, [property]: event.target.checked },
                })}
              />
              {t(`features.${label}`)}
            </label>
          ))}
          {numeric('features.maxPages', value.features.maxPages, (next) => ({
            ...value, features: { ...value.features, maxPages: next },
          }), 1, 12, 1)}
        </fieldset>

        <fieldset className="space-y-2" disabled={disabled}>
          <legend className="text-sm font-medium">{t('sections.title')}</legend>
          {value.sectionSlots.map((slot, index) => (
            <div key={`${slot.sectionType}-${index}`} className="min-w-0 space-y-2 border-b border-zinc-100 pb-3 text-xs dark:border-zinc-800">
              <div className="grid min-w-0 grid-cols-2 items-center gap-2 sm:grid-cols-[minmax(7rem,1fr)_7rem_4rem]">
                <span className="col-span-2 truncate sm:col-span-1">{slot.sectionType}</span>
                <select
                  aria-label={`${t('sections.placement')}:${slot.sectionType}`}
                  value={slot.placement}
                  className={fieldClass}
                  onChange={(event) => commit(`sections.${slot.sectionType}`, {
                    ...value,
                    sectionSlots: value.sectionSlots.map((candidate, candidateIndex) => candidateIndex === index
                      ? { ...candidate, placement: event.target.value as typeof candidate.placement }
                      : candidate),
                  })}
                >
                  {(['header', 'main', 'sidebar', 'footer'] as const).map((placement) => <option key={placement} value={placement}>{t(`sections.${placement}`)}</option>)}
                </select>
                <input
                  type="number"
                  min={0}
                  max={31}
                  value={slot.order}
                  aria-label={`${t('sections.order')}:${slot.sectionType}`}
                  className={fieldClass}
                  onChange={(event) => commit(`sections.${slot.sectionType}.order`, {
                    ...value,
                    sectionSlots: value.sectionSlots.map((candidate, candidateIndex) => candidateIndex === index
                      ? { ...candidate, order: Number(event.target.value) }
                      : candidate),
                  })}
                />
              </div>
              <div className="grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-4">
                {SECTION_STYLE_ELEMENTS.map((element) => (
                  <label key={element} className="min-w-0 space-y-1">
                    <span className="block truncate">{t(`sections.${element}`)}</span>
                    <select
                      aria-label={`${t(`sections.${element}`)}:${slot.sectionType}`}
                      value={styleVariant(slot.sectionType, element)}
                      className={fieldClass}
                      onChange={(event) => updateStyle(
                        slot.sectionType,
                        element,
                        event.target.value as TemplateManifestV1['sectionStyles'][number]['variant'],
                      )}
                    >
                      {(['default', 'compact', 'accent', 'muted', 'bordered'] as const).map((variant) => <option key={variant} value={variant}>{t(`variants.${variant}`)}</option>)}
                    </select>
                  </label>
                ))}
              </div>
            </div>
          ))}
        </fieldset>
      </div>

      <div className="min-w-0 space-y-3">
        <div className="grid w-full grid-cols-2 rounded-md bg-zinc-100 p-1 dark:bg-zinc-900">
          {(['a4', 'letter'] as const).map((paper) => (
            <button
              key={paper}
              type="button"
              aria-label={t(`paper.${paper}`)}
              aria-pressed={paperSize === paper}
              className={cn('h-8 text-xs', paperSize === paper && 'rounded bg-white shadow-sm dark:bg-zinc-800')}
              onClick={() => setPaperSize(paper)}
            >
              {t(`paper.${paper}`)}
            </button>
          ))}
        </div>
        <div
          data-testid="local-template-preview"
          data-paper-size={paperSize}
          className={cn(
            'mx-auto min-w-0 overflow-hidden bg-white text-zinc-950 shadow-sm',
            paperSize === 'a4' ? 'aspect-[210/297] w-full max-w-[46rem]' : 'aspect-[8.5/11] w-full max-w-[46rem]',
          )}
        >
          <DeclarativeTemplateDocument document={document} />
        </div>
      </div>
    </div>
  );
}
