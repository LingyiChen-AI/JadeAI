// @vitest-environment jsdom

import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';

import type { LocalTemplateRecord, TemplateManifestV1 } from '@/types/template';
import type { LocalTemplateRepository } from '@/lib/templates/local-template.repository';
import { LocalTemplateUnavailableError } from '@/lib/templates/local-template.repository';

import { useLocalTemplates } from './use-local-templates';

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

function record(localId: string): LocalTemplateRecord {
  return {
    userId: 'user-a', localId, name: localId, category: 'general', localTags: [],
    sourceDescription: '', templateVersion: '1.0.0', manifest: manifest(),
    thumbnail: new Blob([new Uint8Array(16)], { type: 'image/png' }),
    createdAt: '2026-07-16T00:00:00.000Z', updatedAt: '2026-07-16T00:00:00.000Z',
  };
}

function repository(overrides: Partial<LocalTemplateRepository> = {}): LocalTemplateRepository {
  return {
    list: vi.fn(async () => ({ records: [record('one')], corruptCount: 1 })),
    get: vi.fn(async () => null),
    save: vi.fn(async (value) => value),
    remove: vi.fn(async () => undefined),
    clear: vi.fn(async () => undefined),
    close: vi.fn(),
    ...overrides,
  };
}

describe('useLocalTemplates', () => {
  test('loads one user scope and refreshes after save and remove', async () => {
    const storage = repository();
    const { result } = renderHook(() => useLocalTemplates('user-a', storage));
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.records.map((item) => item.localId)).toEqual(['one']);
    expect(result.current.corruptCount).toBe(1);

    await act(async () => { await result.current.save(record('two')); });
    await act(async () => { await result.current.remove('one'); });

    expect(storage.save).toHaveBeenCalledWith(expect.objectContaining({ userId: 'user-a', localId: 'two' }));
    expect(storage.remove).toHaveBeenCalledWith('user-a', 'one');
    expect(storage.list).toHaveBeenCalledTimes(3);
  });

  test('exposes a stable degraded state when IndexedDB is unavailable', async () => {
    const storage = repository({ list: vi.fn(async () => { throw new LocalTemplateUnavailableError(); }) });
    const { result } = renderHook(() => useLocalTemplates('user-a', storage));

    await waitFor(() => expect(result.current.status).toBe('degraded'));
    expect(result.current.records).toEqual([]);
    expect(result.current.errorCode).toBe('LOCAL_TEMPLATE_STORAGE_UNAVAILABLE');
  });

  test('parses an import completely before making one repository write', async () => {
    const storage = repository();
    const { result } = renderHook(() => useLocalTemplates('user-a', storage));
    await waitFor(() => expect(result.current.status).toBe('ready'));
    const source = record('source');
    const serialized = await result.current.exportPackage(source);

    await act(async () => {
      await result.current.importPackage(serialized, new Blob([new Uint8Array(16)], { type: 'image/png' }));
    });
    expect(storage.save).toHaveBeenCalledTimes(1);

    await expect(result.current.importPackage(
      JSON.stringify({ title: 'Resume', sections: [] }),
      new Blob([new Uint8Array(16)], { type: 'image/png' }),
    )).rejects.toThrow();
    expect(storage.save).toHaveBeenCalledTimes(1);
  });
});
