'use client';

import { use, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';
import { useEditor } from '@/hooks/use-editor';
import { useFingerprint } from '@/hooks/use-fingerprint';
import { useIsMobile } from '@/hooks/use-media-query';
import { EditorToolbar } from '@/components/editor/editor-toolbar';
import { EditorSidebar } from '@/components/editor/editor-sidebar';
import { EditorCanvas } from '@/components/editor/editor-canvas';
import { ThemeEditor } from '@/components/editor/theme-editor';
import { EditorPreviewPanel } from '@/components/editor/editor-preview-panel';
import { EditorMobileTabBar } from '@/components/editor/editor-mobile-tab-bar';
import { AIChatBubble } from '@/components/ai/ai-chat-bubble';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { List } from "lucide-react";
import { SettingsDialog } from '@/components/settings/settings-dialog';
import { JdAnalysisDialog } from '@/components/editor/jd-analysis-dialog';
import { TranslateDialog } from '@/components/editor/translate-dialog';
import { ExportDialog } from '@/components/editor/export-dialog';
import { ImportDialog } from '@/components/editor/import-dialog';
import { ShareDialog } from '@/components/editor/share-dialog';
import { CoverLetterDialog } from '@/components/editor/cover-letter-dialog';
import { GrammarCheckDialog } from '@/components/editor/grammar-check-dialog';
import { TourOverlay, type TourStepConfig } from '@/components/tour/tour-overlay';
import { getSectionsFingerprint, useEditorStore } from '@/stores/editor-store';
import { useUIStore } from '@/stores/ui-store';
import { useSettingsStore } from '@/stores/settings-store';
import { useTourStore, hasCompletedTour } from '@/stores/tour-store';
import { useResumeStore } from '@/stores/resume-store';
import { takePendingOptimizeMessage } from '@/lib/pending-optimize';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

const EDITOR_TOUR_STEPS: TourStepConfig[] = [
  { target: 'sidebar', placement: 'right', i18nKey: 'sidebar' },
  { target: 'preview', placement: 'left', i18nKey: 'preview' },
  { target: 'ai-toolbar', placement: 'bottom', i18nKey: 'aiChat' },
  { target: 'export', placement: 'bottom', i18nKey: 'export' },
  { target: 'theme', placement: 'bottom', i18nKey: 'theme' },
];

export default function EditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const toolbarT = useTranslations('editor.toolbar');
  const { isLoading: fpLoading } = useFingerprint();
  const { resume, sections, updateSection, addSection, removeSection, reorderSections, serverHead } = useEditor(id);
  const isMobile = useIsMobile();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const {
    showThemeEditor, mobileActiveTab, setPendingAiMessage, setShowAiChat,
    loadAIHistory, closeAIHistoryScope,
  } = useEditorStore();
  const { activeModal, openModal, closeModal } = useUIStore();
  const { hydrate, _hydrated } = useSettingsStore();
  const save = useResumeStore((s) => s.save);
  const isAiEditing = useResumeStore((s) => s.aiEditingResumeId === id);
  const startTour = useTourStore((s) => s.startTour);

  useEffect(() => {
    if (!_hydrated) hydrate();
  }, [_hydrated, hydrate]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        if (!isAiEditing) void save();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isAiEditing, save]);

  // Catch unhandled promise rejections (e.g. "Failed to find Server Action")
  // to prevent page crash — show toast instead
  useEffect(() => {
    const handler = (e: PromiseRejectionEvent) => {
      const msg = e.reason?.message || String(e.reason || '');
      if (msg.includes('Server Action') || msg.includes('AI_RetryError') || msg.includes('AI_APICallError')) {
        e.preventDefault();
        toast.error('操作失败', {
          description: msg.includes('Server Action')
            ? '页面版本已更新，请刷新页面重试'
            : 'AI 服务暂时不可用，请稍后重试',
        });
      }
    };
    window.addEventListener('unhandledrejection', handler);
    return () => window.removeEventListener('unhandledrejection', handler);
  }, []);

  useEffect(() => {
    if (!resume) return;
    if (hasCompletedTour('editor')) return;
    if (window.innerWidth < 768) return;
    const timer = setTimeout(() => startTour('editor', EDITOR_TOUR_STEPS.length), 1000);
    return () => clearTimeout(timer);
  }, [resume, startTour]);

  useEffect(() => {
    if (!serverHead || serverHead.resumeId !== id) return;
    void loadAIHistory(serverHead.resumeId, serverHead.userId, {
      revision: serverHead.revision,
      contentFingerprint: getSectionsFingerprint(serverHead.sections),
    });
    return () => closeAIHistoryScope(serverHead.resumeId, serverHead.userId);
  }, [id, serverHead, loadAIHistory, closeAIHistoryScope]);

  // Consume a copy-optimize message handed off via pending-optimize.ts (gated
  // on resume.id === id so it runs after useEditor's cleanup for the old id).
  useEffect(() => {
    if (!resume || resume.id !== id) return;
    const message = takePendingOptimizeMessage(id);
    if (message) {
      setPendingAiMessage(message);
      setShowAiChat(true);
    }
  }, [resume, id, setPendingAiMessage, setShowAiChat]);

  if (fpLoading || !resume) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="space-y-4 w-64">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col">
      <EditorToolbar resumeId={id} userId={resume.userId} />
      {isAiEditing && (
        <div role="status" className="border-b border-amber-200 bg-amber-50 px-3 py-1.5 text-center text-xs font-medium text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
          {toolbarT('aiEditing')}
        </div>
      )}
      <EditorMobileTabBar />

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar: hidden on mobile, shown on desktop */}
        <div inert={isAiEditing} aria-disabled={isAiEditing} className={cn('hidden md:block', isAiEditing && 'pointer-events-none opacity-70')}>
          <EditorSidebar
            sections={sections}
            onAddSection={addSection}
            onReorderSections={reorderSections}
          />
        </div>

        {/* Canvas: always mounted, hidden on mobile when preview tab active */}
        <div inert={isAiEditing} aria-disabled={isAiEditing} className={cn(
          "min-w-0 flex-1 overflow-hidden md:flex-[4]",
          isAiEditing && "pointer-events-none opacity-70",
          isMobile && mobileActiveTab !== "edit" && "hidden"
        )}>
          <EditorCanvas
            sections={sections}
            onUpdateSection={updateSection}
            onRemoveSection={removeSection}
            onReorderSections={reorderSections}
          />
        </div>

        {showThemeEditor && (
          <div inert={isAiEditing} aria-disabled={isAiEditing} className={cn(isAiEditing && 'pointer-events-none opacity-70')}>
            <ThemeEditor />
          </div>
        )}

        {/* Preview: always mounted, hidden on mobile when edit tab active */}
        <div className={cn(
          "min-w-0 flex-1 overflow-hidden md:flex-[6]",
          isMobile && mobileActiveTab !== "preview" && "hidden"
        )}>
          <EditorPreviewPanel />
        </div>
      </div>

      {/* Mobile sidebar FAB */}
      <button
        onClick={() => setSidebarOpen(true)}
        disabled={isAiEditing}
        className="fixed bottom-20 left-4 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-brand text-white shadow-lg transition-transform hover:scale-105 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 md:hidden"
        aria-label="Open sections"
      >
        <List className="h-5 w-5" />
      </button>

      {/* Mobile sidebar Sheet */}
      <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
        <SheetContent side="left" className="w-72 p-0">
          <SheetHeader className="border-b px-4 py-3">
            <SheetTitle className="text-sm font-semibold">Sections</SheetTitle>
          </SheetHeader>
          <EditorSidebar
            sections={sections}
            onAddSection={(s) => { addSection(s); setSidebarOpen(false); }}
            onReorderSections={reorderSections}
          />
        </SheetContent>
      </Sheet>

      <AIChatBubble resumeId={id} />
      <SettingsDialog />
      <JdAnalysisDialog
        open={activeModal === 'jd-analysis'}
        onOpenChange={(open) => open ? openModal('jd-analysis') : closeModal()}
        resumeId={id}
      />
      <TranslateDialog
        open={activeModal === 'translate'}
        onOpenChange={(open) => open ? openModal('translate') : closeModal()}
        resumeId={id}
      />
      <ExportDialog
        open={activeModal === 'export'}
        onOpenChange={(open) => open ? openModal('export') : closeModal()}
        resumeId={id}
      />
      <ImportDialog
        open={activeModal === 'import'}
        onOpenChange={(open) => open ? openModal('import') : closeModal()}
        resumeId={id}
      />
      <ShareDialog
        open={activeModal === 'share'}
        onOpenChange={(open) => open ? openModal('share') : closeModal()}
        resumeId={id}
      />
      <CoverLetterDialog
        open={activeModal === 'cover-letter'}
        onOpenChange={(open) => open ? openModal('cover-letter') : closeModal()}
        resumeId={id}
      />
      <GrammarCheckDialog
        open={activeModal === 'grammar-check'}
        onOpenChange={(open) => open ? openModal('grammar-check') : closeModal()}
        resumeId={id}
      />
      <TourOverlay tourId="editor" steps={EDITOR_TOUR_STEPS} />
    </div>
  );
}
