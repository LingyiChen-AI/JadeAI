import {
  CatalogQueryError,
  encodeCatalogCursor,
  normalizeCatalogQuery,
  validateCatalogCursor,
  type CatalogQueryInput,
  type CatalogSort,
  type NormalizedCatalogQuery,
} from '../../templates/catalog-query';
import { hashManifest } from '../../templates/normalize-manifest';
import { TemplateCatalogItemSchema, TemplateVersionDetailSchema } from '../../templates/schema';

export type TemplateSeedCategory = {
  id: string;
  slug: string;
  nameZh: string;
  nameEn: string;
  sortOrder: number;
};

export type TemplateSeedTag = TemplateSeedCategory & { dimension: string };
export type TemplateSeedTagAlias = {
  id: string;
  tagId: string;
  locale: string;
  alias: string;
  normalizedAlias: string;
};

export type TemplateSeedSeries = {
  id: string;
  slug: string;
  nameZh: string;
  nameEn: string;
  categoryId: string;
  sourceKind: string;
  sourceUrl: string | null;
  sourceRevision: string | null;
  licenseSpdx: string;
  licenseUrl: string;
  licenseHash: string;
  searchText: string;
  stableVersionId: string;
  publishedAt: number;
  tagIds: string[];
};

export type TemplateSeedVersion = {
  id: string;
  templateId: string;
  version: string;
  schemaVersion: number;
  rendererKind: string;
  manifest: string;
  manifestHash: string;
  capabilities: string;
  thumbnailPath: string;
  previewPath: string;
  provenance: string;
  publishedAt: number;
};

export type VerifiedTemplateSeed = {
  categories: TemplateSeedCategory[];
  tags: TemplateSeedTag[];
  tagAliases: TemplateSeedTagAlias[];
  templates: TemplateSeedSeries[];
  versions: TemplateSeedVersion[];
};

export type TemplateSeedWriteReport = {
  categoriesInserted: number;
  tagsInserted: number;
  aliasesInserted: number;
  templatesInserted: number;
  versionsInserted: number;
  tagLinksInserted: number;
};

export interface TemplateTransaction {
  <T extends readonly Record<string, unknown>[] = readonly Record<string, unknown>[]>(
    strings: TemplateStringsArray,
    ...parameters: readonly unknown[]
  ): PromiseLike<T>;
  array(values: readonly string[]): unknown;
}

export function asTemplateTransaction(value: unknown): TemplateTransaction {
  return value as TemplateTransaction;
}

function assertSame(code: string, actual: Record<string, unknown> | undefined, expected: Record<string, unknown>): void {
  if (!actual) throw new Error(`${code}:${String(expected.id)}`);
  for (const [key, value] of Object.entries(expected)) {
    if (actual[key] !== value) throw new Error(`${code}:${String(expected.id)}`);
  }
}

function assertExactSet(code: string, actual: string[], expected: string[]): void {
  const actualSorted = [...actual].sort();
  const expectedSorted = [...expected].sort();
  if (actualSorted.length !== expectedSorted.length || actualSorted.some((value, index) => value !== expectedSorted[index])) {
    throw new Error(code);
  }
}

