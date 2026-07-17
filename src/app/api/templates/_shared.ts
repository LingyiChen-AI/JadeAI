import { createHash } from 'node:crypto';

import { z } from 'zod/v4';

import { getUserIdFromRequest, resolveUser } from '@/lib/auth/helpers';
import { db, dbReady } from '@/lib/db';
import {
  TemplateRepositoryError,
  createTemplateRepository,
  type CatalogSql,
} from '@/lib/db/repositories/template.repository';
import {
  CatalogQueryError,
  MAX_PUBLIC_SLUG_LENGTH,
  normalizeCatalogSearchText,
  validateCatalogCursor,
  type CatalogQueryInput,
} from '@/lib/templates/catalog-query';
import {
  TemplateCatalogItemSchema,
  TemplateCategorySchema,
  TemplateTagSchema,
  TemplateVersionDetailSchema,
} from '@/lib/templates/schema';
import { canonicalizeJson } from '@/lib/templates/security';

const PUBLIC_CACHE = 'public, max-age=60, stale-while-revalidate=300';
const PRIVATE_CACHE = 'private, no-store';
const MAX_TAGS = 32;
const MAX_CURSOR_LENGTH = 2048;

const slugSchema = z.string().min(1).max(MAX_PUBLIC_SLUG_LENGTH).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const versionSchema = z.string().regex(/^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/);
const booleanSchema = z.enum(['true', 'false']).transform((value) => value === 'true');
const queryTextSchema = z.string().refine(
  (value) => [...normalizeCatalogSearchText(value)].length <= 100,
);
const cursorSchema = z.string().min(1).max(MAX_CURSOR_LENGTH);
const tagSchema = z.string().trim().min(1).max(100);

const catalogQuerySchema = z.strictObject({
  q: queryTextSchema.optional(),
  category: slugSchema.optional(),
  tags: z.array(tagSchema).max(MAX_TAGS).optional(),
  ats: booleanSchema.optional(),
  avatar: booleanSchema.optional(),
  paper: z.enum(['a4', 'letter']).optional(),
  docx: booleanSchema.optional(),
  sort: z.enum(['newest', 'popular', 'name']).optional(),
  cursor: cursorSchema.optional(),
  limit: z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().min(1).max(40)).optional(),
});

const facetsQuerySchema = z.strictObject({
  locale: z.enum(['zh', 'en']).optional(),
});

const pageSchema = z.strictObject({
  items: z.array(TemplateCatalogItemSchema),
  nextCursor: z.string().nullable(),
});

const recentSchema = z.array(TemplateCatalogItemSchema).max(20);
const facetCountSchema = z.strictObject({ true: z.number().int().nonnegative(), false: z.number().int().nonnegative() });
const facetsSchema = z.strictObject({
  total: z.number().int().nonnegative(),
  categories: z.array(TemplateCategorySchema.extend({ count: z.number().int().nonnegative() })),
  tags: z.array(TemplateTagSchema.extend({ count: z.number().int().nonnegative() })),
  capabilities: z.strictObject({
    ats: facetCountSchema,
    avatar: facetCountSchema,
    paper: z.strictObject({ a4: z.number().int().nonnegative(), letter: z.number().int().nonnegative() }),
    docx: facetCountSchema,
  }),
});

class RouteInputError extends Error {
  constructor() {
    super('template_route_input_invalid');
    this.name = 'RouteInputError';
  }
}

class UnauthorizedError extends Error {
  constructor() {
    super('template_route_unauthorized');
    this.name = 'UnauthorizedError';
  }
}

export const templateRepository = createTemplateRepository(
  db.$client as unknown as CatalogSql,
);

function inputFailure(): never {
  throw new RouteInputError();
}

function one(searchParams: URLSearchParams, key: string): string | undefined {
  const values = searchParams.getAll(key);
  if (values.length > 1) inputFailure();
  return values[0];
}

function rejectUnknownKeys(searchParams: URLSearchParams, allowed: ReadonlySet<string>): void {
  for (const key of searchParams.keys()) {
    if (!allowed.has(key)) inputFailure();
  }
}

function parseOrInputFailure<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) inputFailure();
  return result.data;
}

export function parseCatalogRequest(request: Request): CatalogQueryInput {
  const searchParams = new URL(request.url).searchParams;
  const keys = new Set(['q', 'category', 'tag', 'ats', 'avatar', 'paper', 'docx', 'sort', 'cursor', 'limit']);
  rejectUnknownKeys(searchParams, keys);
  const raw = Object.fromEntries(Object.entries({
    q: one(searchParams, 'q'),
    category: one(searchParams, 'category'),
    tags: searchParams.has('tag') ? searchParams.getAll('tag') : undefined,
    ats: one(searchParams, 'ats'),
    avatar: one(searchParams, 'avatar'),
    paper: one(searchParams, 'paper'),
    docx: one(searchParams, 'docx'),
    sort: one(searchParams, 'sort'),
    cursor: one(searchParams, 'cursor'),
    limit: one(searchParams, 'limit'),
  }).filter(([, value]) => value !== undefined));
  const input = parseOrInputFailure(catalogQuerySchema, raw);
  validateCatalogCursor(input);
  return input;
}

