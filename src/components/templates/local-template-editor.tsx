'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Redo2, RotateCcw, Undo2 } from 'lucide-react';

import { DeclarativeTemplateDocument } from '@/components/preview/declarative-template-document';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { TemplateSectionSorter } from '@/components/templates/template-section-sorter';
import { useTemplatePreviewResume } from '@/hooks/use-template-preview-resume';
import { buildTemplateDocument, normalizeResumeForTemplate } from '@/lib/templates/template-document';
import { DeclarativeTemplateManifestSchema, TEMPLATE_FONT_FAMILIES } from '@/lib/templates/schema';
import { createLocalTemplatePreset, LOCAL_TEMPLATE_PRESETS } from '@/lib/templates/local-template-presets';
import { createTemplateEditHistory, templateEditHistoryReducer } from '@/lib/templates/template-edit-history';
import { SECTION_TYPES, type SectionType } from '@/lib/constants';
import { cn } from '@/lib/utils';
import type { DeclarativeTemplateManifest, TemplateManifestV1 } from '@/types/template';

type LocalTemplateEditorProps = {
  value: DeclarativeTemplateManifest;
  onChange(value: DeclarativeTemplateManifest): void;
  draftKey: string;
  onDirtyChange?(dirty: boolean): void;
  saveVersion?: number | string;
  disabled?: boolean;
};

const SECTION_STYLE_ELEMENTS = ['heading', 'body', 'date', 'divider', 'bullet', 'avatar', 'contact', 'qr'] as const;
type NumericField = 'layout.sidebarWidth' | 'layout.columnGap' | 'typography.baseFontSize' | 'typography.lineHeight' | 'typography.headingScale' | 'spacing.pageMargin' | 'spacing.sectionGap' | 'features.maxPages';
const NUMERIC_FIELD_LABELS: Record<NumericField, NumericField> = {
  'layout.sidebarWidth': 'layout.sidebarWidth',
  'layout.columnGap': 'layout.columnGap',
  'typography.baseFontSize': 'typography.baseFontSize',
  'typography.lineHeight': 'typography.lineHeight',
  'typography.headingScale': 'typography.headingScale',
  'spacing.pageMargin': 'spacing.pageMargin',
  'spacing.sectionGap': 'spacing.sectionGap',
  'features.maxPages': 'features.maxPages',
};
const SECTION_TRANSLATION_KEYS: Record<SectionType, string> = {
  personal_info: 'personalInfo', summary: 'summary', work_experience: 'workExperience', education: 'education',
  skills: 'skills', projects: 'projects', certifications: 'certifications', languages: 'languages', github: 'github',
  qr_codes: 'qrCodes', custom: 'custom',
};
const fieldClass = 'h-9 min-w-0 w-full rounded-md border border-zinc-200 bg-white px-2 text-sm dark:border-zinc-700 dark:bg-zinc-950';