export async function writeVerifiedTemplateSeed(
  tx: TemplateTransaction,
  seed: VerifiedTemplateSeed,
): Promise<TemplateSeedWriteReport> {
  const report: TemplateSeedWriteReport = {
    categoriesInserted: 0,
    tagsInserted: 0,
    aliasesInserted: 0,
    templatesInserted: 0,
    versionsInserted: 0,
    tagLinksInserted: 0,
  };

  for (const category of seed.categories) {
    const inserted = await tx`
      INSERT INTO template_categories (id, slug, name_zh, name_en, sort_order)
      VALUES (${category.id}, ${category.slug}, ${category.nameZh}, ${category.nameEn}, ${category.sortOrder})
      ON CONFLICT DO NOTHING RETURNING id
    `;
    report.categoriesInserted += inserted.length;
    const [row] = await tx<Record<string, unknown>[]>`
      SELECT id, slug, name_zh AS "nameZh", name_en AS "nameEn", sort_order AS "sortOrder", is_active AS "isActive"
      FROM template_categories WHERE id = ${category.id}
    `;
    assertSame('template_seed_category_conflict', row!, { ...category, isActive: 1 });
  }

  for (const tag of seed.tags) {
    const inserted = await tx`
      INSERT INTO template_tags (id, slug, dimension, name_zh, name_en, sort_order)
      VALUES (${tag.id}, ${tag.slug}, ${tag.dimension}, ${tag.nameZh}, ${tag.nameEn}, ${tag.sortOrder})
      ON CONFLICT DO NOTHING RETURNING id
    `;
    report.tagsInserted += inserted.length;
    const [row] = await tx<Record<string, unknown>[]>`
      SELECT id, slug, dimension, name_zh AS "nameZh", name_en AS "nameEn", sort_order AS "sortOrder", is_active AS "isActive"
      FROM template_tags WHERE id = ${tag.id}
    `;
    assertSame('template_seed_tag_conflict', row!, { ...tag, isActive: 1 });
  }

  for (const alias of seed.tagAliases) {
    const inserted = await tx`
      INSERT INTO template_tag_aliases (id, tag_id, locale, alias, normalized_alias)
      VALUES (${alias.id}, ${alias.tagId}, ${alias.locale}, ${alias.alias}, ${alias.normalizedAlias})
      ON CONFLICT DO NOTHING RETURNING id
    `;
    report.aliasesInserted += inserted.length;
    const [row] = await tx<Record<string, unknown>[]>`
      SELECT id, tag_id AS "tagId", locale, alias, normalized_alias AS "normalizedAlias"
      FROM template_tag_aliases WHERE id = ${alias.id}
    `;
    assertSame('template_seed_alias_conflict', row!, alias);
  }

  for (const template of seed.templates) {
    const inserted = await tx`
      INSERT INTO resume_templates (
        id, slug, name_zh, name_en, category_id, source_kind, source_url, source_revision,
        license_spdx, license_url, license_hash, status, stable_version_id, search_text, published_at
      ) VALUES (
        ${template.id}, ${template.slug}, ${template.nameZh}, ${template.nameEn}, ${template.categoryId},
        ${template.sourceKind}, ${template.sourceUrl}, ${template.sourceRevision}, ${template.licenseSpdx},
        ${template.licenseUrl}, ${template.licenseHash}, 'published', NULL, ${template.searchText}, ${template.publishedAt}
      ) ON CONFLICT DO NOTHING RETURNING id
    `;
    report.templatesInserted += inserted.length;
    const [row] = await tx<Record<string, unknown>[]>`
      SELECT id, slug, name_zh AS "nameZh", name_en AS "nameEn",
        description_zh AS "descriptionZh", description_en AS "descriptionEn", category_id AS "categoryId",
        source_kind AS "sourceKind", source_url AS "sourceUrl", source_revision AS "sourceRevision",
        license_spdx AS "licenseSpdx", license_url AS "licenseUrl", license_hash AS "licenseHash",
        search_text AS "searchText", published_at AS "publishedAt", status
      FROM resume_templates WHERE id = ${template.id}
    `;
    assertSame('template_seed_series_conflict', row!, {
      ...template,
      descriptionZh: '',
      descriptionEn: '',
      tagIds: undefined,
      stableVersionId: undefined,
      status: 'published',
    });
  }

  for (const version of seed.versions) {
    const inserted = await tx`
      INSERT INTO resume_template_versions (
        id, template_id, version, schema_version, renderer_kind, manifest, manifest_hash,
        capabilities, thumbnail_path, preview_path, provenance, status, published_at
      ) VALUES (
        ${version.id}, ${version.templateId}, ${version.version}, ${version.schemaVersion}, ${version.rendererKind},
        ${version.manifest}, ${version.manifestHash}, ${version.capabilities}, ${version.thumbnailPath},
        ${version.previewPath}, ${version.provenance}, 'published', ${version.publishedAt}
      ) ON CONFLICT DO NOTHING RETURNING id
    `;
    report.versionsInserted += inserted.length;
    const [row] = await tx<Record<string, unknown>[]>`
      SELECT id, template_id AS "templateId", version, schema_version AS "schemaVersion",
        renderer_kind AS "rendererKind", manifest, manifest_hash AS "manifestHash", capabilities,
        thumbnail_path AS "thumbnailPath", preview_path AS "previewPath", provenance,
        fallback_version_id AS "fallbackVersionId", published_at AS "publishedAt", status
      FROM resume_template_versions WHERE id = ${version.id}
    `;
    assertSame('template_seed_version_conflict', row!, { ...version, fallbackVersionId: null, status: 'published' });
  }

  for (const template of seed.templates) {
    for (const tagId of template.tagIds) {
      const inserted = await tx`
        INSERT INTO resume_template_tags (template_id, tag_id)
        VALUES (${template.id}, ${tagId})
        ON CONFLICT (template_id, tag_id) DO NOTHING RETURNING template_id
      `;
      report.tagLinksInserted += inserted.length;
    }
    const [stable] = await tx<{ stable_version_id: string | null }[]>`
      SELECT stable_version_id FROM resume_templates WHERE id = ${template.id}
    `;
    if (stable?.stable_version_id === null) {
      await tx`
        UPDATE resume_templates SET stable_version_id = ${template.stableVersionId}
        WHERE id = ${template.id} AND stable_version_id IS NULL
      `;
    } else if (stable?.stable_version_id !== template.stableVersionId) {
      throw new Error(`template_seed_stable_version_conflict:${template.id}`);
    }
    const [published] = await tx<{ valid: boolean }[]>`
      SELECT EXISTS (
        SELECT 1 FROM resume_template_versions
        WHERE id = ${template.stableVersionId} AND template_id = ${template.id}
          AND status = 'published' AND published_at IS NOT NULL
      ) AS valid
    `;
    if (!published?.valid) throw new Error(`template_seed_stable_version_invalid:${template.id}`);
  }

  const tagIds = seed.tags.map((tag) => tag.id);
  const aliases = await tx<{ id: string }[]>`
    SELECT id FROM template_tag_aliases
    WHERE tag_id = ANY(${tx.array(tagIds)})
  `;
  assertExactSet(
    'template_seed_aliases_drift',
    aliases.map((row) => row.id),
    seed.tagAliases.map((alias) => alias.id),
  );

  const templateIds = seed.templates.map((template) => template.id);
  const tagLinks = await tx<{ template_id: string; tag_id: string }[]>`
    SELECT template_id, tag_id FROM resume_template_tags
    WHERE template_id = ANY(${tx.array(templateIds)})
  `;
  assertExactSet(
    'template_seed_tag_links_drift',
    tagLinks.map((row) => `${row.template_id}:${row.tag_id}`),
    seed.templates.flatMap((template) => template.tagIds.map((tagId) => `${template.id}:${tagId}`)),
  );

  return report;
}

