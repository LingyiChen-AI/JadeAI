import type { AIHistoryEntry } from '@/types/editor';

export const AI_HISTORY_DATABASE_NAME = 'jadeai-ai-history';
export const AI_HISTORY_DATABASE_VERSION = 1;
export const AI_HISTORY_LIMIT = 20;

const ENTRY_STORE = 'entries';
const METADATA_STORE = 'metadata';
const SCOPE_CREATED_AT_INDEX = 'by-scope-created-at';

export interface AIHistoryScope {
  userId: string;
  resumeId: string;
}

export interface AIHistoryRecord extends AIHistoryScope {
  cursor: string | null;
  stale: boolean;
}

export interface AIHistoryStorageTransaction {
  listEntries(scope: AIHistoryScope): Promise<unknown[]>;
  clearEntries(scope: AIHistoryScope): Promise<void>;
  putEntry(entry: AIHistoryEntry): Promise<void>;
  deleteEntry(scope: AIHistoryScope, entryId: string): Promise<void>;
  getMetadata(scope: AIHistoryScope): Promise<AIHistoryRecord | undefined>;
  putMetadata(record: AIHistoryRecord): Promise<void>;
  deleteMetadata(scope: AIHistoryScope): Promise<void>;
}

export interface AIHistoryStorageAdapter {
  transaction<T>(
    mode: IDBTransactionMode,
    operation: (transaction: AIHistoryStorageTransaction) => Promise<T>,
  ): Promise<T>;
}

export interface AIHistoryRepository {
  append(entry: AIHistoryEntry): Promise<void>;
  list(scope: AIHistoryScope): Promise<AIHistoryEntry[]>;
  getCursor(scope: AIHistoryScope): Promise<string | null>;
  setCursor(scope: AIHistoryScope, entryId: string | null): Promise<void>;
  truncateRedo(scope: AIHistoryScope, entryId: string): Promise<void>;
  clear(scope: AIHistoryScope): Promise<void>;
  markStale(scope: AIHistoryScope): Promise<void>;
  isStale(scope: AIHistoryScope): Promise<boolean>;
}

export class AIHistoryUnavailableError extends Error {
  readonly code = 'AI_HISTORY_UNAVAILABLE' as const;

  constructor(message = 'AI history storage is unavailable', options?: ErrorOptions) {
    super(message, options);
    this.name = 'AIHistoryUnavailableError';
  }
}

export class AIHistoryStorageError extends Error {
  readonly code = 'AI_HISTORY_STORAGE_ERROR' as const;

  constructor(message = 'AI history storage operation failed', options?: ErrorOptions) {
    super(message, options);
    this.name = 'AIHistoryStorageError';
  }
}

export class AIHistoryEntryNotFoundError extends Error {
  readonly code = 'AI_HISTORY_ENTRY_NOT_FOUND' as const;

  constructor(entryId: string) {
    super(`AI history entry was not found: ${entryId}`);
    this.name = 'AIHistoryEntryNotFoundError';
  }
}

export function isAIHistoryDegradationError(
  error: unknown,
): error is AIHistoryUnavailableError | AIHistoryStorageError {
  return error instanceof AIHistoryUnavailableError || error instanceof AIHistoryStorageError;
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.addEventListener('success', () => resolve(request.result), { once: true });
    request.addEventListener('error', () => reject(request.error), { once: true });
  });
}

function transactionCompletion(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.addEventListener('complete', () => resolve(), { once: true });
    transaction.addEventListener('abort', () => reject(transaction.error), { once: true });
    transaction.addEventListener('error', () => reject(transaction.error), { once: true });
  });
}

class IndexedDBAIHistoryStorageAdapter implements AIHistoryStorageAdapter {
  private databasePromise: Promise<IDBDatabase> | null = null;

