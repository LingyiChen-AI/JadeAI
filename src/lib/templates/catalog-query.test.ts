import { describe, expect, test } from 'vitest';

type CatalogQueryModule = typeof import('./catalog-query');

async function loadCatalogQuery(): Promise<CatalogQueryModule> {
  return import('./catalog-query');
}

const aliases = [
  { tagSlug: 'layout-single-column', normalizedAlias: 'single column' },
  { tagSlug: 'layout-single-column', normalizedAlias: 'single' },
  { tagSlug: 'capability-ats', normalizedAlias: 'ats friendly' },
];

describe('catalog query normalization', () => {
  test('normalizes Unicode with NFKC, lowercase, trim, and collapsed whitespace', async () => {
    const { normalizeCatalogSearchText } = await loadCatalogQuery();
    expect(normalizeCatalogSearchText('  ＡＴＳ\u3000 Friendly  ')).toBe('ats friendly');
  });

  test('rejects a normalized query longer than 100 characters with a stable code', async () => {
    const { normalizeCatalogQuery } = await loadCatalogQuery();
    expect(() => normalizeCatalogQuery({ q: ` ${'A'.repeat(101)} ` }, aliases))
      .toThrowError(expect.objectContaining({ code: 'TEMPLATE_QUERY_INVALID' }));
  });

  test('expands aliases to canonical tags and deduplicates them', async () => {
    const { normalizeCatalogQuery } = await loadCatalogQuery();
    expect(normalizeCatalogQuery({ tags: [' Single ', 'layout-single-column'] }, aliases).tags)
      .toEqual(['layout-single-column']);
  });

  test('rejects unknown tag aliases instead of silently dropping filters', async () => {
    const { normalizeCatalogQuery } = await loadCatalogQuery();
    expect(() => normalizeCatalogQuery({ tags: ['does-not-exist'] }, aliases))
      .toThrowError(expect.objectContaining({ code: 'TEMPLATE_QUERY_INVALID' }));
  });

  test.each([
    [{ sort: 'random' }, 'sort'],
    [{ paper: 'legal' }, 'paper'],
    [{ ats: 'yes' }, 'ats'],
    [{ avatar: 1 }, 'avatar'],
    [{ docx: null }, 'docx'],
  ])('rejects runtime-invalid query value %j for %s', async (input, field) => {
    const { normalizeCatalogQuery } = await loadCatalogQuery();
    expect(() => normalizeCatalogQuery(input as never, aliases))
      .toThrowError(expect.objectContaining({ code: 'TEMPLATE_QUERY_INVALID', message: `invalid_${field}` }));
  });
});

describe('catalog query matching', () => {
  const item = {
    categorySlug: 'ats',
    tagSlugs: ['layout-single-column', 'capability-ats', 'paper-a4'],
    searchText: '软件工程师 software engineer ats friendly',
    capabilities: {
      atsCompatible: true,
      supportsAvatar: false,
      paperSizes: ['a4'] as const,
      docxFidelity: 'generic' as const,
    },
  };

  test('applies category and normalized text filters', async () => {
    const { catalogItemMatchesQuery, normalizeCatalogQuery } = await loadCatalogQuery();
    expect(catalogItemMatchesQuery(item, normalizeCatalogQuery({ category: 'ats', q: 'ＳＯＦＴＷＡＲＥ' }, aliases)))
      .toBe(true);
    expect(catalogItemMatchesQuery(item, normalizeCatalogQuery({ category: 'general' }, aliases)))
      .toBe(false);
  });

  test('requires every selected tag with AND semantics', async () => {
    const { catalogItemMatchesQuery, normalizeCatalogQuery } = await loadCatalogQuery();
    expect(catalogItemMatchesQuery(item, normalizeCatalogQuery({ tags: ['single', 'ats friendly'] }, aliases)))
      .toBe(true);
    expect(catalogItemMatchesQuery(item, normalizeCatalogQuery({ tags: ['single', 'paper-letter'] }, [
      ...aliases,
      { tagSlug: 'paper-letter', normalizedAlias: 'paper-letter' },
    ]))).toBe(false);
  });

  test('applies ATS, avatar, paper, and DOCX capability filters', async () => {
    const { catalogItemMatchesQuery, normalizeCatalogQuery } = await loadCatalogQuery();
    expect(catalogItemMatchesQuery(item, normalizeCatalogQuery({ ats: true, avatar: false, paper: 'a4', docx: true }, aliases)))
      .toBe(true);
    expect(catalogItemMatchesQuery(item, normalizeCatalogQuery({ ats: false }, aliases))).toBe(false);
    expect(catalogItemMatchesQuery(item, normalizeCatalogQuery({ avatar: true }, aliases))).toBe(false);
    expect(catalogItemMatchesQuery(item, normalizeCatalogQuery({ paper: 'letter' }, aliases))).toBe(false);
    expect(catalogItemMatchesQuery(item, normalizeCatalogQuery({ docx: false }, aliases))).toBe(false);
  });

  test.each([
    ['%', 'literal 100% match', true],
    ['%', 'literal 100x match', false],
    ['_', 'literal score_value', true],
    ['_', 'literal scorexvalue', false],
    ['\\', 'literal c:\\resume path', true],
    ['\\', 'literal c:/resume path', false],
    ['  ＡＴＳ\u3000 Friendly ', 'role ats friendly engineer', true],
  ])('matches normalized query %j as a literal substring', async (q, searchText, expected) => {
    const { catalogItemMatchesQuery, normalizeCatalogQuery } = await loadCatalogQuery();
    expect(catalogItemMatchesQuery({ ...item, searchText }, normalizeCatalogQuery({ q }, aliases))).toBe(expected);
  });
});