export type LegacyBackfillReport = {
  updated: number;
  unknown: Array<{ template: string; count: number; resumeIds: string[] }>;
};

export async function backfillLegacyTemplateBindings(tx: TemplateTransaction): Promise<LegacyBackfillReport> {
  await tx`
    SELECT template.id, version.id
    FROM resume_templates AS template
    JOIN resume_template_versions AS version
      ON version.id = template.stable_version_id AND version.template_id = template.id
    WHERE template.status = 'published'
      AND template.published_at IS NOT NULL
      AND version.status = 'published'
      AND version.published_at IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM resumes AS resume
        WHERE resume.template_version_id IS NULL
          AND resume.template_source = 'legacy'
          AND resume.template = template.slug
      )
    FOR UPDATE OF template, version
  `;
  const updated = await tx<{ id: string }[]>`
    UPDATE resumes AS resume
    SET template_version_id = template.stable_version_id, template_source = 'public'
    FROM resume_templates AS template
    JOIN resume_template_versions AS version
      ON version.id = template.stable_version_id AND version.template_id = template.id
    WHERE resume.template_version_id IS NULL
      AND resume.template_source = 'legacy'
      AND resume.template = template.slug
      AND template.status = 'published'
      AND template.published_at IS NOT NULL
      AND template.stable_version_id IS NOT NULL
      AND version.status = 'published'
      AND version.published_at IS NOT NULL
    RETURNING resume.id
  `;
  const unknown = await tx<{ template: string; count: number; resume_ids: string[] }[]>`
    SELECT resume.template, count(*)::int AS count, array_agg(resume.id ORDER BY resume.id) AS resume_ids
    FROM resumes AS resume
    LEFT JOIN resume_templates AS template ON template.slug = resume.template
    WHERE resume.template_version_id IS NULL
      AND resume.template_source = 'legacy'
      AND template.id IS NULL
    GROUP BY resume.template
    ORDER BY resume.template
  `;
  return {
    updated: updated.length,
    unknown: unknown.map((row) => ({ template: row.template, count: row.count, resumeIds: row.resume_ids })),
  };
}

export interface CatalogSql extends TemplateTransaction {
  begin<T>(callback: (tx: CatalogSql) => Promise<T>): Promise<T>;
}

type CatalogRow = {
  id: string;
  slug: string;
  name_zh: string;
  name_en: string;
  category_id: string;
  category_slug: string;
  category_name_zh: string;
  category_name_en: string;
  category_sort_order: number;
  stable_version: string;
  capabilities: string | Record<string, unknown>;
  thumbnail_path: string;
  preview_path: string;
  tags: Array<Record<string, unknown>> | string;
  favorite: boolean;
  usage_count: number;
  published_at: number;
  name_sort: string;
};

export class TemplateRepositoryError extends Error {
  readonly code: 'TEMPLATE_NOT_FOUND' | 'TEMPLATE_VERSION_BLOCKED' | 'TEMPLATE_HASH_MISMATCH';
  readonly fallbackVersion: string | null;

