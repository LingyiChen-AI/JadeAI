'use client';

import { useEffect, useState, type ComponentType } from 'react';
import { Loader2 } from 'lucide-react';
import Image from 'next/image';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { TemplateVersionDetailSchema } from '@/lib/templates/schema';
import { buildTemplatePreviewResume } from '@/lib/templates/template-preview-fixture';
import type { Resume } from '@/types/resume';
import type { DeclarativeTemplateManifest, TemplateCatalogItem, TemplateVersionDetail } from '@/types/template';

import { loadLegacyTemplateAdapter } from './legacy-template-registry';

type PreviewDiscriminant = { rendererKind: string; manifest: unknown };

export function templatePreviewDescription(name: string, template: string): string {
  return template.replace('{name}', name);
}

export function templatePreviewBranch(detail: PreviewDiscriminant): 'legacy-react' | 'declarative-v1' | 'declarative-v2' {
  if (detail.rendererKind === 'legacy-react') {
    if (detail.manifest !== null) throw new Error('invalid_legacy_manifest');
    return 'legacy-react';
  }
  if (detail.rendererKind === 'declarative-v1' || detail.rendererKind === 'declarative-v2') {
    if (!detail.manifest || typeof detail.manifest !== 'object') throw new Error('invalid_declarative_manifest');
    return detail.rendererKind;
  }
  throw new Error('unknown_template_renderer');
}

type Props = {
  item: TemplateCatalogItem | null;
  locale: string;
  creating: boolean;
  labels: { loading: string; error: string; retry: string; useTemplate: string; creating: string; copyTemplate: string; description: string };
  onClose(): void;
  onUse(): void;
  onCopy?(manifest: DeclarativeTemplateManifest, name: string): void;
};

export const TEMPLATE_PREVIEW_FOOTER_CLASSES = 'shrink-0 border-t bg-background p-3';

export function TemplatePreviewFooter({
  creating,
  labels,
  onUse,
  onCopy,
}: {
  creating: boolean;
  labels: Pick<Props['labels'], 'useTemplate' | 'creating' | 'copyTemplate'>;
  onUse(): void;
  onCopy?(): void;
}) {
  return (
    <div className={`${TEMPLATE_PREVIEW_FOOTER_CLASSES} grid gap-2 ${onCopy ? 'grid-cols-2' : 'grid-cols-1'}`}>
      {onCopy && <Button variant="outline" disabled={creating} onClick={onCopy}>{labels.copyTemplate}</Button>}
      <Button className="w-full" disabled={creating} onClick={onUse}>
        {creating ? labels.creating : labels.useTemplate}
      </Button>
    </div>
  );
}

function assetUrl(path: string): string {
  return path.startsWith('/') ? path : `/${path}`;
}

export function TemplatePreviewDialog({ item, locale, creating, labels, onClose, onUse, onCopy }: Props) {
  const [detail, setDetail] = useState<TemplateVersionDetail | null>(null);
  const [LegacyRenderer, setLegacyRenderer] = useState<ComponentType<{ resume: Resume }> | null>(null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [attempt, setAttempt] = useState(0);
  const itemName = item ? (locale.startsWith('zh') ? item.nameZh : item.nameEn) : '';

  useEffect(() => {
    if (!item) {
      setDetail(null);
      setLegacyRenderer(null);
      setStatus('idle');
      return;
    }

    const controller = new AbortController();
    setStatus('loading');
    setDetail(null);
    setLegacyRenderer(null);
    void (async () => {
      try {
        const response = await fetch(`/api/templates/${encodeURIComponent(item.slug)}`, { signal: controller.signal });
        if (!response.ok) throw new Error('template_preview_request_failed');
        const parsed = TemplateVersionDetailSchema.parse(await response.json());
        const branch = templatePreviewBranch(parsed);
        if (branch === 'legacy-react') {
          setLegacyRenderer(() => null);
          const adapter = await loadLegacyTemplateAdapter(parsed.slug);
          if (controller.signal.aborted) return;
          setLegacyRenderer(() => adapter);
        }
        if (controller.signal.aborted) return;
        setDetail(parsed);
        setStatus('ready');
      } catch {
        if (!controller.signal.aborted) setStatus('error');
      }
    })();
    return () => controller.abort();
  }, [attempt, item]);

  return (
    <Dialog open={item !== null} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="flex h-[min(90vh,800px)] w-[calc(100vw-2rem)] max-w-[900px] flex-col gap-0 overflow-hidden p-0 sm:max-w-[900px]">
        <DialogHeader className="shrink-0 border-b px-5 py-4">
          <DialogTitle>{itemName}</DialogTitle>
          <DialogDescription className="sr-only">
            {templatePreviewDescription(itemName, labels.description)}
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto bg-zinc-100 p-4 dark:bg-zinc-900">
          {status === 'loading' && <div className="flex h-full items-center justify-center gap-2 text-sm text-zinc-500"><Loader2 className="animate-spin" />{labels.loading}</div>}
          {status === 'error' && <div className="flex h-full flex-col items-center justify-center gap-3 text-sm"><p>{labels.error}</p><Button variant="outline" onClick={() => setAttempt((value) => value + 1)}>{labels.retry}</Button></div>}
          {status === 'ready' && (detail?.rendererKind === 'declarative-v1' || detail?.rendererKind === 'declarative-v2') && (
            <Image data-renderer-kind={detail.rendererKind} src={assetUrl(detail.fullPreviewPath)} alt="" width="1200" height="900" loading="lazy" unoptimized className="mx-auto h-auto w-full max-w-[794px] bg-white object-contain shadow-sm" />
          )}
          {status === 'ready' && detail?.rendererKind === 'legacy-react' && LegacyRenderer && (
            <div data-renderer-kind="legacy-react" className="mx-auto w-full max-w-[794px] bg-white p-8 shadow-sm">
              <LegacyRenderer resume={buildTemplatePreviewResume(detail.slug, locale)} />
            </div>
          )}
        </div>
        <TemplatePreviewFooter
          creating={creating}
          labels={labels}
          onUse={onUse}
          {...((detail?.rendererKind === 'declarative-v1' || detail?.rendererKind === 'declarative-v2') && onCopy
            ? { onCopy: () => onCopy(detail.manifest, itemName) }
            : {})}
        />
      </DialogContent>
    </Dialog>
  );
}