export function LocalTemplateEditor({
  value,
  onChange,
  draftKey,
  onDirtyChange,
  saveVersion,
  disabled = false,
}: LocalTemplateEditorProps) {
  const t = useTranslations('templates.localEditor');
  const sectionT = useTranslations('editor.sections');
  const preview = useTemplatePreviewResume();
  const [history, setHistory] = useState(() => createTemplateEditHistory(value));
  const historyRef = useRef(history);
  const draftKeyRef = useRef(draftKey);
  const saveVersionRef = useRef(saveVersion);
  const [paperSize, setPaperSize] = useState<'a4' | 'letter'>('a4');
  const [mobileTab, setMobileTab] = useState<'settings' | 'preview'>('settings');
  const [invalidState, setInvalidState] = useState<{ draftKey: string; field: string | null }>({
    draftKey,
    field: null,
  });
  const invalidField = invalidState.draftKey === draftKey ? invalidState.field : null;

  const apply = useCallback((action: Parameters<typeof templateEditHistoryReducer>[1], persist: boolean) => {
    const current = historyRef.current;
    const next = templateEditHistoryReducer(current, action);
    if (next === current) return;
    historyRef.current = next;
    setHistory(next);
    if (persist) onChange(next.present);
  }, [onChange]);

  useEffect(() => {
    if (draftKeyRef.current === draftKey) return;
    draftKeyRef.current = draftKey;
    apply({ type: 'replace', baseline: value }, false);
  }, [apply, draftKey, value]);

  useEffect(() => {
    if (saveVersionRef.current === saveVersion) return;
    saveVersionRef.current = saveVersion;
    apply({ type: 'saved' }, false);
  }, [apply, saveVersion]);

  useEffect(() => onDirtyChange?.(history.dirty), [history.dirty, onDirtyChange]);

  const commit = useCallback((field: string, candidate: unknown) => {
    const parsed = DeclarativeTemplateManifestSchema.safeParse(candidate);
    if (!parsed.success) {
      setInvalidState({ draftKey, field });
      return;
    }
    setInvalidState({ draftKey, field: null });
    apply({ type: 'commit', candidate: parsed.data }, true);
  }, [apply, draftKey]);

  const styleVariant = (
    sectionType: TemplateManifestV1['sectionSlots'][number]['sectionType'],
    element: TemplateManifestV1['sectionStyles'][number]['element'],
  ) => history.present.sectionStyles.find((style) => style.sectionType === sectionType && style.element === element)?.variant ?? 'default';

  const updateStyle = (
    sectionType: TemplateManifestV1['sectionSlots'][number]['sectionType'],
    element: TemplateManifestV1['sectionStyles'][number]['element'],
    variant: TemplateManifestV1['sectionStyles'][number]['variant'],
  ) => {
    const retained = history.present.sectionStyles.filter((style) => !(style.sectionType === sectionType && style.element === element));
    commit(`sections.${sectionType}.${element}`, { ...history.present, sectionStyles: [...retained, { sectionType, element, variant }] });
  };

  const numeric = (
    field: NumericField,
    current: number,
    update: (next: number) => DeclarativeTemplateManifest,
    min: number,
    max: number,
    step: number,
  ) => {
    const label = t(NUMERIC_FIELD_LABELS[field]);
    const sliderLabel = t('controls.slider', { label });
    return (
    <div className="grid min-w-0 gap-1">
      <Slider
        aria-label={sliderLabel}
        ref={(node) => node?.querySelector('[role="slider"]')?.setAttribute('aria-label', sliderLabel)}
        value={[current]}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        onValueChange={(values) => { const next = values[0]; if (typeof next === 'number') commit(field, update(next)); }}
      />
      <input
        type="number"
        aria-label={label}
        aria-invalid={invalidField === field}
        disabled={disabled}
        min={min}
        max={max}
        step={step}
        value={current}
        className={fieldClass}
        onChange={(event) => commit(field, update(Number(event.target.value)))}
      />
    </div>
    );
  };

  const sectionLabels = Object.fromEntries(SECTION_TYPES.map((type) => [type, sectionT(SECTION_TRANSLATION_KEYS[type])]));
  const sorterLabels = {
    dragHandle: (section: string) => t('movement.dragHandle', { section }),
    moveUp: (section: string) => t('movement.moveUp', { section }),
    moveDown: (section: string) => t('movement.moveDown', { section }),
    placement: (section: string) => t('movement.placement', { section }),
    advanced: t('movement.advanced'),
    placements: { header: t('sections.header'), main: t('sections.main'), sidebar: t('sections.sidebar'), footer: t('sections.footer') },
    dragStart: (section: string) => t('movement.dragStart', { section }),
    dragOver: (section: string, over: string) => t('movement.dragOver', { section, over }),
    dragEnd: (section: string, over: string) => t('movement.dragEnd', { section, over }),
    dragCancel: (section: string) => t('movement.dragCancel', { section }),
  };
  const updateSlots = (sectionSlots: DeclarativeTemplateManifest['sectionSlots']) => commit('sections.order', { ...history.present, sectionSlots });
  const previewOptions = preview.options.length > 0 ? preview.options : [{ id: 'fixture', title: 'Jade Template' }];
  const document = useMemo(
    () => buildTemplateDocument(normalizeResumeForTemplate(preview.resume), history.present),
    [history.present, preview.resume],
  );

  const settings = (
    <div className="min-w-0 space-y-5">
      <fieldset className="space-y-2" disabled={disabled}>
        <legend className="text-sm font-medium">{t('presets.title')}</legend>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {LOCAL_TEMPLATE_PRESETS.map((preset) => {
            const candidate = createLocalTemplatePreset(preset.id);
            return (
              <Button key={preset.id} type="button" variant="outline" size="sm" className="min-w-0 flex-wrap whitespace-normal" aria-label={t(`presets.${preset.id === 'ats-clean' ? 'atsClean' : preset.id === 'modern-two-column' ? 'modernTwoColumn' : 'compactProfessional'}`)} onClick={() => commit(`preset.${preset.id}`, candidate)}>
                <span className="size-3 rounded-sm border" style={{ backgroundColor: candidate.colors.accent }} />
                {t(`presets.${preset.id === 'ats-clean' ? 'atsClean' : preset.id === 'modern-two-column' ? 'modernTwoColumn' : 'compactProfessional'}`)}
              </Button>
            );
          })}
        </div>
      </fieldset>

      <div className="flex items-center gap-1">
        <TooltipProvider>
          <Tooltip><TooltipTrigger asChild><Button type="button" size="icon" variant="ghost" aria-label={t('history.undo')} disabled={!history.canUndo || disabled} onClick={() => apply({ type: 'undo' }, true)}><Undo2 /></Button></TooltipTrigger><TooltipContent>{t('history.undo')}</TooltipContent></Tooltip>
          <Tooltip><TooltipTrigger asChild><Button type="button" size="icon" variant="ghost" aria-label={t('history.redo')} disabled={!history.canRedo || disabled} onClick={() => apply({ type: 'redo' }, true)}><Redo2 /></Button></TooltipTrigger><TooltipContent>{t('history.redo')}</TooltipContent></Tooltip>
          <Tooltip><TooltipTrigger asChild><Button type="button" size="icon" variant="ghost" aria-label={t('history.reset')} disabled={!history.dirty || disabled} onClick={() => apply({ type: 'restore' }, true)}><RotateCcw /></Button></TooltipTrigger><TooltipContent>{t('history.reset')}</TooltipContent></Tooltip>
        </TooltipProvider>
      </div>

      <fieldset className="space-y-2" disabled={disabled}>
        <legend className="text-sm font-medium">{t('layout.title')}</legend>
        <div className="grid grid-cols-3 rounded-md bg-zinc-100 p-1 dark:bg-zinc-900">
          {(['single-column', 'two-column', 'sidebar'] as const).map((layout) => <button key={layout} type="button" aria-label={t(`layout.${layout}`)} aria-pressed={history.present.layout.type === layout} className={cn('h-8 text-xs', history.present.layout.type === layout && 'rounded bg-white shadow-sm dark:bg-zinc-800')} onClick={() => commit('layout.type', { ...history.present, layout: { ...history.present.layout, type: layout } })}>{t(`layout.${layout}`)}</button>)}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <select aria-label={t('layout.sidebarPosition')} value={history.present.layout.sidebarPosition} className={fieldClass} onChange={(event) => commit('layout.sidebarPosition', { ...history.present, layout: { ...history.present.layout, sidebarPosition: event.target.value as 'left' | 'right' } })}>{(['left', 'right'] as const).map((side) => <option key={side} value={side}>{t(`layout.${side}`)}</option>)}</select>
          {numeric('layout.sidebarWidth', history.present.layout.sidebarWidthPercent, (next) => ({ ...history.present, layout: { ...history.present.layout, sidebarWidthPercent: next } }), 20, 45, 1)}
          {numeric('layout.columnGap', history.present.layout.columnGapMm, (next) => ({ ...history.present, layout: { ...history.present.layout, columnGapMm: next } }), 0, 20, 0.5)}
        </div>
      </fieldset>

      <fieldset className="space-y-2" disabled={disabled}>
        <legend className="text-sm font-medium">{t('typography.title')}</legend>
        <select aria-label={t('typography.fontFamily')} value={history.present.typography.fontFamily} className={fieldClass} onChange={(event) => commit('typography.fontFamily', { ...history.present, typography: { ...history.present.typography, fontFamily: event.target.value as TemplateManifestV1['typography']['fontFamily'] } })}>{TEMPLATE_FONT_FAMILIES.map((font) => <option key={font} value={font}>{font}</option>)}</select>
        <div className="grid grid-cols-3 gap-2">
          {numeric('typography.baseFontSize', history.present.typography.baseFontSizePt, (next) => ({ ...history.present, typography: { ...history.present.typography, baseFontSizePt: next } }), 8, 18, 0.5)}
          {numeric('typography.lineHeight', history.present.typography.lineHeight, (next) => ({ ...history.present, typography: { ...history.present.typography, lineHeight: next } }), 1, 2, 0.05)}
          {numeric('typography.headingScale', history.present.typography.headingScale, (next) => ({ ...history.present, typography: { ...history.present.typography, headingScale: next } }), 1, 2, 0.05)}
        </div>
      </fieldset>

      <fieldset className="space-y-2" disabled={disabled}>
        <legend className="text-sm font-medium">{t('colors.title')}</legend>
        <div className="grid grid-cols-2 gap-2">{(['text', 'muted', 'accent', 'background'] as const).map((color) => <label key={color} className="flex h-9 items-center gap-2 rounded-md border px-2 text-xs dark:border-zinc-700"><input type="color" aria-label={t(`colors.${color}`)} value={history.present.colors[color]} className="size-6 border-0 bg-transparent p-0" onChange={(event) => commit(`colors.${color}`, { ...history.present, colors: { ...history.present.colors, [color]: event.target.value } })} /><span className="truncate">{t(`colors.${color}`)}</span></label>)}</div>
      </fieldset>

      <fieldset className="space-y-2" disabled={disabled}>
        <legend className="text-sm font-medium">{t('spacing.title')}</legend>
        <div className="grid grid-cols-2 gap-2">
          {numeric('spacing.pageMargin', history.present.spacing.pageMarginMm, (next) => ({ ...history.present, spacing: { ...history.present.spacing, pageMarginMm: next } }), 5, 30, 0.5)}
          {numeric('spacing.sectionGap', history.present.spacing.sectionGapMm, (next) => ({ ...history.present, spacing: { ...history.present.spacing, sectionGapMm: next } }), 0, 20, 0.5)}
        </div>
      </fieldset>

      <fieldset className="space-y-2" disabled={disabled}>
        <legend className="text-sm font-medium">{t('features.title')}</legend>
        {([['avatar', 'showAvatar'], ['qr', 'showQrCodes'], ['pageNumbers', 'showPageNumbers']] as const).map(([label, property]) => <label key={property} className="flex h-8 items-center gap-2 text-sm"><input type="checkbox" aria-label={t(`features.${label}`)} checked={history.present.features[property]} onChange={(event) => commit(`features.${label}`, { ...history.present, features: { ...history.present.features, [property]: event.target.checked } })} />{t(`features.${label}`)}</label>)}
        {numeric('features.maxPages', history.present.features.maxPages, (next) => ({ ...history.present, features: { ...history.present.features, maxPages: next } }), 1, 12, 1)}
      </fieldset>

      <fieldset className="space-y-2" disabled={disabled}>
        <legend className="text-sm font-medium">{t('sections.title')}</legend>
        <TemplateSectionSorter
          slots={history.present.sectionSlots}
          onChange={updateSlots}
          labels={sorterLabels}
          sectionLabels={sectionLabels}
          advancedRenderer={(slot) => <div className="grid grid-cols-2 gap-2 py-2">{SECTION_STYLE_ELEMENTS.map((element) => <label key={element} className="min-w-0 space-y-1"><span className="block truncate">{t(`sections.${element}`)}</span><select aria-label={`${t(`sections.${element}`)}:${sectionLabels[slot.sectionType]}`} value={styleVariant(slot.sectionType, element)} className={fieldClass} onChange={(event) => updateStyle(slot.sectionType, element, event.target.value as TemplateManifestV1['sectionStyles'][number]['variant'])}>{(['default', 'compact', 'accent', 'muted', 'bordered'] as const).map((variant) => <option key={variant} value={variant}>{t(`variants.${variant}`)}</option>)}</select></label>)}</div>}
        />
      </fieldset>
    </div>
  );

  return (
    <div
      data-testid="local-template-editor"
      data-layout={history.present.layout.type}
      data-preview-status={preview.status}
      className="min-w-0"
    >
      <div data-testid="local-template-mobile-tabs" className="mb-3 lg:hidden">
        <Tabs value={mobileTab} onValueChange={(tab) => setMobileTab(tab as 'settings' | 'preview')}>
          <TabsList className="grid w-full grid-cols-2"><TabsTrigger value="settings">{t('mobile.settings')}</TabsTrigger><TabsTrigger value="preview">{t('mobile.preview')}</TabsTrigger></TabsList>
        </Tabs>
      </div>
      <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(18rem,24rem)_minmax(0,1fr)]">
        <div className={cn('min-w-0', mobileTab === 'settings' ? 'block' : 'hidden lg:block')}>{settings}</div>
        <div className={cn('min-w-0 space-y-3', mobileTab === 'preview' ? 'block' : 'hidden lg:sticky lg:top-4 lg:block')}>
          <div className="grid w-full grid-cols-2 rounded-md bg-zinc-100 p-1 dark:bg-zinc-900">{(['a4', 'letter'] as const).map((paper) => <button key={paper} type="button" aria-label={t(`paper.${paper}`)} aria-pressed={paperSize === paper} className={cn('h-8 text-xs', paperSize === paper && 'rounded bg-white shadow-sm dark:bg-zinc-800')} onClick={() => setPaperSize(paper)}>{t(`paper.${paper}`)}</button>)}</div>
          <select aria-label={t('preview.resume')} value={preview.selectedId} className={fieldClass} onChange={(event) => preview.select(event.target.value)}>{previewOptions.map((option) => <option key={option.id} value={option.id}>{option.title}</option>)}</select>
          <div data-testid="local-template-preview" data-paper-size={paperSize} className={cn('mx-auto min-h-[20rem] min-w-0 overflow-hidden bg-white text-zinc-950 shadow-sm', paperSize === 'a4' ? 'aspect-[210/297] w-full max-w-[46rem]' : 'aspect-[8.5/11] w-full max-w-[46rem]')}><DeclarativeTemplateDocument document={document} /></div>
        </div>
      </div>
    </div>
  );
}
