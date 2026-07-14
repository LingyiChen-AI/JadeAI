import { describe, expect, it } from 'vitest';
import type { AIHistoryEntry } from '@/types/editor';
import type {
  AIHistoryRecord,
  AIHistoryScope,
  AIHistoryStorageAdapter,
  AIHistoryStorageTransaction,
} from './ai-history';
import {
  AIHistoryUnavailableError,
  createAIHistoryRepository,
} from './ai-history';

function scope(userId = 'user-1', resumeId = 'resume-1'): AIHistoryScope {
  return { userId, resumeId };
}

function entry(id: string, overrides: Partial<AIHistoryEntry> = {}): AIHistoryEntry {
  const index = Number(id.match(/\d+$/)?.[0] ?? 0);
  return {
    id,
    userId: 'user-1',
    resumeId: 'resume-1',
    beforeSections: [],
    afterSections: [],
    changes: [],
    source: 'chat-tool',
    createdAt: index,
    serverRevision: index,
    contentFingerprint: `fingerprint-${index}`,
    ...overrides,
  };
}

class MemoryAdapter implements AIHistoryStorageAdapter {
  readonly entries: unknown[] = [];
  readonly metadata = new Map<string, AIHistoryRecord>();
  transactions = 0;

  async transaction<T>(
    _mode: IDBTransactionMode,
    operation: (transaction: AIHistoryStorageTransaction) => Promise<T>,
  ): Promise<T> {
    this.transactions += 1;
    const key = (value: AIHistoryScope) => `${value.userId}\u0000${value.resumeId}`;
    const sameScope = (value: unknown, target: AIHistoryScope) => {
      if (!value || typeof value !== 'object') return false;
      const record = value as { userId?: unknown; resumeId?: unknown };
      return record.userId === target.userId && record.resumeId === target.resumeId;
    };

    return operation({
      listEntries: async (target) => this.entries.filter((value) => sameScope(value, target)),
      clearEntries: async (target) => {
        for (let index = this.entries.length - 1; index >= 0; index -= 1) {
          if (sameScope(this.entries[index], target)) this.entries.splice(index, 1);
        }
      },
      putEntry: async (value) => {
        const index = this.entries.findIndex((stored) => {
          if (!sameScope(stored, value)) return false;
          return (stored as { id?: unknown }).id === value.id;
        });
        if (index === -1) this.entries.push(structuredClone(value));
        else this.entries[index] = structuredClone(value);
      },
      deleteEntry: async (target, entryId) => {
        const index = this.entries.findIndex((stored) => (
          sameScope(stored, target)
          && (stored as { id?: unknown }).id === entryId
        ));
        if (index !== -1) this.entries.splice(index, 1);
      },
      getMetadata: async (target) => structuredClone(this.metadata.get(key(target))),
      putMetadata: async (value) => {
        this.metadata.set(key(value), structuredClone(value));
      },
      deleteMetadata: async (target) => {
        this.metadata.delete(key(target));
      },
    });
  }
}

describe('AI history repository', () => {
  it('isolates entries and cursors by user and resume', async () => {
    const adapter = new MemoryAdapter();
    const history = createAIHistoryRepository(adapter);
    await history.append(entry('shared'));
    await history.append(entry('shared', { userId: 'user-2' }));
    await history.append(entry('shared', { resumeId: 'resume-2' }));

    expect((await history.list(scope())).map((value) => value.id)).toEqual(['shared']);
    expect(await history.getCursor(scope())).toBe('shared');
    expect(await history.getCursor(scope('user-2'))).toBe('shared');
    expect(await history.getCursor(scope('user-1', 'resume-2'))).toBe('shared');
  });

  it('keeps only the newest 20 entries in the append transaction', async () => {
    const adapter = new MemoryAdapter();
    const history = createAIHistoryRepository(adapter);
    for (let index = 1; index <= 21; index += 1) {
      await history.append(entry(`entry-${index}`));
    }

    const stored = await history.list(scope());
    expect(stored).toHaveLength(20);
    expect(stored.map((value) => value.id)).toEqual(
      Array.from({ length: 20 }, (_, index) => `entry-${index + 2}`),
    );
    expect(adapter.transactions).toBe(22);
  });

  it('stores a cursor for backward and forward navigation', async () => {
    const history = createAIHistoryRepository(new MemoryAdapter());
    await history.append(entry('entry-1'));
    await history.append(entry('entry-2'));

    expect(await history.getCursor(scope())).toBe('entry-2');
    await history.setCursor(scope(), 'entry-1');
    expect(await history.getCursor(scope())).toBe('entry-1');
    await history.setCursor(scope(), null);
    expect(await history.getCursor(scope())).toBeNull();
  });

  it('truncates the redo branch after the selected entry', async () => {
    const history = createAIHistoryRepository(new MemoryAdapter());
    await history.append(entry('entry-1'));
    await history.append(entry('entry-2'));
    await history.append(entry('entry-3'));

    await history.truncateRedo(scope(), 'entry-1');

    expect((await history.list(scope())).map((value) => value.id)).toEqual(['entry-1']);
    expect(await history.getCursor(scope())).toBe('entry-1');
  });

  it('isolates corrupt records instead of failing the whole scope', async () => {
    const adapter = new MemoryAdapter();
    const history = createAIHistoryRepository(adapter);
    await history.append(entry('entry-1'));
    adapter.entries.push({ id: 'corrupt', userId: 'user-1', resumeId: 'resume-1' });
    adapter.entries.push({ id: 'missing-created-at', userId: 'user-1', resumeId: 'resume-1', createdAt: 'bad' });
    adapter.entries.push({ id: 42, userId: 'user-1', resumeId: 'resume-1' });

    await expect(history.list(scope())).resolves.toEqual([entry('entry-1')]);
    await history.clear(scope());
    expect(adapter.entries).toEqual([]);
  });

  it('ignores malformed metadata when reading cursor and stale state', async () => {
    const adapter = new MemoryAdapter();
    const history = createAIHistoryRepository(adapter);
    adapter.metadata.set('user-1\u0000resume-1', {
      userId: 'user-1', resumeId: 'resume-1', cursor: 42 as unknown as string, stale: 'yes' as unknown as boolean,
    });

    await expect(history.getCursor(scope())).resolves.toBeNull();
    await expect(history.isStale(scope())).resolves.toBe(false);
  });

  it('clears one scope and persists its stale state independently', async () => {
    const history = createAIHistoryRepository(new MemoryAdapter());
    await history.append(entry('entry-1'));
    await history.append(entry('other', { resumeId: 'resume-2' }));
    await history.markStale(scope());

    expect(await history.isStale(scope())).toBe(true);
    expect(await history.isStale(scope('user-1', 'resume-2'))).toBe(false);
    await history.clear(scope());
    expect(await history.list(scope())).toEqual([]);
    expect(await history.getCursor(scope())).toBeNull();
    expect(await history.isStale(scope())).toBe(false);
    expect(await history.list(scope('user-1', 'resume-2'))).toHaveLength(1);
  });

  it('reports an identifiable degradation error when IndexedDB is unavailable', async () => {
    const history = createAIHistoryRepository();

    await expect(history.list(scope())).rejects.toMatchObject({
      name: 'AIHistoryUnavailableError',
      code: 'AI_HISTORY_UNAVAILABLE',
    });
    await expect(history.append(entry('entry-1'))).rejects.toBeInstanceOf(AIHistoryUnavailableError);
  });
});
