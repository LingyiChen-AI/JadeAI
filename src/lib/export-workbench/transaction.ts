import type { Resume } from '@/types/resume';

export interface ExportedFile {
  blob: Blob;
  filename: string;
}

export type ExportTransactionState =
  | { status: 'idle' }
  | { status: 'saving' }
  | { status: 'exporting'; saved: Resume }
  | { status: 'success'; saved: Resume }
  | { status: 'save_failed'; error: Error }
  | { status: 'saved_export_failed'; saved: Resume; error: Error };

interface ExportTransactionDependencies {
  saveDraft: () => Promise<Resume>;
  exportSaved: (saved: Resume) => Promise<ExportedFile>;
  download: (file: ExportedFile) => void | Promise<void>;
}

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error || 'unknown_error'));
}

export interface ExportTransaction {
  getState(): ExportTransactionState;
  subscribe(listener: (state: ExportTransactionState) => void): () => void;
  run(): Promise<ExportTransactionState>;
  retryExport(): Promise<ExportTransactionState>;
}

export function createExportTransaction(
  dependencies: ExportTransactionDependencies,
): ExportTransaction {
  let state: ExportTransactionState = { status: 'idle' };
  let inFlight: Promise<ExportTransactionState> | null = null;
  const listeners = new Set<(next: ExportTransactionState) => void>();

  const setState = (next: ExportTransactionState) => {
    state = next;
    listeners.forEach((listener) => listener(next));
  };

  const exportVersion = async (saved: Resume): Promise<ExportTransactionState> => {
    setState({ status: 'exporting', saved });
    try {
      const file = await dependencies.exportSaved(saved);
      await dependencies.download(file);
      const next = { status: 'success', saved } as const;
      setState(next);
      return next;
    } catch (error) {
      const next = { status: 'saved_export_failed', saved, error: asError(error) } as const;
      setState(next);
      return next;
    }
  };

  const runOnce = async (): Promise<ExportTransactionState> => {
    setState({ status: 'saving' });
    let saved: Resume;
    try {
      saved = await dependencies.saveDraft();
    } catch (error) {
      const next = { status: 'save_failed', error: asError(error) } as const;
      setState(next);
      return next;
    }

    // The export endpoint reloads repository state. Crossing this boundary only
    // after PUT succeeds guarantees preview confirmation and exported bytes refer
    // to the same server-confirmed revision.
    return exportVersion(saved);
  };

  const withInFlightGuard = (operation: () => Promise<ExportTransactionState>) => {
    if (inFlight) return inFlight;
    inFlight = operation().finally(() => {
      inFlight = null;
    });
    return inFlight;
  };

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    run: () => withInFlightGuard(runOnce),
    retryExport: () => {
      if (state.status !== 'saved_export_failed') return Promise.resolve(state);
      const saved = state.saved;
      return withInFlightGuard(() => exportVersion(saved));
    },
  };
}
