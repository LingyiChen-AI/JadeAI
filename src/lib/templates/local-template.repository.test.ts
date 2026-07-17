import 'fake-indexeddb/auto';

import { afterEach, describe, expect, test } from 'vitest';

import type { LocalTemplateRecord, TemplateManifestV1 } from '@/types/template';

import {
  LOCAL_TEMPLATE_STORE_NAME,
  LocalTemplateQuotaError,
  LocalTemplateUnavailableError,
  createLocalTemplateRepository,
} from './local-template.repository';

const databaseNames = new Set<string>();

function databaseName(label: string) {
  const name = `jadeai-local-template-${label}-${crypto.randomUUID()}`;
  databaseNames.add(name);
  return name;
}

function manifest(accent = '#2563eb'): TemplateManifestV1 {
  return {
    schemaVersion: 1,
    rendererKind: 'declarative-v1',
    layout: { type: 'single-column', sidebarPosition: 'left', sidebarWidthPercent: 32, columnGapMm: 8 },
    typography: { fontFamily: 'noto-sans-sc', baseFontSizePt: 10.5, lineHeight: 1.5, headingScale: 1.25 },
    colors: { text: '#111111', muted: '#666666', accent, background: '#ffffff' },
    spacing: { pageMarginMm: 12, sectionGapMm: 6 },
    sectionSlots: [{ sectionType: 'summary', placement: 'main', order: 0 }],
    sectionStyles: [],
    features: { showAvatar: true, showQrCodes: true, showPageNumbers: false, maxPages: 4 },
  };
}

function record(userId: string, localId: string, overrides: Partial<LocalTemplateRecord> = {}): LocalTemplateRecord {
  return {
    userId,
    localId,
    name: `Template ${localId}`,
    category: 'general',
    localTags: [],
    sourceDescription: '',
    templateVersion: '1.0.0',
    manifest: manifest(),
    thumbnail: new Blob([new Uint8Array(32)], { type: 'image/png' }),
    createdAt: '2026-07-16T00:00:00.000Z',
    updatedAt: '2026-07-16T00:00:00.000Z',
    ...overrides,
  };
}

function deleteDatabase(name: string) {
  return new Promise<void>((resolve) => {
    const request = indexedDB.deleteDatabase(name);
    request.addEventListener('success', () => resolve(), { once: true });
    request.addEventListener('error', () => resolve(), { once: true });
    request.addEventListener('blocked', () => resolve(), { once: true });
  });
}

afterEach(async () => {
  await Promise.all([...databaseNames].map(deleteDatabase));
  databaseNames.clear();
});