  private open(): Promise<IDBDatabase> {
    if (typeof globalThis.indexedDB === 'undefined') {
      return Promise.reject(new AIHistoryUnavailableError());
    }
    if (this.databasePromise) return this.databasePromise;

    this.databasePromise = new Promise((resolve, reject) => {
      let settled = false;
      const request = globalThis.indexedDB.open(
        AI_HISTORY_DATABASE_NAME,
        AI_HISTORY_DATABASE_VERSION,
      );
      request.addEventListener('upgradeneeded', () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(ENTRY_STORE)) {
          const entries = database.createObjectStore(ENTRY_STORE, {
            keyPath: ['userId', 'resumeId', 'id'],
          });
          entries.createIndex(
            SCOPE_CREATED_AT_INDEX,
            ['userId', 'resumeId', 'createdAt'],
            { unique: false },
          );
        }
        if (!database.objectStoreNames.contains(METADATA_STORE)) {
          database.createObjectStore(METADATA_STORE, {
            keyPath: ['userId', 'resumeId'],
          });
        }
      });
      request.addEventListener('success', () => {
        const database = request.result;
        if (settled) {
          database.close();
          return;
        }
        database.addEventListener('versionchange', () => {
          database.close();
          this.databasePromise = null;
        });
        settled = true;
        resolve(database);
      }, { once: true });
      request.addEventListener('error', () => {
        settled = true;
        this.databasePromise = null;
        reject(request.error);
      }, { once: true });
      request.addEventListener('blocked', () => {
        settled = true;
        this.databasePromise = null;
        reject(new AIHistoryUnavailableError('AI history database upgrade is blocked'));
      }, { once: true });
    });
    return this.databasePromise;
  }

  async transaction<T>(
    mode: IDBTransactionMode,
    operation: (transaction: AIHistoryStorageTransaction) => Promise<T>,
  ): Promise<T> {
    const database = await this.open();
    const transaction = database.transaction([ENTRY_STORE, METADATA_STORE], mode);
    const completed = transactionCompletion(transaction);
    const entries = transaction.objectStore(ENTRY_STORE);
    const metadata = transaction.objectStore(METADATA_STORE);

    const storageTransaction: AIHistoryStorageTransaction = {
      listEntries: async (scope) => {
        const range = IDBKeyRange.bound(
          [scope.userId, scope.resumeId, Number.NEGATIVE_INFINITY],
          [scope.userId, scope.resumeId, Number.POSITIVE_INFINITY],
        );
        return requestResult(entries.index(SCOPE_CREATED_AT_INDEX).getAll(range));
      },
      clearEntries: async (scope) => new Promise((resolve, reject) => {
        const request = entries.openCursor();
        request.addEventListener('error', () => reject(request.error), { once: true });
        request.addEventListener('success', () => {
          const cursor = request.result;
          if (!cursor) {
            resolve();
            return;
          }
          const key = cursor.primaryKey;
          if (
            Array.isArray(key)
            && key[0] === scope.userId
            && key[1] === scope.resumeId
          ) {
            cursor.delete();
          }
          cursor.continue();
        });
      }),
      putEntry: async (entry) => {
        await requestResult(entries.put(entry));
      },
      deleteEntry: async (scope, entryId) => {
        await requestResult(entries.delete([scope.userId, scope.resumeId, entryId]));
      },
      getMetadata: async (scope) => requestResult(
        metadata.get([scope.userId, scope.resumeId]),
      ) as Promise<AIHistoryRecord | undefined>,
      putMetadata: async (record) => {
        await requestResult(metadata.put(record));
      },
      deleteMetadata: async (scope) => {
        await requestResult(metadata.delete([scope.userId, scope.resumeId]));
      },
    };

    try {
      const result = await operation(storageTransaction);
      await completed;
      return result;
    } catch (error) {
      try {
        transaction.abort();
      } catch {
        // The request error may already have completed or aborted the transaction.
      }
      void completed.catch(() => undefined);
      throw error;
    }
  }
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function isAIHistoryEntry(value: unknown): value is AIHistoryEntry {
  if (!value || typeof value !== 'object') return false;
  const entry = value as Partial<AIHistoryEntry>;
  return isString(entry.id)
    && isString(entry.userId)
    && isString(entry.resumeId)
    && Array.isArray(entry.beforeSections)
    && Array.isArray(entry.afterSections)
    && Array.isArray(entry.changes)
    && (entry.source === 'chat-tool' || entry.source === 'overwrite-translation')
    && typeof entry.createdAt === 'number'
    && Number.isFinite(entry.createdAt)
    && typeof entry.serverRevision === 'number'
    && Number.isSafeInteger(entry.serverRevision)
    && entry.serverRevision >= 0
    && isString(entry.contentFingerprint);
}

