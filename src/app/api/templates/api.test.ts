import { createHash } from 'node:crypto';

import { beforeEach, describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  let readyPromise: Promise<void> = Promise.resolve();
  const repository = {
    list: vi.fn(),
    getFacets: vi.fn(),
    getDetail: vi.fn(),
    getVersion: vi.fn(),
    addFavorite: vi.fn(),
    removeFavorite: vi.fn(),
    listFavorites: vi.fn(),
    listRecent: vi.fn(),
  };
  return {
    repository,
    createTemplateRepository: vi.fn(() => repository),
    resolveUser: vi.fn(),
    getUserIdFromRequest: vi.fn((request: Request) => request.headers.get('x-fingerprint')),
    sqlClient: vi.fn(),
    dbReady: {
      then: (
        onFulfilled?: (value: void) => unknown,
        onRejected?: (reason: unknown) => unknown,
      ) => readyPromise.then(onFulfilled, onRejected),
    },
    setDbReady: (promise: Promise<void>) => {
      readyPromise = promise;
    },
  };
});

vi.mock('@/lib/db', () => ({ db: { $client: mocks.sqlClient }, dbReady: mocks.dbReady }));
vi.mock('@/lib/auth/helpers', () => ({
  resolveUser: mocks.resolveUser,
  getUserIdFromRequest: mocks.getUserIdFromRequest,
}));
vi.mock('@/lib/db/repositories/template.repository', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/db/repositories/template.repository')>();
  return { ...actual, createTemplateRepository: mocks.createTemplateRepository };
});

import { CatalogQueryError, encodeCatalogCursor } from '@/lib/templates/catalog-query';
import { TemplateRepositoryError } from '@/lib/db/repositories/template.repository';
import { GET as getTemplates } from './route';
import { GET as getFacets } from './facets/route';
import { GET as getTemplate } from './[slug]/route';
import { GET as getVersion } from './[slug]/versions/[version]/route';
import { DELETE as deleteFavorite, POST as postFavorite } from './[slug]/favorite/route';
import { GET as getFavorites } from './favorites/route';
import { GET as getRecent } from './recent/route';

const initialRepositoryFactoryCalls = [...mocks.createTemplateRepository.mock.calls];

const PUBLIC_CACHE = 'public, max-age=60, stale-while-revalidate=300';
const PRIVATE_CACHE = 'private, no-store';

const capabilities = {
  supportedSections: ['personal_info', 'summary'],
  paperSizes: ['a4', 'letter'],
  supportsAvatar: true,
  atsCompatible: true,
  supportsZh: true,
  supportsEn: true,
  supportsHtml: true,
  supportsPdf: true,
  docxFidelity: 'generic',
} as const;

const item = {
  slug: 'classic',
  stableVersion: '1.0.0',
  nameZh: '经典',
  nameEn: 'Classic',
  category: { id: 'general', slug: 'general', nameZh: '通用', nameEn: 'General', sortOrder: 0 },
  tags: [],
  thumbnailPath: `templates/classic/v1.0.0/thumbnail-${'a'.repeat(64)}.png`,
  fullPreviewPath: `templates/classic/v1.0.0/preview-${'b'.repeat(64)}.png`,
  capabilities,
  favorite: false,
};

const legacyDetail = {
  ...item,
  version: { id: 'classic@1.0.0', version: '1.0.0', publishedAt: '2026-07-16T00:00:00.000Z' },
  manifestHash: 'c'.repeat(64),
  source: { kind: 'official', license: 'Apache-2.0' },
  rendererKind: 'legacy-react',
  manifest: null,
} as const;

