import {
  serializeTemplateCatalogUrl,
  type TemplateCatalogFilters,
  type TemplateCatalogState,
  type TemplateCatalogView,
} from '@/hooks/use-template-catalog';

export type TemplateCatalogHistoryMode = 'replace' | 'push';

export function createInitialTemplateCatalogFilters(): TemplateCatalogFilters {
  return { view: 'public', tags: [] };
}

export async function settleTemplateFavoriteMutation(
  mutation: Promise<unknown>,
  reportError: () => void,
): Promise<void> {
  try {
    await mutation;
  } catch {
    reportError();
  }
}

export function shouldShowTemplateCatalogSkeleton(
  status: TemplateCatalogState['status'],
  isLoading: boolean,
): boolean {
  return status === 'idle' || isLoading;
}

export function templateCatalogHistoryMode(
  patch: Partial<TemplateCatalogFilters>,
): TemplateCatalogHistoryMode {
  const keys = Object.keys(patch);
  return keys.length > 0 && keys.every((key) => key === 'q') ? 'replace' : 'push';
}

export function buildTemplateCatalogHistoryUrl(
  pathname: string,
  filters: TemplateCatalogFilters,
): string {
  const query = serializeTemplateCatalogUrl(filters).toString();
  return query ? `${pathname}?${query}` : pathname;
}

export function templateCatalogStateMessageKey(
  status: TemplateCatalogState['status'],
  view: TemplateCatalogView,
): 'localEmpty' | 'favoritesEmpty' | 'recentEmpty' | 'empty' | 'error' | null {
  if (status === 'error') return 'error';
  if (status !== 'empty') return null;
  if (view === 'local') return 'localEmpty';
  if (view === 'favorites') return 'favoritesEmpty';
  if (view === 'recent') return 'recentEmpty';
  return 'empty';
}
