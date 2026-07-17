import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';

import { seedLegacyCatalog, seedUnifiedCatalog, type LegacyCatalog } from './seed-catalog';
import { backfillLegacyBindings } from './backfill-legacy-bindings';
import {
  backfillLegacyTemplateBindings,
  asTemplateTransaction,
} from '../../src/lib/db/repositories/template.repository';

export function validateDestructiveTestDatabase(
  value: string,
  allowDrop: string | undefined,
): { databaseName: string; expectedUser: string } {
  const parsed = new URL(value);
  const databaseName = decodeURIComponent(parsed.pathname.replace(/^\//, ''));
  if (!/^jadeai_template_test_[a-z0-9_]+$/.test(databaseName)) {
    throw new Error('template_test_database_name_refused');
  }
  if (allowDrop !== databaseName) throw new Error('template_test_drop_token_mismatch');
  const effectivePort = parsed.port || '5432';
  if (!['127.0.0.1', 'localhost'].includes(parsed.hostname) || ['5432', '5433'].includes(effectivePort)) {
    throw new Error('template_test_database_endpoint_refused');
  }
  return { databaseName, expectedUser: decodeURIComponent(parsed.username) };
}

const databaseUrl = process.env.JADEAI_TEMPLATE_TEST_DATABASE_URL;

if (!databaseUrl) {
  throw new Error('JADEAI_TEMPLATE_TEST_DATABASE_URL is required');
}

const dropAuthorization = validateDestructiveTestDatabase(
  databaseUrl,
  process.env.JADEAI_TEMPLATE_TEST_ALLOW_DROP,
);

describe.sequential('template platform PostgreSQL migration', () => {
  const client = postgres(databaseUrl, { max: 1 });

  beforeAll(async () => {
    const [identity] = await client<{ database_name: string; user_name: string }[]>`
      SELECT current_database() AS database_name, current_user AS user_name
    `;
    if (
      identity?.database_name !== dropAuthorization.databaseName
      || identity.user_name !== dropAuthorization.expectedUser
    ) throw new Error('template_test_database_identity_mismatch');
  });

  async function resetDatabase(): Promise<void> {
    await client.unsafe('DROP SCHEMA IF EXISTS public CASCADE');
    await client.unsafe('DROP SCHEMA IF EXISTS drizzle CASCADE');
    await client.unsafe('CREATE SCHEMA public');
  }

  async function applyMigration(ordinal: number): Promise<void> {
    const names = [
      '0000_hard_greymalkin.sql',
      '0001_windy_skrulls.sql',
      '0002_watery_mister_fear.sql',
      '0003_true_kree.sql',
      '0004_square_pete_wisdom.sql',
      '0005_omniscient_princess_powerful.sql',
      '0006_template_platform.sql',
    ];
    const sql = await readFile(resolve(process.cwd(), 'drizzle/pg-migrations', names[ordinal]!), 'utf8');
    for (const statement of sql.split('--> statement-breakpoint').map((part) => part.trim()).filter(Boolean)) {
      await client.unsafe(statement);
    }
  }

  async function migrateThrough(ordinal: number): Promise<void> {
    for (let index = 0; index <= ordinal; index += 1) await applyMigration(index);
  }

  async function migrateAll(): Promise<void> {
    await migrate(drizzle(client), {
      migrationsFolder: resolve(process.cwd(), 'drizzle/pg-migrations'),
    });
  }

  beforeEach(resetDatabase);

  afterAll(async () => {
    await client.end();
  });

  test('migrates a fresh database through ordinal 0006', async () => {
    await migrateAll();

    const rows = await client<{ exists: boolean }[]>`
      SELECT to_regclass('public.template_categories') IS NOT NULL AS exists
    `;
    expect(rows[0]?.exists).toBe(true);

    await migrateAll();
    const journal = await client<{ count: number }[]>`
      SELECT count(*)::int AS count FROM drizzle.__drizzle_migrations
    `;
    expect(journal[0]?.count).toBe(7);
  });

  test('creates every Task 4 table, Resume column, and explicitly planned index', async () => {
    await migrateAll();
    const expectedTables = [
      'resume_template_tags',
      'resume_template_versions',
      'resume_templates',
      'template_categories',
      'template_favorites',
      'template_recent_usage',
      'template_tag_aliases',
      'template_tags',
    ];
    const tables = await client<{ table_name: string }[]>`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = ANY(${client.array(expectedTables)})
      ORDER BY table_name
    `;
    expect(tables.map((row) => row.table_name)).toEqual([...expectedTables].sort());

    const columns = await client<{ column_name: string; is_nullable: string; column_default: string | null }[]>`
      SELECT column_name, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'resumes'
        AND column_name IN ('template_version_id', 'template_source', 'template_snapshot')
      ORDER BY column_name
    `;
    expect(columns).toEqual([
      { column_name: 'template_snapshot', is_nullable: 'YES', column_default: null },
      { column_name: 'template_source', is_nullable: 'NO', column_default: "'legacy'::text" },
      { column_name: 'template_version_id', is_nullable: 'YES', column_default: null },
    ]);

    const expectedIndexes = [
      'resume_template_tags_tag_template_idx',
      'resume_template_versions_manifest_hash_idx',
      'resume_template_versions_template_status_version_idx',
      'resume_template_versions_template_version_uidx',
      'resume_templates_id_stable_uidx',
      'resume_templates_slug_uidx',
      'resume_templates_status_category_published_idx',
      'resume_templates_status_usage_idx',
      'resumes_template_source_idx',
      'resumes_template_version_id_idx',
      'template_categories_active_sort_idx',
      'template_categories_slug_uidx',
      'template_favorites_user_created_idx',
      'template_recent_usage_user_last_used_idx',
      'template_tag_aliases_locale_normalized_uidx',
      'template_tag_aliases_tag_idx',
      'template_tags_dimension_active_sort_idx',
      'template_tags_slug_uidx',
    ];
    const indexes = await client<{ indexname: string }[]>`
      SELECT indexname FROM pg_indexes
      WHERE schemaname = 'public' AND indexname = ANY(${client.array(expectedIndexes)})
      ORDER BY indexname
    `;
    expect(indexes.map((row) => row.indexname)).toEqual([...expectedIndexes].sort());
  });

  test('matches the complete Task 4 column inventory', async () => {
    await migrateAll();
    type ColumnContract = [dataType: 'text' | 'integer', nullable: boolean, hasDefault: boolean];
    const expected: Record<string, ColumnContract> = {};
    const add = (table: string, columns: Record<string, ColumnContract>) => {
      for (const [column, contract] of Object.entries(columns)) expected[`${table}.${column}`] = contract;
    };
    const textRequired: ColumnContract = ['text', false, false];
    const textNullable: ColumnContract = ['text', true, false];
    const integerRequired: ColumnContract = ['integer', false, false];
    const integerNullable: ColumnContract = ['integer', true, false];
    const integerDefault: ColumnContract = ['integer', false, true];
    add('template_categories', {
      id: textRequired, slug: textRequired, name_zh: textRequired, name_en: textRequired,
      sort_order: integerDefault, is_active: integerDefault, created_at: integerDefault, updated_at: integerDefault,
    });
    add('template_tags', {
      id: textRequired, slug: textRequired, dimension: textRequired, name_zh: textRequired, name_en: textRequired,
      sort_order: integerDefault, is_active: integerDefault, created_at: integerDefault, updated_at: integerDefault,
    });
    add('template_tag_aliases', {
      id: textRequired, tag_id: textRequired, locale: textRequired, alias: textRequired,
      normalized_alias: textRequired, created_at: integerDefault,
    });
    add('resume_templates', {
      id: textRequired, slug: textRequired, name_zh: textRequired, name_en: textRequired,
      description_zh: ['text', false, true], description_en: ['text', false, true], category_id: textRequired,
      source_kind: textRequired, source_url: textNullable, source_revision: textNullable,
      license_spdx: textRequired, license_url: textRequired, license_hash: textRequired, status: textRequired,
      stable_version_id: textNullable, search_text: textRequired, usage_count: integerDefault,
      published_at: integerNullable, created_at: integerDefault, updated_at: integerDefault,
    });
    add('resume_template_versions', {
      id: textRequired, template_id: textRequired, version: textRequired, schema_version: integerRequired,
      renderer_kind: textRequired, manifest: textRequired, manifest_hash: textRequired, capabilities: textRequired,
      thumbnail_path: textRequired, preview_path: textRequired, provenance: textRequired, status: textRequired,
      fallback_version_id: textNullable, created_at: integerDefault, published_at: integerNullable,
    });
    add('resume_template_tags', { template_id: textRequired, tag_id: textRequired });
    add('template_favorites', { user_id: textRequired, template_id: textRequired, created_at: integerDefault });
    add('template_recent_usage', {
      user_id: textRequired, template_id: textRequired, last_used_at: integerDefault, use_count: integerDefault,
    });
    add('resumes', {
      template_version_id: textNullable,
      template_source: ['text', false, true],
      template_snapshot: textNullable,
    });

    const taskTables = [
      'template_categories', 'template_tags', 'template_tag_aliases', 'resume_templates',
      'resume_template_versions', 'resume_template_tags', 'template_favorites', 'template_recent_usage',
    ];
    const rows = await client<{
      table_name: string;
      column_name: string;
      data_type: 'text' | 'integer';
      nullable: boolean;
      has_default: boolean;
    }[]>`
      SELECT table_name, column_name, data_type,
        is_nullable = 'YES' AS nullable,
        column_default IS NOT NULL AS has_default
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND (
          table_name = ANY(${client.array(taskTables)})
          OR (table_name = 'resumes' AND column_name IN ('template_version_id', 'template_source', 'template_snapshot'))
        )
      ORDER BY table_name, ordinal_position
    `;
    const actual = Object.fromEntries(rows.map((row) => [
      `${row.table_name}.${row.column_name}`,
      [row.data_type, row.nullable, row.has_default],
    ]));
    expect(actual).toEqual(expected);
  });

  test('matches planned index uniqueness and ordered columns', async () => {
    await migrateAll();
    const expected: Record<string, { unique: boolean; columns: string[] }> = {
      resume_template_tags_tag_template_idx: { unique: false, columns: ['tag_id', 'template_id'] },
      resume_template_versions_manifest_hash_idx: { unique: false, columns: ['manifest_hash'] },
      resume_template_versions_template_status_version_idx: { unique: false, columns: ['template_id', 'status', 'version'] },
      resume_template_versions_template_version_uidx: { unique: true, columns: ['template_id', 'version'] },
      resume_templates_id_stable_uidx: { unique: true, columns: ['id', 'stable_version_id'] },
      resume_templates_slug_uidx: { unique: true, columns: ['slug'] },
      resume_templates_status_category_published_idx: { unique: false, columns: ['status', 'category_id', 'published_at', 'id'] },
      resume_templates_status_usage_idx: { unique: false, columns: ['status', 'usage_count', 'id'] },
      resumes_template_source_idx: { unique: false, columns: ['template_source'] },
      resumes_template_version_id_idx: { unique: false, columns: ['template_version_id'] },
      template_categories_active_sort_idx: { unique: false, columns: ['is_active', 'sort_order'] },
      template_categories_slug_uidx: { unique: true, columns: ['slug'] },
      template_favorites_user_created_idx: { unique: false, columns: ['user_id', 'created_at', 'template_id'] },
      template_recent_usage_user_last_used_idx: { unique: false, columns: ['user_id', 'last_used_at', 'template_id'] },
      template_tag_aliases_locale_normalized_uidx: { unique: true, columns: ['locale', 'normalized_alias'] },
      template_tag_aliases_tag_idx: { unique: false, columns: ['tag_id'] },
      template_tags_dimension_active_sort_idx: { unique: false, columns: ['dimension', 'is_active', 'sort_order'] },
      template_tags_slug_uidx: { unique: true, columns: ['slug'] },
    };
    const rows = await client<{ index_name: string; unique: boolean; columns: string[] }[]>`
      SELECT index_class.relname AS index_name, index_meta.indisunique AS unique,
        array_agg(attribute.attname ORDER BY key.ordinality) AS columns
      FROM pg_index AS index_meta
      JOIN pg_class AS index_class ON index_class.oid = index_meta.indexrelid
      JOIN pg_class AS table_class ON table_class.oid = index_meta.indrelid
      JOIN pg_namespace AS namespace ON namespace.oid = table_class.relnamespace
      CROSS JOIN LATERAL unnest(index_meta.indkey) WITH ORDINALITY AS key(attnum, ordinality)
      JOIN pg_attribute AS attribute ON attribute.attrelid = table_class.oid AND attribute.attnum = key.attnum
      WHERE namespace.nspname = 'public' AND index_class.relname = ANY(${client.array(Object.keys(expected))})
      GROUP BY index_class.relname, index_meta.indisunique
      ORDER BY index_class.relname
    `;
    expect(Object.fromEntries(rows.map((row) => [row.index_name, { unique: row.unique, columns: row.columns }]))).toEqual(expected);
  });

  test('matches every Task 4 foreign key action and composite key constraint', async () => {
    await migrateAll();
    const expectedForeignKeys: Record<string, {
      targetTable: string;
      targetColumns: string[];
      onUpdate: string;
      onDelete: string;
    }> = {
      'resume_template_tags:template_id': { targetTable: 'resume_templates', targetColumns: ['id'], onUpdate: 'NO ACTION', onDelete: 'CASCADE' },
      'resume_template_tags:tag_id': { targetTable: 'template_tags', targetColumns: ['id'], onUpdate: 'NO ACTION', onDelete: 'CASCADE' },
      'resume_template_versions:template_id': { targetTable: 'resume_templates', targetColumns: ['id'], onUpdate: 'NO ACTION', onDelete: 'NO ACTION' },
      'resume_template_versions:fallback_version_id': { targetTable: 'resume_template_versions', targetColumns: ['id'], onUpdate: 'NO ACTION', onDelete: 'NO ACTION' },
      'resume_templates:category_id': { targetTable: 'template_categories', targetColumns: ['id'], onUpdate: 'NO ACTION', onDelete: 'NO ACTION' },
      'resume_templates:id,stable_version_id': { targetTable: 'resume_template_versions', targetColumns: ['template_id', 'id'], onUpdate: 'NO ACTION', onDelete: 'NO ACTION' },
      'template_favorites:template_id': { targetTable: 'resume_templates', targetColumns: ['id'], onUpdate: 'NO ACTION', onDelete: 'NO ACTION' },
      'template_recent_usage:template_id': { targetTable: 'resume_templates', targetColumns: ['id'], onUpdate: 'NO ACTION', onDelete: 'NO ACTION' },
      'template_tag_aliases:tag_id': { targetTable: 'template_tags', targetColumns: ['id'], onUpdate: 'NO ACTION', onDelete: 'CASCADE' },
      'resumes:template_version_id': { targetTable: 'resume_template_versions', targetColumns: ['id'], onUpdate: 'NO ACTION', onDelete: 'NO ACTION' },
    };
    const foreignKeys = await client<{
      source_table: string;
      source_columns: string[];
      target_table: string;
      target_columns: string[];
      on_update: string;
      on_delete: string;
    }[]>`
      SELECT source.relname AS source_table,
        array_agg(source_attribute.attname ORDER BY key.ordinality) AS source_columns,
        target.relname AS target_table,
        array_agg(target_attribute.attname ORDER BY key.ordinality) AS target_columns,
        CASE fk.confupdtype WHEN 'a' THEN 'NO ACTION' WHEN 'c' THEN 'CASCADE' WHEN 'r' THEN 'RESTRICT' WHEN 'n' THEN 'SET NULL' WHEN 'd' THEN 'SET DEFAULT' END AS on_update,
        CASE fk.confdeltype WHEN 'a' THEN 'NO ACTION' WHEN 'c' THEN 'CASCADE' WHEN 'r' THEN 'RESTRICT' WHEN 'n' THEN 'SET NULL' WHEN 'd' THEN 'SET DEFAULT' END AS on_delete
      FROM pg_constraint AS fk
      JOIN pg_class AS source ON source.oid = fk.conrelid
      JOIN pg_class AS target ON target.oid = fk.confrelid
      JOIN pg_namespace AS namespace ON namespace.oid = source.relnamespace
      CROSS JOIN LATERAL unnest(fk.conkey, fk.confkey) WITH ORDINALITY AS key(source_attnum, target_attnum, ordinality)
      JOIN pg_attribute AS source_attribute ON source_attribute.attrelid = source.oid AND source_attribute.attnum = key.source_attnum
      JOIN pg_attribute AS target_attribute ON target_attribute.attrelid = target.oid AND target_attribute.attnum = key.target_attnum
      WHERE fk.contype = 'f' AND namespace.nspname = 'public'
        AND source.relname = ANY(${client.array([
          'resume_template_tags', 'resume_template_versions', 'resume_templates', 'template_favorites',
          'template_recent_usage', 'template_tag_aliases', 'resumes',
        ])})
      GROUP BY fk.oid, source.relname, target.relname
    `;
    const actualForeignKeys = Object.fromEntries(foreignKeys.map((row) => [
      `${row.source_table}:${row.source_columns.join(',')}`,
      { targetTable: row.target_table, targetColumns: row.target_columns, onUpdate: row.on_update, onDelete: row.on_delete },
    ]));
    expect(actualForeignKeys).toEqual(expectedForeignKeys);
    expect(Object.keys(actualForeignKeys).some((key) => key.endsWith(':user_id'))).toBe(false);

    const expectedKeys: Record<string, { type: string; columns: string[] }> = {
      resume_template_tags_template_id_tag_id_pk: { type: 'PRIMARY KEY', columns: ['template_id', 'tag_id'] },
      resume_template_versions_pkey: { type: 'PRIMARY KEY', columns: ['id'] },
      resume_template_versions_template_id_id_unique: { type: 'UNIQUE', columns: ['template_id', 'id'] },
      resume_templates_pkey: { type: 'PRIMARY KEY', columns: ['id'] },
      template_categories_pkey: { type: 'PRIMARY KEY', columns: ['id'] },
      template_favorites_user_id_template_id_pk: { type: 'PRIMARY KEY', columns: ['user_id', 'template_id'] },
      template_recent_usage_user_id_template_id_pk: { type: 'PRIMARY KEY', columns: ['user_id', 'template_id'] },
      template_tag_aliases_pkey: { type: 'PRIMARY KEY', columns: ['id'] },
      template_tags_pkey: { type: 'PRIMARY KEY', columns: ['id'] },
    };
    const keys = await client<{ name: string; type: string; columns: string[] }[]>`
      SELECT key_constraint.conname AS name,
        CASE key_constraint.contype WHEN 'p' THEN 'PRIMARY KEY' WHEN 'u' THEN 'UNIQUE' END AS type,
        array_agg(attribute.attname ORDER BY key.ordinality) AS columns
      FROM pg_constraint AS key_constraint
      JOIN pg_class AS table_class ON table_class.oid = key_constraint.conrelid
      JOIN pg_namespace AS namespace ON namespace.oid = table_class.relnamespace
      CROSS JOIN LATERAL unnest(key_constraint.conkey) WITH ORDINALITY AS key(attnum, ordinality)
      JOIN pg_attribute AS attribute ON attribute.attrelid = table_class.oid AND attribute.attnum = key.attnum
      WHERE key_constraint.contype IN ('p', 'u') AND namespace.nspname = 'public'
        AND key_constraint.conname = ANY(${client.array(Object.keys(expectedKeys))})
      GROUP BY key_constraint.oid
      ORDER BY key_constraint.conname
    `;
    expect(Object.fromEntries(keys.map((row) => [row.name, { type: row.type, columns: row.columns }]))).toEqual(expectedKeys);
  });

  test('preserves every legacy Resume and section business field across 0006', async () => {
    await migrateThrough(5);
    await client`
      INSERT INTO users (id, auth_type) VALUES ('migration-user', 'fingerprint')
    `;
    await client`
      INSERT INTO resumes (
        id, user_id, title, template, theme_config, is_default, language,
        share_token, is_public, share_password, view_count, revision, created_at, updated_at
      ) VALUES (
        'legacy-resume', 'migration-user', 'Private title', 'classic', '{"accent":"blue"}',
        1, 'zh', 'share-token', 1, 'secret', 9, 4, 1700000000, 1700000100
      )
    `;
    await client`
      INSERT INTO resume_sections (
        id, resume_id, type, title, sort_order, visible, content, created_at, updated_at
      ) VALUES ('legacy-section', 'legacy-resume', 'summary', 'Summary', 2, 1, '{"text":"private"}', 1700000001, 1700000101)
    `;
    const before = await client<{ resume_hash: string; section_hash: string }[]>`
      SELECT
        md5(concat_ws('|', id, user_id, title, template, theme_config, is_default, language,
          share_token, is_public, share_password, view_count, revision, created_at, updated_at)) AS resume_hash,
        (SELECT md5(concat_ws('|', id, resume_id, type, title, sort_order, visible, content, created_at, updated_at))
          FROM resume_sections WHERE id = 'legacy-section') AS section_hash
      FROM resumes WHERE id = 'legacy-resume'
    `;

    await applyMigration(6);

    const after = await client<{ resume_hash: string; section_hash: string; template_version_id: string | null; template_source: string }[]>`
      SELECT
        md5(concat_ws('|', id, user_id, title, template, theme_config, is_default, language,
          share_token, is_public, share_password, view_count, revision, created_at, updated_at)) AS resume_hash,
        (SELECT md5(concat_ws('|', id, resume_id, type, title, sort_order, visible, content, created_at, updated_at))
          FROM resume_sections WHERE id = 'legacy-section') AS section_hash,
        template_version_id,
        template_source
      FROM resumes WHERE id = 'legacy-resume'
    `;
    expect(after[0]).toMatchObject({
      resume_hash: before[0]?.resume_hash,
      section_hash: before[0]?.section_hash,
      template_version_id: null,
      template_source: 'legacy',
    });
  });

  test('enforces stable-version order, same-series ownership, statuses, and versioned asset paths', async () => {
    await migrateAll();
    await client`
      INSERT INTO template_categories (id, slug, name_zh, name_en)
      VALUES ('general', 'general', '通用', 'General')
    `;
    await client`
      INSERT INTO resume_templates (
        id, slug, name_zh, name_en, category_id, source_kind,
        license_spdx, license_url, license_hash, status, search_text
      ) VALUES
        ('one', 'one', '一', 'One', 'general', 'native', 'Apache-2.0', '/LICENSE', repeat('a', 64), 'published', 'one'),
        ('two', 'two', '二', 'Two', 'general', 'native', 'Apache-2.0', '/LICENSE', repeat('b', 64), 'published', 'two')
    `;
    await client`
      INSERT INTO resume_template_versions (
        id, template_id, version, schema_version, renderer_kind, manifest, manifest_hash,
        capabilities, thumbnail_path, preview_path, provenance, status
      ) VALUES (
        'one@1.0.0', 'one', '1.0.0', 1, 'legacy-react', '{}', repeat('c', 64), '{}',
        'templates/one/v1.0.0/thumbnail-cccccccccccccccc.png',
        'templates/one/v1.0.0/preview-cccccccccccccccc.png', '{}', 'published'
      )
    `;
    await client`UPDATE resume_templates SET stable_version_id = 'one@1.0.0' WHERE id = 'one'`;
    await expect(client`UPDATE resume_templates SET stable_version_id = 'one@1.0.0' WHERE id = 'two'`)
      .rejects.toMatchObject({ code: '23503' });
    await expect(client`
      UPDATE resume_template_versions SET fallback_version_id = 'one@1.0.0' WHERE id = 'one@1.0.0'
    `).rejects.toMatchObject({ code: '23514' });
    await expect(client`
      INSERT INTO resume_template_versions (
        id, template_id, version, schema_version, renderer_kind, manifest, manifest_hash,
        capabilities, thumbnail_path, preview_path, provenance, status
      ) VALUES (
        'two@1.0.0', 'two', '1.0.0', 1, 'legacy-react', '{}', repeat('d', 64), '{}',
        '../thumbnail.png', '../preview.png', '{}', 'published'
      )
    `).rejects.toMatchObject({ code: '23514' });
  });

  test('enforces the Task 4 table constraint matrix', async () => {
    await migrateAll();
    await client`INSERT INTO template_categories (id, slug, name_zh, name_en) VALUES ('general', 'general', '通用', 'General')`;
    await client`INSERT INTO template_tags (id, slug, dimension, name_zh, name_en) VALUES ('layout-one', 'layout-one', 'layout', '单栏', 'One')`;
    await client`
      INSERT INTO resume_templates (
        id, slug, name_zh, name_en, category_id, source_kind,
        license_spdx, license_url, license_hash, status, search_text
      ) VALUES ('one', 'one', '一', 'One', 'general', 'native', 'Apache-2.0', '/LICENSE', repeat('a', 64), 'draft', 'one')
    `;
    await client`INSERT INTO resume_template_tags (template_id, tag_id) VALUES ('one', 'layout-one')`;
    await expect(client`INSERT INTO resume_template_tags (template_id, tag_id) VALUES ('one', 'layout-one')`)
      .rejects.toMatchObject({ code: '23505' });
    await expect(client`INSERT INTO template_tags (id, slug, dimension, name_zh, name_en) VALUES ('bad', 'bad', 'language', '坏', 'Bad')`)
      .rejects.toMatchObject({ code: '23514' });
    await expect(client`INSERT INTO template_categories (id, slug, name_zh, name_en) VALUES ('bad-category-slug', 'Bad', '坏', 'Bad')`)
      .rejects.toMatchObject({ code: '23514' });
    await expect(client`INSERT INTO template_categories (id, slug, name_zh, name_en, is_active) VALUES ('bad-category-active', 'bad-category-active', '坏', 'Bad', 2)`)
      .rejects.toMatchObject({ code: '23514' });
    await expect(client`INSERT INTO template_tags (id, slug, dimension, name_zh, name_en, is_active) VALUES ('bad-tag-active', 'bad-tag-active', 'layout', '坏', 'Bad', -1)`)
      .rejects.toMatchObject({ code: '23514' });
    await client`
      INSERT INTO template_tag_aliases (id, tag_id, locale, alias, normalized_alias)
      VALUES ('layout-one:en', 'layout-one', 'en', 'One', 'one')
    `;
    await expect(client`
      INSERT INTO template_tag_aliases (id, tag_id, locale, alias, normalized_alias)
      VALUES ('layout-one:en:duplicate', 'layout-one', 'en', 'ONE', 'one')
    `).rejects.toMatchObject({ code: '23505' });
    await expect(client`
      INSERT INTO resume_templates (
        id, slug, name_zh, name_en, category_id, source_kind,
        license_spdx, license_url, license_hash, status, search_text
      ) VALUES ('bad-status', 'bad-status', '坏', 'Bad', 'general', 'native', 'Apache-2.0', '/LICENSE', repeat('a', 64), 'live', 'bad')
    `).rejects.toMatchObject({ code: '23514' });
    await expect(client`
      INSERT INTO resume_templates (
        id, slug, name_zh, name_en, category_id, source_kind,
        license_spdx, license_url, license_hash, status, search_text
      ) VALUES ('bad-source', 'bad-source', '坏', 'Bad', 'general', 'built-in', 'Apache-2.0', '/LICENSE', repeat('a', 64), 'draft', 'bad')
    `).rejects.toMatchObject({ code: '23514' });
    await expect(client`
      INSERT INTO resume_templates (
        id, slug, name_zh, name_en, category_id, source_kind,
        license_spdx, license_url, license_hash, status, search_text, usage_count
      ) VALUES ('bad-usage', 'bad-usage', '坏', 'Bad', 'general', 'native', 'Apache-2.0', '/LICENSE', repeat('a', 64), 'draft', 'bad', -1)
    `).rejects.toMatchObject({ code: '23514' });
    await expect(client`
      INSERT INTO resume_templates (
        id, slug, name_zh, name_en, category_id, source_kind,
        license_spdx, license_url, license_hash, status, search_text
      ) VALUES ('bad-category-fk', 'bad-category-fk', '坏', 'Bad', 'missing', 'native', 'Apache-2.0', '/LICENSE', repeat('a', 64), 'draft', 'bad')
    `).rejects.toMatchObject({ code: '23503' });

    await client`
      INSERT INTO resume_template_versions (
        id, template_id, version, schema_version, renderer_kind, manifest, manifest_hash,
        capabilities, thumbnail_path, preview_path, provenance, status
      ) VALUES (
        'one@1.0.0', 'one', '1.0.0', 1, 'legacy-react', '{}', repeat('b', 64), '{}',
        'templates/one/v1.0.0/thumbnail-bbbbbbbbbbbbbbbb.png',
        'templates/one/v1.0.0/preview-bbbbbbbbbbbbbbbb.png', '{}', 'published'
      )
    `;
    await expect(client`
      INSERT INTO resume_template_versions (
        id, template_id, version, schema_version, renderer_kind, manifest, manifest_hash,
        capabilities, thumbnail_path, preview_path, provenance, status
      ) VALUES (
        'one@duplicate', 'one', '1.0.0', 1, 'legacy-react', '{}', repeat('c', 64), '{}',
        'templates/one/v1.0.0/thumbnail-cccccccccccccccc.png',
        'templates/one/v1.0.0/preview-cccccccccccccccc.png', '{}', 'published'
      )
    `).rejects.toMatchObject({ code: '23505' });
    for (const [id, column, value] of [
      ['bad-renderer', 'renderer_kind', 'html'],
      ['bad-version-status', 'status', 'live'],
      ['bad-manifest-hash', 'manifest_hash', 'ABC'],
    ] as const) {
      await expect(client.unsafe(
        `INSERT INTO resume_template_versions (id, template_id, version, schema_version, renderer_kind, manifest, manifest_hash, capabilities, thumbnail_path, preview_path, provenance, status)
         VALUES ($1, 'one', $2, 1, 'legacy-react', '{}', repeat('d', 64), '{}', 'templates/one/v2.0.0/thumbnail-dddddddddddddddd.png', 'templates/one/v2.0.0/preview-dddddddddddddddd.png', '{}', 'draft')`
          .replace(column === 'renderer_kind' ? "'legacy-react'" : column === 'manifest_hash' ? "repeat('d', 64)" : "'draft'", '$3'),
        [id, `${id}.0`, value],
      )).rejects.toMatchObject({ code: '23514' });
    }
    await expect(client`
      INSERT INTO resume_template_versions (
        id, template_id, version, schema_version, renderer_kind, manifest, manifest_hash,
        capabilities, thumbnail_path, preview_path, provenance, status
      ) VALUES ('missing-template@1.0.0', 'missing-template', '1.0.0', 1, 'legacy-react', '{}', repeat('e', 64), '{}',
        'templates/missing-template/v1.0.0/thumbnail-eeeeeeeeeeeeeeee.png',
        'templates/missing-template/v1.0.0/preview-eeeeeeeeeeeeeeee.png', '{}', 'draft')
    `).rejects.toMatchObject({ code: '23503' });
    await expect(client`UPDATE resume_template_versions SET fallback_version_id = id WHERE id = 'one@1.0.0'`)
      .rejects.toMatchObject({ code: '23514' });
    await expect(client`UPDATE resume_template_versions SET fallback_version_id = 'missing@1.0.0' WHERE id = 'one@1.0.0'`)
      .rejects.toMatchObject({ code: '23503' });

    await expect(client`INSERT INTO template_tag_aliases (id, tag_id, locale, alias, normalized_alias) VALUES ('missing-tag:en', 'missing-tag', 'en', 'Missing', 'missing')`)
      .rejects.toMatchObject({ code: '23503' });
    await expect(client`INSERT INTO resume_template_tags (template_id, tag_id) VALUES ('missing-template', 'layout-one')`)
      .rejects.toMatchObject({ code: '23503' });
    await expect(client`INSERT INTO resume_template_tags (template_id, tag_id) VALUES ('one', 'missing-tag')`)
      .rejects.toMatchObject({ code: '23503' });
    await client`INSERT INTO template_favorites (user_id, template_id) VALUES ('user', 'one')`;
    await expect(client`INSERT INTO template_favorites (user_id, template_id) VALUES ('user', 'one')`)
      .rejects.toMatchObject({ code: '23505' });
    await expect(client`INSERT INTO template_favorites (user_id, template_id) VALUES ('user', 'missing-template')`)
      .rejects.toMatchObject({ code: '23503' });
    await client`INSERT INTO template_recent_usage (user_id, template_id, use_count) VALUES ('user', 'one', 1)`;
    await expect(client`INSERT INTO template_recent_usage (user_id, template_id, use_count) VALUES ('user', 'one', 2)`)
      .rejects.toMatchObject({ code: '23505' });
    await expect(client`INSERT INTO template_recent_usage (user_id, template_id, use_count) VALUES ('other', 'one', -1)`)
      .rejects.toMatchObject({ code: '23514' });
    await expect(client`INSERT INTO template_recent_usage (user_id, template_id) VALUES ('user', 'missing-template')`)
      .rejects.toMatchObject({ code: '23503' });
    await expect(client`INSERT INTO resumes (id, user_id, template_source) VALUES ('bad-source-resume', 'user', 'remote')`)
      .rejects.toMatchObject({ code: '23514' });
    await expect(client`INSERT INTO resumes (id, user_id, template_version_id) VALUES ('bad-version-resume', 'user', 'missing@1.0.0')`)
      .rejects.toMatchObject({ code: '23503' });
  });

  test('provides the verified legacy catalog seed transaction', async () => {
    const seedModule = await import('./seed-catalog').catch(() => ({}));
    expect(seedModule).toHaveProperty('seedLegacyCatalog');
    expect((seedModule as { seedLegacyCatalog?: unknown }).seedLegacyCatalog).toBeTypeOf('function');
  });

  test('guards destructive integration databases with a dedicated name and exact token', async () => {
    expect(validateDestructiveTestDatabase(
      'postgresql://user:pass@127.0.0.1:32769/jadeai_template_test_task4',
      'jadeai_template_test_task4',
    ))
      .toMatchObject({ databaseName: 'jadeai_template_test_task4' });
    expect(() => validateDestructiveTestDatabase(
      'postgresql://user:pass@127.0.0.1:32769/jadeai_task4',
      'jadeai_task4',
    ))
      .toThrow('template_test_database_name_refused');
    expect(() => validateDestructiveTestDatabase(
      'postgresql://user:pass@127.0.0.1:32769/jadeai_template_test_task4',
      'wrong',
    ))
      .toThrow('template_test_drop_token_mismatch');
    expect(() => validateDestructiveTestDatabase(
      'postgresql://user@127.0.0.1/jadeai_template_test_x',
      'jadeai_template_test_x',
    ))
      .toThrow('template_test_database_endpoint_refused');
  });

  test('requires explicit matching CLI apply targets without exposing credentials', async () => {
    const seedModule = await import('./seed-catalog');
    const backfillModule = await import('./backfill-legacy-bindings');
    expect(seedModule).toHaveProperty('parseSeedCatalogCli');
    expect(backfillModule).toHaveProperty('parseBackfillCli');
    expect(backfillModule).toHaveProperty('formatBackfillCliReport');
    const url = 'postgresql://user:secret@127.0.0.1:32769/jadeai_template_test_task4';
    const seedTarget = (seedModule as {
      parseSeedCatalogCli: (args: string[], databaseUrl: string) => { databaseName: string; safeTarget: string };
    }).parseSeedCatalogCli(['--apply=jadeai_template_test_task4'], url);
    expect(seedTarget).toEqual({
      databaseName: 'jadeai_template_test_task4',
      safeTarget: '127.0.0.1:32769/jadeai_template_test_task4',
    });
    expect(seedTarget.safeTarget).not.toContain('secret');
    expect(() => (seedModule as { parseSeedCatalogCli: (args: string[], databaseUrl: string) => unknown })
      .parseSeedCatalogCli([], url)).toThrow('template_cli_apply_required');
    expect(() => (seedModule as { parseSeedCatalogCli: (args: string[], databaseUrl: string) => unknown })
      .parseSeedCatalogCli(['--apply=wrong'], url)).toThrow('template_cli_apply_mismatch');

    const backfillTarget = (backfillModule as {
      parseBackfillCli: (args: string[], databaseUrl: string) => { databaseName: string; safeTarget: string; includeResumeIds: boolean };
    }).parseBackfillCli(['--apply=jadeai_template_test_task4', '--include-resume-ids'], url);
    expect(backfillTarget).toEqual({
      databaseName: 'jadeai_template_test_task4',
      safeTarget: '127.0.0.1:32769/jadeai_template_test_task4',
      includeResumeIds: true,
    });
    expect(() => (backfillModule as { parseBackfillCli: (args: string[], databaseUrl: string) => unknown })
      .parseBackfillCli([], url)).toThrow('template_cli_apply_required');
    const report = { updated: 0, unknown: [{ template: 'mystery', count: 1, resumeIds: ['private-id'] }] };
    const format = (backfillModule as {
      formatBackfillCliReport: (value: typeof report, includeResumeIds: boolean) => unknown;
    }).formatBackfillCliReport;
    expect(format(report, false)).toEqual({ updated: 0, unknown: [{ template: 'mystery', count: 1 }] });
    expect(format(report, true)).toEqual(report);
  });

  test('seeds the exact verified catalog twice without changing immutable rows', async () => {
    await migrateAll();
    const first = await seedLegacyCatalog({ databaseUrl, publishedAt: 1_784_160_000 });
    expect(first).toEqual({
      categoriesInserted: 12,
      tagsInserted: 17,
      aliasesInserted: 34,
      templatesInserted: 50,
      versionsInserted: 50,
      tagLinksInserted: 200,
    });
    const counts = await client<{
      categories: number;
      tags: number;
      aliases: number;
      templates: number;
      versions: number;
      invalid_stable: number;
    }[]>`
      SELECT
        (SELECT count(*)::int FROM template_categories) AS categories,
        (SELECT count(*)::int FROM template_tags) AS tags,
        (SELECT count(*)::int FROM template_tag_aliases) AS aliases,
        (SELECT count(*)::int FROM resume_templates) AS templates,
        (SELECT count(*)::int FROM resume_template_versions) AS versions,
        (SELECT count(*)::int
          FROM resume_templates AS template
          LEFT JOIN resume_template_versions AS version ON version.id = template.stable_version_id
          WHERE version.id IS NULL OR version.template_id <> template.id OR version.status <> 'published') AS invalid_stable
    `;
    expect(counts[0]).toEqual({
      categories: 12,
      tags: 17,
      aliases: 34,
      templates: 50,
      versions: 50,
      invalid_stable: 0,
    });

    const second = await seedLegacyCatalog({ databaseUrl, publishedAt: 1_784_160_000 });
    expect(second).toEqual({
      categoriesInserted: 0,
      tagsInserted: 0,
      aliasesInserted: 0,
      templatesInserted: 0,
      versionsInserted: 0,
      tagLinksInserted: 0,
    });
  });

  test('seeds the 50+2 unified catalog idempotently with valid declarative stable versions', async () => {
    await migrateAll();
    const first = await seedUnifiedCatalog({ databaseUrl });
    expect(first).toEqual({
      categoriesInserted: 12,
      tagsInserted: 17,
      aliasesInserted: 34,
      templatesInserted: 52,
      versionsInserted: 52,
      tagLinksInserted: 204,
    });
    const [counts] = await client<{
      templates: number;
      versions: number;
      declarative: number;
      invalid_stable: number;
    }[]>`
      SELECT
        (SELECT count(*)::int FROM resume_templates) AS templates,
        (SELECT count(*)::int FROM resume_template_versions) AS versions,
        (SELECT count(*)::int FROM resume_template_versions WHERE renderer_kind = 'declarative-v1') AS declarative,
        (SELECT count(*)::int
          FROM resume_templates AS template
          LEFT JOIN resume_template_versions AS version ON version.id = template.stable_version_id
          WHERE version.id IS NULL OR version.template_id <> template.id OR version.status <> 'published') AS invalid_stable
    `;
    expect(counts).toEqual({ templates: 52, versions: 52, declarative: 2, invalid_stable: 0 });
    const second = await seedUnifiedCatalog({ databaseUrl });
    expect(second).toEqual({
      categoriesInserted: 0,
      tagsInserted: 0,
      aliasesInserted: 0,
      templatesInserted: 0,
      versionsInserted: 0,
      tagLinksInserted: 0,
    });
  });

  test('rejects an inactive existing category without changing catalog rows', async () => {
    await migrateAll();
    await seedLegacyCatalog({ databaseUrl });
    await client`UPDATE template_categories SET is_active = 0 WHERE id = 'general'`;
    await expect(seedLegacyCatalog({ databaseUrl }))
      .rejects.toThrow('template_seed_category_conflict:general');
    const [category] = await client<{ is_active: number }[]>`
      SELECT is_active FROM template_categories WHERE id = 'general'
    `;
    expect(category?.is_active).toBe(0);
  });

  test('rejects an inactive existing tag without changing catalog rows', async () => {
    await migrateAll();
    await seedLegacyCatalog({ databaseUrl });
    await client`UPDATE template_tags SET is_active = 0 WHERE id = 'layout-single-column'`;
    await expect(seedLegacyCatalog({ databaseUrl }))
      .rejects.toThrow('template_seed_tag_conflict:layout-single-column');
    const [tag] = await client<{ is_active: number }[]>`
      SELECT is_active FROM template_tags WHERE id = 'layout-single-column'
    `;
    expect(tag?.is_active).toBe(0);
  });

  test('rejects an immutable published hash conflict without overwriting it', async () => {
    await migrateAll();
    await seedLegacyCatalog({ databaseUrl, publishedAt: 1_784_160_000 });
    const tamperedHash = 'f'.repeat(64);
    await client`
      UPDATE resume_template_versions SET manifest_hash = ${tamperedHash} WHERE id = 'classic@1.0.0'
    `;

    await expect(seedLegacyCatalog({ databaseUrl, publishedAt: 1_784_160_000 }))
      .rejects.toThrow('template_seed_version_conflict:classic@1.0.0');
    const [row] = await client<{ manifest_hash: string }[]>`
      SELECT manifest_hash FROM resume_template_versions WHERE id = 'classic@1.0.0'
    `;
    expect(row?.manifest_hash).toBe(tamperedHash);
  });

  test('reports a stable conflict when another ID owns a canonical slug', async () => {
    await migrateAll();
    await client`INSERT INTO template_categories (id, slug, name_zh, name_en) VALUES ('general', 'general', '通用', 'General')`;
    await client`
      INSERT INTO resume_templates (
        id, slug, name_zh, name_en, category_id, source_kind,
        license_spdx, license_url, license_hash, status, search_text
      ) VALUES ('intruder', 'classic', '占用', 'Intruder', 'general', 'native', 'Apache-2.0', '/LICENSE', repeat('a', 64), 'draft', 'intruder')
    `;
    await expect(seedLegacyCatalog({ databaseUrl }))
      .rejects.toThrow('template_seed_series_conflict:classic');
  });

  test('serializes concurrent identical and conflicting catalog seeds', async () => {
    await migrateAll();
    const identical = await Promise.all([
      seedLegacyCatalog({ databaseUrl }),
      seedLegacyCatalog({ databaseUrl }),
    ]);
    expect(identical.reduce((sum, report) => sum + report.templatesInserted, 0)).toBe(50);
    const canonical = JSON.parse(
      await readFile(resolve(process.cwd(), 'template-sources/legacy/catalog.json'), 'utf8'),
    ) as LegacyCatalog;
    const conflicting = structuredClone(canonical);
    conflicting.templates[0]!.nameEn = 'Conflicting Classic';
    const results = await Promise.allSettled([
      seedLegacyCatalog({ databaseUrl, catalog: canonical }),
      seedLegacyCatalog({ databaseUrl, catalog: conflicting }),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find((result) => result.status === 'rejected') as PromiseRejectedResult;
    expect(rejected.reason).toMatchObject({ message: 'template_seed_series_conflict:classic' });
    const [stored] = await client<{ name_en: string }[]>`SELECT name_en FROM resume_templates WHERE id = 'classic'`;
    expect(stored?.name_en).toBe('Classic');
  });

  test('rejects immutable series descriptions and version fallback drift', async () => {
    await migrateAll();
    await seedLegacyCatalog({ databaseUrl });
    await client`UPDATE resume_templates SET description_en = 'drift' WHERE id = 'classic'`;
    await expect(seedLegacyCatalog({ databaseUrl }))
      .rejects.toThrow('template_seed_series_conflict:classic');
    await client`UPDATE resume_templates SET description_en = '' WHERE id = 'classic'`;
    await client`
      UPDATE resume_template_versions SET fallback_version_id = 'ats@1.0.0' WHERE id = 'classic@1.0.0'
    `;
    await expect(seedLegacyCatalog({ databaseUrl }))
      .rejects.toThrow('template_seed_version_conflict:classic@1.0.0');
  });

  test('rejects malformed capabilities before opening the seed transaction', async () => {
    await migrateAll();
    const catalog = JSON.parse(
      await readFile(resolve(process.cwd(), 'template-sources/legacy/catalog.json'), 'utf8'),
    ) as LegacyCatalog;
    catalog.templates[0]!.capabilities.supportsAvatar = 'yes';
    await expect(seedLegacyCatalog({ databaseUrl, catalog })).rejects.toThrow('template_seed_capabilities_invalid:classic');
    const [count] = await client<{ count: number }[]>`SELECT count(*)::int AS count FROM resume_templates`;
    expect(count?.count).toBe(0);
  });

  test('is idempotent across default invocations at different wall-clock times', async () => {
    await migrateAll();
    const clock = vi.spyOn(Date, 'now')
      .mockReturnValueOnce(1_700_000_000_000)
      .mockReturnValueOnce(1_800_000_000_000);
    try {
      await seedLegacyCatalog({ databaseUrl });
      const second = await seedLegacyCatalog({ databaseUrl });
      expect(second.templatesInserted).toBe(0);
      expect(second.versionsInserted).toBe(0);
    } finally {
      clock.mockRestore();
    }
  });

  test('rejects controlled alias drift without deleting the external row', async () => {
    await migrateAll();
    await seedLegacyCatalog({ databaseUrl, publishedAt: 1_784_160_000 });
    await client`
      INSERT INTO template_tag_aliases (id, tag_id, locale, alias, normalized_alias)
      VALUES ('layout-single-column:en:drift', 'layout-single-column', 'en', 'Drift', 'drift')
    `;

    await expect(seedLegacyCatalog({ databaseUrl, publishedAt: 1_784_160_000 }))
      .rejects.toThrow('template_seed_aliases_drift');
    const [counts] = await client<{ aliases: number }[]>`
      SELECT count(*)::int AS aliases
      FROM template_tag_aliases WHERE tag_id = 'layout-single-column'
    `;
    expect(counts).toEqual({ aliases: 3 });
  });

  test('rejects legacy-owned tag-link drift without deleting the external row', async () => {
    await migrateAll();
    await seedLegacyCatalog({ databaseUrl, publishedAt: 1_784_160_000 });
    await client`
      INSERT INTO resume_template_tags (template_id, tag_id) VALUES ('classic', 'scenario-ats')
    `;

    await expect(seedLegacyCatalog({ databaseUrl, publishedAt: 1_784_160_000 }))
      .rejects.toThrow('template_seed_tag_links_drift');
    const [counts] = await client<{ links: number }[]>`
      SELECT count(*)::int AS links FROM resume_template_tags WHERE template_id = 'classic'
    `;
    expect(counts).toEqual({ links: 5 });
  });

  test('rolls back every row when an asset disappears during the in-transaction recheck', async () => {
    await migrateAll();
    let assetReads = 0;
    await expect(seedLegacyCatalog({
      databaseUrl,
      publishedAt: 1_784_160_000,
      readAsset: async (absolutePath) => {
        assetReads += 1;
        if (assetReads > 100) {
          const error = new Error('missing during transaction') as NodeJS.ErrnoException;
          error.code = 'ENOENT';
          throw error;
        }
        return readFile(absolutePath);
      },
    })).rejects.toThrow('legacy_asset_missing');
    expect(assetReads).toBe(101);
    const [counts] = await client<{ templates: number; categories: number }[]>`
      SELECT
        (SELECT count(*)::int FROM resume_templates) AS templates,
        (SELECT count(*)::int FROM template_categories) AS categories
    `;
    expect(counts).toEqual({ templates: 0, categories: 0 });
  });

  test('rolls back every row when an asset hash changes during the in-transaction recheck', async () => {
    await migrateAll();
    let assetReads = 0;
    await expect(seedLegacyCatalog({
      databaseUrl,
      publishedAt: 1_784_160_000,
      readAsset: async (absolutePath) => {
        assetReads += 1;
        const bytes = Buffer.from(await readFile(absolutePath));
        if (assetReads > 100) bytes[bytes.length - 1] = bytes[bytes.length - 1]! ^ 0xff;
        return bytes;
      },
    })).rejects.toThrow('legacy_asset_hash_mismatch');
    expect(assetReads).toBe(101);
    const [counts] = await client<{ templates: number; categories: number }[]>`
      SELECT
        (SELECT count(*)::int FROM resume_templates) AS templates,
        (SELECT count(*)::int FROM template_categories) AS categories
    `;
    expect(counts).toEqual({ templates: 0, categories: 0 });
  });

  test('provides the idempotent legacy binding backfill transaction', async () => {
    const backfillModule = await import('./backfill-legacy-bindings').catch(() => ({}));
    expect(backfillModule).toHaveProperty('backfillLegacyBindings');
    expect((backfillModule as { backfillLegacyBindings?: unknown }).backfillLegacyBindings).toBeTypeOf('function');
  });

  test('backfills only exact known null bindings and preserves every Resume and section field', async () => {
    await migrateAll();
    await seedLegacyCatalog({ databaseUrl });
    await client`INSERT INTO users (id, auth_type) VALUES ('backfill-user', 'fingerprint')`;
    await client`
      INSERT INTO resumes (
        id, user_id, title, template, theme_config, is_default, language, share_token,
        is_public, share_password, view_count, revision, template_version_id,
        template_source, template_snapshot, created_at, updated_at
      ) VALUES
        ('known-null', 'backfill-user', 'Known', 'classic', '{"accent":"red"}', 1, 'zh', 'known-share', 1, 'known-pass', 3, 7, NULL, 'legacy', NULL, 1700000000, 1700000100),
        ('unknown-null', 'backfill-user', 'Unknown', 'mystery-template', '{"accent":"gray"}', 0, 'en', NULL, 0, NULL, 0, 8, NULL, 'legacy', NULL, 1700000001, 1700000101),
        ('already-bound', 'backfill-user', 'Bound', 'classic', '{"accent":"green"}', 0, 'zh', NULL, 0, NULL, 1, 9, 'ats@1.0.0', 'public', NULL, 1700000002, 1700000102),
        ('local-snapshot', 'backfill-user', 'Local', 'classic', '{"accent":"blue"}', 0, 'zh', NULL, 0, NULL, 2, 10, NULL, 'local-snapshot', '{"manifest":"private"}', 1700000003, 1700000103)
    `;
    await client`
      INSERT INTO resume_sections (id, resume_id, type, title, sort_order, visible, content, created_at, updated_at)
      VALUES ('known-section', 'known-null', 'summary', 'Private summary', 1, 1, '{"text":"private"}', 1700000004, 1700000104)
    `;
    const [before] = await client<{ resume_hash: string; section_hash: string }[]>`
      SELECT
        md5(string_agg(concat_ws('|', id, user_id, title, template, theme_config, is_default,
          language, share_token, is_public, share_password, view_count, revision,
          coalesce(template_snapshot, ''), created_at, updated_at), '||' ORDER BY id)) AS resume_hash,
        (SELECT md5(string_agg(concat_ws('|', id, resume_id, type, title, sort_order, visible,
          content, created_at, updated_at), '||' ORDER BY id)) FROM resume_sections) AS section_hash
      FROM resumes
    `;

    const first = await backfillLegacyBindings(databaseUrl);
    expect(first).toEqual({
      updated: 1,
      unknown: [{ template: 'mystery-template', count: 1, resumeIds: ['unknown-null'] }],
    });
    const second = await backfillLegacyBindings(databaseUrl);
    expect(second).toEqual({
      updated: 0,
      unknown: [{ template: 'mystery-template', count: 1, resumeIds: ['unknown-null'] }],
    });

    const rows = await client<{ id: string; template_version_id: string | null; template_source: string }[]>`
      SELECT id, template_version_id, template_source FROM resumes ORDER BY id
    `;
    expect(rows).toEqual([
      { id: 'already-bound', template_version_id: 'ats@1.0.0', template_source: 'public' },
      { id: 'known-null', template_version_id: 'classic@1.0.0', template_source: 'public' },
      { id: 'local-snapshot', template_version_id: null, template_source: 'local-snapshot' },
      { id: 'unknown-null', template_version_id: null, template_source: 'legacy' },
    ]);
    const [after] = await client<{ resume_hash: string; section_hash: string }[]>`
      SELECT
        md5(string_agg(concat_ws('|', id, user_id, title, template, theme_config, is_default,
          language, share_token, is_public, share_password, view_count, revision,
          coalesce(template_snapshot, ''), created_at, updated_at), '||' ORDER BY id)) AS resume_hash,
        (SELECT md5(string_agg(concat_ws('|', id, resume_id, type, title, sort_order, visible,
          content, created_at, updated_at), '||' ORDER BY id)) FROM resume_sections) AS section_hash
      FROM resumes
    `;
    expect(after).toEqual(before);
  });

  test('does not backfill a binding whose stable version is blocked', async () => {
    await migrateAll();
    await seedLegacyCatalog({ databaseUrl });
    await client`UPDATE resume_template_versions SET status = 'blocked' WHERE id = 'classic@1.0.0'`;
    await client`INSERT INTO users (id, auth_type) VALUES ('blocked-user', 'fingerprint')`;
    await client`
      INSERT INTO resumes (id, user_id, template, revision, updated_at)
      VALUES ('blocked-resume', 'blocked-user', 'classic', 5, 1700000000)
    `;
    const report = await backfillLegacyBindings(databaseUrl);
    expect(report.updated).toBe(0);
    const [resume] = await client<{ template_version_id: string | null; template_source: string; revision: number; updated_at: number }[]>`
      SELECT template_version_id, template_source, revision, updated_at FROM resumes WHERE id = 'blocked-resume'
    `;
    expect(resume).toEqual({ template_version_id: null, template_source: 'legacy', revision: 5, updated_at: 1700000000 });
  });

  test('locks candidate template and version rows until the backfill transaction commits', async () => {
    await migrateAll();
    await seedLegacyCatalog({ databaseUrl });
    await client`INSERT INTO users (id, auth_type) VALUES ('lock-user', 'fingerprint')`;
    await client`INSERT INTO resumes (id, user_id, template) VALUES ('lock-resume', 'lock-user', 'classic')`;
    const backfillClient = postgres(databaseUrl, { max: 1 });
    const mutationClient = postgres(databaseUrl, { max: 1 });
    let releaseTransaction!: () => void;
    let reportReady!: () => void;
    const release = new Promise<void>((resolveRelease) => { releaseTransaction = resolveRelease; });
    const ready = new Promise<void>((resolveReady) => { reportReady = resolveReady; });
    const backfill = backfillClient.begin(async (tx) => {
      const report = await backfillLegacyTemplateBindings(asTemplateTransaction(tx));
      reportReady();
      await release;
      return report;
    });
    await ready;
    const [backend] = await mutationClient<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`;
    const mutation = mutationClient`
      UPDATE resume_template_versions SET status = 'blocked' WHERE id = 'classic@1.0.0'
    `.then(() => undefined);
    let observedLock = false;
    try {
      for (let attempt = 0; attempt < 100; attempt += 1) {
        const [activity] = await client<{ wait_event_type: string | null }[]>`
          SELECT wait_event_type FROM pg_stat_activity WHERE pid = ${backend!.pid}
        `;
        if (activity?.wait_event_type === 'Lock') {
          observedLock = true;
          break;
        }
        await new Promise<void>((resolveTurn) => setImmediate(resolveTurn));
      }
    } finally {
      releaseTransaction();
      await Promise.allSettled([backfill, mutation]);
      await Promise.all([backfillClient.end(), mutationClient.end()]);
    }
    expect(observedLock).toBe(true);
    const [state] = await client<{ template_version_id: string; template_source: string; version_status: string }[]>`
      SELECT resume.template_version_id, resume.template_source, version.status AS version_status
      FROM resumes AS resume
      JOIN resume_template_versions AS version ON version.id = resume.template_version_id
      WHERE resume.id = 'lock-resume'
    `;
    expect(state).toEqual({
      template_version_id: 'classic@1.0.0',
      template_source: 'public',
      version_status: 'blocked',
    });
  });

  test('keeps a unified 52+948 catalog indexed lookup below the 200ms p95 budget', async () => {
    await migrateAll();
    await seedUnifiedCatalog({ databaseUrl });
    await client`
      INSERT INTO resume_templates (
        id, slug, name_zh, name_en, category_id, source_kind, license_spdx,
        license_url, license_hash, status, search_text, usage_count, published_at
      )
      SELECT
        'fixture-' || value,
        'fixture-' || value,
        '夹具 ' || value,
        'Fixture ' || value,
        'general', 'native', 'Apache-2.0', '/LICENSE', repeat('a', 64),
        'published', 'fixture ' || value,
        value % 100,
        1784160000 + value
      FROM generate_series(1, 948) AS value
    `;
    await client`
      INSERT INTO resume_template_versions (
        id, template_id, version, schema_version, renderer_kind, manifest, manifest_hash,
        capabilities, thumbnail_path, preview_path, provenance, status, published_at
      )
      SELECT
        'fixture-' || value || '@1.0.0',
        'fixture-' || value,
        '1.0.0', 1, 'legacy-react', '{}', repeat('b', 64), '{}',
        'templates/fixture-' || value || '/v1.0.0/thumbnail-' || substring(md5(value::text), 1, 16) || '.png',
        'templates/fixture-' || value || '/v1.0.0/preview-' || substring(md5((value + 1000)::text), 1, 16) || '.png',
        '{}', 'published', 1784160000 + value
      FROM generate_series(1, 948) AS value
    `;
    await client`
      UPDATE resume_templates
      SET stable_version_id = id || '@1.0.0'
      WHERE id LIKE 'fixture-%'
    `;
    await client`
      INSERT INTO resume_template_tags (template_id, tag_id)
      SELECT 'fixture-' || value, tag_id
      FROM generate_series(1, 948) AS value
      CROSS JOIN (VALUES ('layout-single-column'), ('style-legacy'), ('capability-bilingual')) AS tags(tag_id)
    `;

    const samples: number[] = [];
    for (let index = 0; index < 25; index += 1) {
      const startedAt = performance.now();
      const result = await client<{ id: string }[]>`
        SELECT template.id
        FROM resume_templates AS template
        JOIN resume_template_versions AS version ON version.id = template.stable_version_id
        WHERE template.status = 'published' AND version.status = 'published'
        ORDER BY template.usage_count DESC, template.id
        LIMIT 20
      `;
      samples.push(performance.now() - startedAt);
      expect(result).toHaveLength(20);
    }
    const [count] = await client<{ count: number }[]>`SELECT count(*)::int AS count FROM resume_templates`;
    expect(count?.count).toBe(1000);
    await client`SET enable_seqscan = off`;
    const [explained] = await client<{ 'QUERY PLAN': Array<Record<string, unknown>> }[]>`
      EXPLAIN (FORMAT JSON)
      SELECT template.id
      FROM resume_templates AS template
      JOIN resume_template_versions AS version ON version.id = template.stable_version_id
      WHERE template.status = 'published' AND version.status = 'published'
      ORDER BY template.usage_count DESC, template.id
      LIMIT 20
    `;
    await client`RESET enable_seqscan`;
    const indexNames = new Set<string>();
    const visitPlan = (value: unknown): void => {
      if (Array.isArray(value)) { value.forEach(visitPlan); return; }
      if (!value || typeof value !== 'object') return;
      const record = value as Record<string, unknown>;
      if (typeof record['Index Name'] === 'string') indexNames.add(record['Index Name']);
      Object.values(record).forEach(visitPlan);
    };
    visitPlan(explained?.['QUERY PLAN']);
    expect(indexNames.has('resume_templates_status_usage_idx')).toBe(true);
    const sorted = [...samples].sort((left, right) => left - right);
    const p95 = sorted[Math.ceil(sorted.length * 0.95) - 1]!;
    console.log(`template_fixture_p95_ms=${p95.toFixed(3)}`);
    expect(p95).toBeLessThan(200);
  });
});
