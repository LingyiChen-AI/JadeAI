import {
  LOCAL_TEMPLATE_MAX_ESTIMATED_BYTES,
  LOCAL_TEMPLATE_MAX_RECORDS,
  LocalTemplateRecordSchema,
} from './schema';
import type { LocalTemplateRecord } from '@/types/template';

export const LOCAL_TEMPLATE_DATABASE_NAME = 'jadeai-local-templates';
export const LOCAL_TEMPLATE_DATABASE_VERSION = 1;
export const LOCAL_TEMPLATE_STORE_NAME = 'templates';

const USER_INDEX = 'by-user';

type LocalTemplateLimits = {
  maxRecords: number;
  maxEstimatedBytes: number;
};

type LocalTemplateRepositoryOptions = {
  databaseName?: string;
  databaseVersion?: number;
  indexedDB?: IDBFactory;
  limits?: Partial<LocalTemplateLimits>;
};

export type LocalTemplateListResult = {
  records: LocalTemplateRecord[];
  corruptCount: number;
};

export interface LocalTemplateRepository {
  list(userId: string): Promise<LocalTemplateListResult>;
  get(userId: string, localId: string): Promise<LocalTemplateRecord | null>;
  save(record: LocalTemplateRecord): Promise<LocalTemplateRecord>;
  remove(userId: string, localId: string): Promise<void>;
  clear(userId: string): Promise<void>;
  close(): void;
}

export class LocalTemplateUnavailableError extends Error {
  readonly code = 'LOCAL_TEMPLATE_STORAGE_UNAVAILABLE' as const;

  constructor(message = 'Local template storage is unavailable', options?: ErrorOptions) {
    super(message, options);
    this.name = 'LocalTemplateUnavailableError';
  }
}

export class LocalTemplateQuotaError extends Error {
  readonly code = 'LOCAL_TEMPLATE_QUOTA_EXCEEDED' as const;

  constructor(message = 'Local template quota exceeded', options?: ErrorOptions) {
    super(message, options);
    this.name = 'LocalTemplateQuotaError';
  }
}

export class LocalTemplateStorageError extends Error {
  readonly code = 'LOCAL_TEMPLATE_STORAGE_ERROR' as const;

