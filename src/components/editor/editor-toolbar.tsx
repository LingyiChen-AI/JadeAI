'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/routing';
import { toast } from 'sonner';
import { ArrowLeft, Undo2, Redo2, Download, Upload, Settings, Palette, Save, FileSearch, Languages, FileText, SpellCheck, Share2, MoreHorizontal, Sparkles, History } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useEditorStore } from '@/stores/editor-store';
import { useResumeStore } from '@/stores/resume-store';
import { useUIStore } from '@/stores/ui-store';
import { LocaleSwitcher } from '@/components/layout/locale-switcher';
import { AIHistoryPanel } from '@/components/editor/ai-history-panel';

interface EditorToolbarProps {
  resumeId: string;
  userId: string;
}

export function EditorToolbar({ resumeId, userId }: EditorToolbarProps) {
  const t = useTranslations('editor.toolbar');
  const router = useRouter();
  const { toggleThemeEditor, showThemeEditor, undo, redo, undoStack, redoStack, showAiChat, toggleAiChat } = useEditorStore();
  const { isSaving, isDirty, saveError, currentResume, reorderSections, save } = useResumeStore();
  const isAiEditing = useResumeStore((s) => s.aiEditingResumeId === resumeId);
  const { openModal } = useUIStore();
  const [historyOpen, setHistoryOpen] = useState(false);

  useEffect(() => {
    if (saveError) toast.error(t(saveError === 'saveConflict' ? 'saveConflict' : 'saveFailed'));
  }, [saveError, t]);

  const handleBack = async () => {
    if (isAiEditing) return;
    await save();
    router.push('/dashboard');
  };

  const handleUndo = () => {
    const snapshot = undo();
    if (snapshot) {
      reorderSections(snapshot.sections);
    }
  };

  const handleRedo = () => {
    const snapshot = redo();
    if (snapshot) {
      reorderSections(snapshot.sections);
    }
  };

  const openExportWorkbench = async () => {
    // Flush the editor's existing autosave queue before the isolated workbench
    // loads its baseline, otherwise a pending timer could overwrite that draft.
    if (!await save()) return;
    router.push(`/editor/${resumeId}/export`);
  };

  return (
    <>
    <div className="flex h-12 items-center justify-between gap-2 border-b bg-white px-2 sm:px-3 dark:bg-background dark:border-zinc-800">
      <div className="flex min-w-0 flex-1 items-center gap-1 sm:gap-2">
        <Button
          variant="ghost"
          size="icon"
          onClick={handleBack}
          disabled={isAiEditing}
          className="h-8 w-8 shrink-0 cursor-pointer text-zinc-600"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <Separator orientation="vertical" className="hidden h-6 sm:block" />
        <span className="min-w-0 max-w-[8rem] truncate text-sm font-medium text-zinc-900 sm:max-w-48 dark:text-zinc-100">
          {currentResume?.title || ''}
        </span>
        <span className="hidden text-xs text-zinc-400 sm:inline">
          {isAiEditing ? t('aiEditing') : isSaving ? t('saving') : saveError ? t(saveError === 'saveConflict' ? 'saveConflict' : 'saveFailed') : isDirty ? t('unsaved') : t('autoSaved')}
        </span>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => save()}
          disabled={!isDirty || isSaving || isAiEditing}
          className="cursor-pointer gap-1 text-brand hover:bg-brand-muted hover:text-brand"
          title={`${t('save')} (Ctrl+S)`}
        >
          <Save className="h-3.5 w-3.5" />
          <span className="hidden text-xs sm:inline">{t('save')}</span>
        </Button>
      </div>

      <div className="flex shrink-0 items-center gap-0.5 sm:gap-1">
        {/* Primary: undo/redo — always visible */}
        <Button
          variant="ghost"
          size="icon"
          onClick={handleUndo}
          disabled={undoStack.length === 0 || isAiEditing}
          className="h-8 w-8 cursor-pointer"
          title={t('undo')}
        >
          <Undo2 className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={handleRedo}
          disabled={redoStack.length === 0 || isAiEditing}
          className="h-8 w-8 cursor-pointer"
          title={t('redo')}
        >
          <Redo2 className="h-4 w-4" />
        </Button>
        <Separator orientation="vertical" className="hidden h-6 sm:block" />

        {/* Desktop: show all secondary buttons */}
        <div className="hidden items-center gap-1 md:flex">
          <Button
            data-tour="ai-toolbar"
            variant={showAiChat ? 'secondary' : 'ghost'}
            size="sm"
            onClick={toggleAiChat}
            className="cursor-pointer text-brand hover:bg-brand-muted hover:text-brand"
            title={t('aiAssistant')}
          >
            <Sparkles className="h-4 w-4" />
            <span className="ml-1 text-xs hidden sm:inline">{t('aiAssistant')}</span>
          </Button>
          <Separator orientation="vertical" className="h-6" />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setHistoryOpen(true)}
            disabled={isAiEditing}
            className="cursor-pointer"
            title={t('aiHistory')}
            aria-label={t('aiHistory')}
          >
            <History className="h-4 w-4" />
            <span className="ml-1 hidden text-xs lg:inline">{t('aiHistory')}</span>
          </Button>
          <Button
            data-tour="export"
            variant="ghost"
            size="sm"
            onClick={() => void openExportWorkbench()}
            className="cursor-pointer"
            title={t('exportPdf')}
          >
            <Download className="h-4 w-4" />
            <span className="ml-1 text-xs hidden sm:inline">{t('exportPdf')}</span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => openModal('import')}
            disabled={isAiEditing}
            className="cursor-pointer"
            title={t('import')}
          >
            <Upload className="h-4 w-4" />
            <span className="ml-1 text-xs hidden sm:inline">{t('import')}</span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => openModal('share')}
            className="cursor-pointer"
            title={t('share')}
          >
            <Share2 className="h-4 w-4" />
            <span className="ml-1 text-xs hidden sm:inline">{t('share')}</span>
          </Button>
          <Separator orientation="vertical" className="h-6" />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => openModal('jd-analysis')}
            className="cursor-pointer"
            title={t('jdAnalysis')}
          >
            <FileSearch className="h-4 w-4" />
            <span className="ml-1 text-xs hidden sm:inline">{t('jdAnalysis')}</span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => openModal('translate')}
            disabled={isAiEditing}
            className="cursor-pointer"
            title={t('translate')}
          >
            <Languages className="h-4 w-4" />
            <span className="ml-1 text-xs hidden sm:inline">{t('translate')}</span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => openModal('cover-letter')}
            className="cursor-pointer"
            title={t('coverLetter')}
          >
            <FileText className="h-4 w-4" />
            <span className="ml-1 text-xs hidden sm:inline">{t('coverLetter')}</span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => openModal('grammar-check')}
            className="cursor-pointer"
            title={t('grammarCheck')}
          >
            <SpellCheck className="h-4 w-4" />
            <span className="ml-1 text-xs hidden sm:inline">{t('grammarCheck')}</span>
          </Button>
          <Separator orientation="vertical" className="h-6" />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => openModal('settings')}
            className="cursor-pointer"
            title={t('settings')}
          >
            <Settings className="h-4 w-4" />
          </Button>
        </div>

        {/* Mobile: "more" dropdown */}
        <div className="md:hidden">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={toggleAiChat}>
                <Sparkles className="mr-2 h-4 w-4 text-brand" />
                {t('aiAssistant')}
              </DropdownMenuItem>
              <DropdownMenuItem disabled={isAiEditing} onClick={() => setHistoryOpen(true)}>
                <History className="mr-2 h-4 w-4" />
                {t('aiHistory')}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => void openExportWorkbench()}>
                <Download className="mr-2 h-4 w-4" />
                {t('exportPdf')}
              </DropdownMenuItem>
              <DropdownMenuItem disabled={isAiEditing} onClick={() => openModal('import')}>
                <Upload className="mr-2 h-4 w-4" />
                {t('import')}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => openModal('share')}>
                <Share2 className="mr-2 h-4 w-4" />
                {t('share')}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => openModal('jd-analysis')}>
                <FileSearch className="mr-2 h-4 w-4" />
                {t('jdAnalysis')}
              </DropdownMenuItem>
              <DropdownMenuItem disabled={isAiEditing} onClick={() => openModal('translate')}>
                <Languages className="mr-2 h-4 w-4" />
                {t('translate')}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => openModal('cover-letter')}>
                <FileText className="mr-2 h-4 w-4" />
                {t('coverLetter')}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => openModal('grammar-check')}>
                <SpellCheck className="mr-2 h-4 w-4" />
                {t('grammarCheck')}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => openModal('settings')}>
                <Settings className="mr-2 h-4 w-4" />
                {t('settings')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Primary: theme toggle — always visible */}
        <Separator orientation="vertical" className="hidden h-6 sm:block" />
        <Button
          data-tour="theme"
          variant={showThemeEditor ? 'secondary' : 'ghost'}
          size="icon"
          onClick={toggleThemeEditor}
          disabled={isAiEditing}
          className="h-8 w-8 cursor-pointer sm:w-auto sm:px-3"
          title={t('theme')}
        >
          <Palette className="h-4 w-4" />
          <span className="ml-1 hidden text-xs sm:inline">{t('theme')}</span>
        </Button>
        <Separator orientation="vertical" className="hidden h-6 sm:block" />
        <LocaleSwitcher />
      </div>
    </div>
    <AIHistoryPanel
      open={historyOpen}
      onOpenChange={setHistoryOpen}
      resumeId={resumeId}
      userId={userId}
    />
    </>
  );
}
