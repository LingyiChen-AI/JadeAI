'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import {
  createLocalTemplateRepository,
  LocalTemplateUnavailableError,
  type LocalTemplateRepository,
} from '@/lib/templates/local-template.repository';
import {
  exportLocalTemplatePackage,
  importLocalTemplatePackage,
} from '@/lib/templates/local-template-package';
import type { LocalTemplateRecord } from '@/types/template';
import { createLocalTemplateThumbnail } from '@/lib/templates/local-template-thumbnail';

const defaultRepository = createLocalTemplateRepository();

type LocalTemplateStatus = 'idle' | 'loading' | 'ready' | 'degraded' | 'error';

export function useLocalTemplates(
  userId: string | null | undefined,
  repository: LocalTemplateRepository = defaultRepository,
) {
  const [records, setRecords] = useState<LocalTemplateRecord[]>([]);
  const [corruptCount, setCorruptCount] = useState(0);
  const [status, setStatus] = useState<LocalTemplateStatus>(userId ? 'loading' : 'idle');
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const loadSequence = useRef(0);

  const refresh = useCallback(async () => {
    const sequence = ++loadSequence.current;
    if (!userId) {
      setRecords([]);
      setCorruptCount(0);
      setErrorCode(null);
      setStatus('idle');
      return;
    }
    setStatus('loading');
    try {
      const result = await repository.list(userId);
      if (sequence !== loadSequence.current) return;
      setRecords(result.records);
      setCorruptCount(result.corruptCount);
      setErrorCode(null);
      setStatus('ready');
    } catch (error) {
      if (sequence !== loadSequence.current) return;
      setRecords([]);
      setCorruptCount(0);
      if (error instanceof LocalTemplateUnavailableError) {
        setErrorCode(error.code);
        setStatus('degraded');
      } else {
        setErrorCode(error instanceof Error && 'code' in error ? String(error.code) : 'LOCAL_TEMPLATE_STORAGE_ERROR');
        setStatus('error');
      }
    }
  }, [repository, userId]);

  useEffect(() => {
    const timer = globalThis.setTimeout(() => void refresh(), 0);
    return () => {
      globalThis.clearTimeout(timer);
      loadSequence.current += 1;
    };
  }, [refresh]);

  const save = useCallback(async (record: LocalTemplateRecord) => {
    if (!userId || record.userId !== userId) throw new LocalTemplateUnavailableError('Local template user scope is unavailable');
    const saved = await repository.save(record);
    await refresh();
    return saved;
  }, [refresh, repository, userId]);

  const remove = useCallback(async (localId: string) => {
    if (!userId) throw new LocalTemplateUnavailableError('Local template user scope is unavailable');
    await repository.remove(userId, localId);
    await refresh();
  }, [refresh, repository, userId]);

  const importPackage = useCallback(async (serialized: string, thumbnail?: Blob) => {
    if (!userId) throw new LocalTemplateUnavailableError('Local template user scope is unavailable');
    const record = await importLocalTemplatePackage(serialized, {
      userId,
      thumbnail: thumbnail ?? createLocalTemplateThumbnail,
    });
    await repository.save(record);
    await refresh();
    return record;
  }, [refresh, repository, userId]);

  return {
    records,
    corruptCount,
    status,
    errorCode,
    refresh,
    save,
    remove,
    importPackage,
    exportPackage: exportLocalTemplatePackage,
  };
}