  constructor(code: TemplateRepositoryError['code'], fallbackVersion: string | null = null) {
    super(code.toLowerCase());
    this.name = 'TemplateRepositoryError';
    this.code = code;
    this.fallbackVersion = fallbackVersion;
  }
}

function parseJson<T>(value: string | T): T {
  return typeof value === 'string' ? JSON.parse(value) as T : value;
}

function toIsoDate(epoch: number): string {
  return new Date(epoch * 1000).toISOString();
}

function catalogRowValue(row: CatalogRow) {
  return {
    slug: row.slug,
    stableVersion: row.stable_version,
    nameZh: row.name_zh,
    nameEn: row.name_en,
    category: {
      id: row.category_id,
      slug: row.category_slug,
      nameZh: row.category_name_zh,
      nameEn: row.category_name_en,
      sortOrder: row.category_sort_order,
    },
    tags: parseJson<Array<Record<string, unknown>>>(row.tags),
    thumbnailPath: row.thumbnail_path,
    fullPreviewPath: row.preview_path,
    capabilities: parseJson<Record<string, unknown>>(row.capabilities),
    favorite: row.favorite,
  };
}

function mapCatalogRow(row: CatalogRow) {
  return TemplateCatalogItemSchema.parse(catalogRowValue(row));
}

function rowSortValue(sort: CatalogSort, row: CatalogRow): number | string {
  if (sort === 'popular') return row.usage_count;
  if (sort === 'name') return row.name_sort;
  return row.published_at;
}

async function loadAliases(sql: CatalogSql) {
  const rows = await sql<{ tag_slug: string; normalized_alias: string }[]>`
    SELECT tag.slug AS tag_slug, alias.normalized_alias
    FROM template_tags AS tag
    JOIN template_tag_aliases AS alias ON alias.tag_id = tag.id
    WHERE tag.is_active = 1
    UNION
    SELECT slug AS tag_slug, slug AS normalized_alias
    FROM template_tags WHERE is_active = 1
  `;
  return rows.map((row) => ({ tagSlug: row.tag_slug, normalizedAlias: row.normalized_alias }));
}

