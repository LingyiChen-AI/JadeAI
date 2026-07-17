import { resolve } from 'node:path';

import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';

import { TemplateVersionDetailSchema } from '../../templates/schema';
import { hashManifest } from '../../templates/normalize-manifest';
import { encodeCatalogCursor } from '../../templates/catalog-query';
import * as repositoryModule from './template.repository';
import type { CatalogSql } from './template.repository';

type SqlClient = ReturnType<typeof postgres>;

const databaseUrl = process.env.JADEAI_TEMPLATE_REPOSITORY_TEST_DATABASE_URL;
if (!databaseUrl) throw new Error('JADEAI_TEMPLATE_REPOSITORY_TEST_DATABASE_URL is required');

function authorizeTask5Database(value: string, token: string | undefined) {
  const parsed = new URL(value);
  const databaseName = decodeURIComponent(parsed.pathname.slice(1));
  const port = parsed.port || '5432';
  if (!/^jadeai_template_repository_test_task5_[a-z0-9_]+$/.test(databaseName)) throw new Error('template_task5_database_name_refused');
  if (token !== databaseName) throw new Error('template_task5_drop_token_mismatch');
  if (!['127.0.0.1', 'localhost'].includes(parsed.hostname) || ['5432', '5433'].includes(port)) {
    throw new Error('template_task5_database_endpoint_refused');
  }
  return { databaseName, expectedUser: decodeURIComponent(parsed.username), port: Number(port) };
}

const authorization = authorizeTask5Database(databaseUrl, process.env.JADEAI_TEMPLATE_REPOSITORY_TEST_ALLOW_DROP);

function declarativeManifest() {
  return {
    schemaVersion: 1,
    rendererKind: 'declarative-v1',
    layout: { type: 'single-column', sidebarPosition: 'left', sidebarWidthPercent: 32, columnGapMm: 8 },
    typography: { fontFamily: 'noto-sans-sc', baseFontSizePt: 10.5, lineHeight: 1.5, headingScale: 1.25 },
    colors: { text: '#111111', muted: '#666666', accent: '#2563eb', background: '#ffffff' },
    spacing: { pageMarginMm: 12, sectionGapMm: 6 },
    sectionSlots: [{ sectionType: 'personal_info', placement: 'main', order: 0 }],
    sectionStyles: [],
    features: { showAvatar: true, showQrCodes: true, showPageNumbers: false, maxPages: 4 },
  };
}

function capabilities(index: number) {
  return JSON.stringify({
    supportedSections: ['personal_info', 'summary'],
    paperSizes: index % 2 === 0 ? ['a4', 'letter'] : ['a4'],
    supportsAvatar: index % 3 === 0,
    atsCompatible: index % 2 === 0,
    supportsZh: true,
    supportsEn: true,
    supportsHtml: true,
    supportsPdf: true,
    docxFidelity: index % 4 === 0 ? 'generic' : 'unsupported',
  });
}