export function parseFacetsRequest(request: Request): void {
  const searchParams = new URL(request.url).searchParams;
  rejectUnknownKeys(searchParams, new Set(['locale']));
  parseOrInputFailure(facetsQuerySchema, { locale: one(searchParams, 'locale') });
}

export function parseEmptyRequest(request: Request): void {
  if ([...new URL(request.url).searchParams.keys()].length > 0) inputFailure();
}

export function parseSlug(params: { slug: string }): string {
  return parseOrInputFailure(slugSchema, params.slug);
}

export function parseSlugVersion(params: { slug: string; version: string }): { slug: string; version: string } {
  return {
    slug: parseOrInputFailure(slugSchema, params.slug),
    version: parseOrInputFailure(versionSchema, params.version),
  };
}

export async function requireUser(request: Request): Promise<{ id: string }> {
  const user = await resolveUser(getUserIdFromRequest(request));
  if (!user) throw new UnauthorizedError();
  return user;
}

export async function awaitDatabaseReady(): Promise<void> {
  await dbReady;
}

function errorJson(code: string, status: number, extra?: Record<string, string>): Response {
  return Response.json(
    { error: { code, ...extra } },
    { status, headers: { 'cache-control': PRIVATE_CACHE } },
  );
}

export function errorResponse(error: unknown): Response {
  if (error instanceof RouteInputError) return errorJson('TEMPLATE_QUERY_INVALID', 400);
  if (error instanceof UnauthorizedError) return errorJson('UNAUTHORIZED', 401);
  if (error instanceof CatalogQueryError) return errorJson(error.code, 400);
  if (error instanceof TemplateRepositoryError) {
    if (error.code === 'TEMPLATE_NOT_FOUND') return errorJson('TEMPLATE_NOT_FOUND', 404);
    if (error.code === 'TEMPLATE_VERSION_BLOCKED') {
      const fallback = versionSchema.safeParse(error.fallbackVersion);
      return errorJson(
        'TEMPLATE_VERSION_BLOCKED',
        410,
        fallback.success ? { fallbackVersion: fallback.data } : undefined,
      );
    }
    return errorJson(error.code, 422);
  }
  if (error instanceof z.ZodError || error instanceof SyntaxError) {
    return errorJson('TEMPLATE_MANIFEST_INVALID', 422);
  }
  return errorJson('TEMPLATE_INTERNAL_ERROR', 500);
}

export async function handleRoute(operation: () => Promise<Response>): Promise<Response> {
  try {
    return await operation();
  } catch (error) {
    return errorResponse(error);
  }
}

function quotedEtag(value: string): string {
  return `"${value}"`;
}

function matchesEtag(request: Request, etag: string): boolean {
  const condition = request.headers.get('if-none-match');
  if (!condition) return false;
  return condition.split(',').some((candidate) => {
    const value = candidate.trim();
    const weakValue = value.startsWith('W/') ? value.slice(2) : value;
    const weakEtag = etag.startsWith('W/') ? etag.slice(2) : etag;
    return value === '*' || weakValue === weakEtag;
  });
}

function publicResponse(request: Request, value: unknown, etagValue?: string): Response {
  const json = canonicalizeJson(value);
  const etag = quotedEtag(etagValue ?? createHash('sha256').update(json).digest('hex'));
  const headers = { 'cache-control': PUBLIC_CACHE, etag };
  if (matchesEtag(request, etag)) return new Response(null, { status: 304, headers });
  return new Response(json, {
    status: 200,
    headers: { ...headers, 'content-type': 'application/json' },
  });
}

export function publicPageResponse(request: Request, value: unknown): Response {
  const parsed = pageSchema.parse(value);
  return publicResponse(request, {
    ...parsed,
    items: parsed.items.map((entry) => ({ ...entry, favorite: false })),
  });
}

export function privatePageResponse(value: unknown): Response {
  return Response.json(pageSchema.parse(value), {
    headers: { 'cache-control': PRIVATE_CACHE },
  });
}

export function publicFacetsResponse(request: Request, value: unknown): Response {
  return publicResponse(request, facetsSchema.parse(value));
}

export function publicDetailResponse(request: Request, value: unknown): Response {
  const parsed = TemplateVersionDetailSchema.parse(value);
  return publicResponse(request, { ...parsed, favorite: false }, parsed.manifestHash);
}

export function privateRecentResponse(value: unknown): Response {
  return Response.json(recentSchema.parse(value), {
    headers: { 'cache-control': PRIVATE_CACHE },
  });
}

export function privateOkResponse(): Response {
  return Response.json({ ok: true }, {
    headers: { 'cache-control': PRIVATE_CACHE },
  });
}

export function notFoundResponse(): Response {
  return errorJson('TEMPLATE_NOT_FOUND', 404);
}
