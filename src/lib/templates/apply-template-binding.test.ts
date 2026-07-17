import { resolve } from 'node:path';

import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';

import { hashManifest } from './normalize-manifest';
import type { TemplateCapability } from '@/types/template';

const databaseUrl = process.env.JADEAI_TEMPLATE_BINDING_TEST_DATABASE_URL;
if (!databaseUrl) throw new Error('JADEAI_TEMPLATE_BINDING_TEST_DATABASE_URL is required');

const parsedDatabaseUrl = new URL(databaseUrl);
const databaseName = decodeURIComponent(parsedDatabaseUrl.pathname.slice(1));
if (!/^jadeai_template_binding_test_task8_[a-z0-9_]+$/.test(databaseName)) {
  throw new Error('template_task8_database_name_refused');
}
if (process.env.JADEAI_TEMPLATE_BINDING_TEST_ALLOW_DROP !== databaseName) {
  throw new Error('template_task8_drop_token_mismatch');
}
if (!['127.0.0.1', 'localhost'].includes(parsedDatabaseUrl.hostname)
  || ['5432', '5433', ''].includes(parsedDatabaseUrl.port)) {
  throw new Error('template_task8_database_endpoint_refused');
}

type ResumeRepository = typeof import('../db/repositories/resume.repository').resumeRepository;
type ParseChoice = typeof import('./apply-template-binding.server').parseClientTemplateBindingChoice;

function manifest() {
  return {
    schemaVersion: 1 as const,
    rendererKind: 'declarative-v1' as const,
    layout: { type: 'single-column' as const, sidebarPosition: 'left' as const, sidebarWidthPercent: 32, columnGapMm: 8 },
    typography: { fontFamily: 'noto-sans-sc' as const, baseFontSizePt: 10.5, lineHeight: 1.5, headingScale: 1.25 },
    colors: { text: '#111111', muted: '#666666', accent: '#2563eb', background: '#ffffff' },
    spacing: { pageMarginMm: 12, sectionGapMm: 6 },
    sectionSlots: [{ sectionType: 'personal_info' as const, placement: 'main' as const, order: 0 }],
    sectionStyles: [],
    features: { showAvatar: true, showQrCodes: true, showPageNumbers: false, maxPages: 4 },
  };
}

function capabilities(): TemplateCapability {
  return {
    supportedSections: ['personal_info'],
    paperSizes: ['a4'],
    supportsAvatar: true,
    atsCompatible: true,
    supportsZh: true,
    supportsEn: true,
    supportsHtml: true,
    supportsPdf: true,
    docxFidelity: 'generic',
  };
}

function localSnapshot() {
  const value = manifest();
  return {
    rendererKind: 'declarative-v1' as const,
    schemaVersion: 1 as const,
    manifest: value,
    manifestHash: hashManifest(value),
    capabilities: capabilities(),
  };
}