  constructor(message = 'Local template storage operation failed', options?: ErrorOptions) {
    super(message, options);
    this.name = 'LocalTemplateStorageError';
  }
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

function estimatedBytes(value: unknown): number {
  try {
    if (value && typeof value === 'object' && 'thumbnail' in value) {
      const record = value as { thumbnail?: unknown };
      const thumbnailBytes = record.thumbnail instanceof Blob ? record.thumbnail.size : 0;
      const withoutThumbnail = { ...(value as Record<string, unknown>), thumbnail: undefined };
      return new TextEncoder().encode(JSON.stringify(withoutThumbnail)).byteLength + thumbnailBytes;
    }
    return new TextEncoder().encode(JSON.stringify(value)).byteLength;
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

function normalizeStorageError(error: unknown): Error {
  if (
    error instanceof LocalTemplateUnavailableError
    || error instanceof LocalTemplateQuotaError
    || error instanceof LocalTemplateStorageError
  ) return error;
  if (error instanceof DOMException && error.name === 'QuotaExceededError') {
    return new LocalTemplateQuotaError(undefined, { cause: error });
  }
  if (error instanceof DOMException && error.name === 'VersionError') {
    return new LocalTemplateUnavailableError('Local template database version is unavailable', { cause: error });
  }
  return new LocalTemplateStorageError(undefined, { cause: error });
}

export function createLocalTemplateRepository(
  options: LocalTemplateRepositoryOptions = {},
): LocalTemplateRepository {
  const databaseName = options.databaseName ?? LOCAL_TEMPLATE_DATABASE_NAME;
  const databaseVersion = options.databaseVersion ?? LOCAL_TEMPLATE_DATABASE_VERSION;
  const limits: LocalTemplateLimits = {
    maxRecords: options.limits?.maxRecords ?? LOCAL_TEMPLATE_MAX_RECORDS,
    maxEstimatedBytes: options.limits?.maxEstimatedBytes ?? LOCAL_TEMPLATE_MAX_ESTIMATED_BYTES,
  };
  let databasePromise: Promise<IDBDatabase> | null = null;

  function factory(): IDBFactory {
    const value = options.indexedDB ?? globalThis.indexedDB;
    if (!value) throw new LocalTemplateUnavailableError();
    return value;
  }

  function open(): Promise<IDBDatabase> {
    if (databasePromise) return databasePromise;
    databasePromise = new Promise((resolve, reject) => {
      let settled = false;
      let request: IDBOpenDBRequest;
      try {
        request = factory().open(databaseName, databaseVersion);
      } catch (error) {
        databasePromise = null;
        reject(normalizeStorageError(error));
        return;
      }
      request.addEventListener('upgradeneeded', () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(LOCAL_TEMPLATE_STORE_NAME)) {
          const store = database.createObjectStore(LOCAL_TEMPLATE_STORE_NAME, {
            keyPath: ['userId', 'localId'],
          });
          store.createIndex(USER_INDEX, 'userId', { unique: false });
        }
      });
      request.addEventListener('success', () => {
        const database = request.result;
        if (settled) {
          database.close();
          return;
        }
        settled = true;
        database.addEventListener('versionchange', () => {
          database.close();
          databasePromise = null;
        });
        resolve(database);
      }, { once: true });
      request.addEventListener('error', () => {
        if (settled) return;
        settled = true;
        databasePromise = null;
        reject(normalizeStorageError(request.error));
      }, { once: true });
      request.addEventListener('blocked', () => {
        if (settled) return;
        settled = true;
        databasePromise = null;
        reject(new LocalTemplateUnavailableError('Local template database upgrade is blocked'));
      }, { once: true });
    });
    return databasePromise;
  }

  async function withStore<T>(
    mode: IDBTransactionMode,
    operation: (store: IDBObjectStore) => Promise<T>,
  ): Promise<T> {
    try {
      const database = await open();
      const transaction = database.transaction(LOCAL_TEMPLATE_STORE_NAME, mode);
      const completed = transactionCompletion(transaction);
      try {
        const result = await operation(transaction.objectStore(LOCAL_TEMPLATE_STORE_NAME));
        await completed;
        return result;
      } catch (error) {
        try {
          transaction.abort();
        } catch {
          // A request error may already have completed or aborted the transaction.
        }
        void completed.catch(() => undefined);
        throw error;
      }
    } catch (error) {
      throw normalizeStorageError(error);
    }
  }

  async function rawForUser(store: IDBObjectStore, userId: string): Promise<unknown[]> {
    return requestResult(store.index(USER_INDEX).getAll(IDBKeyRange.only(userId))) as Promise<unknown[]>;
  }

  return {
    list: async (userId) => withStore('readonly', async (store) => {
      const values = await rawForUser(store, userId);
      const records: LocalTemplateRecord[] = [];
      let corruptCount = 0;
      for (const value of values) {
        const parsed = LocalTemplateRecordSchema.safeParse(value);
        if (!parsed.success || parsed.data.userId !== userId) {
          corruptCount += 1;
          continue;
        }
        records.push(parsed.data);
      }
      records.sort((left, right) => (
        right.updatedAt.localeCompare(left.updatedAt) || left.localId.localeCompare(right.localId)
      ));
      return { records, corruptCount };
    }),

    get: async (userId, localId) => withStore('readonly', async (store) => {
      const value = await requestResult(store.get([userId, localId]));
      const parsed = LocalTemplateRecordSchema.safeParse(value);
      return parsed.success && parsed.data.userId === userId ? parsed.data : null;
    }),

    save: async (input) => {
      const record = LocalTemplateRecordSchema.parse(input);
      return withStore('readwrite', async (store) => {
        const values = await rawForUser(store, record.userId);
        const others = values.flatMap((value) => {
          const parsed = LocalTemplateRecordSchema.safeParse(value);
          if (!parsed.success || parsed.data.userId !== record.userId || parsed.data.localId === record.localId) return [];
          return [parsed.data];
        });
        if (others.length + 1 > limits.maxRecords) throw new LocalTemplateQuotaError('Local template count quota exceeded');
        const totalBytes = others.reduce<number>((total, value) => total + estimatedBytes(value), 0) + estimatedBytes(record);
        if (totalBytes > limits.maxEstimatedBytes) throw new LocalTemplateQuotaError('Local template byte quota exceeded');
        await requestResult(store.put(record));
        return record;
      });
    },

    remove: async (userId, localId) => withStore('readwrite', async (store) => {
      await requestResult(store.delete([userId, localId]));
    }),

    clear: async (userId) => withStore('readwrite', async (store) => {
      const request = store.index(USER_INDEX).openKeyCursor(IDBKeyRange.only(userId));
      await new Promise<void>((resolve, reject) => {
        request.addEventListener('error', () => reject(request.error), { once: true });
        request.addEventListener('success', () => {
          const cursor = request.result;
          if (!cursor) {
            resolve();
            return;
          }
          store.delete(cursor.primaryKey);
          cursor.continue();
        });
      });
    }),

    close: () => {
      if (!databasePromise) return;
      void databasePromise.then((database) => database.close()).catch(() => undefined);
      databasePromise = null;
    },
  };
}
