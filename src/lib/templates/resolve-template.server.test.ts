import { describe, expect, test, vi } from 'vitest';

vi.mock('@/lib/db', () => ({
  db: { $client: vi.fn() },
  dbReady: Promise.resolve(),
}));

import { createRuntimeVersionLoader } from './resolve-template.server';

describe('server runtime version loader', () => {
  test('maps blocked fallback chains and fails unknown renderer data closed', async () => {
    const rows = new Map<string, Record<string, unknown>>([
      ['blocked-id', {
        slug: 'modern', template_status: 'published', version: '2.0.0', version_status: 'blocked',
        template_published_at: 1, version_published_at: 1, stable_status: 'published', stable_published_at: 1,
        renderer_kind: 'declarative-v1', manifest: '{}', manifest_hash: '0'.repeat(64), capabilities: '{}',
        fallback_version_id: 'fallback-id',
      }],
      ['fallback-id', {
        slug: 'modern', template_status: 'published', version: '1.0.0', version_status: 'published',
        template_published_at: 1, version_published_at: 1, stable_status: 'published', stable_published_at: 1,
        renderer_kind: 'legacy-react', manifest: '{}', manifest_hash: '1'.repeat(64),
        capabilities: JSON.stringify({ supportedSections: [], paperSizes: ['a4'], supportsAvatar: false, atsCompatible: true, supportsZh: true, supportsEn: true, supportsHtml: true, supportsPdf: true, docxFidelity: 'high-fidelity' }),
        fallback_version_id: null,
      }],
      ['unknown-id', {
        slug: 'modern', template_status: 'published', version: '3.0.0', version_status: 'published',
        template_published_at: 1, version_published_at: 1, stable_status: 'published', stable_published_at: 1,
        renderer_kind: 'executable-js', manifest: '{}', manifest_hash: '2'.repeat(64), capabilities: '{}',
        fallback_version_id: null,
      }],
    ]);
    const sql = vi.fn(async (_strings: TemplateStringsArray, versionId: string) => {
      const row = rows.get(versionId);
      return row ? [row] : [];
    });
    const waitUntilReady = vi.fn(async () => undefined);
    const load = createRuntimeVersionLoader(sql as never, waitUntilReady);

    await expect(load('blocked-id')).resolves.toMatchObject({
      status: 'blocked',
      fallback: { status: 'published', rendererKind: 'legacy-react', version: '1.0.0' },
    });
    await expect(load('unknown-id')).resolves.toMatchObject({ status: 'invalid' });
    expect(waitUntilReady).toHaveBeenCalledTimes(3);
    expect((sql.mock.calls[0]?.[0] as TemplateStringsArray).join(' '))
      .toContain('LEFT JOIN resume_template_versions AS stable');
  });

  test.each([
    ['malformed manifest JSON', { manifest: '{' }],
    ['malformed capabilities JSON', { capabilities: '{' }],
    ['missing template publish time', { template_published_at: null }],
    ['missing version publish time', { version_published_at: null }],
    ['blocked stable version', { stable_status: 'blocked' }],
  ])('maps %s to an invalid or blocked runtime version without throwing', async (_label, override) => {
    const row = {
      slug: 'modern', template_status: 'published', version: '2.0.0', version_status: 'published',
      template_published_at: 1, version_published_at: 1, stable_status: 'published', stable_published_at: 1,
      renderer_kind: 'declarative-v1', manifest: '{}', manifest_hash: '0'.repeat(64), capabilities: '{}',
      fallback_version_id: null,
      ...override,
    };
    const load = createRuntimeVersionLoader(
      (async () => [row]) as never,
      async () => undefined,
    );

    const result = await load('version-id');

    expect(result?.status).toBe(row.stable_status === 'blocked' ? 'blocked' : 'invalid');
  });
});
