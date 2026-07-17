'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type {
  TemplateCatalogItem,
  TemplateCategory,
  TemplateTag,
} from '@/types/template';

export const TEMPLATE_CATALOG_PAGE_SIZE = 20;
export const TEMPLATE_CATALOG_DEBOUNCE_MS = 300;

export type TemplateCatalogView = 'public' | 'local' | 'favorites' | 'recent';
export type TemplateCatalogPaper = 'a4' | 'letter';
export type TemplateCatalogSort = 'newest' | 'popular' | 'name';

export type TemplateCatalogFilters = {
  view: TemplateCatalogView;
  q?: string;
  category?: string;
  tags: string[];
  ats?: boolean;
  avatar?: boolean;
  paper?: TemplateCatalogPaper;
  docx?: boolean;
  sort?: TemplateCatalogSort;
  cursor?: string;
};

export type TemplateCatalogRequest = {
  url: string;
  private: boolean;
};

type FacetCount = { true: number; false: number };

export type TemplateCatalogFacets = {
  total: number;
  categories: Array<TemplateCategory & { count: number }>;
  tags: Array<TemplateTag & { count: number }>;
  capabilities: {
    ats: FacetCount;
    avatar: FacetCount;
    paper: { a4: number; letter: number };
    docx: FacetCount;
  };
};

export type TemplateCatalogError = {
  code: string;
  status?: number;
};

export type TemplateCatalogState = {
  status: 'idle' | 'loading' | 'ready' | 'empty' | 'error';
  items: TemplateCatalogItem[];
  nextCursor: string | null;
  favoriteSlugs: string[];
  facets: TemplateCatalogFacets | null;
  error: TemplateCatalogError | null;
  isLoading: boolean;
  isLoadingMore: boolean;
};

type Fetcher = typeof fetch;
type LoadMode = 'replace' | 'append';

type TemplateCatalogStoreOptions = {
  fetcher?: Fetcher;
  fingerprint?: string | null;
  privateStateEnabled?: boolean;
};

type TemplateCatalogStore = {
  getState(): TemplateCatalogState;
  subscribe(listener: (state: TemplateCatalogState) => void): () => void;
  load(filters: TemplateCatalogFilters, options?: { mode?: LoadMode }): Promise<TemplateCatalogState>;
  setFavorite(slug: string, favorite: boolean): Promise<TemplateCatalogState>;
  cancel(): void;
};

type CatalogPage = {
  items: TemplateCatalogItem[];
  nextCursor: string | null;
};

const VIEWS = new Set<TemplateCatalogView>(['public', 'local', 'favorites', 'recent']);
const PAPERS = new Set<TemplateCatalogPaper>(['a4', 'letter']);
const SORTS = new Set<TemplateCatalogSort>(['newest', 'popular', 'name']);

function one(params: URLSearchParams, key: string): string | undefined {
  return params.get(key) ?? undefined;
}

function optionalBoolean(value: string | undefined): boolean | undefined {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return undefined;
}

function canonicalTags(tags: readonly string[]): string[] {
  return [...new Set(tags.filter(Boolean))].sort((left, right) => left.localeCompare(right));
}

export function parseTemplateCatalogUrl(params: URLSearchParams): TemplateCatalogFilters {
  const rawView = one(params, 'view');
  const rawPaper = one(params, 'paper');
  const rawSort = one(params, 'sort');
  return {
    view: rawView && VIEWS.has(rawView as TemplateCatalogView) ? rawView as TemplateCatalogView : 'public',
    ...(one(params, 'q') !== undefined ? { q: one(params, 'q') } : {}),
    ...(one(params, 'category') !== undefined ? { category: one(params, 'category') } : {}),
    tags: canonicalTags(params.getAll('tag')),
    ...(optionalBoolean(one(params, 'ats')) !== undefined ? { ats: optionalBoolean(one(params, 'ats')) } : {}),
    ...(optionalBoolean(one(params, 'avatar')) !== undefined ? { avatar: optionalBoolean(one(params, 'avatar')) } : {}),
    ...(rawPaper && PAPERS.has(rawPaper as TemplateCatalogPaper) ? { paper: rawPaper as TemplateCatalogPaper } : {}),
    ...(optionalBoolean(one(params, 'docx')) !== undefined ? { docx: optionalBoolean(one(params, 'docx')) } : {}),
    ...(rawSort && SORTS.has(rawSort as TemplateCatalogSort) ? { sort: rawSort as TemplateCatalogSort } : {}),
    ...(one(params, 'cursor') !== undefined ? { cursor: one(params, 'cursor') } : {}),
  };
}

