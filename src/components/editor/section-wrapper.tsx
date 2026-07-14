'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ChevronDown, ChevronRight, Eye, EyeOff, GripVertical, Sparkles, Undo2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { useEditorStore } from '@/stores/editor-store';
import { useResumeStore } from '@/stores/resume-store';
import { useDragHandle } from './dnd/sortable-section';
import { AIChangeProvider } from './ai-change-context';
import type { ResumeSection, SectionContent } from '@/types/resume';
import type { RestoreResult } from '@/lib/resume/apply-ai-change';
import { PersonalInfoSection } from './sections/personal-info';
import { SummarySection } from './sections/summary';
import { WorkExperienceSection } from './sections/work-experience';
import { EducationSection } from './sections/education';
import { SkillsSection } from './sections/skills';
import { ProjectsSection } from './sections/projects';
import { CertificationsSection } from './sections/certifications';
import { LanguagesSection } from './sections/languages';
import { CustomSection } from './sections/custom-section';
import { GitHubSection } from './sections/github';
import { QrCodesSection } from './sections/qr-codes';

interface SectionWrapperProps {
  section: ResumeSection;
  onUpdate: (content: Partial<SectionContent>) => void;
  onRemove: () => void;
}

const sectionComponents: Record<string, React.ComponentType<{ section: ResumeSection; onUpdate: (content: Partial<SectionContent>) => void }>> = {
  personal_info: PersonalInfoSection,
  summary: SummarySection,
  work_experience: WorkExperienceSection,
  education: EducationSection,
  skills: SkillsSection,
  projects: ProjectsSection,
  certifications: CertificationsSection,
  languages: LanguagesSection,
  github: GitHubSection,
  qr_codes: QrCodesSection,
  custom: CustomSection,
};

function formatChangeValue(value: unknown, emptyLabel: string) {
  if (Array.isArray(value)) return value.join(', ');
  return value == null ? emptyLabel : String(value);
}

export function restoreSectionAIChanges({
  sectionId,
  changeId,
  restore,
}: {
  sectionId: string;
  changeId?: string;
  restore: (options: { scope: 'change'; changeId: string } | { scope: 'section'; sectionId: string }) => RestoreResult;
}): RestoreResult {
  return changeId
    ? restore({ scope: 'change', changeId })
    : restore({ scope: 'section', sectionId });
}