const declarativeDetail = {
  ...legacyDetail,
  rendererKind: 'declarative-v1',
  manifestHash: 'd'.repeat(64),
  manifest: {
    schemaVersion: 1,
    rendererKind: 'declarative-v1',
    layout: { type: 'single-column', sidebarPosition: 'left', sidebarWidthPercent: 32, columnGapMm: 8 },
    typography: { fontFamily: 'noto-sans-sc', baseFontSizePt: 10.5, lineHeight: 1.5, headingScale: 1.25 },
    colors: { text: '#111111', muted: '#666666', accent: '#2563eb', background: '#ffffff' },
    spacing: { pageMarginMm: 12, sectionGapMm: 6 },
    sectionSlots: [{ sectionType: 'personal_info', placement: 'main', order: 0 }],
    sectionStyles: [],
    features: { showAvatar: true, showQrCodes: true, showPageNumbers: false, maxPages: 4 },
  },
} as const;

const facets = {
  total: 1,
  categories: [{ ...item.category, count: 1 }],
  tags: [],
  capabilities: {
    ats: { true: 1, false: 0 },
    avatar: { true: 1, false: 0 },
    paper: { a4: 1, letter: 1 },
    docx: { true: 1, false: 0 },
  },
};

function request(path: string, headers?: HeadersInit) {
  return new Request(`http://localhost${path}`, { headers });
}

function context<T extends Record<string, string>>(params: T) {
  return { params: Promise.resolve(params) };
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

const invalidCatalogCursors = [
  ['malformed', 'not-base64', undefined],
  [
    'v1 internal-ID',
    Buffer.from(JSON.stringify({ v: 1, s: 'newest', k: 1, id: 'internal-template-id' })).toString('base64url'),
    undefined,
  ],
  [
    'cross-sort',
    encodeCatalogCursor({ sort: 'popular', sortValue: 1, templateSlug: 'classic' }),
    'name',
  ],
  [
    'oversized public-slug',
    encodeCatalogCursor({ sort: 'newest', sortValue: 1, templateSlug: 'a'.repeat(81) }),
    undefined,
  ],
] as const;

async function invokeBeforeDatabaseReady(invoke: () => Promise<Response>) {
  const gate = deferred();
  mocks.setDbReady(gate.promise);
  let settledBeforeReadiness = false;
  const pending = invoke().then((response) => {
    settledBeforeReadiness = true;
    return response;
  });
  for (let attempt = 0; attempt < 10 && !settledBeforeReadiness; attempt += 1) {
    await Promise.resolve();
  }
  const settled = settledBeforeReadiness;
  gate.resolve();
  return { settled, response: await pending };
}

async function body(response: Response) {
  return response.json() as Promise<Record<string, unknown>>;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.setDbReady(Promise.resolve());
  mocks.repository.list.mockResolvedValue({ items: [item], nextCursor: null });
  mocks.repository.getFacets.mockResolvedValue(facets);
  mocks.repository.getDetail.mockResolvedValue(legacyDetail);
  mocks.repository.getVersion.mockResolvedValue(declarativeDetail);
  mocks.repository.listFavorites.mockResolvedValue({ items: [{ ...item, favorite: true }], nextCursor: null });
  mocks.repository.listRecent.mockResolvedValue([{ ...item, favorite: true }]);
  mocks.repository.addFavorite.mockResolvedValue(undefined);
  mocks.repository.removeFavorite.mockResolvedValue(undefined);
  mocks.resolveUser.mockResolvedValue({ id: 'user-a' });
});