async function seedFixture(client: SqlClient, count: number): Promise<void> {
  await client`
    INSERT INTO template_categories (id, slug, name_zh, name_en, sort_order) VALUES
      ('general', 'general', '通用', 'General', 0),
      ('ats', 'ats', 'ATS', 'ATS', 1)
  `;
  await client`
    INSERT INTO template_tags (id, slug, dimension, name_zh, name_en, sort_order) VALUES
      ('layout-single-column', 'layout-single-column', 'layout', '单栏', 'Single Column', 0),
      ('style-clean', 'style-clean', 'style', '简洁', 'Clean', 1),
      ('capability-ats', 'capability-ats', 'capability', 'ATS 友好', 'ATS Friendly', 2)
  `;
  await client`
    INSERT INTO template_tag_aliases (id, tag_id, locale, alias, normalized_alias) VALUES
      ('single-en', 'layout-single-column', 'en', 'Single', 'single'),
      ('single-column-en', 'layout-single-column', 'en', 'Single Column', 'single column'),
      ('ats-en', 'capability-ats', 'en', 'ATS Friendly', 'ats friendly')
  `;
  const templates = Array.from({ length: count }, (_, index) => ({
    id: `template-${String(index).padStart(4, '0')}`,
    slug: `template-${String(index).padStart(4, '0')}`,
    name_zh: `模板 ${String(index).padStart(4, '0')}`,
    name_en: `Template ${String(index).padStart(4, '0')}`,
    description_zh: `工程师 ${index}`,
    description_en: `Engineer ${index}`,
    category_id: index % 2 === 0 ? 'ats' : 'general',
    source_kind: 'native',
    license_spdx: 'Apache-2.0',
    license_url: 'LICENSE',
    license_hash: 'a'.repeat(64),
    status: 'published',
    search_text: `模板 ${index} template ${index} engineer ${index % 2 === 0 ? 'ats friendly' : ''}`,
    usage_count: index % 17,
    published_at: 1_700_000_000 + index,
  }));
  await client`INSERT INTO resume_templates ${client(templates,
    'id', 'slug', 'name_zh', 'name_en', 'description_zh', 'description_en', 'category_id',
    'source_kind', 'license_spdx', 'license_url', 'license_hash', 'status', 'search_text',
    'usage_count', 'published_at')}`;
  const versions = templates.map((template, index) => ({
    id: `${template.id}@1.0.0`,
    template_id: template.id,
    version: '1.0.0',
    schema_version: 1,
    renderer_kind: 'legacy-react',
    manifest: JSON.stringify({ schemaVersion: 1, rendererKind: 'legacy-react', templateId: template.id, version: '1.0.0' }),
    manifest_hash: index.toString(16).padStart(64, '0'),
    capabilities: capabilities(index),
    thumbnail_path: `templates/${template.slug}/v1.0.0/thumbnail-${index.toString(16).padStart(16, '0')}.png`,
    preview_path: `templates/${template.slug}/v1.0.0/preview-${index.toString(16).padStart(16, '0')}.png`,
    provenance: JSON.stringify({ source: { kind: 'built-in' }, license: { spdx: 'Apache-2.0' } }),
    status: 'published',
    published_at: template.published_at,
  }));
  await client`INSERT INTO resume_template_versions ${client(versions,
    'id', 'template_id', 'version', 'schema_version', 'renderer_kind', 'manifest', 'manifest_hash',
    'capabilities', 'thumbnail_path', 'preview_path', 'provenance', 'status', 'published_at')}`;
  await client`UPDATE resume_templates SET stable_version_id = id || '@1.0.0'`;
  const links = templates.flatMap((template, index) => [
    { template_id: template.id, tag_id: 'layout-single-column' },
    ...(index % 2 === 0 ? [{ template_id: template.id, tag_id: 'capability-ats' }] : []),
    ...(index % 3 === 0 ? [{ template_id: template.id, tag_id: 'style-clean' }] : []),
  ]);
  await client`INSERT INTO resume_template_tags ${client(links, 'template_id', 'tag_id')}`;
}

