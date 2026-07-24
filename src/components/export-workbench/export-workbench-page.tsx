'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ArrowLeft, ChevronDown, ChevronUp, Download, Eye, EyeOff, Layers3, Loader2, Palette, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useRouter } from '@/i18n/routing';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { PreviewErrorBoundary } from '@/components/preview/preview-error-boundary';
import { ResumePreview } from '@/components/preview/resume-preview';
import { ThemeEditor } from '@/components/editor/theme-editor';
import { DEFAULT_SECTIONS, SECTION_TYPES, type SectionType } from '@/lib/constants';
import { generateId } from '@/lib/utils';
import type { ExportFormat } from '@/lib/export-workbench/export-client';
import type { ResumeSection, SectionContent } from '@/types/resume';
import { DraftSectionEditor } from './draft-section-editor';
import { useExportWorkbench } from './use-export-workbench';

const FORMATS: ExportFormat[] = ['pdf', 'pdf-one-page', 'docx', 'html', 'txt', 'json'];

function emptySection(type: SectionType, resumeId: string, title: string, sortOrder: number): ResumeSection {
  return {
    id: generateId(), resumeId, type, title, sortOrder, visible: true,
    content: type === 'personal_info'
      ? { fullName: '', jobTitle: '', email: '', phone: '', location: '' }
      : type === 'summary' ? { text: '' } : type === 'skills' ? { categories: [] } : { items: [] },
    createdAt: new Date(), updatedAt: new Date(),
  };
}

function sectionEntries(section: ResumeSection): { key: 'items' | 'categories'; values: Array<Record<string, unknown>> } | null {
  const content = section.content as unknown as Record<string, unknown>;
  if (Array.isArray(content.items)) return { key: 'items', values: content.items as Array<Record<string, unknown>> };
  if (Array.isArray(content.categories)) return { key: 'categories', values: content.categories as Array<Record<string, unknown>> };
  return null;
}

function entryLabel(entry: Record<string, unknown>, index: number, fallback: string): string {
  for (const key of ['company', 'institution', 'name', 'title', 'label', 'position']) {
    if (typeof entry[key] === 'string' && entry[key]) return entry[key];
  }
  return `${fallback} ${index + 1}`;
}

