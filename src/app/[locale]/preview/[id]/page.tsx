'use client';

import { use, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ArrowLeft, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useRouter } from '@/i18n/routing';
import { ResumePreview } from '@/components/preview/resume-preview';
import { PreviewErrorBoundary } from '@/components/preview/preview-error-boundary';
import { ExportDialog } from '@/components/editor/export-dialog';
import { useFingerprint } from '@/hooks/use-fingerprint';
import { normalizeSections } from '@/lib/resume/normalize-content';
import { parseThemeConfig } from '@/lib/resume/parse-theme-config';
import type { Resume } from '@/types/resume';

export default function PreviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const t = useTranslations();
  const [resume, setResume] = useState<Resume | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const { fingerprint, isLoading: fingerprintLoading } = useFingerprint();
  const [exportOpen, setExportOpen] = useState(false);

  useEffect(() => {
    if (fingerprintLoading) return;
    const controller = new AbortController();
    fetch(`/api/resume/${id}`, {
      headers: fingerprint ? { 'x-fingerprint': fingerprint } : {},
      signal: controller.signal,
    })
      .then((res) => {
        if (!res.ok) throw new Error(`Resume loading failed (${res.status})`);
        return res.json();
      })
      // Heal AI-corrupted content so a bad shape can't crash the preview (issue #87).
      .then((data: Resume) => {
        if (!controller.signal.aborted) {
          setLoadError(null);
          setResume({
            ...data,
            themeConfig: (parseThemeConfig(data.themeConfig) ?? {}) as Resume['themeConfig'],
            sections: normalizeSections(data.sections || []),
          });
        }
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          console.error(error);
          setLoadError(id);
        }
      });
    return () => controller.abort();
  }, [id, loadAttempt, fingerprint, fingerprintLoading]);

  if (loadError === id) return (
    <div className="flex h-dvh flex-col items-center justify-center gap-4 bg-background p-4">
      <p role="alert" className="text-sm text-muted-foreground">{t('preview.loadError')}</p>
      <div className="flex gap-2">
        <Button variant="outline" onClick={() => router.push('/dashboard')}>{t('common.back')}</Button>
        <Button onClick={() => { setLoadError(null); setLoadAttempt(value => value + 1); }}>{t('preview.retry')}</Button>
      </div>
    </div>
  );

  if (!resume || resume.id !== id) {
    return <div className="flex h-screen items-center justify-center text-zinc-400">{t('common.loading')}</div>;
  }

  return (
    <div className="min-h-screen bg-zinc-100">
      <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-white px-4 py-2">
        <Button variant="ghost" size="sm" onClick={() => router.push(`/editor/${id}`)} className="cursor-pointer gap-1">
          <ArrowLeft className="h-4 w-4" />
          {t('common.back')}
        </Button>
        <Button
          size="sm"
          onClick={() => setExportOpen(true)}
          className="cursor-pointer gap-1 bg-brand hover:bg-brand-hover"
        >
          <Download className="h-4 w-4" />
          {t('editor.toolbar.export')}
        </Button>
      </div>
      <div className="p-8 pb-20 sm:pb-8">
        <PreviewErrorBoundary
          resetKey={resume.sections}
          fallback={
            <div className="p-8 text-center text-sm text-zinc-500">{t('editor.toolbar.previewError')}</div>
          }
        >
          <ResumePreview resume={resume} />
        </PreviewErrorBoundary>
      </div>
      {/* Mobile bottom action bar */}
      <div className="fixed inset-x-0 bottom-0 z-30 flex items-center gap-2 border-t bg-white p-3 dark:bg-background sm:hidden">
        <Button variant="outline" className="flex-1 cursor-pointer" onClick={() => router.push(`/editor/${id}`)}>
          <ArrowLeft className="mr-1.5 h-4 w-4" />
          {t('common.back')}
        </Button>
        <Button
          className="flex-1 cursor-pointer bg-brand hover:bg-brand-hover"
          onClick={() => setExportOpen(true)}
        >
          <Download className="mr-1.5 h-4 w-4" />
          {t('editor.toolbar.export')}
        </Button>
      </div>
      <ExportDialog key={resume.id} open={exportOpen} onOpenChange={setExportOpen} resume={resume} includeTimestamp={false} />
    </div>
  );
}
