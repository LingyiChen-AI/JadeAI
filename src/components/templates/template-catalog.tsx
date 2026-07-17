'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ChevronLeft, ChevronRight, Loader2, RefreshCw } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { toast } from 'sonner';

import { useRuntimeConfig } from '@/components/providers/runtime-config-provider';
import { TourOverlay, type TourStepConfig } from '@/components/tour/tour-overlay';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useFingerprint } from '@/hooks/use-fingerprint';
import { useAuth } from '@/hooks/use-auth';
import { useLocalTemplates } from '@/hooks/use-local-templates';
import { useResume } from '@/hooks/use-resume';
import {
  parseTemplateCatalogUrl,
  shouldLoadTemplateCatalog,
  updateTemplateCatalogFilters,
  useTemplateCatalog,
  type TemplateCatalogFilters,
  type TemplateCatalogView,
} from '@/hooks/use-template-catalog';
import { Link, useRouter } from '@/i18n/routing';
import { hasCompletedTour, useTourStore } from '@/stores/tour-store';

import { TemplateCard, type TemplateCardLabels } from './template-card';
import {
  buildTemplateCatalogHistoryUrl,
  createInitialTemplateCatalogFilters,
  settleTemplateFavoriteMutation,
  shouldShowTemplateCatalogSkeleton,
  templateCatalogHistoryMode,
  templateCatalogStateMessageKey,
} from './template-catalog-state';
import { TemplateFilters } from './template-filters';
import { TemplatePreviewDialog } from './template-preview-dialog';
import { LocalTemplateManager } from './local-template-manager';
import { createLocalTemplateThumbnail } from '@/lib/templates/local-template-thumbnail';
import { TemplateManifestV1Schema } from '@/lib/templates/schema';
import type { TemplateManifestV1 } from '@/types/template';

const TOUR_STEPS: TourStepConfig[] = [
  { target: 'tpl-preview', placement: 'bottom', i18nKey: 'tplPreview' },
  { target: 'tpl-use', placement: 'bottom', i18nKey: 'tplUse' },
];

function SkeletonGrid() {
  return (
    <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 6 }, (_, index) => (
        <div key={index} className="overflow-hidden rounded-lg border"><Skeleton className="aspect-[4/3] w-full rounded-none" /><div className="space-y-3 p-4"><Skeleton className="h-4 w-2/3" /><Skeleton className="h-3 w-1/2" /><Skeleton className="h-8 w-full" /></div></div>
      ))}
    </div>
  );
}

