/** @vitest-environment jsdom */

import { cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import type { AnchorHTMLAttributes, ReactNode } from 'react';

const runtime = vi.hoisted(() => ({
  authEnabled: false,
  fingerprint: null as string | null,
  fingerprintLoading: true,
  localSave: vi.fn(),
}));

vi.mock('@/components/providers/runtime-config-provider', () => ({
  useRuntimeConfig: () => ({ authEnabled: runtime.authEnabled }),
}));
vi.mock('@/hooks/use-fingerprint', () => ({
  useFingerprint: () => ({ fingerprint: runtime.fingerprint, isLoading: runtime.fingerprintLoading }),
}));
vi.mock('@/hooks/use-resume', () => ({ useResume: () => ({ createResume: vi.fn() }) }));
vi.mock('@/hooks/use-auth', () => ({ useAuth: () => ({ user: { id: 'user-a' } }) }));
vi.mock('@/hooks/use-local-templates', () => ({
  useLocalTemplates: () => ({ records: [], status: 'ready', save: runtime.localSave }),
}));
vi.mock('@/lib/templates/local-template-thumbnail', () => ({
  createLocalTemplateThumbnail: async () => new Blob([new Uint8Array(8)], { type: 'image/png' }),
}));
vi.mock('./local-template-manager', () => ({ LocalTemplateManager: () => <div>states.localEmpty</div> }));
vi.mock('@/i18n/routing', () => ({
  Link: ({ children, ...props }: { children: ReactNode } & AnchorHTMLAttributes<HTMLAnchorElement>) => <a {...props}>{children}</a>,
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock('next-intl', () => ({
  useLocale: () => 'en',
  useTranslations: () => Object.assign((key: string) => key, { raw: (key: string) => key }),
}));
vi.mock('@/stores/tour-store', () => ({
  hasCompletedTour: () => true,
  useTourStore: (selector: (state: { startTour: () => void }) => unknown) => selector({ startTour: vi.fn() }),
}));
vi.mock('@/components/tour/tour-overlay', () => ({ TourOverlay: () => null }));
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }));

import type { TemplateCatalogItem } from '@/types/template';
import {
  TEMPLATE_CATALOG_DEBOUNCE_MS,
  TEMPLATE_CATALOG_PAGE_SIZE,
  buildTemplateCatalogRequest,
  createTemplateCatalogStore,
  debounceTemplateCatalogSearch,
  parseTemplateCatalogUrl,
  serializeTemplateCatalogUrl,
  shouldLoadTemplateCatalog,
  updateTemplateCatalogFilters,
} from '@/hooks/use-template-catalog';

function catalogItem(slug: string, favorite = false): TemplateCatalogItem {
  return {
    slug,
    stableVersion: '1.0.0',
    nameZh: slug,
    nameEn: slug,
    category: { id: 'general', slug: 'general', nameZh: '通用', nameEn: 'General', sortOrder: 0 },
    tags: [],
    thumbnailPath: `templates/${slug}/v1.0.0/thumbnail.webp`,
    fullPreviewPath: `templates/${slug}/v1.0.0/full.webp`,
    capabilities: {
      supportedSections: ['personal_info'],
      paperSizes: ['a4'],
      supportsAvatar: false,
      atsCompatible: true,
      supportsZh: true,
      supportsEn: true,
      supportsHtml: true,
      supportsPdf: true,
      docxFidelity: 'generic',
    },
    favorite,
  };
}

const facets = {
  total: 2,
  categories: [],
  tags: [],
  capabilities: {
    ats: { true: 2, false: 0 },
    avatar: { true: 0, false: 2 },
    paper: { a4: 2, letter: 0 },
    docx: { true: 2, false: 0 },
  },
};

function json(value: unknown, status = 200): Response {
  return Response.json(value, { status });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, resolve, reject };
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

beforeEach(() => {
  runtime.authEnabled = false;
  runtime.fingerprint = null;
  runtime.fingerprintLoading = true;
  window.history.replaceState({}, '', '/en/templates');
});

describe('template catalog URL contract', () => {
  test('parses and serializes every server filter in canonical order, including an opaque page cursor', () => {
    const parsed = parseTemplateCatalogUrl(new URLSearchParams(
      'cursor=opaque%2Bcursor&sort=name&docx=false&paper=letter&avatar=true&ats=false'
      + '&tag=style-z&tag=style-a&tag=style-z&category=general&q=staff+engineer&view=favorites',
    ));

    expect(parsed).toEqual({
      view: 'favorites',
      q: 'staff engineer',
      category: 'general',
      tags: ['style-a', 'style-z'],
      ats: false,
      avatar: true,
      paper: 'letter',
      docx: false,
      sort: 'name',
      cursor: 'opaque+cursor',
    });
    expect(serializeTemplateCatalogUrl(parsed).toString()).toBe(
      'view=favorites&q=staff+engineer&category=general&tag=style-a&tag=style-z'
      + '&ats=false&avatar=true&paper=letter&docx=false&sort=name&cursor=opaque%2Bcursor',
    );
  });

  test.each(['public', 'local', 'favorites', 'recent'] as const)('round trips the %s view', (view) => {
    const serialized = serializeTemplateCatalogUrl({ view, tags: [] });
    expect(parseTemplateCatalogUrl(serialized)).toEqual({ view, tags: [] });
  });

  test('clears cursor for a non-pagination filter change but preserves explicit cursor navigation', () => {
    const current = { view: 'public' as const, q: 'old', tags: ['one'], cursor: 'page-2' };
    expect(updateTemplateCatalogFilters(current, { q: 'new' })).toEqual({
      view: 'public', q: 'new', tags: ['one'], cursor: undefined,
    });
    expect(updateTemplateCatalogFilters(current, { cursor: 'page-3' })).toEqual({
      view: 'public', q: 'old', tags: ['one'], cursor: 'page-3',
    });
  });

  test('builds a canonical limit-20 API query while keeping local and recent request boundaries separate', () => {
    expect(TEMPLATE_CATALOG_PAGE_SIZE).toBe(20);
    expect(buildTemplateCatalogRequest({
      view: 'public', q: 'engineer', tags: ['clean'], ats: true, sort: 'popular', cursor: 'next/raw',
    })).toEqual({
      url: '/api/templates?q=engineer&tag=clean&ats=true&sort=popular&cursor=next%2Fraw&limit=20',
      private: false,
    });
    expect(buildTemplateCatalogRequest({ view: 'favorites', tags: [] })).toEqual({
      url: '/api/templates/favorites?limit=20',
      private: true,
    });
    expect(buildTemplateCatalogRequest({ view: 'recent', q: 'ignored', tags: [] })).toEqual({
      url: '/api/templates/recent',
      private: true,
    });
    expect(buildTemplateCatalogRequest({ view: 'local', tags: [] })).toBeNull();
  });
});

describe('template catalog request coordination', () => {
  test('debounces only search-input q changes while initial, navigation, filter, and cursor loads stay immediate', async () => {
    const catalogHook = await import('@/hooks/use-template-catalog') as typeof import('@/hooks/use-template-catalog') & {
      shouldDebounceTemplateCatalogLoad(
        previous: Parameters<typeof updateTemplateCatalogFilters>[0] | null,
        next: Parameters<typeof updateTemplateCatalogFilters>[0],
        searchInput: boolean,
      ): boolean;
      shouldLoadTemplateCatalog(enabled: boolean): boolean;
    };
    const initial = { view: 'public' as const, tags: [] as string[] };
    const searched = { ...initial, q: 'engineer' };

    expect(catalogHook.shouldDebounceTemplateCatalogLoad(null, initial, false)).toBe(false);
    expect(catalogHook.shouldDebounceTemplateCatalogLoad(initial, searched, true)).toBe(true);
    expect(catalogHook.shouldDebounceTemplateCatalogLoad(initial, searched, false)).toBe(false);
    expect(catalogHook.shouldDebounceTemplateCatalogLoad(initial, { ...initial, view: 'favorites' }, true)).toBe(false);
    expect(catalogHook.shouldDebounceTemplateCatalogLoad(initial, { ...initial, tags: ['clean'] }, true)).toBe(false);
    expect(catalogHook.shouldDebounceTemplateCatalogLoad(initial, { ...initial, cursor: 'next' }, true)).toBe(false);
    expect(catalogHook.shouldLoadTemplateCatalog(false)).toBe(false);
    expect(catalogHook.shouldLoadTemplateCatalog(true)).toBe(true);
  });

  test('debounces search by 300 ms and cancels the superseded callback', async () => {
    vi.useFakeTimers();
    const callback = vi.fn();
    const debounced = debounceTemplateCatalogSearch(callback);

    expect(TEMPLATE_CATALOG_DEBOUNCE_MS).toBe(300);
    debounced.schedule('old');
    await vi.advanceTimersByTimeAsync(299);
    expect(callback).not.toHaveBeenCalled();
    debounced.schedule('new');
    await vi.advanceTimersByTimeAsync(300);
    expect(callback).toHaveBeenCalledOnce();
    expect(callback).toHaveBeenCalledWith('new');
    debounced.dispose();
  });

  test('keeps local view empty without issuing public, facets, recent, or favorite requests', async () => {
    const fetcher = vi.fn<typeof fetch>();
    const store = createTemplateCatalogStore({ fetcher });

    await store.load({ view: 'local', tags: [] });

    expect(fetcher).not.toHaveBeenCalled();
    expect(store.getState()).toMatchObject({
      status: 'empty', items: [], nextCursor: null, error: null, isLoading: false, isLoadingMore: false,
    });
  });

  test.each(['favorites', 'recent'] as const)(
    'waits for an anonymous fingerprint before loading the private %s view',
    async (view) => {
      const loadGate = shouldLoadTemplateCatalog as (
        urlReady: boolean,
        readiness: { view: typeof view; authEnabled: boolean; fingerprintLoading: boolean },
      ) => boolean;
      const decisions = [
        loadGate(true, { view, authEnabled: false, fingerprintLoading: true }),
        loadGate(true, { view, authEnabled: false, fingerprintLoading: false }),
      ];
      const calls: Array<{ url: string; init?: RequestInit }> = [];
      const fetcher = vi.fn<typeof fetch>(async (input, init) => {
        const url = String(input);
        calls.push({ url, init });
        if (url === '/api/templates/facets') return json(facets);
        if (url === '/api/templates/favorites?limit=20') {
          return json({ items: [catalogItem('favorite')], nextCursor: null });
        }
        if (url === '/api/templates/recent') return json([catalogItem('recent')]);
        throw new Error(`unexpected request: ${url}`);
      });
      const store = createTemplateCatalogStore({ fetcher, fingerprint: 'fingerprint-ready' });
      const catalogState = await import('./template-catalog-state');

      expect(decisions[0]).toBe(false);
      expect(fetcher).not.toHaveBeenCalled();
      expect(store.getState()).toMatchObject({ status: 'idle', error: null, isLoading: false });
      expect(catalogState.shouldShowTemplateCatalogSkeleton('idle', false)).toBe(true);
      expect(catalogState.templateCatalogStateMessageKey('idle', view)).toBeNull();

      for (const enabled of decisions) {
        if (enabled) await store.load({ view, tags: [] });
      }

      expect(decisions.filter(Boolean)).toHaveLength(1);
      expect(store.getState()).toMatchObject({ status: 'ready', error: null, isLoading: false });
      const privateCalls = calls.filter(({ url }) => (
        url.startsWith('/api/templates/favorites') || url === '/api/templates/recent'
      ));
      expect(privateCalls.length).toBeGreaterThan(0);
      for (const call of privateCalls) {
        expect(call.init?.headers).toEqual({ 'x-fingerprint': 'fingerprint-ready' });
      }
    },
  );

  test.each(['favorites', 'recent'] as const)(
    'loads a session-backed %s view while fingerprint discovery is still pending',
    async (view) => {
      const loadGate = shouldLoadTemplateCatalog as (
        urlReady: boolean,
        readiness: { view: typeof view; authEnabled: boolean; fingerprintLoading: boolean },
      ) => boolean;
      const fetcher = vi.fn<typeof fetch>(async (input) => {
        const url = String(input);
        if (url === '/api/templates/facets') return json(facets);
        if (url === '/api/templates/favorites?limit=20') {
          return json({ items: [catalogItem('favorite')], nextCursor: null });
        }
        if (url === '/api/templates/recent') return json([catalogItem('recent')]);
        throw new Error(`unexpected request: ${url}`);
      });
      const store = createTemplateCatalogStore({ fetcher });

      const enabled = loadGate(true, {
        view,
        authEnabled: true,
        fingerprintLoading: true,
      });
      if (enabled) await store.load({ view, tags: [] });

      expect(enabled).toBe(true);
      expect(store.getState()).toMatchObject({ status: 'ready', error: null, isLoading: false });
      for (const [, init] of fetcher.mock.calls) {
        expect(new Headers(init?.headers).has('x-fingerprint')).toBe(false);
      }
    },
  );

  test('loads facets and public items, then merges the complete private favorite set using the fingerprint header', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetcher = vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input);
      calls.push({ url, init });
      if (url === '/api/templates/facets') return json(facets);
      if (url === '/api/templates?limit=20') {
        return json({ items: [catalogItem('alpha'), catalogItem('beta')], nextCursor: 'public-next' });
      }
      if (url === '/api/templates/favorites?limit=20') {
        return json({ items: [catalogItem('beta')], nextCursor: 'favorite-next/raw' });
      }
      if (url === '/api/templates/favorites?cursor=favorite-next%2Fraw&limit=20') {
        return json({ items: [catalogItem('gamma')], nextCursor: null });
      }
      throw new Error(`unexpected request: ${url}`);
    });
    const store = createTemplateCatalogStore({ fetcher, fingerprint: 'fingerprint-a' });

    await store.load({ view: 'public', tags: [] });

    expect(store.getState()).toMatchObject({
      status: 'ready',
      nextCursor: 'public-next',
      favoriteSlugs: ['beta', 'gamma'],
      items: [{ slug: 'alpha', favorite: false }, { slug: 'beta', favorite: true }],
      facets,
    });
    for (const call of calls.filter(({ url }) => url.startsWith('/api/templates/favorites'))) {
      expect(call.init?.headers).toEqual({ 'x-fingerprint': 'fingerprint-a' });
    }
    expect(calls.find(({ url }) => url === '/api/templates?limit=20')?.init?.headers).toBeUndefined();
  });

  test('keeps the public catalog ready without requesting favorites while private state is unavailable', async () => {
    const fetcher = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url === '/api/templates/facets') return json(facets);
      if (url === '/api/templates?limit=20') {
        return json({ items: [catalogItem('alpha')], nextCursor: null });
      }
      throw new Error(`unexpected request: ${url}`);
    });
    const store = createTemplateCatalogStore({ fetcher, privateStateEnabled: false });

    await store.load({ view: 'public', tags: [] });

    expect(store.getState()).toMatchObject({
      status: 'ready',
      items: [{ slug: 'alpha', favorite: false }],
      favoriteSlugs: [],
      error: null,
    });
    expect(fetcher.mock.calls.map(([input]) => String(input))).toEqual([
      '/api/templates?limit=20',
      '/api/templates/facets',
    ]);
  });

  test.each(['favorites', 'recent'] as const)(
    'lets the server resolve a session-backed %s request when fingerprint is absent',
    async (view) => {
      const privateCalls: RequestInit[] = [];
      const fetcher = vi.fn<typeof fetch>(async (input, init) => {
        const url = String(input);
        if (url === '/api/templates/facets') return json(facets);
        if (url === '/api/templates/favorites?limit=20') {
          privateCalls.push(init ?? {});
          return json({ items: [catalogItem('favorite')], nextCursor: null });
        }
        if (url === '/api/templates/recent') {
          privateCalls.push(init ?? {});
          return json([catalogItem('recent')]);
        }
        throw new Error(`unexpected request: ${url}`);
      });
      const store = createTemplateCatalogStore({ fetcher });

      await store.load({ view, tags: [] });

      expect(store.getState().status).toBe('ready');
      expect(store.getState().items.map((item) => item.slug)).toEqual([
        view === 'favorites' ? 'favorite' : 'recent',
      ]);
      expect(privateCalls.length).toBeGreaterThan(0);
      for (const init of privateCalls) {
        expect(new Headers(init.headers).has('x-fingerprint')).toBe(false);
      }
    },
  );

  test('keeps an anonymous public catalog ready when the background favorites request is unauthorized', async () => {
    const fetcher = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url === '/api/templates/facets') return json(facets);
      if (url === '/api/templates?limit=20') {
        return json({ items: [catalogItem('alpha')], nextCursor: null });
      }
      if (url === '/api/templates/favorites?limit=20') {
        return json({ error: { code: 'UNAUTHORIZED' } }, 401);
      }
      throw new Error(`unexpected request: ${url}`);
    });
    const store = createTemplateCatalogStore({ fetcher });

    await store.load({ view: 'public', tags: [] });

    expect(store.getState()).toMatchObject({
      status: 'ready',
      items: [{ slug: 'alpha', favorite: false }],
      favoriteSlugs: [],
      error: null,
    });
  });

  test('aborts the old request and ignores its stale response even when the fetcher resolves after abort', async () => {
    const first = deferred<Response>();
    const second = deferred<Response>();
    const signals: AbortSignal[] = [];
    const fetcher = vi.fn<typeof fetch>((input, init) => {
      const url = String(input);
      if (url === '/api/templates/facets') return Promise.resolve(json(facets));
      if (url === '/api/templates/favorites?limit=20') {
        return Promise.resolve(json({ error: { code: 'UNAUTHORIZED' } }, 401));
      }
      signals.push(init?.signal as AbortSignal);
      return url.includes('q=old') ? first.promise : second.promise;
    });
    const store = createTemplateCatalogStore({ fetcher });

    const oldLoad = store.load({ view: 'public', q: 'old', tags: [] });
    const newLoad = store.load({ view: 'public', q: 'new', tags: [] });
    expect(signals[0]?.aborted).toBe(true);
    second.resolve(json({ items: [catalogItem('new')], nextCursor: null }));
    await newLoad;
    first.resolve(json({ items: [catalogItem('old')], nextCursor: null }));
    await oldLoad;

    expect(store.getState().items.map((item) => item.slug)).toEqual(['new']);
    expect(store.getState().status).toBe('ready');
  });

  test('replaces initial pages and appends cursor pages with stable slug deduplication', async () => {
    const fetcher = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url === '/api/templates/facets') return json(facets);
      if (url === '/api/templates/favorites?limit=20') {
        return json({ error: { code: 'UNAUTHORIZED' } }, 401);
      }
      if (url.includes('cursor=page-2')) {
        return json({ items: [catalogItem('beta'), catalogItem('gamma')], nextCursor: 'page-3/raw' });
      }
      return json({ items: [catalogItem('alpha'), catalogItem('beta')], nextCursor: 'page-2' });
    });
    const store = createTemplateCatalogStore({ fetcher });

    await store.load({ view: 'public', tags: [] });
    await store.load({ view: 'public', tags: [], cursor: 'page-2' }, { mode: 'append' });

    expect(store.getState().items.map((item) => item.slug)).toEqual(['alpha', 'beta', 'gamma']);
    expect(store.getState().nextCursor).toBe('page-3/raw');
    expect(store.getState()).toMatchObject({ status: 'ready', isLoading: false, isLoadingMore: false });
  });

  test.each([
    [{ items: [], nextCursor: null }, 'empty'],
    [{ error: { code: 'TEMPLATE_QUERY_INVALID' } }, 'error'],
  ] as const)('exposes a stable %s terminal state', async (payload, expectedStatus) => {
    const fetcher = vi.fn<typeof fetch>(async (input) => {
      if (String(input) === '/api/templates/facets') return json(facets);
      return expectedStatus === 'error' ? json(payload, 400) : json(payload);
    });
    const store = createTemplateCatalogStore({ fetcher });

    await store.load({ view: 'public', tags: [] });

    expect(store.getState()).toMatchObject({
      status: expectedStatus,
      items: [],
      error: expectedStatus === 'error' ? { code: 'TEMPLATE_QUERY_INVALID', status: 400 } : null,
      isLoading: false,
      isLoadingMore: false,
    });
  });

  test('updates favorite state optimistically, sends the correct mutation, and refreshes all favorite pages', async () => {
    let favoritesRead = 0;
    const fetcher = vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input);
      if (url === '/api/templates/facets') return json(facets);
      if (url === '/api/templates?limit=20') return json({ items: [catalogItem('alpha')], nextCursor: null });
      if (url === '/api/templates/alpha/favorite' && init?.method === 'POST') return json({ ok: true });
      if (url === '/api/templates/favorites?limit=20') {
        favoritesRead += 1;
        return json({ items: favoritesRead === 1 ? [] : [catalogItem('alpha')], nextCursor: null });
      }
      throw new Error(`unexpected request: ${url}`);
    });
    const store = createTemplateCatalogStore({ fetcher, fingerprint: 'fingerprint-a' });
    await store.load({ view: 'public', tags: [] });

    const mutation = store.setFavorite('alpha', true);
    expect(store.getState().items[0]?.favorite).toBe(true);
    await mutation;

    expect(store.getState().favoriteSlugs).toEqual(['alpha']);
    expect(fetcher).toHaveBeenCalledWith('/api/templates/alpha/favorite', {
      method: 'POST', headers: { 'x-fingerprint': 'fingerprint-a' },
    });
  });

  test('lets the server resolve a session-backed favorite mutation when fingerprint is absent', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetcher = vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input);
      calls.push({ url, init });
      if (url === '/api/templates/alpha/favorite' && init?.method === 'POST') return json({ ok: true });
      if (url === '/api/templates/favorites?limit=20') {
        return json({ items: [catalogItem('alpha')], nextCursor: null });
      }
      throw new Error(`unexpected request: ${url}`);
    });
    const store = createTemplateCatalogStore({ fetcher });

    await store.setFavorite('alpha', true);

    expect(store.getState().favoriteSlugs).toEqual(['alpha']);
    expect(calls.map(({ url }) => url)).toEqual([
      '/api/templates/alpha/favorite',
      '/api/templates/favorites?limit=20',
    ]);
    for (const { init } of calls) {
      expect(new Headers(init?.headers).has('x-fingerprint')).toBe(false);
    }
  });

  test.each(['mutation response', 'favorite refresh'] as const)(
    'preserves a newer catalog load when an older optimistic favorite %s fails',
    async (failureStage) => {
      const mutationResponse = deferred<Response>();
      const newerFacets = { ...facets, total: 7 };
      let facetsRead = 0;
      let favoritesRead = 0;
      const fetcher = vi.fn<typeof fetch>(async (input, init) => {
        const url = String(input);
        if (url === '/api/templates/facets') {
          facetsRead += 1;
          return json(facetsRead === 1 ? facets : newerFacets);
        }
        if (url === '/api/templates?q=old&limit=20') {
          return json({ items: [catalogItem('old')], nextCursor: 'old-cursor' });
        }
        if (url === '/api/templates?q=new&limit=20') {
          return json({
            items: [catalogItem('alpha'), catalogItem('gamma')],
            nextCursor: 'new-cursor',
          });
        }
        if (url === '/api/templates/alpha/favorite' && init?.method === 'POST') {
          return mutationResponse.promise;
        }
        if (url === '/api/templates/favorites?limit=20') {
          favoritesRead += 1;
          if (favoritesRead === 1) return json({ items: [], nextCursor: null });
          if (favoritesRead === 2) {
            return json({
              items: [catalogItem('alpha'), catalogItem('gamma')],
              nextCursor: null,
            });
          }
          return json({ error: { code: 'FAVORITE_REFRESH_FAILED' } }, 500);
        }
        throw new Error(`unexpected request: ${url}`);
      });
      const store = createTemplateCatalogStore({ fetcher, fingerprint: 'fingerprint-a' });
      await store.load({ view: 'public', q: 'old', tags: [] });

      const mutation = store.setFavorite('alpha', true);
      await store.load({ view: 'public', q: 'new', tags: [] });
      mutationResponse.resolve(failureStage === 'mutation response'
        ? json({ error: { code: 'FAVORITE_MUTATION_FAILED' } }, 500)
        : json({ ok: true }));

      await expect(mutation).rejects.toThrow(
        failureStage === 'mutation response' ? 'FAVORITE_MUTATION_FAILED' : 'FAVORITE_REFRESH_FAILED',
      );
      expect(store.getState()).toEqual({
        status: 'ready',
        items: [catalogItem('alpha'), { ...catalogItem('gamma'), favorite: true }],
        nextCursor: 'new-cursor',
        favoriteSlugs: ['gamma'],
        facets: newerFacets,
        error: null,
        isLoading: false,
        isLoadingMore: false,
      });
    },
  );

  test('applies a successful favorite refresh to the items from a newer catalog load', async () => {
    const mutationResponse = deferred<Response>();
    const newerFacets = { ...facets, total: 9 };
    let facetsRead = 0;
    let favoritesRead = 0;
    const fetcher = vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input);
      if (url === '/api/templates/facets') {
        facetsRead += 1;
        return json(facetsRead === 1 ? facets : newerFacets);
      }
      if (url === '/api/templates?q=old&limit=20') {
        return json({ items: [catalogItem('old')], nextCursor: 'old-cursor' });
      }
      if (url === '/api/templates?q=new&limit=20') {
        return json({
          items: [catalogItem('alpha'), catalogItem('gamma')],
          nextCursor: 'new-cursor',
        });
      }
      if (url === '/api/templates/alpha/favorite' && init?.method === 'POST') {
        return mutationResponse.promise;
      }
      if (url === '/api/templates/favorites?limit=20') {
        favoritesRead += 1;
        if (favoritesRead === 1) return json({ items: [], nextCursor: null });
        if (favoritesRead === 2) return json({ items: [catalogItem('gamma')], nextCursor: null });
        return json({
          items: [catalogItem('alpha'), catalogItem('gamma')],
          nextCursor: null,
        });
      }
      throw new Error(`unexpected request: ${url}`);
    });
    const store = createTemplateCatalogStore({ fetcher, fingerprint: 'fingerprint-a' });
    await store.load({ view: 'public', q: 'old', tags: [] });

    const mutation = store.setFavorite('alpha', true);
    await store.load({ view: 'public', q: 'new', tags: [] });
    mutationResponse.resolve(json({ ok: true }));
    await mutation;

    expect(store.getState()).toEqual({
      status: 'ready',
      items: [
        { ...catalogItem('alpha'), favorite: true },
        { ...catalogItem('gamma'), favorite: true },
      ],
      nextCursor: 'new-cursor',
      favoriteSlugs: ['alpha', 'gamma'],
      facets: newerFacets,
      error: null,
      isLoading: false,
      isLoadingMore: false,
    });
  });
});

