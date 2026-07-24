'use client';

import { useMemo, useState } from 'react';
import { ZoomIn, ZoomOut } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { ResumePreview } from '@/components/preview/resume-preview';
import { PreviewErrorBoundary } from '@/components/preview/preview-error-boundary';
import { useResumeStore } from '@/stores/resume-store';
import { buildEditorPreviewResume } from '@/lib/templates/editor-preview-resume';
import { buildTemplatePreviewResume } from '@/lib/templates/template-preview-fixture';
import { useIsMobile } from "@/hooks/use-media-query";
import type { Resume } from '@/types/resume';

// A4 width in px (at 96 dpi)
const A4_WIDTH = 794;

export function EditorPreviewPanel() {
  const t = useTranslations('editor.toolbar');
  const { currentResume, sections } = useResumeStore();
  const [zoom, setZoom] = useState(80);
  const isMobile = useIsMobile();

  const liveResume = useMemo<Resume | null>(() => {
    if (!currentResume) return null;
    return { ...currentResume, sections };
  }, [currentResume, sections]);

  const fixture = useMemo(
    () => currentResume ? buildTemplatePreviewResume(currentResume.template, currentResume.language) : null,
    [currentResume],
  );
  const preview = useMemo(
    () => liveResume && fixture ? buildEditorPreviewResume(liveResume, fixture) : null,
    [fixture, liveResume],
  );

  if (!preview) return null;

  const scale = zoom / 100;

  return (
    <div data-tour="preview" className="flex h-full min-w-0 flex-col border-l bg-zinc-50 dark:bg-zinc-900 dark:border-zinc-800">
      {/* Header */}
      <div className="hidden shrink-0 items-center justify-between border-b bg-white px-4 py-2 md:flex dark:bg-background dark:border-zinc-800">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-zinc-500">{t('preview')}</span>
          {preview.placeholderPaths.size > 0 && <span className="text-xs text-zinc-400">{t('samplePreview')}</span>}
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 cursor-pointer p-0"
            onClick={() => setZoom((z) => Math.max(30, z - 10))}
            disabled={zoom <= 30}
          >
            <ZoomOut className="h-3.5 w-3.5" />
          </Button>
          <span className="w-10 text-center text-xs text-zinc-500">{zoom}%</span>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 cursor-pointer p-0"
            onClick={() => setZoom((z) => Math.min(150, z + 10))}
            disabled={zoom >= 150}
          >
            <ZoomIn className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Preview body */}
      <div className="min-h-0 flex-1 overflow-auto">
        <div className="flex justify-center p-2 md:p-4">
          <div
            className="bg-white shadow-md"
            style={{
              width: isMobile ? "100%" : A4_WIDTH,
              maxWidth: A4_WIDTH,
              zoom: isMobile ? undefined : scale,
            }}
          >
            <PreviewErrorBoundary
              resetKey={preview.resume.sections}
              fallback={
                <div className="p-8 text-center text-sm text-zinc-500">{t('previewError')}</div>
              }
            >
              <ResumePreview resume={preview.resume} placeholderPaths={preview.placeholderPaths} />
            </PreviewErrorBoundary>
          </div>
        </div>
      </div>
    </div>
  );
}