describe('template catalog public APIs', () => {
  test('passes only catalog query fields that are present in the request', async () => {
    const defaultResponse = await getTemplates(request('/api/templates'));
    const limitedResponse = await getTemplates(request('/api/templates?limit=20'));

    expect(defaultResponse.status).toBe(200);
    expect(limitedResponse.status).toBe(200);
    expect(mocks.repository.list).toHaveBeenNthCalledWith(1, {});
    expect(mocks.repository.list).toHaveBeenNthCalledWith(2, { limit: 20 });
    expect(Object.keys(mocks.repository.list.mock.calls[0]![0])).toEqual([]);
    expect(Object.keys(mocks.repository.list.mock.calls[1]![0])).toEqual(['limit']);
  });

  test('creates one repository from the existing Drizzle client and never resolves a public user', async () => {
    await getFacets(request('/api/templates/facets'));
    await getTemplates(request('/api/templates'));
    await getTemplate(request('/api/templates/classic'), context({ slug: 'classic' }));
    await getVersion(request('/api/templates/classic/versions/1.0.0'), context({ slug: 'classic', version: '1.0.0' }));

    expect(initialRepositoryFactoryCalls).toEqual([[mocks.sqlClient]]);
    expect(mocks.resolveUser).not.toHaveBeenCalled();
  });

  test('parses repeated tags and all supported catalog query values', async () => {
    const cursor = encodeCatalogCursor({ sort: 'popular', sortValue: 9, templateSlug: 'classic' });
    const response = await getTemplates(request(
      '/api/templates?q=engineer&category=general&tag=style-clean&tag=capability-ats'
      + `&ats=true&avatar=false&paper=a4&docx=true&sort=popular&cursor=${cursor}&limit=40`,
    ));

    expect(response.status).toBe(200);
    expect(mocks.repository.list).toHaveBeenCalledWith({
      q: 'engineer',
      category: 'general',
      tags: ['style-clean', 'capability-ats'],
      ats: true,
      avatar: false,
      paper: 'a4',
      docx: true,
      sort: 'popular',
      cursor,
      limit: 40,
    });
  });

  test('applies the query length limit after Task 5 search normalization', async () => {
    const rawQuery = `  ＡＴＳ${' '.repeat(110)}Friendly  `;
    const response = await getTemplates(request(`/api/templates?q=${encodeURIComponent(rawQuery)}`));
    expect(response.status).toBe(200);
    expect(mocks.repository.list).toHaveBeenCalledWith({ q: rawQuery });
  });

  test.each([
    ['/api/templates?q=one&q=two', 'repeated single query'],
    [`/api/templates?q=${'q'.repeat(101)}`, 'query over 100 characters'],
    ['/api/templates?limit=41', 'limit over 40'],
    [`/api/templates?cursor=${'c'.repeat(2049)}`, 'oversized cursor'],
    ['/api/templates?ats=1', 'non-boolean filter'],
    [`/api/templates?${Array.from({ length: 33 }, (_, index) => `tag=tag-${index}`).join('&')}`, 'too many tags'],
    ['/api/templates?unknown=true', 'unknown query key'],
  ])('rejects %s before calling the repository (%s)', async (path) => {
    const response = await getTemplates(request(path));
    expect(response.status).toBe(400);
    expect(await body(response)).toEqual({ error: { code: 'TEMPLATE_QUERY_INVALID' } });
    expect(mocks.repository.list).not.toHaveBeenCalled();
  });

  test('returns stable cursor errors without leaking the repository message', async () => {
    mocks.repository.list.mockRejectedValue(new CatalogQueryError('TEMPLATE_CURSOR_INVALID', 'secret cursor detail'));
    const cursor = encodeCatalogCursor({ sort: 'newest', sortValue: 1, templateSlug: 'classic' });
    const response = await getTemplates(request(`/api/templates?cursor=${cursor}`));
    expect(response.status).toBe(400);
    const responseBody = await body(response);
    expect(responseBody).toEqual({ error: { code: 'TEMPLATE_CURSOR_INVALID' } });
    expect(JSON.stringify(responseBody)).not.toContain('secret');
  });

  test.each(invalidCatalogCursors)(
    'rejects %s cursors before database readiness or any auth/repository side effect',
    async (_name, cursor, sort) => {
      const query = new URLSearchParams({ cursor });
      if (sort) query.set('sort', sort);
      const { settled, response } = await invokeBeforeDatabaseReady(
        () => getTemplates(request(`/api/templates?${query}`)),
      );

      expect(settled).toBe(true);
      expect(response.status).toBe(400);
      expect(await body(response)).toEqual({ error: { code: 'TEMPLATE_CURSOR_INVALID' } });
      expect(mocks.getUserIdFromRequest).not.toHaveBeenCalled();
      expect(mocks.resolveUser).not.toHaveBeenCalled();
      expect(Object.values(mocks.repository).every((operation) => operation.mock.calls.length === 0)).toBe(true);
    },
  );

  test('uses canonical response SHA-256 ETags and handles exact, comma-list, and wildcard conditions', async () => {
    const first = await getTemplates(request('/api/templates'));
    const text = await first.clone().text();
    const etag = `"${createHash('sha256').update(text).digest('hex')}"`;
    expect(first.headers.get('etag')).toBe(etag);
    expect(first.headers.get('cache-control')).toBe(PUBLIC_CACHE);

    for (const value of [etag, `W/${etag}`, `"other", W/${etag}`, '*']) {
      const response = await getTemplates(request('/api/templates', { 'if-none-match': value }));
      expect(response.status).toBe(304);
      expect(await response.text()).toBe('');
      expect(response.headers.get('etag')).toBe(etag);
      expect(response.headers.get('cache-control')).toBe(PUBLIC_CACHE);
    }
  });

  test('returns only a v2 public-slug payload in a non-empty API cursor', async () => {
    const cursor = encodeCatalogCursor({
      sort: 'popular',
      sortValue: 9,
      templateSlug: 'classic',
    });
    mocks.repository.list.mockResolvedValueOnce({ items: [item], nextCursor: cursor });
    const response = await getTemplates(request('/api/templates?sort=popular'));
    const responseBody = await body(response) as { nextCursor: string };
    const payload = JSON.parse(Buffer.from(responseBody.nextCursor, 'base64url').toString('utf8'));
    expect(payload).toEqual({ v: 2, s: 'popular', k: 9, slug: 'classic' });
    expect(JSON.stringify(payload)).not.toMatch(/\bid\b|internal/);
  });

  test('waits for database readiness before every public repository operation', async () => {
    const gate = deferred();
    mocks.setDbReady(gate.promise);
    const pending = [
      getFacets(request('/api/templates/facets')),
      getTemplates(request('/api/templates')),
      getTemplate(request('/api/templates/classic'), context({ slug: 'classic' })),
      getVersion(
        request('/api/templates/classic/versions/1.0.0'),
        context({ slug: 'classic', version: '1.0.0' }),
      ),
    ];
    await Promise.resolve();
    await Promise.resolve();
    expect(mocks.repository.getFacets).not.toHaveBeenCalled();
    expect(mocks.repository.list).not.toHaveBeenCalled();
    expect(mocks.repository.getDetail).not.toHaveBeenCalled();
    expect(mocks.repository.getVersion).not.toHaveBeenCalled();
    expect(mocks.resolveUser).not.toHaveBeenCalled();
    gate.resolve();
    expect((await Promise.all(pending)).map((response) => response.status)).toEqual([200, 200, 200, 200]);
  });

  test('returns facets with public cache and response-derived ETag', async () => {
    const response = await getFacets(request('/api/templates/facets?locale=zh'));
    expect(response.status).toBe(200);
    expect(await body(response)).toEqual(facets);
    expect(response.headers.get('cache-control')).toBe(PUBLIC_CACHE);
    expect(response.headers.get('etag')).toMatch(/^"[0-9a-f]{64}"$/);

    const conditional = await getFacets(request('/api/templates/facets?locale=zh', {
      'if-none-match': response.headers.get('etag')!,
    }));
    expect(conditional.status).toBe(304);
    expect(await conditional.text()).toBe('');
  });

  test('returns both renderer branches with manifestHash ETags and no internal legacy fields', async () => {
    const legacy = await getTemplate(request('/api/templates/classic'), context({ slug: 'classic' }));
    expect(legacy.status).toBe(200);
    const legacyBody = await body(legacy);
    expect(legacyBody).toEqual(legacyDetail);
    expect(legacy.headers.get('etag')).toBe(`"${legacyDetail.manifestHash}"`);
    expect(legacy.headers.get('cache-control')).toBe(PUBLIC_CACHE);
    const legacyConditional = await getTemplate(
      request('/api/templates/classic', { 'if-none-match': `"${legacyDetail.manifestHash}"` }),
      context({ slug: 'classic' }),
    );
    expect(legacyConditional.status).toBe(304);
    expect(await legacyConditional.text()).toBe('');

    const declarative = await getVersion(
      request('/api/templates/classic/versions/1.0.0'),
      context({ slug: 'classic', version: '1.0.0' }),
    );
    expect(declarative.status).toBe(200);
    expect(await body(declarative)).toEqual(declarativeDetail);
    expect(declarative.headers.get('etag')).toBe(`"${declarativeDetail.manifestHash}"`);
    const declarativeConditional = await getVersion(
      request('/api/templates/classic/versions/1.0.0', {
        'if-none-match': `"other", "${declarativeDetail.manifestHash}"`,
      }),
      context({ slug: 'classic', version: '1.0.0' }),
    );
    expect(declarativeConditional.status).toBe(304);
    expect(await declarativeConditional.text()).toBe('');
    expect(JSON.stringify(legacyBody)).not.toMatch(/provenance|sourcePath|sourceHash|assetInventory/);
  });

  test('maps catalog DTO drift to 422 without serializing internal fields', async () => {
    mocks.repository.list.mockResolvedValue({
      items: [{ ...item, internalTemplateId: 'internal-template-id' }],
      nextCursor: null,
    });
    const response = await getTemplates(request('/api/templates'));
    const responseBody = await body(response);
    expect(response.status).toBe(422);
    expect(responseBody).toEqual({ error: { code: 'TEMPLATE_MANIFEST_INVALID' } });
    expect(JSON.stringify(responseBody)).not.toContain('internal-template-id');
  });

  test('fails closed when a legacy repository result contains internal fields', async () => {
    mocks.repository.getDetail.mockResolvedValue({ ...legacyDetail, provenance: { sourcePath: '/internal/file.tsx' } });
    const response = await getTemplate(request('/api/templates/classic'), context({ slug: 'classic' }));
    expect(response.status).toBe(422);
    const responseBody = await body(response);
    expect(responseBody).toEqual({ error: { code: 'TEMPLATE_MANIFEST_INVALID' } });
    expect(JSON.stringify(responseBody)).not.toContain('/internal/file.tsx');
  });

  test('maps not found, blocked fallback, hash drift, and unknown failures without internal messages', async () => {
    mocks.repository.getDetail.mockResolvedValueOnce(null);
    let response = await getTemplate(request('/api/templates/missing'), context({ slug: 'missing' }));
    expect(response.status).toBe(404);
    expect(await body(response)).toEqual({ error: { code: 'TEMPLATE_NOT_FOUND' } });

    mocks.repository.getVersion.mockRejectedValueOnce(new TemplateRepositoryError('TEMPLATE_VERSION_BLOCKED', '1.0.0'));
    response = await getVersion(request('/api/templates/classic/versions/2.0.0'), context({ slug: 'classic', version: '2.0.0' }));
    expect(response.status).toBe(410);
    expect(await body(response)).toEqual({
      error: { code: 'TEMPLATE_VERSION_BLOCKED', fallbackVersion: '1.0.0' },
    });

    mocks.repository.getDetail.mockRejectedValueOnce(new TemplateRepositoryError('TEMPLATE_HASH_MISMATCH'));
    response = await getTemplate(request('/api/templates/classic'), context({ slug: 'classic' }));
    expect(response.status).toBe(422);
    expect(await body(response)).toEqual({ error: { code: 'TEMPLATE_HASH_MISMATCH' } });

    mocks.repository.getFacets.mockRejectedValueOnce(new Error('postgresql://secret@internal/db'));
    response = await getFacets(request('/api/templates/facets'));
    expect(response.status).toBe(500);
    const responseBody = await body(response);
    expect(responseBody).toEqual({ error: { code: 'TEMPLATE_INTERNAL_ERROR' } });
    expect(JSON.stringify(responseBody)).not.toContain('secret');
  });

  test.each([
    ['/api/templates/Classic', { slug: 'Classic' }],
    ['/api/templates/classic/versions/v1', { slug: 'classic', version: 'v1' }],
  ])('rejects an invalid public path before repository access', async (path, params) => {
    const response = 'version' in params
      ? await getVersion(request(path), context(params))
      : await getTemplate(request(path), context(params));
    expect(response.status).toBe(400);
    expect(await body(response)).toEqual({ error: { code: 'TEMPLATE_QUERY_INVALID' } });
    expect(mocks.repository.getDetail).not.toHaveBeenCalled();
    expect(mocks.repository.getVersion).not.toHaveBeenCalled();
  });
});