describe('template catalog UI contract', () => {
  test('uses one stable public empty filter contract for SSR and hydrates location separately', async () => {
    const catalogState = await import('./template-catalog-state') as typeof import('./template-catalog-state') & {
      createInitialTemplateCatalogFilters(): Parameters<typeof updateTemplateCatalogFilters>[0];
    };

    const first = catalogState.createInitialTemplateCatalogFilters();
    const second = catalogState.createInitialTemplateCatalogFilters();
    expect(first).toEqual({ view: 'public', tags: [] });
    expect(second).toEqual(first);
    expect(second.tags).not.toBe(first.tags);
  });

  test('uses replace history for search and push history for discrete filters and cursor navigation', async () => {
    const {
      buildTemplateCatalogHistoryUrl,
      templateCatalogHistoryMode,
    } = await import('./template-catalog-state');
    const filters = {
      view: 'public' as const,
      q: 'staff engineer',
      tags: ['clean', 'modern'],
      cursor: 'raw/next+cursor',
    };

    expect(templateCatalogHistoryMode({ q: 'staff engineer' })).toBe('replace');
    expect(templateCatalogHistoryMode({ tags: ['clean'] })).toBe('push');
    expect(templateCatalogHistoryMode({ cursor: 'raw/next+cursor' })).toBe('push');
    expect(buildTemplateCatalogHistoryUrl('/en/templates', filters)).toBe(
      '/en/templates?view=public&q=staff+engineer&tag=clean&tag=modern&cursor=raw%2Fnext%2Bcursor',
    );
  });

  test('renders a fixed 400 by 300 lazy thumbnail card without mounting ResumePreview', async () => {
    const { TemplateCard } = await import('./template-card');
    const markup = renderToString(
      <TemplateCard
        item={catalogItem('classic')}
        locale="en"
        isFirst
        creating={false}
        labels={{
          preview: 'Preview', useTemplate: 'Use template', creating: 'Creating',
          favorite: 'Favorite', unfavorite: 'Remove favorite', ats: 'ATS', avatar: 'Avatar',
          paper: 'Paper', docx: 'DOCX',
        }}
        onFavorite={() => undefined}
        onPreview={() => undefined}
        onUse={() => undefined}
      />,
    );

    expect(markup).toContain('loading="lazy"');
    expect(markup).toContain('width="400"');
    expect(markup).toContain('height="300"');
    expect(markup).toContain('aspect-[4/3]');
    expect(markup).toContain('data-tour="tpl-preview"');
    expect(markup).toContain('aria-pressed="false"');
    expect(markup).not.toContain('ResumePreview');
  });

  test('keeps local empty and request error copy boundaries distinct', async () => {
    const { templateCatalogStateMessageKey } = await import('./template-catalog-state');

    expect(templateCatalogStateMessageKey('empty', 'local')).toBe('localEmpty');
    expect(templateCatalogStateMessageKey('empty', 'favorites')).toBe('favoritesEmpty');
    expect(templateCatalogStateMessageKey('empty', 'recent')).toBe('recentEmpty');
    expect(templateCatalogStateMessageKey('empty', 'public')).toBe('empty');
    expect(templateCatalogStateMessageKey('error', 'public')).toBe('error');
    expect(templateCatalogStateMessageKey('ready', 'public')).toBeNull();
  });

  test('selects an explicit renderer branch and rejects unknown legacy slugs', async () => {
    const { templatePreviewBranch, templatePreviewDescription } = await import('./template-preview-dialog');
    const { loadLegacyTemplateAdapter } = await import('./legacy-template-registry');

    expect(templatePreviewBranch({ rendererKind: 'legacy-react', manifest: null })).toBe('legacy-react');
    expect(templatePreviewBranch({
      rendererKind: 'declarative-v1',
      manifest: { schemaVersion: 1, rendererKind: 'declarative-v1' },
    })).toBe('declarative-v1');
    expect(() => templatePreviewBranch({ rendererKind: 'legacy-react', manifest: {} })).toThrow(
      'invalid_legacy_manifest',
    );
    await expect(loadLegacyTemplateAdapter('unknown-public-slug')).rejects.toThrow(
      'unknown_legacy_template',
    );
    expect(templatePreviewDescription('Modern', 'Preview for {name}')).toBe('Preview for Modern');
  });

  test('uses a desktop sidebar and a bounded mobile sheet without horizontal overflow', async () => {
    const { TEMPLATE_FILTER_LAYOUT_CLASSES } = await import('./template-filters');

    expect(TEMPLATE_FILTER_LAYOUT_CLASSES.desktop).toContain('hidden');
    expect(TEMPLATE_FILTER_LAYOUT_CLASSES.desktop).toContain('md:block');
    expect(TEMPLATE_FILTER_LAYOUT_CLASSES.mobileTrigger).toContain('md:hidden');
    expect(TEMPLATE_FILTER_LAYOUT_CLASSES.mobileSheet).toContain('w-[min(20rem,calc(100vw-2rem))]');
    expect(TEMPLATE_FILTER_LAYOUT_CLASSES.mobileSheet).toContain('overflow-x-hidden');
  });

  test('gives desktop and mobile capability controls unique SSR ids', async () => {
    const { TemplateFilterFields } = await import('./template-filters') as typeof import('./template-filters') & {
      TemplateFilterFields: React.ComponentType<{
        filters: Parameters<typeof updateTemplateCatalogFilters>[0];
        facets: typeof facets;
        locale: string;
        labels: Record<string, string>;
        idPrefix: string;
        onChange(patch: Partial<Parameters<typeof updateTemplateCatalogFilters>[0]>): void;
      }>;
    };
    const labels = {
      category: 'Category', allCategories: 'All', tags: 'Tags', ats: 'ATS', avatar: 'Avatar',
      docx: 'DOCX', paper: 'Paper', anyPaper: 'Any',
    };
    const props = {
      filters: { view: 'public' as const, tags: [] as string[] }, facets, locale: 'en', labels,
      onChange: () => undefined,
    };
    const desktop = renderToString(<TemplateFilterFields {...props} idPrefix="desktop" />);
    const mobile = renderToString(<TemplateFilterFields {...props} idPrefix="mobile" />);

    expect(desktop).toContain('id="template-desktop-ats"');
    expect(desktop).toContain('for="template-desktop-ats"');
    expect(mobile).toContain('id="template-mobile-ats"');
    expect(mobile).toContain('for="template-mobile-ats"');
    expect(`${desktop}${mobile}`).not.toMatch(/id="template-(ats|avatar|docx)"/);
  });

  test('settles favorite failures without rejecting and reports only failed mutations', async () => {
    const catalogState = await import('./template-catalog-state') as typeof import('./template-catalog-state') & {
      settleTemplateFavoriteMutation(mutation: Promise<unknown>, reportError: () => void): Promise<void>;
    };
    const reportError = vi.fn();

    await expect(catalogState.settleTemplateFavoriteMutation(Promise.resolve(), reportError)).resolves.toBeUndefined();
    expect(reportError).not.toHaveBeenCalled();
    await expect(catalogState.settleTemplateFavoriteMutation(Promise.reject(new Error('failed')), reportError)).resolves.toBeUndefined();
    expect(reportError).toHaveBeenCalledOnce();
  });

  test('keeps the preview use action in a stable footer on desktop and mobile', async () => {
    const preview = await import('./template-preview-dialog') as typeof import('./template-preview-dialog') & {
      TEMPLATE_PREVIEW_FOOTER_CLASSES: string;
      TemplatePreviewFooter: React.ComponentType<{
        creating: boolean;
        labels: { useTemplate: string; creating: string; copyTemplate: string };
        onUse(): void;
      }>;
    };
    const markup = renderToString(
      <preview.TemplatePreviewFooter
        creating={false}
        labels={{ useTemplate: 'Use template', creating: 'Creating', copyTemplate: 'Copy template' }}
        onUse={() => undefined}
      />,
    );

    expect(preview.TEMPLATE_PREVIEW_FOOTER_CLASSES).toContain('shrink-0');
    expect(preview.TEMPLATE_PREVIEW_FOOTER_CLASSES).not.toContain('sm:hidden');
    expect(markup).toContain('Use template');
  });

  test('shows the catalog skeleton during idle hydration and active replacement loads', async () => {
    const catalogState = await import('./template-catalog-state') as typeof import('./template-catalog-state') & {
      shouldShowTemplateCatalogSkeleton(status: 'idle' | 'loading' | 'ready' | 'empty' | 'error', isLoading: boolean): boolean;
    };

    expect(catalogState.shouldShowTemplateCatalogSkeleton('idle', false)).toBe(true);
    expect(catalogState.shouldShowTemplateCatalogSkeleton('loading', true)).toBe(true);
    expect(catalogState.shouldShowTemplateCatalogSkeleton('ready', false)).toBe(false);
  });
});