export function SectionWrapper({ section, onUpdate, onRemove }: SectionWrapperProps) {
  const t = useTranslations('editor');
  const { selectedSectionId, selectSection, showAiChat, toggleAiChat, restoreAiChanges } = useEditorStore();
  const { toggleSectionVisibility, updateSectionTitle } = useResumeStore();
  const { attributes, listeners } = useDragHandle();
  const allAiChanges = useEditorStore((state) => state.aiChanges);
  const focusRequest = useEditorStore((state) => state.aiChangeFocusRequest);
  const sectionChanges = useMemo(() => allAiChanges.filter((change) => change.sectionId === section.id), [allAiChanges, section.id]);
  const clearAiSectionChanges = useEditorStore((state) => state.clearAiSectionChanges);
  const isSelected = selectedSectionId === section.id;
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(section.title);
  const [changesOpen, setChangesOpen] = useState(false);
  const [focusHighlighted, setFocusHighlighted] = useState(false);
  const [restoreDialogOpen, setRestoreDialogOpen] = useState(false);
  const sectionRootRef = useRef<HTMLDivElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isRenaming) {
      renameInputRef.current?.focus();
      renameInputRef.current?.select();
    }
  }, [isRenaming]);

  useEffect(() => {
    if (!focusRequest || focusRequest.sectionId !== section.id) return;

    selectSection(section.id);
    let secondFrame = 0;
    let clearHighlightTimer = 0;
    const firstFrame = requestAnimationFrame(() => {
      setChangesOpen(true);
      secondFrame = requestAnimationFrame(() => {
        const root = sectionRootRef.current;
        if (!root) return;
        const field = root.querySelector<HTMLElement>(
          `[data-ai-change-path="${CSS.escape(focusRequest.fieldPath)}"]`
        );
        const summaryRow = root.querySelector<HTMLElement>(
          `[data-ai-change-id="${CSS.escape(focusRequest.changeId)}"]`
        );
        const target = field ?? summaryRow ?? root.querySelector<HTMLElement>('[data-ai-change-summary]') ?? root;
        target.scrollIntoView({ behavior: 'smooth', block: 'center' });
        target.focus({ preventScroll: true });
        setFocusHighlighted(true);
        clearHighlightTimer = window.setTimeout(() => setFocusHighlighted(false), 1400);
      });
    });

    return () => {
      cancelAnimationFrame(firstFrame);
      if (secondFrame) cancelAnimationFrame(secondFrame);
      if (clearHighlightTimer) window.clearTimeout(clearHighlightTimer);
    };
  }, [focusRequest, section.id, selectSection]);

  const commitRename = () => {
    const trimmed = renameValue.trim();
    if (trimmed && trimmed !== section.title) {
      updateSectionTitle(section.id, trimmed);
    } else {
      setRenameValue(section.title);
    }
    setIsRenaming(false);
  };

  const reportRestoreResult = (result: RestoreResult) => {
    if (result.conflicts.length > 0 || result.skipped.length > 0) {
      toast.warning(t('aiRestorePartial', {
        restored: result.restored,
        skipped: result.conflicts.length + result.skipped.length,
      }));
    }
  };

  const restoreOneChange = (changeId: string) => {
    const result = restoreSectionAIChanges({ sectionId: section.id, changeId, restore: restoreAiChanges });
    reportRestoreResult(result);
  };

  const restoreSectionChanges = () => {
    const result = restoreSectionAIChanges({ sectionId: section.id, restore: restoreAiChanges });
    reportRestoreResult(result);
    setRestoreDialogOpen(false);
    if (result.restored > 0 && result.conflicts.length === 0 && result.skipped.length === 0) setChangesOpen(false);
  };

  const SectionComponent = sectionComponents[section.type];
  const isRenamable = section.type !== 'personal_info';

  return (
    <AIChangeProvider sectionId={section.id}>
      <div
        ref={sectionRootRef}
        tabIndex={-1}
        className={`rounded-xl border bg-white shadow-sm outline-none transition-all duration-200 dark:bg-zinc-900 ${
          isSelected ? 'border-brand shadow-brand-muted/50 dark:shadow-brand/20' : 'border-zinc-200 hover:border-zinc-300 dark:border-zinc-700 dark:hover:border-zinc-600'
        } ${focusHighlighted ? 'ring-4 ring-amber-400 dark:ring-amber-500' : sectionChanges.length > 0 ? 'ring-2 ring-amber-200/80 dark:ring-amber-900/60' : ''} ${!section.visible ? 'opacity-50' : ''}`}
        onClick={() => selectSection(section.id)}
      >
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-100 px-3 py-2.5 md:flex-nowrap md:px-4 dark:border-zinc-800">
          <div className="flex min-w-0 items-center gap-2">
            <GripVertical
              className="h-4 w-4 shrink-0 cursor-grab text-zinc-300 active:cursor-grabbing"
              {...attributes}
              {...listeners}
            />
            {isRenaming ? (
              <input
                ref={renameInputRef}
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onBlur={commitRename}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitRename();
                  if (e.key === 'Escape') { setRenameValue(section.title); setIsRenaming(false); }
                }}
                className="h-6 w-32 rounded border border-brand bg-transparent px-1 text-sm font-semibold text-zinc-700 outline-none dark:text-zinc-200"
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <h3
                className={`min-w-0 truncate text-sm font-semibold text-zinc-700 dark:text-zinc-200 ${isRenamable ? 'cursor-text rounded px-1 -mx-1 hover:bg-zinc-100 dark:hover:bg-zinc-700' : ''}`}
                onDoubleClick={isRenamable ? (e) => { e.stopPropagation(); setRenameValue(section.title); setIsRenaming(true); } : undefined}
              >
                {section.title}
              </h3>
            )}
            {sectionChanges.length > 0 && (
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800 dark:bg-amber-900/60 dark:text-amber-200">
                <Sparkles className="h-2.5 w-2.5" />
                {t('aiChanged')} {sectionChanges.length}
              </span>
            )}
          </div>
          <div className="ml-auto flex shrink-0 items-center gap-1">
            {sectionChanges.length > 0 && (
              <AlertDialog open={restoreDialogOpen} onOpenChange={setRestoreDialogOpen}>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 cursor-pointer text-amber-700 hover:bg-amber-50 hover:text-amber-900 dark:text-amber-300 dark:hover:bg-amber-950/40"
                    aria-label={t('restoreAiChanges')}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Undo2 className="h-3.5 w-3.5" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>{t('restoreAiChanges')}</AlertDialogTitle>
                    <AlertDialogDescription>
                      {t('restoreAiChangesConfirm', { count: sectionChanges.length })}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>{t('cancel')}</AlertDialogCancel>
                    <AlertDialogAction onClick={restoreSectionChanges}>{t('restoreAiChanges')}</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
            {sectionChanges.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 cursor-pointer gap-1 px-1.5 text-[11px] text-amber-700 hover:bg-amber-50 hover:text-amber-900 dark:text-amber-300 dark:hover:bg-amber-950/40"
                aria-expanded={changesOpen}
                aria-label={changesOpen ? t('hideAiChanges') : t('viewAiChanges')}
                onClick={(e) => { e.stopPropagation(); setChangesOpen((open) => !open); }}
              >
                {changesOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                <span className="hidden sm:inline">{changesOpen ? t('hideAiChanges') : t('viewAiChanges')}</span>
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="h-7 cursor-pointer gap-1.5 px-2 text-brand hover:bg-brand-muted hover:text-brand"
              title={t('toolbar.aiAssistant')}
              aria-label={t('toolbar.aiAssistant')}
              aria-pressed={showAiChat}
              onClick={(e) => {
                e.stopPropagation();
                if (!showAiChat) toggleAiChat();
              }}
            >
              <Sparkles className="h-3.5 w-3.5" />
              <span className="text-[11px] font-semibold">{t('toolbar.aiAssistant')}</span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 cursor-pointer p-0"
              aria-label={section.visible ? t('hideSection') : t('showSection')}
              onClick={(e) => {
                e.stopPropagation();
                toggleSectionVisibility(section.id);
              }}
            >
              {section.visible ? <Eye className="h-3.5 w-3.5 text-zinc-400" /> : <EyeOff className="h-3.5 w-3.5 text-zinc-400" />}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 cursor-pointer p-0 text-zinc-400 hover:text-red-500"
              aria-label={t('removeSection')}
              onClick={(e) => {
                e.stopPropagation();
                onRemove();
              }}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
        {changesOpen && sectionChanges.length > 0 && (
          <div data-ai-change-summary tabIndex={-1} className="border-b border-amber-100 bg-amber-50/60 px-3 py-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-amber-500 dark:border-amber-900/50 dark:bg-amber-950/20">
            <div className="mb-1 flex items-center justify-between gap-2">
              <span className="font-semibold text-amber-900 dark:text-amber-100">{t('aiChangesTitle')}</span>
              <button
                type="button"
                className="cursor-pointer text-[11px] text-amber-700 underline-offset-2 hover:underline dark:text-amber-300"
                onClick={(e) => { e.stopPropagation(); clearAiSectionChanges(section.id); setChangesOpen(false); }}
              >
                {t('clearAiChanges')}
              </button>
            </div>
            <div className="space-y-1.5">
              {sectionChanges.map((change) => {
                const leaf = change.fieldPath.split('.').pop() || change.fieldPath;
                const fieldKey = `fields.${leaf}`;
                const label = t.has(fieldKey) ? t(fieldKey) : leaf;
                return (
                  <div key={change.id} data-ai-change-id={change.id} tabIndex={-1} className="grid min-w-0 gap-1 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-amber-500 sm:grid-cols-[minmax(6rem,0.7fr)_minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-baseline sm:gap-2">
                    <span className="font-medium text-amber-900 dark:text-amber-100">{label}</span>
                    <span className="min-w-0 break-words text-zinc-500 line-through dark:text-zinc-400">{formatChangeValue(change.beforeValue, t('emptyValue'))}</span>
                    <span className="min-w-0 break-words text-zinc-800 dark:text-zinc-200">{formatChangeValue(change.afterValue, t('emptyValue'))}</span>
                    <button
                      type="button"
                      className="inline-flex h-6 w-6 items-center justify-center rounded text-amber-700 hover:bg-amber-100 dark:text-amber-300 dark:hover:bg-amber-900/50"
                      aria-label={t('restoreAiChange')}
                      title={t('restoreAiChange')}
                      onClick={(e) => { e.stopPropagation(); restoreOneChange(change.id); }}
                    >
                      <Undo2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}
        <div className="px-4 pb-4 pt-3">
          {!section.content || typeof section.content !== 'object' ? (
            <p className="text-sm text-red-400">{t('invalidSectionContent')}</p>
          ) : SectionComponent ? (
            <SectionComponent section={section} onUpdate={onUpdate} />
          ) : (
            <p className="text-sm text-zinc-400">Unknown section type: {section.type}</p>
          )}
        </div>
      </div>
    </AIChangeProvider>
  );
}