describe('catalog sort and cursor', () => {
  test('uses public template slug as the deterministic tie-breaker', async () => {
    const { compareCatalogSortRows } = await loadCatalogQuery();
    const rows = [
      { templateSlug: 'b', sortValue: 10 },
      { templateSlug: 'a', sortValue: 10 },
      { templateSlug: 'c', sortValue: 20 },
    ];
    expect([...rows].sort((a, b) => compareCatalogSortRows('popular', a, b)).map((row) => row.templateSlug))
      .toEqual(['c', 'a', 'b']);
  });

  test('round-trips v2 public-slug cursors without an internal ID field', async () => {
    const { decodeCatalogCursor, encodeCatalogCursor } = await loadCatalogQuery();
    for (const cursor of [
      { sort: 'newest' as const, sortValue: 123, templateSlug: 'template-a' },
      { sort: 'popular' as const, sortValue: 9, templateSlug: 'template-b' },
      { sort: 'name' as const, sortValue: 'ats engineer', templateSlug: 'template-c' },
    ]) {
      const encoded = encodeCatalogCursor(cursor);
      expect(JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'))).toEqual({
        v: 2,
        s: cursor.sort,
        k: cursor.sortValue,
        slug: cursor.templateSlug,
      });
      expect(decodeCatalogCursor(encoded, cursor.sort)).toEqual(cursor);
    }
  });

  test.each([
    ['malformed', 'not-base64', 'newest'],
    ['stale format', Buffer.from(JSON.stringify({ v: 0, s: 'newest', k: 1, id: 'a' })).toString('base64url'), 'newest'],
    ['old internal-ID format', Buffer.from(JSON.stringify({ v: 1, s: 'newest', k: 1, id: 'internal-a' })).toString('base64url'), 'newest'],
    ['cross-sort', Buffer.from(JSON.stringify({ v: 2, s: 'popular', k: 1, slug: 'a' })).toString('base64url'), 'newest'],
    ['oversized public slug', Buffer.from(JSON.stringify({ v: 2, s: 'newest', k: 1, slug: 'a'.repeat(81) })).toString('base64url'), 'newest'],
    ['non-canonical encoding', Buffer.from(JSON.stringify({ slug: 'a', k: 1, s: 'newest', v: 2 })).toString('base64url'), 'newest'],
  ])('rejects %s cursors with a stable error', async (_name, encoded, expectedSort) => {
    const { decodeCatalogCursor } = await loadCatalogQuery();
    expect(() => decodeCatalogCursor(encoded, expectedSort as 'newest'))
      .toThrowError(expect.objectContaining({ code: 'TEMPLATE_CURSOR_INVALID' }));
  });
});