async function listCatalog(
  sql: CatalogSql,
  input: CatalogQueryInput,
  userId: string | null,
  favoritesOnly: boolean,
) {
  const validatedCursor = validateCatalogCursor(input);
  const query = normalizeCatalogQuery(input, await loadAliases(sql), validatedCursor);
  if (query.category) {
    const [category] = await sql<{ exists: boolean }[]>`
      SELECT EXISTS (
        SELECT 1 FROM template_categories WHERE slug = ${query.category} AND is_active = 1
      ) AS exists
    `;
    if (!category?.exists) throw new CatalogQueryError('TEMPLATE_QUERY_INVALID', 'unknown_category');
  }
  const tagCount = query.tags.length;
  const cursorNumber = typeof query.cursor?.sortValue === 'number' ? query.cursor.sortValue : 0;
  const cursorName = typeof query.cursor?.sortValue === 'string' ? query.cursor.sortValue : '';
  const cursorSlug = query.cursor?.templateSlug ?? '';
  const hasCursor = query.cursor !== null;
  const rows = await sql<CatalogRow[]>`
    SELECT
      template.id,
      template.slug,
      template.name_zh,
      template.name_en,
      template.category_id,
      category.slug AS category_slug,
      category.name_zh AS category_name_zh,
      category.name_en AS category_name_en,
      category.sort_order AS category_sort_order,
      version.version AS stable_version,
      version.capabilities,
      version.thumbnail_path,
      version.preview_path,
      template.usage_count,
      template.published_at,
      lower(template.name_en) AS name_sort,
      EXISTS (
        SELECT 1 FROM template_favorites AS favorite
        WHERE favorite.template_id = template.id AND favorite.user_id = ${userId}
      ) AS favorite,
      COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'id', tag.id,
          'slug', tag.slug,
          'dimension', tag.dimension,
          'nameZh', tag.name_zh,
          'nameEn', tag.name_en
        ) ORDER BY tag.sort_order, tag.id)
        FROM resume_template_tags AS link
        JOIN template_tags AS tag ON tag.id = link.tag_id
        WHERE link.template_id = template.id AND tag.is_active = 1
      ), '[]'::jsonb) AS tags
    FROM resume_templates AS template
    JOIN template_categories AS category ON category.id = template.category_id AND category.is_active = 1
    JOIN resume_template_versions AS version
      ON version.id = template.stable_version_id
      AND version.template_id = template.id
      AND version.status = 'published'
      AND version.published_at IS NOT NULL
    WHERE template.status = 'published'
      AND template.published_at IS NOT NULL
      AND (${query.q}::text = '' OR strpos(template.search_text, ${query.q}) > 0)
      AND (${query.category}::text IS NULL OR category.slug = ${query.category})
      AND (${tagCount}::int = 0 OR (
        SELECT count(DISTINCT filter_tag.slug)::int
        FROM resume_template_tags AS filter_link
        JOIN template_tags AS filter_tag ON filter_tag.id = filter_link.tag_id
        WHERE filter_link.template_id = template.id
          AND filter_tag.is_active = 1
          AND filter_tag.slug = ANY(${sql.array(query.tags)}::text[])
      ) = ${tagCount})
      AND (${query.ats}::boolean IS NULL OR (version.capabilities::jsonb ->> 'atsCompatible')::boolean = ${query.ats})
      AND (${query.avatar}::boolean IS NULL OR (version.capabilities::jsonb ->> 'supportsAvatar')::boolean = ${query.avatar})
      AND (${query.paper}::text IS NULL OR version.capabilities::jsonb -> 'paperSizes' ? ${query.paper})
      AND (${query.docx}::boolean IS NULL OR ((version.capabilities::jsonb ->> 'docxFidelity') <> 'unsupported') = ${query.docx})
      AND (${favoritesOnly}::boolean = false OR EXISTS (
        SELECT 1 FROM template_favorites AS favorite_filter
        WHERE favorite_filter.template_id = template.id AND favorite_filter.user_id = ${userId}
      ))
      AND (
        ${hasCursor}::boolean = false
        OR (${query.sort}::text = 'newest' AND (template.published_at < ${cursorNumber} OR (template.published_at = ${cursorNumber} AND template.slug > ${cursorSlug})))
        OR (${query.sort}::text = 'popular' AND (template.usage_count < ${cursorNumber} OR (template.usage_count = ${cursorNumber} AND template.slug > ${cursorSlug})))
        OR (${query.sort}::text = 'name' AND (lower(template.name_en) > ${cursorName} OR (lower(template.name_en) = ${cursorName} AND template.slug > ${cursorSlug})))
      )
    ORDER BY
      CASE WHEN ${query.sort}::text = 'newest' THEN template.published_at END DESC,
      CASE WHEN ${query.sort}::text = 'popular' THEN template.usage_count END DESC,
      CASE WHEN ${query.sort}::text = 'name' THEN lower(template.name_en) END ASC,
      template.slug ASC
    LIMIT ${query.limit + 1}
  `;
  const hasNext = rows.length > query.limit;
  const visible = hasNext ? rows.slice(0, query.limit) : rows;
  const last = visible.at(-1);
  return {
    items: visible.map(mapCatalogRow),
    nextCursor: hasNext && last
      ? encodeCatalogCursor({ sort: query.sort, sortValue: rowSortValue(query.sort, last), templateSlug: last.slug })
      : null,
  };
}

async function getVersionRow(sql: CatalogSql, slug: string, versionNumber: string, userId: string | null) {
  const [row] = await sql<Array<CatalogRow & {
    version_id: string;
    version_status: string;
    manifest: string | Record<string, unknown>;
    manifest_hash: string;
    renderer_kind: string;
    version_published_at: number;
    source_kind: string;
    license_spdx: string;
    fallback_version: string | null;
    stable_status: string;
  }>>`
    SELECT
      template.id, template.slug, template.name_zh, template.name_en, template.category_id,
      category.slug AS category_slug, category.name_zh AS category_name_zh,
      category.name_en AS category_name_en, category.sort_order AS category_sort_order,
      stable.version AS stable_version, stable.status AS stable_status,
      version.id AS version_id, version.version,
      version.status AS version_status, version.manifest, version.manifest_hash,
      version.renderer_kind, version.capabilities, version.thumbnail_path, version.preview_path,
      version.published_at AS version_published_at, template.usage_count, template.published_at,
      lower(template.name_en) AS name_sort, template.source_kind, template.license_spdx,
      fallback.version AS fallback_version,
      EXISTS (SELECT 1 FROM template_favorites AS favorite WHERE favorite.template_id = template.id AND favorite.user_id = ${userId}) AS favorite,
      COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'id', tag.id, 'slug', tag.slug, 'dimension', tag.dimension,
        'nameZh', tag.name_zh, 'nameEn', tag.name_en
      ) ORDER BY tag.sort_order, tag.id)
      FROM resume_template_tags AS link JOIN template_tags AS tag ON tag.id = link.tag_id
      WHERE link.template_id = template.id AND tag.is_active = 1), '[]'::jsonb) AS tags
    FROM resume_templates AS template
    JOIN template_categories AS category ON category.id = template.category_id AND category.is_active = 1
    JOIN resume_template_versions AS stable ON stable.id = template.stable_version_id AND stable.template_id = template.id
      AND stable.published_at IS NOT NULL
    JOIN resume_template_versions AS version ON version.template_id = template.id AND version.version = ${versionNumber}
      AND (version.status = 'blocked' OR version.published_at IS NOT NULL)
    LEFT JOIN resume_template_versions AS fallback ON fallback.id = version.fallback_version_id
      AND fallback.status = 'published' AND fallback.published_at IS NOT NULL
    WHERE template.slug = ${slug} AND template.status = 'published' AND template.published_at IS NOT NULL
  `;
  return row ?? null;
}