function appendFilters(params: URLSearchParams, filters: TemplateCatalogFilters, includeCursor: boolean): void {
  if (filters.q !== undefined) params.set('q', filters.q);
  if (filters.category !== undefined) params.set('category', filters.category);
  for (const tag of canonicalTags(filters.tags)) params.append('tag', tag);
  if (filters.ats !== undefined) params.set('ats', String(filters.ats));
  if (filters.avatar !== undefined) params.set('avatar', String(filters.avatar));
  if (filters.paper !== undefined) params.set('paper', filters.paper);
  if (filters.docx !== undefined) params.set('docx', String(filters.docx));
  if (filters.sort !== undefined) params.set('sort', filters.sort);
  if (includeCursor && filters.cursor !== undefined) params.set('cursor', filters.cursor);
}

export function serializeTemplateCatalogUrl(filters: TemplateCatalogFilters): URLSearchParams {
  const params = new URLSearchParams();
  params.set('view', filters.view);
  appendFilters(params, filters, true);
  return params;
}

export function updateTemplateCatalogFilters(
  current: TemplateCatalogFilters,
  patch: Partial<TemplateCatalogFilters>,
): TemplateCatalogFilters {
  const changesFilter = Object.keys(patch).some((key) => key !== 'cursor');
  return {
    ...current,
    ...patch,
    tags: canonicalTags(patch.tags ?? current.tags),
    ...(changesFilter ? { cursor: undefined } : {}),
  };
}

export function buildTemplateCatalogRequest(filters: TemplateCatalogFilters): TemplateCatalogRequest | null {
  if (filters.view === 'local') return null;
  if (filters.view === 'recent') return { url: '/api/templates/recent', private: true };

  const params = new URLSearchParams();
  appendFilters(params, filters, true);
  params.set('limit', String(TEMPLATE_CATALOG_PAGE_SIZE));
  const path = filters.view === 'favorites' ? '/api/templates/favorites' : '/api/templates';
  return { url: `${path}?${params.toString()}`, private: filters.view === 'favorites' };
}

export function debounceTemplateCatalogSearch<T>(
  callback: (value: T) => void,
  delay = TEMPLATE_CATALOG_DEBOUNCE_MS,
): { schedule(value: T): void; dispose(): void } {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return {
    schedule(value) {
      if (timer !== undefined) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = undefined;
        callback(value);
      }, delay);
    },
    dispose() {
      if (timer !== undefined) clearTimeout(timer);
      timer = undefined;
    },
  };
}

export function shouldDebounceTemplateCatalogLoad(
  previous: TemplateCatalogFilters | null,
  next: TemplateCatalogFilters,
  searchInput: boolean,
): boolean {
  if (!searchInput || previous === null || previous.q === next.q) return false;
  const comparable = (filters: TemplateCatalogFilters) => ({
    ...filters,
    q: undefined,
    cursor: undefined,
  });
  return JSON.stringify(comparable(previous)) === JSON.stringify(comparable(next));
}

export function shouldLoadTemplateCatalog(
  enabled: boolean,
  readiness?: {
    view: TemplateCatalogView;
    authEnabled: boolean;
    fingerprintLoading: boolean;
  },
): boolean {
  if (!enabled) return false;
  if (!readiness) return true;
  const privateView = readiness.view === 'favorites' || readiness.view === 'recent';
  return !privateView || readiness.authEnabled || !readiness.fingerprintLoading;
}

class CatalogRequestError extends Error {
  readonly code: string;
  readonly status?: number;

  constructor(code: string, status?: number) {
    super(code);
    this.name = 'CatalogRequestError';
    this.code = code;
    this.status = status;
  }
}

async function responseJson(response: Response): Promise<unknown> {
  const value = await response.json().catch(() => null);
  if (response.ok) return value;
  const error = value && typeof value === 'object' && 'error' in value
    ? (value as { error?: { code?: unknown } }).error
    : undefined;
  throw new CatalogRequestError(
    typeof error?.code === 'string' ? error.code : 'TEMPLATE_CATALOG_REQUEST_FAILED',
    response.status,
  );
}

function privateHeaders(fingerprint: string | null | undefined): Record<string, string> {
  return fingerprint ? { 'x-fingerprint': fingerprint } : {};
}

function asPage(value: unknown): CatalogPage {
  const page = value as Partial<CatalogPage> | null;
  if (!page || !Array.isArray(page.items) || (page.nextCursor !== null && typeof page.nextCursor !== 'string')) {
    throw new CatalogRequestError('TEMPLATE_CATALOG_RESPONSE_INVALID');
  }
  return { items: page.items, nextCursor: page.nextCursor };
}