describe.sequential('Resume template binding persistence', () => {
  const client = postgres(databaseUrl, { max: 3 });
  let repository: ResumeRepository;
  let parseChoice: ParseChoice;

  beforeAll(async () => {
    process.env.DATABASE_URL = databaseUrl;
    process.env.JADEAI_SKIP_DB_INIT = '1';
    const identity = await client<{ database_name: string; user_name: string }[]>`
      SELECT current_database() AS database_name, current_user AS user_name
    `;
    expect(identity[0]?.database_name).toBe(databaseName);
    expect(identity[0]?.user_name).toBe(decodeURIComponent(parsedDatabaseUrl.username));
    ({ resumeRepository: repository } = await import('../db/repositories/resume.repository'));
    ({ parseClientTemplateBindingChoice: parseChoice } = await import('./apply-template-binding.server'));
  });

  beforeEach(async () => {
    await client.unsafe('DROP SCHEMA IF EXISTS public CASCADE');
    await client.unsafe('DROP SCHEMA IF EXISTS drizzle CASCADE');
    await client.unsafe('CREATE SCHEMA public');
    await migrate(drizzle(client), { migrationsFolder: resolve(process.cwd(), 'drizzle/pg-migrations') });
    await client`
      INSERT INTO users (id, auth_type) VALUES ('user-a', 'session')
    `;
    await client`
      INSERT INTO template_categories (id, slug, name_zh, name_en)
      VALUES ('general', 'general', '通用', 'General')
    `;
    await client`
      INSERT INTO resume_templates (
        id, slug, name_zh, name_en, category_id, source_kind, license_spdx,
        license_url, license_hash, status, search_text, published_at
      ) VALUES (
        'internal-public-template', 'public-template', '公开模板', 'Public Template',
        'general', 'native', 'Apache-2.0', 'LICENSE', ${'a'.repeat(64)},
        'published', 'public template', 1800000000
      )
    `;
    const publicManifest = manifest();
    await client`
      INSERT INTO resume_template_versions (
        id, template_id, version, schema_version, renderer_kind, manifest, manifest_hash,
        capabilities, thumbnail_path, preview_path, provenance, status, published_at
      ) VALUES (
        'internal-public-version', 'internal-public-template', '1.2.3', 1, 'declarative-v1',
        ${JSON.stringify(publicManifest)}, ${hashManifest(publicManifest)}, ${JSON.stringify(capabilities())},
        'templates/public-template/v1.2.3/thumbnail-aaaaaaaaaaaaaaaa.png',
        'templates/public-template/v1.2.3/preview-aaaaaaaaaaaaaaaa.png',
        ${JSON.stringify({ source: { kind: 'built-in' }, license: { spdx: 'Apache-2.0' } })},
        'published', 1800000000
      )
    `;
    await client`
      UPDATE resume_templates SET stable_version_id = 'internal-public-version'
      WHERE id = 'internal-public-template'
    `;
  });

  afterAll(async () => client.end());

  test('accepts only discriminated client choices without trusted public internals', () => {
    expect(parseChoice({ kind: 'public', templateSlug: 'public-template', version: '1.2.3' }))
      .toEqual({ kind: 'public', templateSlug: 'public-template', version: '1.2.3' });
    expect(() => parseChoice({
      kind: 'public',
      templateSlug: 'public-template',
      version: '1.2.3',
      versionId: 'forged',
      manifest: manifest(),
      manifestHash: 'f'.repeat(64),
      capabilities: capabilities(),
    })).toThrow();
    expect(() => parseChoice({ kind: 'legacy', templateSlug: 'not-registered' })).toThrow();
  });

  test('creates public, local snapshot, and registered legacy bindings while preserving content inputs', async () => {
    const themeConfig = { primaryColor: '#123456' };
    const sections = [{
      id: 'section-a',
      type: 'summary',
      title: 'Summary',
      sortOrder: 0,
      visible: true,
      content: { text: 'Keep me' },
    }];
    const publicResume = await repository.create({
      userId: 'user-a',
      title: 'Public',
      themeConfig,
      sections,
      binding: { kind: 'public', templateSlug: 'public-template', version: '1.2.3' },
    });
    expect(publicResume).toMatchObject({
      template: 'public-template',
      templateSource: 'public',
      templateVersionId: 'internal-public-version',
      templateSnapshot: null,
      themeConfig,
      sections: [expect.objectContaining({ title: 'Summary', content: { text: 'Keep me' } })],
    });

    const snapshot = localSnapshot();
    const localResume = await repository.create({
      userId: 'user-a',
      title: 'Local',
      sections,
      binding: { kind: 'local-snapshot', snapshot },
    });
    expect(localResume).toMatchObject({
      templateSource: 'local-snapshot',
      templateVersionId: null,
      templateSnapshot: snapshot,
    });

    const legacyResume = await repository.create({
      userId: 'user-a',
      binding: { kind: 'legacy', templateSlug: 'classic' },
    });
    expect(legacyResume).toMatchObject({
      template: 'classic',
      templateSource: 'legacy',
      templateVersionId: null,
      templateSnapshot: null,
    });
    expect((await client<{ usage_count: number }[]>`
      SELECT usage_count FROM resume_templates WHERE id = 'internal-public-template'
    `)[0]?.usage_count).toBe(1);
    expect((await client<{ count: number }[]>`
      SELECT count(*)::int AS count FROM template_recent_usage WHERE user_id = 'user-a'
    `)[0]?.count).toBe(1);
  });

  test('replaces binding under exact CAS without changing sections or theme and omission preserves binding', async () => {
    const created = await repository.create({
      userId: 'user-a',
      themeConfig: { primaryColor: '#abcdef' },
      sections: [{ id: 'section-a', type: 'summary', title: 'Summary', sortOrder: 0, visible: true, content: { text: 'Original' } }],
      binding: { kind: 'local-snapshot', snapshot: localSnapshot() },
    });
    const updated = await repository.replaceContent(created!.id, 0, {
      binding: { kind: 'public', templateSlug: 'public-template', version: '1.2.3' },
    });
    expect(updated).toMatchObject({
      revision: 1,
      templateSource: 'public',
      templateVersionId: 'internal-public-version',
      themeConfig: { primaryColor: '#abcdef' },
      sections: [expect.objectContaining({ content: { text: 'Original' } })],
    });
    const omitted = await repository.replaceContent(created!.id, 1, { title: 'Renamed' });
    expect(omitted).toMatchObject({
      revision: 2,
      templateSource: 'public',
      templateVersionId: 'internal-public-version',
      templateSnapshot: null,
    });
    await expect(repository.replaceContent(created!.id, 1, {
      binding: { kind: 'legacy', templateSlug: 'classic' },
    })).rejects.toMatchObject({ name: 'ResumeRevisionConflictError', currentRevision: 2 });
  });

  test('rejects a published requested version when the template stable version is no longer visible', async () => {
    const historicalManifest = manifest();
    await client`
      INSERT INTO resume_template_versions (
        id, template_id, version, schema_version, renderer_kind, manifest, manifest_hash,
        capabilities, thumbnail_path, preview_path, provenance, status, published_at
      ) VALUES (
        'historical-public-version', 'internal-public-template', '1.1.0', 1, 'declarative-v1',
        ${JSON.stringify(historicalManifest)}, ${hashManifest(historicalManifest)}, ${JSON.stringify(capabilities())},
        'templates/public-template/v1.1.0/thumbnail-bbbbbbbbbbbbbbbb.png',
        'templates/public-template/v1.1.0/preview-bbbbbbbbbbbbbbbb.png',
        ${JSON.stringify({ source: { kind: 'built-in' }, license: { spdx: 'Apache-2.0' } })},
        'published', 1700000000
      )
    `;
    await client`
      UPDATE resume_template_versions SET status = 'blocked'
      WHERE id = 'internal-public-version'
    `;

    await expect(repository.create({
      userId: 'user-a',
      binding: { kind: 'public', templateSlug: 'public-template', version: '1.1.0' },
    })).rejects.toThrow('template_version_not_found');
    expect((await client<{ usage_count: number }[]>`
      SELECT usage_count FROM resume_templates WHERE id = 'internal-public-template'
    `)[0]?.usage_count).toBe(0);
    expect((await client<{ count: number }[]>`
      SELECT count(*)::int AS count FROM template_recent_usage WHERE user_id = 'user-a'
    `)[0]?.count).toBe(0);
  });

  test('preserves public and local bindings through duplicate and private reads without recounting usage', async () => {
    const publicResume = await repository.create({
      userId: 'user-a',
      binding: { kind: 'public', templateSlug: 'public-template', version: '1.2.3' },
    });
    const publicDuplicate = await repository.duplicate(publicResume!.id, 'user-a');
    expect(publicDuplicate).toMatchObject({
      template: 'public-template',
      templateSource: 'public',
      templateVersionId: 'internal-public-version',
      templateSnapshot: null,
    });
    expect((await repository.findAllByUserId('user-a')).find((resume) => resume.id === publicDuplicate!.id))
      .toMatchObject({ templateSource: 'public', templateVersionId: 'internal-public-version' });

    const snapshot = localSnapshot();
    const localResume = await repository.create({
      userId: 'user-a',
      binding: { kind: 'local-snapshot', snapshot },
    });
    const localDuplicate = await repository.duplicate(localResume!.id, 'user-a');
    expect(await repository.findById(localDuplicate!.id)).toMatchObject({
      templateSource: 'local-snapshot',
      templateVersionId: null,
      templateSnapshot: snapshot,
    });
    expect((await client<{ usage_count: number }[]>`
      SELECT usage_count FROM resume_templates WHERE id = 'internal-public-template'
    `)[0]?.usage_count).toBe(1);
  });

  test.each(['usage', 'recent'] as const)('rolls back Resume CAS, binding, usage, and recent when %s persistence fails', async (failure) => {
    const created = await repository.create({ userId: 'user-a', binding: { kind: 'legacy', templateSlug: 'classic' } });
    if (failure === 'usage') {
      await client.unsafe(`
        CREATE FUNCTION fail_template_usage() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN RAISE EXCEPTION 'injected_usage_failure'; END $$;
        CREATE TRIGGER fail_template_usage BEFORE UPDATE OF usage_count ON resume_templates
        FOR EACH ROW EXECUTE FUNCTION fail_template_usage();
      `);
    } else {
      await client.unsafe(`
        CREATE FUNCTION fail_template_recent() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN RAISE EXCEPTION 'injected_recent_failure'; END $$;
        CREATE TRIGGER fail_template_recent BEFORE INSERT OR UPDATE ON template_recent_usage
        FOR EACH ROW EXECUTE FUNCTION fail_template_recent();
      `);
    }
    await expect(repository.replaceContent(created!.id, 0, {
      title: 'Must roll back',
      binding: { kind: 'public', templateSlug: 'public-template', version: '1.2.3' },
    })).rejects.toThrow(`injected_${failure}_failure`);
    const persisted = await repository.findById(created!.id);
    expect(persisted).toMatchObject({
      title: '未命名简历',
      revision: 0,
      template: 'classic',
      templateSource: 'legacy',
      templateVersionId: null,
      templateSnapshot: null,
    });
    expect((await client<{ usage_count: number }[]>`
      SELECT usage_count FROM resume_templates WHERE id = 'internal-public-template'
    `)[0]?.usage_count).toBe(0);
    expect((await client<{ count: number }[]>`
      SELECT count(*)::int AS count FROM template_recent_usage WHERE user_id = 'user-a'
    `)[0]?.count).toBe(0);
  });
});