export function TemplateCatalog() {
  const t = useTranslations('templates');
  const locale = useLocale();
  const router = useRouter();
  const { authEnabled } = useRuntimeConfig();
  const { user } = useAuth();
  const { fingerprint, isLoading: fingerprintLoading } = useFingerprint();
  const localLibrary = useLocalTemplates(user?.id);
  const { createResume } = useResume();
  const [filters, setFilters] = useState<TemplateCatalogFilters>(createInitialTemplateCatalogFilters);
  const [searchValue, setSearchValue] = useState(filters.q ?? '');
  const [previewSlug, setPreviewSlug] = useState<string | null>(null);
  const [creatingSlug, setCreatingSlug] = useState<string | null>(null);
  const [urlReady, setUrlReady] = useState(false);
  const searchInputRef = useRef(false);
  const startTour = useTourStore((state) => state.startTour);
  const catalog = useTemplateCatalog({
    filters,
    fingerprint,
    searchInput: searchInputRef.current,
    privateStateEnabled: authEnabled || !fingerprintLoading,
    enabled: shouldLoadTemplateCatalog(urlReady, {
      view: filters.view,
      authEnabled,
      fingerprintLoading,
    }),
  });
  const previewItem = catalog.items.find((item) => item.slug === previewSlug) ?? null;

  useEffect(() => {
    const syncLocation = () => {
      searchInputRef.current = false;
      const next = parseTemplateCatalogUrl(new URLSearchParams(window.location.search));
      setFilters(next);
      setSearchValue(next.q ?? '');
      setUrlReady(true);
    };
    syncLocation();
    window.addEventListener('popstate', syncLocation);
    return () => window.removeEventListener('popstate', syncLocation);
  }, []);

  useEffect(() => {
    if (catalog.status !== 'ready' || catalog.items.length === 0 || hasCompletedTour('templates') || window.innerWidth < 768) return;
    const timer = window.setTimeout(() => startTour('templates', TOUR_STEPS.length), 800);
    return () => window.clearTimeout(timer);
  }, [catalog.items.length, catalog.status, startTour]);

  const commitFilters = (
    patch: Partial<TemplateCatalogFilters>,
    mode = templateCatalogHistoryMode(patch),
    searchInput = false,
  ) => {
    searchInputRef.current = searchInput;
    const next = updateTemplateCatalogFilters(filters, patch);
    setFilters(next);
    const url = buildTemplateCatalogHistoryUrl(window.location.pathname, next);
    window.history[mode === 'replace' ? 'replaceState' : 'pushState']({}, '', url);
  };

  const handleSearch = (value: string) => {
    setSearchValue(value);
    commitFilters({ q: value || undefined }, 'replace', true);
  };

  const handleUse = async (slug: string) => {
    const item = catalog.items.find((candidate) => candidate.slug === slug);
    if (!item) return;
    setCreatingSlug(slug);
    try {
      const resume = await createResume({
        binding: { kind: 'public', templateSlug: item.slug, version: item.stableVersion },
      });
      if (resume) router.push(`/editor/${resume.id}`);
    } finally {
      setCreatingSlug(null);
    }
  };

  const handleUseLocal = async (manifest: TemplateManifestV1) => {
    const resume = await createResume({ binding: { kind: 'local-snapshot', manifest } });
    if (resume) router.push(`/editor/${resume.id}`);
  };

  const handleCopyPublic = async (manifest: unknown, name: string) => {
    if (!user) return;
    try {
      const parsed = TemplateManifestV1Schema.parse(manifest);
      const timestamp = new Date().toISOString();
      await localLibrary.save({
        userId: user.id,
        localId: crypto.randomUUID(),
        name,
        category: previewItem?.category.slug ?? 'general',
        localTags: previewItem?.tags.map((tag) => tag.slug) ?? [],
        sourceDescription: previewItem ? `JadeAI public template: ${previewItem.slug}` : 'JadeAI public template',
        templateVersion: previewItem?.stableVersion ?? '1.0.0',
        manifest: parsed,
        thumbnail: await createLocalTemplateThumbnail(parsed),
        createdAt: timestamp,
        updatedAt: timestamp,
      });
      toast.success(t('localManager.copySuccess'));
    } catch {
      toast.error(t('localManager.copyError'));
    }
  };

  const messageKey = templateCatalogStateMessageKey(catalog.status, filters.view);
  const showSkeleton = shouldShowTemplateCatalogSkeleton(catalog.status, catalog.isLoading);
  const cardLabels: TemplateCardLabels = {
    preview: t('preview'), useTemplate: t('useTemplate'), creating: t('creating'),
    favorite: t('favorite'), unfavorite: t('unfavorite'), ats: t('capabilities.ats'),
    avatar: t('capabilities.avatar'), paper: t('capabilities.paper'), docx: t('capabilities.docx'),
  };
  const filterLabels = {
    searchPlaceholder: t('filters.searchPlaceholder'), filters: t('filters.title'),
    filterDescription: t('filters.description'), category: t('filters.category'),
    allCategories: t('filters.allCategories'), tags: t('filters.tags'), ats: t('filters.ats'),
    avatar: t('filters.avatar'), docx: t('filters.docx'), paper: t('filters.paper'),
    anyPaper: t('filters.anyPaper'), newest: t('sort.newest'), popular: t('sort.popular'), name: t('sort.name'),
  };

  return (
    <div className="min-w-0 overflow-x-hidden">
      <header className="mb-6">
        <Link href="/dashboard" className="mb-4 inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-950 dark:hover:text-zinc-50"><ArrowLeft className="size-4" />{t('back')}</Link>
        <h1 className="text-2xl font-bold">{t('title')}</h1>
        <p className="mt-1 text-sm text-zinc-500">{t('subtitle')}</p>
      </header>

      <Tabs value={filters.view} onValueChange={(view) => commitFilters({ view: view as TemplateCatalogView })} className="min-w-0">
        <TabsList className="grid h-auto w-full grid-cols-4 overflow-hidden">
          {(['public', 'local', 'favorites', 'recent'] as const).map((view) => <TabsTrigger key={view} value={view} className="min-w-0 px-1 text-xs sm:text-sm">{t(`views.${view}`)}</TabsTrigger>)}
        </TabsList>
      </Tabs>

      {filters.view === 'local' ? (
        <div className="mt-5 min-w-0">
          <LocalTemplateManager userId={user?.id} onApply={handleUseLocal} />
        </div>
      ) : <div className="mt-5 grid min-w-0 gap-4 md:grid-cols-[14rem_minmax(0,1fr)]">
        <TemplateFilters filters={filters} facets={catalog.facets} locale={locale} searchValue={searchValue} labels={filterLabels} onSearch={handleSearch} onChange={commitFilters} />

        <main className="min-w-0 md:col-start-2">
          {showSkeleton && <SkeletonGrid />}
          {messageKey && (
            <div className="flex min-h-64 flex-col items-center justify-center gap-3 rounded-lg border border-dashed px-6 text-center text-sm text-zinc-500">
              <p>{t(`states.${messageKey}`)}</p>
              {catalog.status === 'error' && <Button variant="outline" onClick={() => void catalog.reload()}><RefreshCw />{t('states.retry')}</Button>}
            </div>
          )}
          {!catalog.isLoading && catalog.items.length > 0 && (
            <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {catalog.items.map((item, index) => <TemplateCard key={item.slug} item={item} locale={locale} isFirst={index === 0} creating={creatingSlug === item.slug} labels={cardLabels} onFavorite={(favorite) => void settleTemplateFavoriteMutation(catalog.setFavorite(item.slug, favorite), () => toast.error(t('favoriteError')))} onPreview={() => setPreviewSlug(item.slug)} onUse={() => void handleUse(item.slug)} />)}
            </div>
          )}
          {!catalog.isLoading && catalog.status === 'ready' && (
            <nav aria-label={t('pagination.label')} className="mt-6 flex items-center justify-center gap-3">
              <Button variant="outline" disabled={!filters.cursor} onClick={() => window.history.back()}><ChevronLeft />{t('pagination.previous')}</Button>
              <Button variant="outline" disabled={!catalog.nextCursor || catalog.isLoadingMore} onClick={() => catalog.nextCursor && commitFilters({ cursor: catalog.nextCursor })}>{catalog.isLoadingMore ? <Loader2 className="animate-spin" /> : <ChevronRight />}{t('pagination.next')}</Button>
            </nav>
          )}
        </main>
      </div>}

      <TemplatePreviewDialog item={previewItem} locale={locale} creating={creatingSlug === previewSlug} labels={{ loading: t('previewDialog.loading'), error: t('previewDialog.error'), retry: t('states.retry'), useTemplate: t('useTemplate'), creating: t('creating'), copyTemplate: t('localManager.actions.copyPublic'), description: t.raw('previewDialog.description') as string }} onClose={() => setPreviewSlug(null)} onUse={() => previewSlug && void handleUse(previewSlug)} onCopy={(manifest, name) => void handleCopyPublic(manifest, name)} />
      <TourOverlay tourId="templates" steps={TOUR_STEPS} />
    </div>
  );
}