function asRecentPage(value: unknown): CatalogPage {
  if (!Array.isArray(value)) throw new CatalogRequestError('TEMPLATE_CATALOG_RESPONSE_INVALID');
  return { items: value as TemplateCatalogItem[], nextCursor: null };
}

function mergeItems(
  previous: readonly TemplateCatalogItem[],
  incoming: readonly TemplateCatalogItem[],
): TemplateCatalogItem[] {
  const merged = new Map(previous.map((item) => [item.slug, item]));
  for (const item of incoming) merged.set(item.slug, item);
  return [...merged.values()];
}

function applyFavorites(items: readonly TemplateCatalogItem[], favoriteSlugs: readonly string[]): TemplateCatalogItem[] {
  const favorites = new Set(favoriteSlugs);
  return items.map((item) => ({ ...item, favorite: favorites.has(item.slug) }));
}

const INITIAL_STATE: TemplateCatalogState = {
  status: 'idle',
  items: [],
  nextCursor: null,
  favoriteSlugs: [],
  facets: null,
  error: null,
  isLoading: false,
  isLoadingMore: false,
};

export function createTemplateCatalogStore(options: TemplateCatalogStoreOptions = {}): TemplateCatalogStore {
  const fetcher = options.fetcher ?? fetch;
  const fingerprint = options.fingerprint;
  const privateStateEnabled = options.privateStateEnabled ?? true;
  const listeners = new Set<(state: TemplateCatalogState) => void>();
  let state = INITIAL_STATE;
  let activeController: AbortController | null = null;
  let sequence = 0;

  function publish(patch: Partial<TemplateCatalogState>): TemplateCatalogState {
    state = { ...state, ...patch };
    for (const listener of listeners) listener(state);
    return state;
  }

  async function fetchPage(filters: TemplateCatalogFilters, signal: AbortSignal): Promise<CatalogPage> {
    const request = buildTemplateCatalogRequest(filters);
    if (!request) return { items: [], nextCursor: null };
    const headers = request.private
      ? privateHeaders(fingerprint)
      : undefined;
    const response = await fetcher(request.url, { ...(headers ? { headers } : {}), signal });
    const value = await responseJson(response);
    return filters.view === 'recent' ? asRecentPage(value) : asPage(value);
  }

  async function fetchFacets(signal: AbortSignal): Promise<TemplateCatalogFacets> {
    const response = await fetcher('/api/templates/facets', { signal });
    return await responseJson(response) as TemplateCatalogFacets;
  }

  async function fetchFavoriteSlugs(
    signal?: AbortSignal,
    options: { ignoreUnauthorized?: boolean } = {},
  ): Promise<string[]> {
    const slugs: string[] = [];
    const seen = new Set<string>();
    let cursor: string | undefined;
    try {
      do {
        const request = buildTemplateCatalogRequest({ view: 'favorites', tags: [], cursor });
        if (!request) break;
        const response = await fetcher(request.url, {
          headers: privateHeaders(fingerprint),
          ...(signal ? { signal } : {}),
        });
        const page = asPage(await responseJson(response));
        for (const item of page.items) {
          if (!seen.has(item.slug)) {
            seen.add(item.slug);
            slugs.push(item.slug);
          }
        }
        cursor = page.nextCursor ?? undefined;
      } while (cursor !== undefined);
      return slugs;
    } catch (error) {
      if (options.ignoreUnauthorized && error instanceof CatalogRequestError && error.status === 401) return [];
      throw error;
    }
  }

  async function load(
    filters: TemplateCatalogFilters,
    loadOptions: { mode?: LoadMode } = {},
  ): Promise<TemplateCatalogState> {
    const mode = loadOptions.mode ?? 'replace';
    activeController?.abort();
    const controller = new AbortController();
    activeController = controller;
    const requestSequence = ++sequence;

    if (filters.view === 'local') {
      return publish({
        status: 'empty',
        items: [],
        nextCursor: null,
        error: null,
        isLoading: false,
        isLoadingMore: false,
      });
    }

    publish({
      status: 'loading',
      ...(mode === 'replace' ? { items: [], nextCursor: null } : {}),
      error: null,
      isLoading: mode === 'replace',
      isLoadingMore: mode === 'append',
    });

    try {
      const [page, nextFacets, nextFavorites] = await Promise.all([
        fetchPage(filters, controller.signal),
        fetchFacets(controller.signal),
        privateStateEnabled
          ? fetchFavoriteSlugs(controller.signal, { ignoreUnauthorized: filters.view === 'public' })
          : Promise.resolve([]),
      ]);
      if (requestSequence !== sequence || controller.signal.aborted) return state;

      const combined = mode === 'append' ? mergeItems(state.items, page.items) : page.items;
      const items = applyFavorites(combined, nextFavorites);
      return publish({
        status: items.length === 0 ? 'empty' : 'ready',
        items,
        nextCursor: page.nextCursor,
        favoriteSlugs: nextFavorites,
        facets: nextFacets,
        error: null,
        isLoading: false,
        isLoadingMore: false,
      });
    } catch (error) {
      if (requestSequence !== sequence || controller.signal.aborted) return state;
      const catalogError = error instanceof CatalogRequestError
        ? { code: error.code, ...(error.status !== undefined ? { status: error.status } : {}) }
        : { code: 'TEMPLATE_CATALOG_REQUEST_FAILED' };
      return publish({
        status: 'error',
        items: mode === 'append' ? state.items : [],
        nextCursor: mode === 'append' ? state.nextCursor : null,
        error: catalogError,
        isLoading: false,
        isLoadingMore: false,
      });
    }
  }

  async function setFavorite(slug: string, favorite: boolean): Promise<TemplateCatalogState> {
    const wasFavorite = state.favoriteSlugs.includes(slug);
    const optimisticFavorites = new Set(state.favoriteSlugs);
    if (favorite) optimisticFavorites.add(slug);
    else optimisticFavorites.delete(slug);
    const favoriteSlugs = [...optimisticFavorites];
    publish({ favoriteSlugs, items: applyFavorites(state.items, favoriteSlugs) });

    try {
      const response = await fetcher(`/api/templates/${encodeURIComponent(slug)}/favorite`, {
        method: favorite ? 'POST' : 'DELETE',
        headers: privateHeaders(fingerprint),
      });
      await responseJson(response);
      const refreshed = await fetchFavoriteSlugs();
      return publish({ favoriteSlugs: refreshed, items: applyFavorites(state.items, refreshed) });
    } catch (error) {
      const reconciledFavorites = new Set(state.favoriteSlugs);
      if (wasFavorite) reconciledFavorites.add(slug);
      else reconciledFavorites.delete(slug);
      const favoriteSlugs = [...reconciledFavorites];
      publish({ favoriteSlugs, items: applyFavorites(state.items, favoriteSlugs) });
      throw error;
    }
  }

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    load,
    setFavorite,
    cancel() {
      activeController?.abort();
      activeController = null;
      sequence += 1;
    },
  };
}