function compareEntries(left: AIHistoryEntry, right: AIHistoryEntry): number {
  return left.createdAt - right.createdAt || left.id.localeCompare(right.id);
}

function validEntries(values: unknown[], scope: AIHistoryScope): AIHistoryEntry[] {
  return values
    .filter((value): value is AIHistoryEntry => (
      isAIHistoryEntry(value)
      && value.userId === scope.userId
      && value.resumeId === scope.resumeId
    ))
    .map((value) => structuredClone(value))
    .sort(compareEntries);
}

function metadata(scope: AIHistoryScope, record?: AIHistoryRecord): AIHistoryRecord {
  const cursor = record?.cursor;
  const stale = record?.stale;
  return {
    userId: scope.userId,
    resumeId: scope.resumeId,
    cursor: typeof cursor === 'string' || cursor === null ? cursor : null,
    stale: typeof stale === 'boolean' ? stale : false,
  };
}

async function runStorageOperation<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (
      error instanceof AIHistoryUnavailableError
      || error instanceof AIHistoryStorageError
      || error instanceof AIHistoryEntryNotFoundError
    ) {
      throw error;
    }
    throw new AIHistoryStorageError(undefined, { cause: error });
  }
}

export function createAIHistoryRepository(
  adapter: AIHistoryStorageAdapter = new IndexedDBAIHistoryStorageAdapter(),
): AIHistoryRepository {
  return {
    append: async (entry) => runStorageOperation(async () => {
      if (!isAIHistoryEntry(entry)) {
        throw new AIHistoryStorageError('Cannot store an invalid AI history entry');
      }
      const scope = { userId: entry.userId, resumeId: entry.resumeId };
      await adapter.transaction('readwrite', async (transaction) => {
        await transaction.putEntry(structuredClone(entry));
        const entries = validEntries(await transaction.listEntries(scope), scope);
        const excess = entries.slice(0, Math.max(0, entries.length - AI_HISTORY_LIMIT));
        for (const expired of excess) {
          await transaction.deleteEntry(scope, expired.id);
        }
        await transaction.putMetadata({ ...scope, cursor: entry.id, stale: false });
      });
    }),

    list: async (scope) => runStorageOperation(async () => adapter.transaction(
      'readonly',
      async (transaction) => validEntries(await transaction.listEntries(scope), scope),
    )),

    getCursor: async (scope) => runStorageOperation(async () => adapter.transaction(
      'readonly',
      async (transaction) => metadata(scope, await transaction.getMetadata(scope)).cursor,
    )),

    setCursor: async (scope, entryId) => runStorageOperation(async () => {
      await adapter.transaction('readwrite', async (transaction) => {
        const current = await transaction.getMetadata(scope);
        await transaction.putMetadata({ ...metadata(scope, current), cursor: entryId });
      });
    }),

    truncateRedo: async (scope, entryId) => runStorageOperation(async () => {
      await adapter.transaction('readwrite', async (transaction) => {
        const entries = validEntries(await transaction.listEntries(scope), scope);
        const pivot = entries.findIndex((entry) => entry.id === entryId);
        if (pivot === -1) throw new AIHistoryEntryNotFoundError(entryId);
        for (const redoEntry of entries.slice(pivot + 1)) {
          await transaction.deleteEntry(scope, redoEntry.id);
        }
        const current = await transaction.getMetadata(scope);
        await transaction.putMetadata({
          ...metadata(scope, current),
          cursor: entryId,
          stale: false,
        });
      });
    }),

    clear: async (scope) => runStorageOperation(async () => {
      await adapter.transaction('readwrite', async (transaction) => {
        await transaction.clearEntries(scope);
        await transaction.deleteMetadata(scope);
      });
    }),

    markStale: async (scope) => runStorageOperation(async () => {
      await adapter.transaction('readwrite', async (transaction) => {
        const current = await transaction.getMetadata(scope);
        await transaction.putMetadata({ ...metadata(scope, current), stale: true });
      });
    }),

    isStale: async (scope) => runStorageOperation(async () => adapter.transaction(
      'readonly',
      async (transaction) => metadata(scope, await transaction.getMetadata(scope)).stale,
    )),
  };
}

export const aiHistoryRepository = createAIHistoryRepository();