describe('template catalog readiness effects', () => {
  function installCatalogFetch() {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetcher = vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input);
      calls.push({ url, init });
      if (url === '/api/templates/facets') return json(facets);
      if (url === '/api/templates/recent') return json([catalogItem('recent')]);
      if (url.startsWith('/api/templates/favorites')) {
        return json({ items: [catalogItem('favorite')], nextCursor: null });
      }
      if (url.startsWith('/api/templates?')) return json({ items: [catalogItem('public')], nextCursor: null });
      throw new Error(`unexpected request: ${url}`);
    });
    vi.stubGlobal('fetch', fetcher);
    return calls;
  }

  test.each(['favorites', 'recent'] as const)(
    'anonymous %s waits for fingerprint readiness in the mounted catalog effect',
    async (view) => {
      window.history.replaceState({}, '', `/en/templates?view=${view}`);
      const calls = installCatalogFetch();
      const { TemplateCatalog } = await import('./template-catalog');
      const mounted = render(<TemplateCatalog />);

      await waitFor(() => expect(calls).toHaveLength(0));
      expect(mounted.container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0);
      expect(mounted.container.textContent).not.toContain('states.error');

      runtime.fingerprint = 'fingerprint-ready';
      runtime.fingerprintLoading = false;
      mounted.rerender(<TemplateCatalog />);
      await waitFor(() => expect(calls).toHaveLength(3));

      expect(calls.map(({ url }) => url).sort()).toEqual([
        '/api/templates/facets',
        view === 'favorites' ? '/api/templates/favorites?limit=20' : '/api/templates/recent',
        '/api/templates/favorites?limit=20',
      ].sort());
      expect(calls.filter(({ url }) => url !== '/api/templates/facets').every(({ init }) => (
        new Headers(init?.headers).get('x-fingerprint') === 'fingerprint-ready'
      ))).toBe(true);
    },
  );

  test.each(['favorites', 'recent'] as const)(
    'session-auth %s loads while fingerprint is pending without a fingerprint header',
    async (view) => {
      runtime.authEnabled = true;
      window.history.replaceState({}, '', `/en/templates?view=${view}`);
      const calls = installCatalogFetch();
      const { TemplateCatalog } = await import('./template-catalog');
      render(<TemplateCatalog />);

      await waitFor(() => expect(calls).toHaveLength(3));
      expect(calls.map(({ url }) => url).sort()).toEqual([
        '/api/templates/facets',
        view === 'favorites' ? '/api/templates/favorites?limit=20' : '/api/templates/recent',
        '/api/templates/favorites?limit=20',
      ].sort());
      expect(calls.filter(({ url }) => url !== '/api/templates/facets').every(({ init }) => (
        !new Headers(init?.headers).has('x-fingerprint')
      ))).toBe(true);
    },
  );

  test('public view remains available while anonymous fingerprint discovery is pending', async () => {
    window.history.replaceState({}, '', '/en/templates?view=public');
    const calls = installCatalogFetch();
    const { TemplateCatalog } = await import('./template-catalog');
    render(<TemplateCatalog />);

    await waitFor(() => expect(calls.length).toBe(2));
    expect(calls.map(({ url }) => url).sort()).toEqual(['/api/templates/facets', '/api/templates?limit=20'].sort());
  });

  test('local view stays empty without issuing network requests', async () => {
    window.history.replaceState({}, '', '/en/templates?view=local');
    const calls = installCatalogFetch();
    const { TemplateCatalog } = await import('./template-catalog');
    const mounted = render(<TemplateCatalog />);

    await waitFor(() => expect(calls).toHaveLength(0));
    expect(mounted.container.textContent).toContain('states.localEmpty');
  });
});
