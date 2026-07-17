'use client';

import { useState } from 'react';
import Image from 'next/image';
import { Loader2, RefreshCw } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';

import { useRuntimeConfig } from '@/components/providers/runtime-config-provider';
import { TemplateThumbnail } from '@/components/dashboard/template-thumbnail';
import { Button } from '@/components/ui/button';
import { useFingerprint } from '@/hooks/use-fingerprint';
import { useAuth } from '@/hooks/use-auth';
import { useLocalTemplates } from '@/hooks/use-local-templates';
import {
  shouldLoadTemplateCatalog,
  useTemplateCatalog,
  type TemplateCatalogView,
} from '@/hooks/use-template-catalog';
import { TEMPLATES } from '@/lib/constants';
import { cn } from '@/lib/utils';
import type { ClientTemplateBindingChoice } from '@/lib/templates/apply-template-binding.server';

type SelectorView = TemplateCatalogView | 'legacy';

export type LocalTemplateChoice = {
  key: string;
  label: string;
  manifest: unknown;
};

type TemplateSelectorProps = {
  value: ClientTemplateBindingChoice | null;
  onChange(choice: ClientTemplateBindingChoice): void;
  localTemplates?: readonly LocalTemplateChoice[];
  disabled?: boolean;
  className?: string;
};

export function TemplateSelector({
  value,
  onChange,
  localTemplates,
  disabled = false,
  className,
}: TemplateSelectorProps) {
  const t = useTranslations('templates');
  const locale = useLocale();
  const { authEnabled } = useRuntimeConfig();
  const { user } = useAuth();
  const { fingerprint, isLoading: fingerprintLoading } = useFingerprint();
  const localLibrary = useLocalTemplates(user?.id);
  const availableLocalTemplates = localTemplates ?? localLibrary.records.map((record) => ({
    key: record.localId,
    label: record.name,
    manifest: record.manifest,
  }));
  const [view, setView] = useState<SelectorView>('public');
  const catalogView: TemplateCatalogView = view === 'legacy' ? 'local' : view;
  const catalog = useTemplateCatalog({
    filters: { view: catalogView, tags: [] },
    fingerprint,
    privateStateEnabled: authEnabled || !fingerprintLoading,
    enabled: view !== 'legacy' && shouldLoadTemplateCatalog(true, {
      view: catalogView,
      authEnabled,
      fingerprintLoading,
    }),
  });

  return (
    <div className={cn('min-w-0 space-y-3', className)}>
      <div role="tablist" className="grid h-9 w-full grid-cols-5 rounded-md bg-zinc-100 p-1 dark:bg-zinc-900">
        {(['public', 'favorites', 'recent', 'local', 'legacy'] as const).map((candidate) => (
          <button
            key={candidate}
            type="button"
            role="tab"
            aria-selected={view === candidate}
            className={cn(
              'min-w-0 truncate rounded px-1 text-xs',
              view === candidate && 'bg-white font-medium shadow-sm dark:bg-zinc-800',
            )}
            onClick={() => setView(candidate)}
          >
            {t(`views.${candidate}`)}
          </button>
        ))}
      </div>

      {view !== 'local' && view !== 'legacy' && catalog.isLoading && (
        <div role="status" className="flex h-24 items-center justify-center">
          <Loader2 className="size-5 animate-spin text-zinc-500" />
        </div>
      )}

      {view !== 'local' && view !== 'legacy' && !catalog.isLoading && catalog.status === 'error' && (
        <div className="flex h-24 items-center justify-center">
          <Button type="button" variant="outline" size="sm" onClick={() => void catalog.reload()}>
            <RefreshCw />
            {t('states.retry')}
          </Button>
        </div>
      )}

      {view !== 'local' && view !== 'legacy' && !catalog.isLoading && catalog.status !== 'error' && (
        <div className="grid max-h-72 grid-cols-2 gap-2 overflow-y-auto pr-1 sm:grid-cols-3">
          {catalog.items.map((item) => {
            const selected = value?.kind === 'public'
              && value.templateSlug === item.slug
              && value.version === item.stableVersion;
            return (
              <button
                key={`${item.slug}@${item.stableVersion}`}
                type="button"
                disabled={disabled}
                aria-pressed={selected}
                aria-label={locale.startsWith('zh') ? item.nameZh : item.nameEn}
                className={cn(
                  'min-w-0 overflow-hidden rounded-md border bg-white text-left disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-950',
                  selected ? 'border-brand ring-1 ring-brand' : 'border-zinc-200 dark:border-zinc-800',
                )}
                onClick={() => onChange({
                  kind: 'public',
                  templateSlug: item.slug,
                  version: item.stableVersion,
                })}
              >
                <div className="aspect-[4/3] w-full bg-zinc-100 dark:bg-zinc-900">
                  <Image
                    src={item.thumbnailPath.startsWith('/') ? item.thumbnailPath : `/${item.thumbnailPath}`}
                    alt=""
                    width={240}
                    height={180}
                    unoptimized
                    className="h-full w-full object-cover"
                  />
                </div>
                <span className="block truncate px-2 py-1.5 text-xs font-medium">
                  {locale.startsWith('zh') ? item.nameZh : item.nameEn}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {view === 'local' && (
        <div className="grid max-h-72 grid-cols-2 gap-2 overflow-y-auto pr-1 sm:grid-cols-3">
          {availableLocalTemplates.map((template) => (
            <button
              key={template.key}
              type="button"
              disabled={disabled}
              aria-label={template.label}
              className="h-20 min-w-0 rounded-md border border-zinc-200 px-3 text-left text-xs font-medium disabled:opacity-50 dark:border-zinc-800"
              onClick={() => onChange({ kind: 'local-snapshot', manifest: template.manifest })}
            >
              <span className="line-clamp-2">{template.label}</span>
            </button>
          ))}
        </div>
      )}

      {view === 'legacy' && (
        <div className="grid max-h-72 grid-cols-3 gap-2 overflow-y-auto pr-1 sm:grid-cols-5">
          {TEMPLATES.map((template) => {
            const selected = value?.kind === 'legacy' && value.templateSlug === template;
            return (
              <button
                key={template}
                type="button"
                disabled={disabled}
                aria-label={template}
                aria-pressed={selected}
                className={cn(
                  'min-w-0 overflow-hidden rounded-md border disabled:opacity-50',
                  selected ? 'border-brand ring-1 ring-brand' : 'border-zinc-200 dark:border-zinc-800',
                )}
                onClick={() => onChange({ kind: 'legacy', templateSlug: template })}
              >
                <div className="flex h-16 items-center justify-center bg-zinc-50 dark:bg-zinc-900">
                  <TemplateThumbnail template={template} className="h-14 w-10 shadow-sm" />
                </div>
                <span className="block truncate px-1 py-1 text-[10px]">{template}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
