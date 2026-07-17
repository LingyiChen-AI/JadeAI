import { describe, expect, test, vi } from 'vitest';

import type { LocalTemplateRecord, TemplateManifestV1 } from '@/types/template';

import {
  exportLocalTemplatePackage,
  importLocalTemplatePackage,
} from './local-template-package';
import { hashManifest } from './normalize-manifest';

function manifest(): TemplateManifestV1 {
  return {
    schemaVersion: 1,
    rendererKind: 'declarative-v1',
    layout: { type: 'single-column', sidebarPosition: 'left', sidebarWidthPercent: 32, columnGapMm: 8 },
    typography: { fontFamily: 'noto-sans-sc', baseFontSizePt: 10.5, lineHeight: 1.5, headingScale: 1.25 },
    colors: { text: '#111111', muted: '#666666', accent: '#2563eb', background: '#ffffff' },
    spacing: { pageMarginMm: 12, sectionGapMm: 6 },
    sectionSlots: [{ sectionType: 'summary', placement: 'main', order: 0 }],
    sectionStyles: [],
    features: { showAvatar: true, showQrCodes: true, showPageNumbers: false, maxPages: 4 },
  };
}

function record(): LocalTemplateRecord {
  return {
    userId: 'private-user',
    localId: 'private-local-id',
    name: 'Local clean',
    category: 'general',
    localTags: ['clean'],
    sourceDescription: '',
    templateVersion: '1.0.0',
    manifest: manifest(),
    thumbnail: new Blob([new Uint8Array(32)], { type: 'image/png' }),
    createdAt: '2026-07-15T00:00:00.000Z',
    updatedAt: '2026-07-15T01:00:00.000Z',
  };
}

describe('.jade-template.json package', () => {
  test('exports only portable metadata, normalized manifest, format and checksum', async () => {
    const serialized = await exportLocalTemplatePackage({
      ...record(),
      sourceDescription: 'Created from a reviewed reference',
      templateVersion: '2.1.0',
    });
    const value = JSON.parse(serialized);

    expect(value).toMatchObject({
      formatVersion: 1,
      metadata: {
        name: 'Local clean',
        category: 'general',
        localTags: ['clean'],
        sourceDescription: 'Created from a reviewed reference',
        templateVersion: '2.1.0',
      },
      manifest: manifest(),
      checksum: expect.stringMatching(/^[0-9a-f]{64}$/),
    });
    expect(value.checksum).toBe(hashManifest(manifest()));
    expect(serialized).not.toMatch(/private-user|private-local-id/);
    expect(value).not.toHaveProperty('userId');
    expect(value).not.toHaveProperty('localId');
    expect(value).not.toHaveProperty('thumbnail');
    expect(value).not.toHaveProperty('sections');
  });

  test('imports into a new current-scope identity and timestamps', async () => {
    const serialized = await exportLocalTemplatePackage({
      ...record(),
      sourceDescription: 'Portable source note',
      templateVersion: '3.0.2',
    });
    const thumbnail = vi.fn(async () => new Blob([new Uint8Array(16)], { type: 'image/png' }));
    const imported = await importLocalTemplatePackage(serialized, {
      userId: 'current-user',
      localId: () => 'new-local-id',
      now: () => new Date('2026-07-16T02:03:04.000Z'),
      thumbnail,
    });

    expect(imported).toMatchObject({
      userId: 'current-user',
      localId: 'new-local-id',
      createdAt: '2026-07-16T02:03:04.000Z',
      updatedAt: '2026-07-16T02:03:04.000Z',
      sourceDescription: 'Portable source note',
      templateVersion: '3.0.2',
      manifest: manifest(),
    });
    expect(thumbnail).toHaveBeenCalledWith(manifest());
  });

  test.each([
    ['Resume JSON', JSON.stringify({ title: 'Resume', sections: [] })],
    ['unknown format', JSON.stringify({ formatVersion: 2 })],
    ['unknown root field', null],
    ['bad checksum', null],
    ['dangerous manifest field', null],
  ])('rejects %s before creating a record', async (kind, fixedInput) => {
    const exported = JSON.parse(await exportLocalTemplatePackage(record()));
    const input = fixedInput ?? JSON.stringify(kind === 'unknown root field'
      ? { ...exported, userId: 'leak' }
      : kind === 'bad checksum'
        ? { ...exported, checksum: '0'.repeat(64) }
        : {
            ...exported,
            manifest: { ...exported.manifest, rawHtml: '<script>alert(1)</script>' },
          });

    await expect(importLocalTemplatePackage(input, {
      userId: 'current-user',
      localId: () => 'new-local-id',
      now: () => new Date('2026-07-16T02:03:04.000Z'),
      thumbnail: new Blob([new Uint8Array(16)], { type: 'image/png' }),
    })).rejects.toThrow();
  });
});