describe('template catalog user APIs', () => {
  test('parses a minimal favorites query before auth and passes only present fields after auth', async () => {
    mocks.resolveUser.mockResolvedValueOnce(null);
    const unauthorized = await getFavorites(request('/api/templates/favorites?limit=20'));

    expect(unauthorized.status).toBe(401);
    expect(mocks.repository.listFavorites).not.toHaveBeenCalled();

    const authorized = await getFavorites(request(
      '/api/templates/favorites?limit=20',
      { 'x-fingerprint': 'fingerprint-a' },
    ));

    expect(authorized.status).toBe(200);
    expect(mocks.repository.listFavorites).toHaveBeenCalledWith('user-a', { limit: 20 });
    expect(Object.keys(mocks.repository.listFavorites.mock.calls[0]![1])).toEqual(['limit']);
  });

  test.each(invalidCatalogCursors)(
    'rejects %s favorites cursors before database readiness, sample-user resolution, or repository access',
    async (_name, cursor, sort) => {
      const query = new URLSearchParams({ cursor });
      if (sort) query.set('sort', sort);
      const { settled, response } = await invokeBeforeDatabaseReady(
        () => getFavorites(request(`/api/templates/favorites?${query}`, { 'x-fingerprint': 'fingerprint-a' })),
      );

      expect(settled).toBe(true);
      expect(response.status).toBe(400);
      expect(await body(response)).toEqual({ error: { code: 'TEMPLATE_CURSOR_INVALID' } });
      expect(mocks.getUserIdFromRequest).not.toHaveBeenCalled();
      expect(mocks.resolveUser).not.toHaveBeenCalled();
      expect(Object.values(mocks.repository).every((operation) => operation.mock.calls.length === 0)).toBe(true);
    },
  );

  test.each([
    ['favorites', () => getFavorites(request('/api/templates/favorites'))],
    ['recent', () => getRecent(request('/api/templates/recent'))],
    ['favorite POST', () => postFavorite(request('/api/templates/classic/favorite'), context({ slug: 'classic' }))],
    ['favorite DELETE', () => deleteFavorite(request('/api/templates/classic/favorite'), context({ slug: 'classic' }))],
  ])('returns 401 before user repository access for %s', async (_name, invoke) => {
    mocks.resolveUser.mockResolvedValueOnce(null);
    const response = await invoke();
    expect(response.status).toBe(401);
    expect(await body(response)).toEqual({ error: { code: 'UNAUTHORIZED' } });
    expect(mocks.repository.listFavorites).not.toHaveBeenCalled();
    expect(mocks.repository.listRecent).not.toHaveBeenCalled();
    expect(mocks.repository.addFavorite).not.toHaveBeenCalled();
    expect(mocks.repository.removeFavorite).not.toHaveBeenCalled();
  });

  test('uses fingerprint resolution, scopes favorites by user, and returns private no-store', async () => {
    const response = await getFavorites(request(
      '/api/templates/favorites?sort=name&tag=style-clean&limit=20',
      { 'x-fingerprint': 'fingerprint-a' },
    ));
    expect(mocks.getUserIdFromRequest).toHaveBeenCalled();
    expect(mocks.resolveUser).toHaveBeenCalledWith('fingerprint-a');
    expect(mocks.repository.listFavorites).toHaveBeenCalledWith('user-a', {
      sort: 'name',
      tags: ['style-clean'],
      limit: 20,
    });
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe(PRIVATE_CACHE);
    expect(response.headers.get('etag')).toBeNull();
  });

  test('waits for database readiness before auth or a private repository operation', async () => {
    const gate = deferred();
    mocks.setDbReady(gate.promise);
    const pending = getFavorites(request(
      '/api/templates/favorites',
      { 'x-fingerprint': 'fingerprint-a' },
    ));
    await Promise.resolve();
    await Promise.resolve();
    expect(mocks.getUserIdFromRequest).not.toHaveBeenCalled();
    expect(mocks.resolveUser).not.toHaveBeenCalled();
    expect(mocks.repository.listFavorites).not.toHaveBeenCalled();
    gate.resolve();
    expect((await pending).status).toBe(200);
    expect(mocks.resolveUser).toHaveBeenCalledWith('fingerprint-a');
    expect(mocks.repository.listFavorites).toHaveBeenCalledWith('user-a', {});
  });

  test('scopes recent by user and always returns private no-store', async () => {
    const response = await getRecent(request('/api/templates/recent', { 'x-fingerprint': 'fingerprint-a' }));
    expect(mocks.repository.listRecent).toHaveBeenCalledWith('user-a');
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe(PRIVATE_CACHE);
  });

  test.each([
    ['POST', postFavorite, 'addFavorite'],
    ['DELETE', deleteFavorite, 'removeFavorite'],
  ] as const)('%s mutation passes only the public slug and is idempotent', async (_method, handler, operation) => {
    const first = await handler(
      request('/api/templates/public-template-slug/favorite', { 'x-fingerprint': 'fingerprint-a' }),
      context({ slug: 'public-template-slug' }),
    );
    const second = await handler(
      request('/api/templates/public-template-slug/favorite', { 'x-fingerprint': 'fingerprint-a' }),
      context({ slug: 'public-template-slug' }),
    );
    expect(mocks.repository[operation]).toHaveBeenNthCalledWith(1, 'user-a', 'public-template-slug');
    expect(mocks.repository[operation]).toHaveBeenNthCalledWith(2, 'user-a', 'public-template-slug');
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(await body(first)).toEqual({ ok: true });
    expect(first.headers.get('cache-control')).toBe(PRIVATE_CACHE);
    expect(first.headers.get('etag')).toBeNull();
  });

  test('maps a missing or invisible favorite target to a stable 404', async () => {
    mocks.repository.addFavorite.mockRejectedValueOnce(new TemplateRepositoryError('TEMPLATE_NOT_FOUND'));
    const response = await postFavorite(
      request('/api/templates/missing/favorite', { 'x-fingerprint': 'fingerprint-a' }),
      context({ slug: 'missing' }),
    );
    expect(response.status).toBe(404);
    expect(await body(response)).toEqual({ error: { code: 'TEMPLATE_NOT_FOUND' } });
  });

  test.each([
    ['favorites query', () => getFavorites(request('/api/templates/favorites?limit=0'))],
    ['recent query', () => getRecent(request('/api/templates/recent?unexpected=true'))],
    ['favorite POST path', () => postFavorite(
      request('/api/templates/INVALID/favorite'),
      context({ slug: 'INVALID' }),
    )],
    ['favorite DELETE path', () => deleteFavorite(
      request('/api/templates/INVALID/favorite'),
      context({ slug: 'INVALID' }),
    )],
  ])('rejects invalid %s before readiness, fingerprint, auth, or repository access', async (_name, invoke) => {
    const gate = deferred();
    mocks.setDbReady(gate.promise);
    const response = await invoke();
    expect(response.status).toBe(400);
    expect(mocks.getUserIdFromRequest).not.toHaveBeenCalled();
    expect(mocks.resolveUser).not.toHaveBeenCalled();
    expect(mocks.repository.listFavorites).not.toHaveBeenCalled();
    expect(mocks.repository.listRecent).not.toHaveBeenCalled();
    expect(mocks.repository.addFavorite).not.toHaveBeenCalled();
    expect(mocks.repository.removeFavorite).not.toHaveBeenCalled();
  });
});