describe('local template IndexedDB repository', () => {
  test('migrates legacy records with stable metadata defaults and preserves explicit metadata', async () => {
    const name = databaseName('metadata-migration');
    const repository = createLocalTemplateRepository({ databaseName: name });
    await repository.list('user-a');

    const connection = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(name);
      request.addEventListener('success', () => resolve(request.result), { once: true });
      request.addEventListener('error', () => reject(request.error), { once: true });
    });
    const transaction = connection.transaction(LOCAL_TEMPLATE_STORE_NAME, 'readwrite');
    const legacyRecord: Record<string, unknown> = { ...record('user-a', 'legacy') };
    delete legacyRecord.sourceDescription;
    delete legacyRecord.templateVersion;
    transaction.objectStore(LOCAL_TEMPLATE_STORE_NAME).put(legacyRecord);
    await new Promise<void>((resolve, reject) => {
      transaction.addEventListener('complete', () => resolve(), { once: true });
      transaction.addEventListener('error', () => reject(transaction.error), { once: true });
    });
    connection.close();

    await expect(repository.get('user-a', 'legacy')).resolves.toMatchObject({
      sourceDescription: '',
      templateVersion: '1.0.0',
    });
    await expect(repository.save({
      ...record('user-a', 'current'),
      sourceDescription: 'Copied from the JadeAI public catalog',
      templateVersion: '2.3.1',
    })).resolves.toMatchObject({
      sourceDescription: 'Copied from the JadeAI public catalog',
      templateVersion: '2.3.1',
    });
    repository.close();
  });

  test('isolates CRUD by user and local ID in real IndexedDB transactions', async () => {
    const repository = createLocalTemplateRepository({ databaseName: databaseName('scope') });
    await repository.save(record('user-a', 'shared'));
    await repository.save(record('user-b', 'shared', { name: 'Other user' }));
    await repository.save(record('user-a', 'second'));

    expect((await repository.list('user-a')).records.map((item) => item.localId)).toEqual(['second', 'shared']);
    expect((await repository.list('user-b')).records.map((item) => item.name)).toEqual(['Other user']);
    await repository.save(record('user-a', 'shared', { name: 'Updated', manifest: manifest('#dc2626') }));
    expect((await repository.get('user-a', 'shared'))?.name).toBe('Updated');
    await repository.remove('user-a', 'shared');
    expect(await repository.get('user-a', 'shared')).toBeNull();
    expect(await repository.get('user-b', 'shared')).not.toBeNull();
    repository.close();
  });

  test('rolls back record-count and byte-quota failures without replacing valid data', async () => {
    const countRepository = createLocalTemplateRepository({
      databaseName: databaseName('count-quota'),
      limits: { maxRecords: 1, maxEstimatedBytes: 10_000 },
    });
    await countRepository.save(record('user-a', 'kept'));
    await expect(countRepository.save(record('user-a', 'rejected'))).rejects.toBeInstanceOf(LocalTemplateQuotaError);
    expect((await countRepository.list('user-a')).records.map((item) => item.localId)).toEqual(['kept']);
    countRepository.close();

    const byteRepository = createLocalTemplateRepository({
      databaseName: databaseName('byte-quota'),
      limits: { maxRecords: 100, maxEstimatedBytes: 1_250 },
    });
    await byteRepository.save(record('user-a', 'kept'));
    const before = await byteRepository.get('user-a', 'kept');
    await expect(byteRepository.save(record('user-a', 'kept', {
      name: 'x'.repeat(100),
      thumbnail: new Blob([new Uint8Array(900)], { type: 'image/png' }),
    }))).rejects.toBeInstanceOf(LocalTemplateQuotaError);
    expect(await byteRepository.get('user-a', 'kept')).toEqual(before);
    byteRepository.close();
  });

  test('isolates corrupt and wrong-scope records while reporting their count', async () => {
    const name = databaseName('corrupt');
    const repository = createLocalTemplateRepository({ databaseName: name });
    await repository.save(record('user-a', 'valid'));
    await repository.list('user-a');

    const connection = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(name);
      request.addEventListener('success', () => resolve(request.result), { once: true });
      request.addEventListener('error', () => reject(request.error), { once: true });
    });
    const transaction = connection.transaction(LOCAL_TEMPLATE_STORE_NAME, 'readwrite');
    transaction.objectStore(LOCAL_TEMPLATE_STORE_NAME).put({ userId: 'user-a', localId: 'corrupt', name: 42 });
    transaction.objectStore(LOCAL_TEMPLATE_STORE_NAME).put({ ...record('user-b', 'foreign'), userId: 'user-a' });
    await new Promise<void>((resolve, reject) => {
      transaction.addEventListener('complete', () => resolve(), { once: true });
      transaction.addEventListener('error', () => reject(transaction.error), { once: true });
    });
    connection.close();

    const result = await repository.list('user-a');
    expect(result.records.map((item) => item.localId)).toEqual(['foreign', 'valid']);
    expect(result.corruptCount).toBe(1);
    repository.close();
  });

  test('excludes corrupt records from count and byte quotas when saving valid data', async () => {
    const name = databaseName('corrupt-quota');
    const repository = createLocalTemplateRepository({
      databaseName: name,
      limits: { maxRecords: 1, maxEstimatedBytes: 1_500 },
    });
    await repository.list('user-a');
    const connection = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(name);
      request.addEventListener('success', () => resolve(request.result), { once: true });
      request.addEventListener('error', () => reject(request.error), { once: true });
    });
    const transaction = connection.transaction(LOCAL_TEMPLATE_STORE_NAME, 'readwrite');
    transaction.objectStore(LOCAL_TEMPLATE_STORE_NAME).put({
      userId: 'user-a', localId: 'corrupt', name: 'x'.repeat(5_000),
    });
    await new Promise<void>((resolve, reject) => {
      transaction.addEventListener('complete', () => resolve(), { once: true });
      transaction.addEventListener('error', () => reject(transaction.error), { once: true });
    });
    connection.close();

    await expect(repository.save(record('user-a', 'valid'))).resolves.toMatchObject({ localId: 'valid' });
    expect(await repository.list('user-a')).toMatchObject({ corruptCount: 1, records: [expect.objectContaining({ localId: 'valid' })] });
    repository.close();
  });

  test('reports unavailable IndexedDB with a stable degradation error', async () => {
    const original = globalThis.indexedDB;
    Object.defineProperty(globalThis, 'indexedDB', { configurable: true, value: undefined });
    try {
      const repository = createLocalTemplateRepository({ databaseName: databaseName('unavailable') });
      await expect(repository.list('user-a')).rejects.toBeInstanceOf(LocalTemplateUnavailableError);
    } finally {
      Object.defineProperty(globalThis, 'indexedDB', { configurable: true, value: original });
    }
  });

  test('fails a blocked upgrade without leaking a hanging operation', async () => {
    const name = databaseName('blocked');
    const blocker = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(name, 1);
      request.addEventListener('upgradeneeded', () => request.result.createObjectStore('blocker'));
      request.addEventListener('success', () => resolve(request.result), { once: true });
      request.addEventListener('error', () => reject(request.error), { once: true });
    });
    const repository = createLocalTemplateRepository({ databaseName: name, databaseVersion: 2 });

    await expect(repository.list('user-a')).rejects.toBeInstanceOf(LocalTemplateUnavailableError);

    blocker.close();
    repository.close();
  });

  test('closes on versionchange and reports the stale client version as unavailable', async () => {
    const name = databaseName('versionchange');
    const repository = createLocalTemplateRepository({ databaseName: name, databaseVersion: 1 });
    await repository.save(record('user-a', 'kept'));

    const upgraded = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(name, 2);
      request.addEventListener('success', () => resolve(request.result), { once: true });
      request.addEventListener('error', () => reject(request.error), { once: true });
    });
    upgraded.close();

    await expect(repository.list('user-a')).rejects.toBeInstanceOf(LocalTemplateUnavailableError);
    repository.close();
  });
});