type UseTemplateCatalogOptions = {
  filters: TemplateCatalogFilters;
  fingerprint?: string | null;
  fetcher?: Fetcher;
  searchInput?: boolean;
  privateStateEnabled?: boolean;
  enabled?: boolean;
};

export function useTemplateCatalog({
  filters,
  fingerprint,
  fetcher,
  searchInput = false,
  privateStateEnabled = true,
  enabled = true,
}: UseTemplateCatalogOptions) {
  const store = useMemo(
    () => createTemplateCatalogStore({ fetcher, fingerprint, privateStateEnabled }),
    [fetcher, fingerprint, privateStateEnabled],
  );
  const [state, setState] = useState<TemplateCatalogState>(() => store.getState());
  const filterKey = serializeTemplateCatalogUrl(filters).toString();
  const stableFilters = useMemo(
    () => parseTemplateCatalogUrl(new URLSearchParams(filterKey)),
    [filterKey],
  );
  const previousFilters = useRef<TemplateCatalogFilters | null>(null);

  useEffect(() => store.subscribe(setState), [store]);

  useEffect(() => {
    store.cancel();
    if (!shouldLoadTemplateCatalog(enabled)) {
      previousFilters.current = null;
      return;
    }
    const debounce = shouldDebounceTemplateCatalogLoad(previousFilters.current, stableFilters, searchInput);
    previousFilters.current = stableFilters;
    if (!debounce) {
      void store.load(stableFilters);
      return;
    }
    const debounced = debounceTemplateCatalogSearch(() => void store.load(stableFilters));
    debounced.schedule(undefined);
    return () => debounced.dispose();
  }, [enabled, searchInput, stableFilters, store]);

  const reload = useCallback(() => store.load(stableFilters), [stableFilters, store]);
  const setFavorite = useCallback(
    (slug: string, favorite: boolean) => store.setFavorite(slug, favorite),
    [store],
  );

  return { ...state, reload, setFavorite };
}
