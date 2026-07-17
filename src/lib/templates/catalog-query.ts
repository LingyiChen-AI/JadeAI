export const MAX_CATALOG_QUERY_LENGTH = 100;
export const MAX_CATALOG_PAGE_SIZE = 40;
export const MAX_PUBLIC_SLUG_LENGTH = 80;

export type CatalogSort = 'newest' | 'popular' | 'name';
export type CatalogPaper = 'a4' | 'letter';

export type CatalogQueryInput = {
  q?: string;
  category?: string;
  tags?: readonly string[];
  ats?: boolean;
  avatar?: boolean;
  paper?: CatalogPaper;
  docx?: boolean;
  sort?: CatalogSort;
  cursor?: string;
  limit?: number;
};

export type CatalogTagAlias = {
  tagSlug: string;
  normalizedAlias: string;
};

export type NormalizedCatalogQuery = {
  q: string;
  category: string | null;
  tags: string[];
  ats: boolean | null;
  avatar: boolean | null;
  paper: CatalogPaper | null;
  docx: boolean | null;
  sort: CatalogSort;
  cursor: CatalogCursor | null;
  limit: number;
};

export type CatalogCursor = {
  sort: CatalogSort;
  sortValue: number | string;
  templateSlug: string;
};

export class CatalogQueryError extends Error {
  readonly code: 'TEMPLATE_QUERY_INVALID' | 'TEMPLATE_CURSOR_INVALID';

  constructor(code: CatalogQueryError['code'], message: string) {
    super(message);
    this.name = 'CatalogQueryError';
    this.code = code;
  }
}

export function normalizeCatalogSearchText(value: string): string {
  return value.normalize('NFKC').toLowerCase().trim().replace(/\s+/gu, ' ');
}

function normalizeSlug(value: string, field: string): string {
  const normalized = normalizeCatalogSearchText(value);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(normalized)) {
    throw new CatalogQueryError('TEMPLATE_QUERY_INVALID', `invalid_${field}`);
  }
  return normalized;
}

function normalizeTags(values: readonly string[], aliases: readonly CatalogTagAlias[]): string[] {
  const lookup = new Map<string, string>();
  for (const alias of aliases) {
    lookup.set(normalizeCatalogSearchText(alias.normalizedAlias), alias.tagSlug);
    lookup.set(normalizeCatalogSearchText(alias.tagSlug), alias.tagSlug);
  }
  const tags = new Set<string>();
  for (const value of values) {
    const normalized = normalizeCatalogSearchText(value);
    const tag = lookup.get(normalized);
    if (!tag) throw new CatalogQueryError('TEMPLATE_QUERY_INVALID', 'unknown_tag');
    tags.add(tag);
  }
  return [...tags].sort();
}

function isCatalogSort(value: unknown): value is CatalogSort {
  return value === 'newest' || value === 'popular' || value === 'name';
}

export function validateCatalogCursor(
  input: Pick<CatalogQueryInput, 'sort' | 'cursor'>,
): CatalogCursor | null {
  const sort = input.sort ?? 'newest';
  if (!isCatalogSort(sort)) {
    throw new CatalogQueryError('TEMPLATE_QUERY_INVALID', 'invalid_sort');
  }
  return input.cursor == null ? null : decodeCatalogCursor(input.cursor, sort);
}