describe.sequential('template catalog repository', () => {
  const client = postgres(databaseUrl, { max: 3 });
  let repository: ReturnType<NonNullable<typeof repositoryModule.createTemplateRepository>>;

  beforeAll(async () => {
    const [identity] = await client<{ database_name: string; user_name: string }[]>`
      SELECT current_database() AS database_name, current_user AS user_name
    `;
    if (identity?.database_name !== authorization.databaseName || identity.user_name !== authorization.expectedUser) {
      throw new Error('template_task5_database_identity_mismatch');
    }
    expect(authorization.port).not.toBeOneOf([5432, 5433]);
    expect(repositoryModule.createTemplateRepository).toBeTypeOf('function');
    repository = repositoryModule.createTemplateRepository!(client as unknown as CatalogSql);
  });

  beforeEach(async () => {
    await client.unsafe('DROP SCHEMA IF EXISTS public CASCADE');
    await client.unsafe('DROP SCHEMA IF EXISTS drizzle CASCADE');
    await client.unsafe('CREATE SCHEMA public');
    await migrate(drizzle(client), { migrationsFolder: resolve(process.cwd(), 'drizzle/pg-migrations') });
  });

  afterAll(async () => client.end());

  test('returns deterministic complete pagination for 20, 100, and 1000 fixtures', async () => {
    for (const count of [20, 100, 1000]) {
      await client`TRUNCATE resume_template_tags, resume_template_versions, resume_templates, template_tag_aliases, template_tags, template_categories CASCADE`;
      await seedFixture(client, count);
      const collect = async () => {
        const ids: string[] = [];
        let cursor: string | undefined;
        do {
          const page = await repository.list({ sort: 'newest', limit: 40, cursor });
          ids.push(...page.items.map((item) => item.slug));
          cursor = page.nextCursor ?? undefined;
        } while (cursor);
        return ids;
      };
      const first = await collect();
      expect(first).toHaveLength(count);
      expect(await collect()).toEqual(first);
    }
  }, 60_000);

  test('filters published stable versions, tag aliases with AND semantics, and capabilities', async () => {
    await seedFixture(client, 13);
    await client`UPDATE resume_templates SET status = 'draft' WHERE id = 'template-0000'`;
    await client`UPDATE resume_template_versions SET status = 'blocked' WHERE id = 'template-0002@1.0.0'`;
    const result = await repository.list({
      category: 'ats', tags: ['single column', 'ats friendly'], ats: true, avatar: true, paper: 'a4', docx: true, limit: 40,
    });
    expect(result.items.map((item) => item.slug)).toEqual(['template-0012']);
    expect(result.items.every((item) => !('manifest' in item) && !('provenance' in item))).toBe(true);
    expect((await repository.getDetail('template-0000'))).toBeNull();
    expect((await repository.getDetail('template-0002'))).toBeNull();
    await expect(repository.getVersion('template-0002', '1.0.0'))
      .rejects.toMatchObject({ code: 'TEMPLATE_VERSION_BLOCKED' });
  });

  test('returns only strict public detail DTOs and hides every legacy internal manifest', async () => {
    await seedFixture(client, 2);
    const legacy = await repository.getDetail('template-0000');
    expect(TemplateVersionDetailSchema.parse(legacy)).toEqual(legacy);
    expect(legacy).toMatchObject({ rendererKind: 'legacy-react', manifest: null });
    expect(JSON.stringify(legacy)).not.toMatch(/provenance|previewSourcePath|exportSourcePath|sourceHash|assetInventory/);

    await client`
      UPDATE resume_template_versions SET renderer_kind = 'declarative-v1', manifest = ${JSON.stringify(declarativeManifest())},
        manifest_hash = ${hashManifest(declarativeManifest())}
      WHERE id = 'template-0001@1.0.0'
    `;
    const declarative = await repository.getVersion('template-0001', '1.0.0');
    expect(TemplateVersionDetailSchema.parse(declarative)).toEqual(declarative);
    expect(declarative).toMatchObject({ rendererKind: 'declarative-v1', manifest: declarativeManifest() });
  });

  test('rejects a valid declarative manifest whose canonical hash mismatches the stored hash', async () => {
    await seedFixture(client, 1);
    const actualHash = hashManifest(declarativeManifest());
    const mismatchedHash = actualHash === 'f'.repeat(64) ? 'e'.repeat(64) : 'f'.repeat(64);
    await client`
      UPDATE resume_template_versions SET renderer_kind = 'declarative-v1',
        manifest = ${JSON.stringify(declarativeManifest())}, manifest_hash = ${mismatchedHash}
      WHERE id = 'template-0000@1.0.0'
    `;
    await expect(repository.getVersion('template-0000', '1.0.0'))
      .rejects.toMatchObject({ code: 'TEMPLATE_HASH_MISMATCH' });
    await expect(repository.getDetail('template-0000'))
      .rejects.toMatchObject({ code: 'TEMPLATE_HASH_MISMATCH' });
  });

  test('fails closed for invalid capabilities in list, favorites, and recent DTOs', async () => {
    await seedFixture(client, 1);
    await client`INSERT INTO template_favorites (user_id, template_id) VALUES ('user-a', 'template-0000')`;
    await client`INSERT INTO template_recent_usage (user_id, template_id, last_used_at, use_count) VALUES ('user-a', 'template-0000', 1800000000, 1)`;
    await client`
      UPDATE resume_template_versions
      SET capabilities = capabilities::jsonb || '{"internal":{"secret":true}}'::jsonb
      WHERE id = 'template-0000@1.0.0'
    `;
    await expect(repository.list({ limit: 20 })).rejects.toThrow();
    await expect(repository.listFavorites('user-a', { limit: 20 })).rejects.toThrow();
    await expect(repository.listRecent('user-a')).rejects.toThrow();
  });

  test('does not expose another published version when the stable version is blocked', async () => {
    await seedFixture(client, 1);
    await client`
      INSERT INTO resume_template_versions (
        id, template_id, version, schema_version, renderer_kind, manifest, manifest_hash,
        capabilities, thumbnail_path, preview_path, provenance, status, published_at
      ) SELECT
        'template-0000@2.0.0', template_id, '2.0.0', schema_version, renderer_kind, manifest, repeat('f', 64),
        capabilities, 'templates/template-0000/v2.0.0/thumbnail-ffffffffffffffff.png',
        'templates/template-0000/v2.0.0/preview-ffffffffffffffff.png', provenance, 'published', published_at + 1
      FROM resume_template_versions WHERE id = 'template-0000@1.0.0'
    `;
    await client`UPDATE resume_template_versions SET status = 'blocked' WHERE id = 'template-0000@1.0.0'`;
    await expect(repository.getVersion('template-0000', '1.0.0'))
      .rejects.toMatchObject({ code: 'TEMPLATE_VERSION_BLOCKED' });
    expect(await repository.getVersion('template-0000', '2.0.0')).toBeNull();
  });

  test('returns a published historical version with assets owned by the requested version', async () => {
    await seedFixture(client, 1);
    await client`
      INSERT INTO resume_template_versions (
        id, template_id, version, schema_version, renderer_kind, manifest, manifest_hash,
        capabilities, thumbnail_path, preview_path, provenance, status, published_at
      ) SELECT
        'template-0000@2.0.0', template_id, '2.0.0', schema_version, renderer_kind, manifest, repeat('f', 64),
        capabilities, 'templates/template-0000/v2.0.0/thumbnail-ffffffffffffffff.png',
        'templates/template-0000/v2.0.0/preview-ffffffffffffffff.png', provenance, 'published', published_at + 1
      FROM resume_template_versions WHERE id = 'template-0000@1.0.0'
    `;
    const historical = await repository.getVersion('template-0000', '2.0.0');
    expect(TemplateVersionDetailSchema.parse(historical)).toEqual(historical);
    expect(historical).toMatchObject({
      stableVersion: '1.0.0',
      version: { id: 'template-0000@2.0.0', version: '2.0.0' },
      thumbnailPath: 'templates/template-0000/v2.0.0/thumbnail-ffffffffffffffff.png',
      fullPreviewPath: 'templates/template-0000/v2.0.0/preview-ffffffffffffffff.png',
      rendererKind: 'legacy-react',
      manifest: null,
    });
    await client`UPDATE resume_template_versions SET status = 'blocked' WHERE id = 'template-0000@2.0.0'`;
    await expect(repository.getVersion('template-0000', '2.0.0'))
      .rejects.toMatchObject({ code: 'TEMPLATE_VERSION_BLOCKED' });
  });

  test('treats percent, underscore, backslash, and normalized whitespace as literal search text', async () => {
    await seedFixture(client, 6);
    const searchTexts = [
      'literal 100% match',
      'literal 100x match',
      'literal score_value',
      'literal scorexvalue',
      'literal c:\\resume path',
      'role ats friendly engineer',
    ];
    for (let index = 0; index < searchTexts.length; index += 1) {
      await client`UPDATE resume_templates SET search_text = ${searchTexts[index]!} WHERE id = ${`template-${String(index).padStart(4, '0')}`}`;
    }
    const matches = async (q: string) => (await repository.list({ q, limit: 20 })).items.map((item) => item.slug);
    expect(await matches('%')).toEqual(['template-0000']);
    expect(await matches('_')).toEqual(['template-0002']);
    expect(await matches('\\')).toEqual(['template-0004']);
    expect(await matches('  ＡＴＳ\u3000 Friendly ')).toEqual(['template-0005']);
  });

  test('keeps cursor pages stable when rows share sort values', async () => {
    await seedFixture(client, 25);
    await client`UPDATE resume_templates SET usage_count = 7`;
    const first = await repository.list({ sort: 'popular', limit: 10 });
    const second = await repository.list({ sort: 'popular', limit: 10, cursor: first.nextCursor! });
    expect(first.items.map((item) => item.slug)).toEqual(Array.from({ length: 10 }, (_, index) => `template-${String(index).padStart(4, '0')}`));
    expect(new Set([...first.items, ...second.items].map((item) => item.slug)).size).toBe(20);
  });

  test.each([
    ['malformed', 'not-base64', undefined],
    [
      'v1 internal-ID',
      Buffer.from(JSON.stringify({ v: 1, s: 'newest', k: 1, id: 'internal-template-id' })).toString('base64url'),
      undefined,
    ],
    [
      'cross-sort',
      encodeCatalogCursor({ sort: 'popular', sortValue: 1, templateSlug: 'template-0000' }),
      'name',
    ],
    [
      'oversized public-slug',
      encodeCatalogCursor({ sort: 'newest', sortValue: 1, templateSlug: 'a'.repeat(81) }),
      undefined,
    ],
  ] as const)('rejects %s cursors for list and favorites before the first alias SQL', async (_name, cursor, sort) => {
    let sqlCalls = 0;
    const noSideEffectSql = (() => {
      sqlCalls += 1;
      return Promise.resolve([]);
    }) as unknown as CatalogSql;
    noSideEffectSql.array = (values) => values;
    noSideEffectSql.begin = async (callback) => callback(noSideEffectSql);
    const boundaryRepository = repositoryModule.createTemplateRepository!(noSideEffectSql);
    const input = { cursor, ...(sort ? { sort } : {}) };

    for (const invoke of [
      () => boundaryRepository.list(input),
      () => boundaryRepository.listFavorites('user-a', input),
    ]) {
      sqlCalls = 0;
      await expect(invoke()).rejects.toThrowError(
        expect.objectContaining({ code: 'TEMPLATE_CURSOR_INVALID' }),
      );
      expect(sqlCalls).toBe(0);
    }
  });

  test('orders and encodes keyset cursors by public slug rather than internal template id', async () => {
    await seedFixture(client, 1);
    await client`UPDATE resume_templates SET usage_count = 0 WHERE id = 'template-0000'`;
    const templates = [
      { id: 'z-internal-template', slug: 'alpha-public', versionId: 'z-internal-version', hash: 'd'.repeat(64) },
      { id: 'a-internal-template', slug: 'zeta-public', versionId: 'a-internal-version', hash: 'e'.repeat(64) },
    ];
    for (const template of templates) {
      await client`
        INSERT INTO resume_templates (
          id, slug, name_zh, name_en, description_zh, description_en, category_id,
          source_kind, license_spdx, license_url, license_hash, status, search_text,
          usage_count, published_at
        ) VALUES (
          ${template.id}, ${template.slug}, '同名', 'Same Name', '', '', 'general',
          'native', 'Apache-2.0', 'LICENSE', ${template.hash}, 'published', 'same name',
          100, 1800000000
        )
      `;
      await client`
        INSERT INTO resume_template_versions (
          id, template_id, version, schema_version, renderer_kind, manifest, manifest_hash,
          capabilities, thumbnail_path, preview_path, provenance, status, published_at
        ) VALUES (
          ${template.versionId}, ${template.id}, '1.0.0', 1, 'legacy-react',
          ${JSON.stringify({ schemaVersion: 1, rendererKind: 'legacy-react', templateId: template.slug, version: '1.0.0' })},
          ${template.hash}, ${capabilities(0)},
          ${`templates/${template.slug}/v1.0.0/thumbnail-${template.hash.slice(0, 16)}.png`},
          ${`templates/${template.slug}/v1.0.0/preview-${template.hash.slice(0, 16)}.png`},
          ${JSON.stringify({ source: { kind: 'built-in' }, license: { spdx: 'Apache-2.0' } })},
          'published', 1800000000
        )
      `;
      await client`
        UPDATE resume_templates SET stable_version_id = ${template.versionId}
        WHERE id = ${template.id}
      `;
    }

    const first = await repository.list({ sort: 'popular', limit: 1 });
    expect(first.items.map((entry) => entry.slug)).toEqual(['alpha-public']);
    const payload = JSON.parse(Buffer.from(first.nextCursor!, 'base64url').toString('utf8'));
    expect(payload).toEqual({ v: 2, s: 'popular', k: 100, slug: 'alpha-public' });
    expect(JSON.stringify(payload)).not.toMatch(/internal|\bid\b/);
    const second = await repository.list({ sort: 'popular', limit: 1, cursor: first.nextCursor! });
    expect(second.items.map((entry) => entry.slug)).toEqual(['zeta-public']);
  });

  test('returns facets that count only visible templates', async () => {
    await seedFixture(client, 10);
    await client`UPDATE resume_template_versions SET status = 'blocked' WHERE id = 'template-0000@1.0.0'`;
    const facets = await repository.getFacets();
    expect(facets.total).toBe(9);
    expect(facets.categories).toEqual(expect.arrayContaining([
      expect.objectContaining({ slug: 'ats', count: 4 }),
      expect.objectContaining({ slug: 'general', count: 5 }),
    ]));
    expect(facets.tags).toEqual(expect.arrayContaining([
      expect.objectContaining({ slug: 'layout-single-column', count: 9 }),
      expect.objectContaining({ slug: 'capability-ats', count: 4 }),
    ]));
    expect(facets.capabilities).toEqual({
      ats: { true: 4, false: 5 },
      avatar: { true: 3, false: 6 },
      paper: { a4: 9, letter: 4 },
      docx: { true: 2, false: 7 },
    });
  });

  test('keeps active zero-count categories and tags and rejects unknown categories', async () => {
    await seedFixture(client, 2);
    await client`INSERT INTO template_categories (id, slug, name_zh, name_en, sort_order) VALUES ('empty', 'empty', '空', 'Empty', 99)`;
    await client`INSERT INTO template_tags (id, slug, dimension, name_zh, name_en, sort_order) VALUES ('empty-tag', 'empty-tag', 'style', '空', 'Empty', 99)`;
    const facets = await repository.getFacets();
    expect(facets.categories).toContainEqual(expect.objectContaining({ slug: 'empty', count: 0 }));
    expect(facets.tags).toContainEqual(expect.objectContaining({ slug: 'empty-tag', count: 0 }));
    await expect(repository.list({ category: 'missing-category', limit: 20 }))
      .rejects.toMatchObject({ code: 'TEMPLATE_QUERY_INVALID' });
  });

  test('derives every facet count from the anonymous catalog visibility predicate', async () => {
    await seedFixture(client, 4);
    await client`INSERT INTO template_categories (id, slug, name_zh, name_en, sort_order) VALUES ('empty', 'empty', '空', 'Empty', 99)`;
    await client`INSERT INTO template_tags (id, slug, dimension, name_zh, name_en, sort_order) VALUES ('empty-tag', 'empty-tag', 'style', '空', 'Empty', 99)`;
    await client`UPDATE template_categories SET is_active = 0 WHERE id = 'general'`;
    await client`UPDATE template_tags SET is_active = 0 WHERE id = 'style-clean'`;
    await client`UPDATE resume_templates SET published_at = NULL WHERE id = 'template-0000'`;

    expect((await repository.list({ limit: 20 })).items.map((item) => item.slug)).toEqual(['template-0002']);
    const facets = await repository.getFacets();
    expect(facets.total).toBe(1);
    expect(facets.categories).toEqual([
      expect.objectContaining({ slug: 'ats', count: 1 }),
      expect.objectContaining({ slug: 'empty', count: 0 }),
    ]);
    expect(facets.tags).toEqual(expect.arrayContaining([
      expect.objectContaining({ slug: 'layout-single-column', count: 1 }),
      expect.objectContaining({ slug: 'capability-ats', count: 1 }),
      expect.objectContaining({ slug: 'empty-tag', count: 0 }),
    ]));
    expect(facets.tags.some((tag) => tag.slug === 'style-clean')).toBe(false);
    expect(facets.capabilities).toEqual({
      ats: { true: 1, false: 0 },
      avatar: { true: 0, false: 1 },
      paper: { a4: 1, letter: 1 },
      docx: { true: 0, false: 1 },
    });
  });

  test('adds and removes favorites idempotently and isolates users', async () => {
    await seedFixture(client, 3);
    await repository.addFavorite('user-a', 'template-0000');
    await repository.addFavorite('user-a', 'template-0000');
    await repository.addFavorite('user-b', 'template-0001');
    expect((await repository.listFavorites('user-a', { limit: 20 })).items.map((item) => item.slug))
      .toEqual(['template-0000']);
    await repository.removeFavorite('user-a', 'template-0000');
    await repository.removeFavorite('user-a', 'template-0000');
    expect((await repository.listFavorites('user-a', { limit: 20 })).items).toEqual([]);
    expect((await repository.listFavorites('user-b', { limit: 20 })).items.map((item) => item.slug))
      .toEqual(['template-0001']);
  });

  test('resolves favorite mutations by public slug when the internal template id differs', async () => {
    await seedFixture(client, 1);
    await client`
      INSERT INTO resume_templates (
        id, slug, name_zh, name_en, description_zh, description_en, category_id,
        source_kind, license_spdx, license_url, license_hash, status, search_text,
        usage_count, published_at
      ) VALUES (
        'internal-template-id', 'public-template-slug', '公开模板', 'Public Template', '', '', 'general',
        'native', 'Apache-2.0', 'LICENSE', ${'b'.repeat(64)}, 'published', 'public template', 0, 1800000000
      )
    `;
    await client`
      INSERT INTO resume_template_versions (
        id, template_id, version, schema_version, renderer_kind, manifest, manifest_hash,
        capabilities, thumbnail_path, preview_path, provenance, status, published_at
      ) VALUES (
        'internal-template-version', 'internal-template-id', '1.0.0', 1, 'legacy-react',
        ${JSON.stringify({ schemaVersion: 1, rendererKind: 'legacy-react', templateId: 'public-template-slug', version: '1.0.0' })},
        ${'b'.repeat(64)}, ${capabilities(0)},
        'templates/public-template-slug/v1.0.0/thumbnail-bbbbbbbbbbbbbbbb.png',
        'templates/public-template-slug/v1.0.0/preview-bbbbbbbbbbbbbbbb.png',
        ${JSON.stringify({ source: { kind: 'built-in' }, license: { spdx: 'Apache-2.0' } })},
        'published', 1800000000
      )
    `;
    await client`
      UPDATE resume_templates SET stable_version_id = 'internal-template-version'
      WHERE id = 'internal-template-id'
    `;

    await repository.addFavorite('slug-user', 'public-template-slug');
    await repository.addFavorite('slug-user', 'public-template-slug');
    expect((await repository.listFavorites('slug-user', { limit: 20 })).items.map((item) => item.slug))
      .toEqual(['public-template-slug']);

    await client`UPDATE resume_templates SET status = 'unlisted' WHERE id = 'internal-template-id'`;
    await expect(repository.addFavorite('new-user', 'public-template-slug'))
      .rejects.toMatchObject({ code: 'TEMPLATE_NOT_FOUND' });
    expect((await client<{ count: number }[]>`
      SELECT count(*)::int AS count FROM template_favorites WHERE user_id = 'new-user'
    `)[0]?.count).toBe(0);

    await repository.removeFavorite('slug-user', 'public-template-slug');
    await repository.removeFavorite('slug-user', 'public-template-slug');
    expect((await client<{ count: number }[]>`
      SELECT count(*)::int AS count FROM template_favorites WHERE user_id = 'slug-user'
    `)[0]?.count).toBe(0);
  });

  test('rejects a missing public slug as a favorite target', async () => {
    await seedFixture(client, 1);
    await expect(repository.addFavorite('new-user', 'missing-public-slug'))
      .rejects.toMatchObject({ code: 'TEMPLATE_NOT_FOUND' });
  });

  test('records recent and aggregate usage only after an explicit successful binding', async () => {
    await seedFixture(client, 25);
    await expect(repository.withSuccessfulBinding('user-a', 'template-0000', async () => {
      throw new Error('binding_failed');
    })).rejects.toThrow('binding_failed');
    expect((await client<{ usage_count: number }[]>`SELECT usage_count FROM resume_templates WHERE id = 'template-0000'`)[0]?.usage_count)
      .toBe(0);

    for (let index = 0; index < 25; index += 1) {
      await repository.withSuccessfulBinding('user-a', `template-${String(index).padStart(4, '0')}`, async () => index, 1_800_000_000 + index);
    }
    await repository.withSuccessfulBinding('user-b', 'template-0000', async () => true, 1_900_000_000);
    const recent = await repository.listRecent('user-a');
    expect(recent).toHaveLength(20);
    expect(recent[0]?.slug).toBe('template-0024');
    expect(recent.at(-1)?.slug).toBe('template-0005');
    expect(recent.every((item) => item.favorite === false)).toBe(true);
    expect((await repository.listRecent('user-b')).map((item) => item.slug)).toEqual(['template-0000']);
    expect((await client<{ usage_count: number }[]>`SELECT usage_count FROM resume_templates WHERE id = 'template-0000'`)[0]?.usage_count)
      .toBe(2);
  });

  test('applies the public visibility predicate to detail, history, recent, favorite, and binding writes', async () => {
    await seedFixture(client, 1);
    await client`
      INSERT INTO resume_template_versions (
        id, template_id, version, schema_version, renderer_kind, manifest, manifest_hash,
        capabilities, thumbnail_path, preview_path, provenance, status, published_at
      ) SELECT
        'template-0000@2.0.0', template_id, '2.0.0', schema_version, renderer_kind, manifest, repeat('f', 64),
        capabilities, 'templates/template-0000/v2.0.0/thumbnail-ffffffffffffffff.png',
        'templates/template-0000/v2.0.0/preview-ffffffffffffffff.png', provenance, 'published', published_at + 1
      FROM resume_template_versions WHERE id = 'template-0000@1.0.0'
    `;
    await client`INSERT INTO template_favorites (user_id, template_id) VALUES ('old-user', 'template-0000')`;
    await client`INSERT INTO template_recent_usage (user_id, template_id, last_used_at, use_count) VALUES ('old-user', 'template-0000', 1800000000, 1)`;
    await client`UPDATE resume_templates SET published_at = NULL WHERE id = 'template-0000'`;

    expect(await repository.getDetail('template-0000')).toBeNull();
    expect(await repository.getVersion('template-0000', '1.0.0')).toBeNull();
    expect(await repository.getVersion('template-0000', '2.0.0')).toBeNull();
    expect(await repository.listRecent('old-user')).toEqual([]);

    await expect(repository.addFavorite('new-user', 'template-0000'))
      .rejects.toMatchObject({ code: 'TEMPLATE_NOT_FOUND' });
    expect((await client<{ count: number }[]>`
      SELECT count(*)::int AS count FROM template_favorites WHERE user_id = 'new-user'
    `)[0]?.count).toBe(0);
    await repository.removeFavorite('old-user', 'template-0000');
    expect((await client<{ count: number }[]>`
      SELECT count(*)::int AS count FROM template_favorites WHERE user_id = 'old-user'
    `)[0]?.count).toBe(0);

    await expect(repository.withSuccessfulBinding('new-user', 'template-0000', async (tx) => {
      await tx`UPDATE resume_templates SET name_en = 'Should Roll Back' WHERE id = 'template-0000'`;
      return true;
    })).rejects.toMatchObject({ code: 'TEMPLATE_NOT_FOUND' });
    expect((await client<{ name_en: string; usage_count: number }[]>`
      SELECT name_en, usage_count FROM resume_templates WHERE id = 'template-0000'
    `)[0]).toEqual({ name_en: 'Template 0000', usage_count: 0 });
    expect((await client<{ count: number }[]>`
      SELECT count(*)::int AS count FROM template_recent_usage WHERE user_id = 'new-user'
    `)[0]?.count).toBe(0);
  });

  test('fails every public read and write closed when the published stable version has no publish time', async () => {
    await seedFixture(client, 1);
    await client`INSERT INTO template_favorites (user_id, template_id) VALUES ('old-user', 'template-0000')`;
    await client`INSERT INTO template_recent_usage (user_id, template_id, last_used_at, use_count) VALUES ('old-user', 'template-0000', 1800000000, 1)`;
    await client`UPDATE resume_template_versions SET published_at = NULL WHERE id = 'template-0000@1.0.0'`;

    expect((await repository.list({ limit: 20 })).items).toEqual([]);
    expect((await repository.getFacets()).total).toBe(0);
    expect(await repository.getDetail('template-0000')).toBeNull();
    expect(await repository.getVersion('template-0000', '1.0.0')).toBeNull();
    expect(await repository.listRecent('old-user')).toEqual([]);
    expect((await repository.listFavorites('old-user', { limit: 20 })).items).toEqual([]);
    await expect(repository.addFavorite('new-user', 'template-0000'))
      .rejects.toMatchObject({ code: 'TEMPLATE_NOT_FOUND' });
    await expect(repository.withSuccessfulBinding('new-user', 'template-0000', async () => true))
      .rejects.toMatchObject({ code: 'TEMPLATE_NOT_FOUND' });
  });

  test('meets 20/100/1000 search and filter budgets with bounded responses and an indexed SQL plan', async () => {
    const query = { q: 'engineer', sort: 'newest' as const, category: 'ats', tags: ['single'], ats: true, limit: 20 };
    for (const count of [20, 100, 1000]) {
      await client`TRUNCATE resume_template_tags, resume_template_versions, resume_templates, template_tag_aliases, template_tags, template_categories CASCADE`;
      await seedFixture(client, count);
      const warm = await repository.list(query);
      const samples: number[] = [];
      let responseBytes = 0;
      for (let index = 0; index < 25; index += 1) {
        const start = performance.now();
        const result = await repository.list(query);
        samples.push(performance.now() - start);
        responseBytes = new TextEncoder().encode(JSON.stringify(result)).byteLength;
      }
      samples.sort((a, b) => a - b);
      const p50 = samples[Math.floor(samples.length * 0.5)]!;
      const p95 = samples[Math.floor(samples.length * 0.95)]!;
      console.info(`TASK5_SCALE count=${count} p50=${p50.toFixed(3)}ms p95=${p95.toFixed(3)}ms responseBytes=${responseBytes} samples=25`);
      expect(warm.items.length).toBeGreaterThan(0);
      expect(p95).toBeLessThan(200);
      expect(responseBytes).toBeGreaterThan(0);
      expect(responseBytes).toBeLessThan(128 * 1024);
    }
    const plan = await repository.explainList(query);
    console.info(`TASK5_EXPLAIN ${plan.join(' | ')}`);
    const planText = plan.join('\n');
    expect(planText).toMatch(/Index|Bitmap/);
    expect(planText).toMatch(/template_categories/);
    expect(planText).toMatch(/resume_template_tags/);
    expect(planText).toMatch(/capabilities/);
    expect(planText).toMatch(/template\.slug/);
  }, 60_000);
});