export function createTemplateRepository(sql: CatalogSql) {
  return {
    list(input: CatalogQueryInput, userId: string | null = null) {
      return listCatalog(sql, input, userId, false);
    },

    async getDetail(slug: string, userId: string | null = null) {
      const [stable] = await sql<{ version: string }[]>`
        SELECT version.version
        FROM resume_templates AS template
        JOIN template_categories AS category ON category.id = template.category_id AND category.is_active = 1
        JOIN resume_template_versions AS version
          ON version.id = template.stable_version_id AND version.template_id = template.id
        WHERE template.slug = ${slug} AND template.status = 'published'
          AND template.published_at IS NOT NULL AND version.status = 'published'
          AND version.published_at IS NOT NULL
      `;
      return stable ? this.getVersion(slug, stable.version, userId) : null;
    },

    async getVersion(slug: string, versionNumber: string, userId: string | null = null) {
      const row = await getVersionRow(sql, slug, versionNumber, userId);
      if (!row) return null;
      if (row.version_status === 'blocked') throw new TemplateRepositoryError('TEMPLATE_VERSION_BLOCKED', row.fallback_version);
      if (row.stable_status !== 'published' || row.version_status !== 'published') return null;
      const rendererKind = row.renderer_kind === 'declarative-v1' ? 'declarative-v1' : 'legacy-react';
      const detail = {
        ...catalogRowValue(row),
        version: { id: row.version_id, version: versionNumber, publishedAt: toIsoDate(row.version_published_at) },
        rendererKind,
        manifest: rendererKind === 'declarative-v1' ? parseJson<Record<string, unknown>>(row.manifest) : null,
        manifestHash: row.manifest_hash,
        source: { kind: row.source_kind === 'native' ? 'official' : 'community', license: row.license_spdx },
      };
      const parsed = TemplateVersionDetailSchema.parse(detail);
      if (parsed.rendererKind === 'declarative-v1' && hashManifest(parsed.manifest) !== parsed.manifestHash) {
        throw new TemplateRepositoryError('TEMPLATE_HASH_MISMATCH');
      }
      return parsed;
    },

    async getFacets() {
      const [facets] = await sql<Array<{
        total: number;
        categories: Array<Record<string, unknown>>;
        tags: Array<Record<string, unknown>>;
        capabilities: Record<string, unknown>;
      }>>`
        WITH visible AS (
          SELECT template.id, template.category_id, version.capabilities::jsonb AS capabilities
          FROM resume_templates AS template
          JOIN template_categories AS category
            ON category.id = template.category_id AND category.is_active = 1
          JOIN resume_template_versions AS version
            ON version.id = template.stable_version_id
            AND version.template_id = template.id
            AND version.status = 'published'
            AND version.published_at IS NOT NULL
          WHERE template.status = 'published' AND template.published_at IS NOT NULL
        )
        SELECT
          (SELECT count(*)::int FROM visible) AS total,
          COALESCE((SELECT jsonb_agg(jsonb_build_object(
            'id', counted.id, 'slug', counted.slug, 'nameZh', counted.name_zh,
            'nameEn', counted.name_en, 'sortOrder', counted.sort_order, 'count', counted.count
          ) ORDER BY counted.sort_order, counted.id)
          FROM (
            SELECT category.id, category.slug, category.name_zh, category.name_en,
              category.sort_order, count(visible.id)::int AS count
            FROM template_categories AS category
            LEFT JOIN visible ON visible.category_id = category.id
            WHERE category.is_active = 1
            GROUP BY category.id
          ) AS counted), '[]'::jsonb) AS categories,
          COALESCE((SELECT jsonb_agg(jsonb_build_object(
            'id', counted.id, 'slug', counted.slug, 'dimension', counted.dimension,
            'nameZh', counted.name_zh, 'nameEn', counted.name_en, 'count', counted.count
          ) ORDER BY counted.sort_order, counted.id)
          FROM (
            SELECT tag.id, tag.slug, tag.dimension, tag.name_zh, tag.name_en,
              tag.sort_order, count(visible.id)::int AS count
            FROM template_tags AS tag
            LEFT JOIN resume_template_tags AS link ON link.tag_id = tag.id
            LEFT JOIN visible ON visible.id = link.template_id
            WHERE tag.is_active = 1
            GROUP BY tag.id
          ) AS counted), '[]'::jsonb) AS tags,
          jsonb_build_object(
            'ats', jsonb_build_object(
              'true', count(*) FILTER (WHERE (visible.capabilities ->> 'atsCompatible')::boolean),
              'false', count(*) FILTER (WHERE NOT (visible.capabilities ->> 'atsCompatible')::boolean)
            ),
            'avatar', jsonb_build_object(
              'true', count(*) FILTER (WHERE (visible.capabilities ->> 'supportsAvatar')::boolean),
              'false', count(*) FILTER (WHERE NOT (visible.capabilities ->> 'supportsAvatar')::boolean)
            ),
            'paper', jsonb_build_object(
              'a4', count(*) FILTER (WHERE visible.capabilities -> 'paperSizes' ? 'a4'),
              'letter', count(*) FILTER (WHERE visible.capabilities -> 'paperSizes' ? 'letter')
            ),
            'docx', jsonb_build_object(
              'true', count(*) FILTER (WHERE (visible.capabilities ->> 'docxFidelity') <> 'unsupported'),
              'false', count(*) FILTER (WHERE (visible.capabilities ->> 'docxFidelity') = 'unsupported')
            )
          ) AS capabilities
        FROM visible
      `;
      return facets ?? { total: 0, categories: [], tags: [], capabilities: {} };
    },

    async addFavorite(userId: string, templateSlug: string) {
      const [result] = await sql<{ target_visible: boolean; inserted: boolean }[]>`
        WITH visible AS MATERIALIZED (
          SELECT template.id
          FROM resume_templates AS template
          JOIN template_categories AS category
            ON category.id = template.category_id AND category.is_active = 1
          JOIN resume_template_versions AS version
            ON version.id = template.stable_version_id
            AND version.template_id = template.id
            AND version.status = 'published'
            AND version.published_at IS NOT NULL
          WHERE template.slug = ${templateSlug}
            AND template.status = 'published'
            AND template.published_at IS NOT NULL
        ),
        inserted AS (
          INSERT INTO template_favorites (user_id, template_id)
          SELECT ${userId}, visible.id FROM visible
          ON CONFLICT (user_id, template_id) DO NOTHING
          RETURNING template_id
        )
        SELECT
          EXISTS (SELECT 1 FROM visible) AS target_visible,
          EXISTS (SELECT 1 FROM inserted) AS inserted
      `;
      if (!result?.target_visible) throw new TemplateRepositoryError('TEMPLATE_NOT_FOUND');
    },

    async removeFavorite(userId: string, templateSlug: string) {
      await sql`
        DELETE FROM template_favorites AS favorite
        USING resume_templates AS template
        WHERE favorite.user_id = ${userId}
          AND favorite.template_id = template.id
          AND template.slug = ${templateSlug}
      `;
    },

    listFavorites(userId: string, input: CatalogQueryInput) {
      return listCatalog(sql, input, userId, true);
    },

    async listRecent(userId: string) {
      const rows = await sql<CatalogRow[]>`
        SELECT template.id, template.slug, template.name_zh, template.name_en, template.category_id,
          category.slug AS category_slug, category.name_zh AS category_name_zh,
          category.name_en AS category_name_en, category.sort_order AS category_sort_order,
          version.version AS stable_version, version.capabilities, version.thumbnail_path, version.preview_path,
          template.usage_count, template.published_at, lower(template.name_en) AS name_sort,
          EXISTS (SELECT 1 FROM template_favorites AS favorite
            WHERE favorite.template_id = template.id AND favorite.user_id = ${userId}) AS favorite,
          COALESCE((SELECT jsonb_agg(jsonb_build_object(
            'id', tag.id, 'slug', tag.slug, 'dimension', tag.dimension,
            'nameZh', tag.name_zh, 'nameEn', tag.name_en
          ) ORDER BY tag.sort_order, tag.id)
          FROM resume_template_tags AS link JOIN template_tags AS tag ON tag.id = link.tag_id
          WHERE link.template_id = template.id AND tag.is_active = 1), '[]'::jsonb) AS tags
        FROM template_recent_usage AS recent
        JOIN resume_templates AS template
          ON template.id = recent.template_id AND template.status = 'published' AND template.published_at IS NOT NULL
        JOIN template_categories AS category ON category.id = template.category_id AND category.is_active = 1
        JOIN resume_template_versions AS version ON version.id = template.stable_version_id
          AND version.template_id = template.id AND version.status = 'published'
          AND version.published_at IS NOT NULL
        WHERE recent.user_id = ${userId}
        ORDER BY recent.last_used_at DESC, template.id ASC LIMIT 20
      `;
      return rows.map(mapCatalogRow);
    },

    async withSuccessfulBinding<T>(
      userId: string,
      templateId: string,
      binding: (tx: CatalogSql) => Promise<T>,
      usedAt = Math.floor(Date.now() / 1000),
    ): Promise<T> {
      return sql.begin(async (tx) => {
        const result = await binding(tx);
        const updated = await tx<{ id: string }[]>`
          UPDATE resume_templates AS template SET usage_count = usage_count + 1
          FROM resume_template_versions AS version, template_categories AS category
          WHERE template.id = ${templateId} AND template.status = 'published'
            AND template.published_at IS NOT NULL
            AND category.id = template.category_id AND category.is_active = 1
            AND version.id = template.stable_version_id AND version.template_id = template.id
            AND version.status = 'published' AND version.published_at IS NOT NULL
          RETURNING template.id
        `;
        if (updated.length !== 1) throw new TemplateRepositoryError('TEMPLATE_NOT_FOUND');
        await tx`
          INSERT INTO template_recent_usage (user_id, template_id, last_used_at, use_count)
          VALUES (${userId}, ${templateId}, ${usedAt}, 1)
          ON CONFLICT (user_id, template_id) DO UPDATE SET
            last_used_at = EXCLUDED.last_used_at,
            use_count = template_recent_usage.use_count + 1
        `;
        await tx`
          DELETE FROM template_recent_usage AS recent
          WHERE recent.user_id = ${userId} AND (recent.last_used_at, recent.template_id) NOT IN (
            SELECT kept.last_used_at, kept.template_id FROM template_recent_usage AS kept
            WHERE kept.user_id = ${userId}
            ORDER BY kept.last_used_at DESC, kept.template_id ASC LIMIT 20
          )
        `;
        return result;
      });
    },

    async explainList(input: CatalogQueryInput): Promise<string[]> {
      const query: NormalizedCatalogQuery = normalizeCatalogQuery(input, await loadAliases(sql));
      if (query.category) {
        const [category] = await sql<{ exists: boolean }[]>`
          SELECT EXISTS (
            SELECT 1 FROM template_categories WHERE slug = ${query.category} AND is_active = 1
          ) AS exists
        `;
        if (!category?.exists) throw new CatalogQueryError('TEMPLATE_QUERY_INVALID', 'unknown_category');
      }
      const tagCount = query.tags.length;
      const rows = await sql<{ 'QUERY PLAN': string }[]>`
        EXPLAIN SELECT template.id
        FROM resume_templates AS template
        JOIN template_categories AS category ON category.id = template.category_id AND category.is_active = 1
        JOIN resume_template_versions AS version
          ON version.id = template.stable_version_id AND version.template_id = template.id AND version.status = 'published'
          AND version.published_at IS NOT NULL
        WHERE template.status = 'published'
          AND template.published_at IS NOT NULL
          AND (${query.q}::text = '' OR strpos(template.search_text, ${query.q}) > 0)
          AND (${query.category}::text IS NULL OR category.slug = ${query.category})
          AND (${tagCount}::int = 0 OR (
            SELECT count(DISTINCT filter_tag.slug)::int
            FROM resume_template_tags AS filter_link
            JOIN template_tags AS filter_tag ON filter_tag.id = filter_link.tag_id
            WHERE filter_link.template_id = template.id
              AND filter_tag.is_active = 1
              AND filter_tag.slug = ANY(${sql.array(query.tags)}::text[])
          ) = ${tagCount})
          AND (${query.ats}::boolean IS NULL OR (version.capabilities::jsonb ->> 'atsCompatible')::boolean = ${query.ats})
          AND (${query.avatar}::boolean IS NULL OR (version.capabilities::jsonb ->> 'supportsAvatar')::boolean = ${query.avatar})
          AND (${query.paper}::text IS NULL OR version.capabilities::jsonb -> 'paperSizes' ? ${query.paper})
          AND (${query.docx}::boolean IS NULL OR ((version.capabilities::jsonb ->> 'docxFidelity') <> 'unsupported') = ${query.docx})
        ORDER BY
          CASE WHEN ${query.sort}::text = 'newest' THEN template.published_at END DESC,
          CASE WHEN ${query.sort}::text = 'popular' THEN template.usage_count END DESC,
          CASE WHEN ${query.sort}::text = 'name' THEN lower(template.name_en) END ASC,
          template.slug ASC
        LIMIT ${query.limit}
      `;
      return rows.map((row) => row['QUERY PLAN']);
    },
  };
}