export function normalizeCatalogQuery(
  input: CatalogQueryInput,
  aliases: readonly CatalogTagAlias[] = [],
  validatedCursor: CatalogCursor | null = validateCatalogCursor(input),
): NormalizedCatalogQuery {
  if (input.sort !== undefined && !['newest', 'popular', 'name'].includes(input.sort)) {
    throw new CatalogQueryError('TEMPLATE_QUERY_INVALID', 'invalid_sort');
  }
  if (input.paper !== undefined && !['a4', 'letter'].includes(input.paper)) {
    throw new CatalogQueryError('TEMPLATE_QUERY_INVALID', 'invalid_paper');
  }
  for (const field of ['ats', 'avatar', 'docx'] as const) {
    if (Object.hasOwn(input, field) && typeof input[field] !== 'boolean') {
      throw new CatalogQueryError('TEMPLATE_QUERY_INVALID', `invalid_${field}`);
    }
  }
  const q = normalizeCatalogSearchText(input.q ?? '');
  if ([...q].length > MAX_CATALOG_QUERY_LENGTH) {
    throw new CatalogQueryError('TEMPLATE_QUERY_INVALID', 'query_too_long');
  }
  const sort = input.sort ?? 'newest';
  const limit = input.limit ?? 20;
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_CATALOG_PAGE_SIZE) {
    throw new CatalogQueryError('TEMPLATE_QUERY_INVALID', 'invalid_limit');
  }
  return {
    q,
    category: input.category == null ? null : normalizeSlug(input.category, 'category'),
    tags: normalizeTags(input.tags ?? [], aliases),
    ats: input.ats ?? null,
    avatar: input.avatar ?? null,
    paper: input.paper ?? null,
    docx: input.docx ?? null,
    sort,
    cursor: validatedCursor,
    limit,
  };
}

export type CatalogMatchItem = {
  categorySlug: string;
  tagSlugs: readonly string[];
  searchText: string;
  capabilities: {
    atsCompatible: boolean;
    supportsAvatar: boolean;
    paperSizes: readonly CatalogPaper[];
    docxFidelity: 'unsupported' | 'generic' | 'high-fidelity';
  };
};

export function catalogItemMatchesQuery(item: CatalogMatchItem, query: NormalizedCatalogQuery): boolean {
  if (query.q && !normalizeCatalogSearchText(item.searchText).includes(query.q)) return false;
  if (query.category && item.categorySlug !== query.category) return false;
  if (!query.tags.every((tag) => item.tagSlugs.includes(tag))) return false;
  if (query.ats !== null && item.capabilities.atsCompatible !== query.ats) return false;
  if (query.avatar !== null && item.capabilities.supportsAvatar !== query.avatar) return false;
  if (query.paper !== null && !item.capabilities.paperSizes.includes(query.paper)) return false;
  if (query.docx !== null && (item.capabilities.docxFidelity !== 'unsupported') !== query.docx) return false;
  return true;
}

export function encodeCatalogCursor(cursor: CatalogCursor): string {
  const payload = { v: 2, s: cursor.sort, k: cursor.sortValue, slug: cursor.templateSlug };
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

export function decodeCatalogCursor(encoded: string, expectedSort: CatalogSort): CatalogCursor {
  try {
    const raw = Buffer.from(encoded, 'base64url').toString('utf8');
    const payload = JSON.parse(raw) as Record<string, unknown>;
    if (
      Object.keys(payload).sort().join(',') !== 'k,s,slug,v'
      || payload.v !== 2
      || !isCatalogSort(payload.s)
      || payload.s !== expectedSort
      || typeof payload.slug !== 'string'
      || payload.slug.length > MAX_PUBLIC_SLUG_LENGTH
      || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(payload.slug)
      || (expectedSort === 'name' ? typeof payload.k !== 'string' : typeof payload.k !== 'number')
      || (typeof payload.k === 'number' && !Number.isSafeInteger(payload.k))
    ) throw new Error('invalid_cursor_payload');
    const cursor = { sort: payload.s, sortValue: payload.k as number | string, templateSlug: payload.slug };
    if (encodeCatalogCursor(cursor) !== encoded) throw new Error('non_canonical_cursor');
    return cursor;
  } catch {
    throw new CatalogQueryError('TEMPLATE_CURSOR_INVALID', 'invalid_cursor');
  }
}

export function compareCatalogSortRows(
  sort: CatalogSort,
  left: { templateSlug: string; sortValue: number | string },
  right: { templateSlug: string; sortValue: number | string },
): number {
  const primary = sort === 'name'
    ? String(left.sortValue).localeCompare(String(right.sortValue))
    : Number(right.sortValue) - Number(left.sortValue);
  return primary || left.templateSlug.localeCompare(right.templateSlug);
}