export function ExportWorkbenchPage({ resumeId }: { resumeId: string }) {
  const t = useTranslations('exportWorkbench');
  const router = useRouter();
  const workbench = useExportWorkbench(resumeId);
  const [themeOpen, setThemeOpen] = useState(false);
  const [modulesOpen, setModulesOpen] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [selectedSectionId, setSelectedSectionId] = useState<string | null>(null);
  const draft = workbench.draft;
  const selectedSection = draft?.sections.find((section) => section.id === selectedSectionId) ?? null;
  const selectedEntries = selectedSection ? sectionEntries(selectedSection) : null;
  const canRetryExport = workbench.transactionState.status === 'saved_export_failed' && !workbench.isDirty;

  useEffect(() => {
    if (workbench.transactionState.status === 'success') toast.success(t('status.success'));
    if (workbench.transactionState.status === 'save_failed') toast.error(t('status.saveFailed'));
    if (workbench.transactionState.status === 'saved_export_failed') toast.error(t('status.savedExportFailed'));
  }, [t, workbench.transactionState.status]);

  const availableTypes = useMemo(() => {
    const existing = new Set(draft?.sections.map((section) => section.type));
    return SECTION_TYPES.filter((type) => type === 'custom' || !existing.has(type));
  }, [draft?.sections]);

  const leave = () => {
    if (workbench.isDirty) setConfirmLeave(true);
    else router.push(`/editor/${resumeId}`);
  };

  const runPrimaryAction = async () => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    await Promise.resolve();
    await workbench.primaryAction();
  };

  if (workbench.isLoading) return <div className="flex h-dvh items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" aria-label={t('loading')} /></div>;
  if (workbench.loadError || !draft) return <div className="flex h-dvh flex-col items-center justify-center gap-3"><p className="text-sm text-red-600">{t('loadFailed')}</p><Button variant="outline" onClick={() => router.push(`/editor/${resumeId}`)}>{t('back')}</Button></div>;

  const moveSection = (sectionId: string, direction: -1 | 1) => {
    const index = draft.sections.findIndex((section) => section.id === sectionId);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= draft.sections.length) return;
    const next = [...draft.sections];
    [next[index], next[target]] = [next[target], next[index]];
    workbench.reorderSections(next);
  };

  const addSection = (type: SectionType) => {
    const definition = DEFAULT_SECTIONS.find((section) => section.type === type);
    const title = definition ? (draft.language === 'zh' ? definition.titleZh : definition.titleEn) : t('customSection');
    const section = emptySection(type, draft.id, title, draft.sections.length);
    workbench.addSection(section);
    setSelectedSectionId(section.id);
  };

  const moveEntry = (index: number, direction: -1 | 1) => {
    if (!selectedSection || !selectedEntries) return;
    const target = index + direction;
    if (target < 0 || target >= selectedEntries.values.length) return;
    const values = [...selectedEntries.values];
    [values[index], values[target]] = [values[target], values[index]];
    workbench.updateSectionContent(selectedSection.id, {
      [selectedEntries.key]: values,
    } as Partial<SectionContent>);
  };

  return (
    <div className="flex h-dvh min-w-0 flex-col bg-zinc-100 dark:bg-zinc-950" data-testid="export-workbench-page">
      <header className="flex min-h-14 flex-wrap items-center justify-between gap-2 border-b bg-white px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex min-w-0 items-center gap-2">
          <Button variant="ghost" size="icon" onClick={leave} aria-label={t('back')}><ArrowLeft className="h-4 w-4" /></Button>
          <div className="min-w-0"><h1 className="truncate text-sm font-semibold">{draft.title}</h1><p className="text-xs text-zinc-500">{workbench.isDirty ? t('unsaved') : t('saved')}</p></div>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button variant="outline" size="sm" onClick={() => setModulesOpen(true)} disabled={workbench.isSubmitting}><Layers3 className="h-4 w-4" /><span className="hidden sm:inline">{t('modules')}</span></Button>
          <Button variant="outline" size="sm" onClick={() => setThemeOpen(true)} disabled={workbench.isSubmitting}><Palette className="h-4 w-4" /><span className="hidden sm:inline">{t('theme')}</span></Button>
          <Select value={workbench.format} onValueChange={(value) => workbench.setFormat(value as ExportFormat)} disabled={workbench.isSubmitting}>
            <SelectTrigger className="w-36" aria-label={t('format')}><SelectValue /></SelectTrigger>
            <SelectContent>{FORMATS.map((format) => <SelectItem key={format} value={format}>{t(`formats.${format}`)}</SelectItem>)}</SelectContent>
          </Select>
          <Button onClick={() => void runPrimaryAction()} disabled={workbench.isSubmitting}>
            {workbench.isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            {canRetryExport ? t('retryExport') : t('saveAndExport')}
          </Button>
        </div>
      </header>

      <main className="min-h-0 flex-1 overflow-auto p-2 md:p-6">
        <div className="mx-auto w-[794px] max-w-full bg-white shadow-md" data-testid="export-a4-preview">
          <PreviewErrorBoundary resetKey={draft.sections} fallback={<div className="p-8 text-center text-sm text-zinc-500">{t('previewFailed')}</div>}>
            <ResumePreview resume={draft} edit={workbench.isSubmitting ? undefined : {
              enabled: true,
              updateField: (source, value) => workbench.updateField({
                sectionId: source.sectionId,
                ...(source.itemId ? { itemId: source.itemId } : {}),
                fieldPath: source.fieldPath,
                value,
              }),
              emptyLabel: t('emptyField'),
            }} />
          </PreviewErrorBoundary>
        </div>
      </main>

      <Sheet open={themeOpen} onOpenChange={setThemeOpen}>
        <SheetContent className="w-80 p-0 sm:max-w-80"><SheetHeader className="sr-only"><SheetTitle>{t('theme')}</SheetTitle></SheetHeader><ThemeEditor adapter={{ resume: draft, pendingTemplateBinding: workbench.session?.pendingBinding ?? null, onThemeChange: workbench.updateTheme, onTemplateChange: workbench.selectTemplate }} /></SheetContent>
      </Sheet>

      <Sheet open={modulesOpen} onOpenChange={setModulesOpen}>
        <SheetContent side="left" className="w-[min(92vw,28rem)] overflow-y-auto p-0 sm:max-w-md">
          <SheetHeader className="border-b p-4"><SheetTitle>{t('modules')}</SheetTitle></SheetHeader>
          <div className="space-y-2 border-b p-3">
            {draft.sections.map((section, index) => <div key={section.id} className="flex items-center gap-1 rounded border p-1.5">
              <button type="button" className="min-w-0 flex-1 truncate px-2 text-left text-sm" onClick={() => setSelectedSectionId(section.id)}>{section.title}</button>
              <Button variant="ghost" size="icon-xs" className="h-11 w-11 md:h-6 md:w-6" onClick={() => moveSection(section.id, -1)} disabled={index === 0} aria-label={t('moveUp')}><ChevronUp className="h-3.5 w-3.5" /></Button>
              <Button variant="ghost" size="icon-xs" className="h-11 w-11 md:h-6 md:w-6" onClick={() => moveSection(section.id, 1)} disabled={index === draft.sections.length - 1} aria-label={t('moveDown')}><ChevronDown className="h-3.5 w-3.5" /></Button>
              <Button variant="ghost" size="icon-xs" className="h-11 w-11 md:h-6 md:w-6" onClick={() => workbench.toggleSectionVisibility(section.id)} aria-label={section.visible ? t('hide') : t('show')}>{section.visible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}</Button>
              <Button variant="ghost" size="icon-xs" className="h-11 w-11 md:h-6 md:w-6" onClick={() => { workbench.removeSection(section.id); if (selectedSectionId === section.id) setSelectedSectionId(null); }} disabled={section.type === 'personal_info'} aria-label={t('remove')}><Trash2 className="h-3.5 w-3.5" /></Button>
            </div>)}
            <Select onValueChange={(value) => addSection(value as SectionType)}><SelectTrigger><Plus className="h-4 w-4" /><SelectValue placeholder={t('addModule')} /></SelectTrigger><SelectContent>{availableTypes.map((type) => <SelectItem key={type} value={type}>{t(`sectionTypes.${type}`)}</SelectItem>)}</SelectContent></Select>
          </div>
          <div className="space-y-4 p-4">{selectedSection ? <>
            {selectedEntries && selectedEntries.values.length > 1 && <div className="space-y-1 rounded border p-2">
              <p className="px-1 text-xs font-medium text-zinc-500">{t('entryOrder')}</p>
              {selectedEntries.values.map((entry, index) => <div key={String(entry.id ?? index)} className="flex items-center gap-1">
                <span className="min-w-0 flex-1 truncate px-1 text-xs">{entryLabel(entry, index, t('entry'))}</span>
                <Button variant="ghost" size="icon-xs" className="h-11 w-11 md:h-6 md:w-6" onClick={() => moveEntry(index, -1)} disabled={index === 0} aria-label={t('moveEntryUp')}><ChevronUp className="h-3.5 w-3.5" /></Button>
                <Button variant="ghost" size="icon-xs" className="h-11 w-11 md:h-6 md:w-6" onClick={() => moveEntry(index, 1)} disabled={index === selectedEntries.values.length - 1} aria-label={t('moveEntryDown')}><ChevronDown className="h-3.5 w-3.5" /></Button>
              </div>)}
            </div>}
            <DraftSectionEditor section={selectedSection} draftSections={draft.sections} themeConfig={draft.themeConfig} onThemeChange={workbench.updateTheme} onUpdate={(updates) => workbench.updateSectionContent(selectedSection.id, updates)} />
          </> : <p className="text-sm text-zinc-500">{t('selectModule')}</p>}</div>
        </SheetContent>
      </Sheet>

      <AlertDialog open={confirmLeave || workbench.historyBackRequested} onOpenChange={(open) => {
        if (open) return;
        setConfirmLeave(false);
        workbench.cancelHistoryBack();
      }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{t('leaveTitle')}</AlertDialogTitle><AlertDialogDescription>{t('leaveDescription')}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>{t('stay')}</AlertDialogCancel><AlertDialogAction onClick={() => {
        if (workbench.historyBackRequested) workbench.confirmHistoryBack();
        else workbench.discardAndLeave(() => router.push(`/editor/${resumeId}`));
      }}>{t('discard')}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
    </div>
  );
}
