import { describe, expect, it, vi } from 'vitest';
import type { Resume } from '@/types/resume';
import { createExportTransaction } from './transaction';

function savedResume(revision = 4): Resume {
  return {
    id: 'r1', userId: 'u1', title: 'Resume', template: 'classic', revision,
    templateVersionId: null, templateSource: 'legacy', templateSnapshot: null,
    themeConfig: {
      primaryColor: '#111', accentColor: '#222', fontFamily: 'sans', fontSize: 'medium',
      lineSpacing: 1.5, sectionSpacing: 6, margin: { top: 12, right: 12, bottom: 12, left: 12 },
    },
    isDefault: false, language: 'en', sections: [],
    createdAt: new Date(), updatedAt: new Date(),
  };
}

describe('save and export transaction', () => {
  it('waits for the server-confirmed save before export and download', async () => {
    const events: string[] = [];
    const transaction = createExportTransaction({
      saveDraft: async () => {
        events.push('save:start');
        const saved = savedResume();
        events.push(`save:success:${saved.revision}`);
        return saved;
      },
      exportSaved: async (saved) => {
        events.push(`export:start:${saved.revision}`);
        return { blob: new Blob(['pdf']), filename: 'resume.pdf' };
      },
      download: async () => { events.push('download'); },
    });

    await transaction.run();

    expect(events).toEqual(['save:start', 'save:success:4', 'export:start:4', 'download']);
    expect(transaction.getState()).toMatchObject({ status: 'success', saved: { revision: 4 } });
  });

  it('does not export when saving fails', async () => {
    const exportSaved = vi.fn();
    const transaction = createExportTransaction({
      saveDraft: async () => { throw new Error('save failed'); },
      exportSaved,
      download: vi.fn(),
    });

    await expect(transaction.run()).resolves.toMatchObject({ status: 'save_failed' });
    expect(exportSaved).not.toHaveBeenCalled();
  });

  it('retains the saved version after export failure and retries without another save', async () => {
    const saveDraft = vi.fn().mockResolvedValue(savedResume());
    const exportSaved = vi.fn()
      .mockRejectedValueOnce(new Error('export failed'))
      .mockResolvedValueOnce({ blob: new Blob(['pdf']), filename: 'resume.pdf' });
    const download = vi.fn();
    const transaction = createExportTransaction({ saveDraft, exportSaved, download });

    await expect(transaction.run()).resolves.toMatchObject({
      status: 'saved_export_failed',
      saved: { revision: 4 },
    });
    await expect(transaction.retryExport()).resolves.toMatchObject({ status: 'success' });

    expect(saveDraft).toHaveBeenCalledTimes(1);
    expect(exportSaved).toHaveBeenCalledTimes(2);
    expect(download).toHaveBeenCalledTimes(1);
  });

  it('deduplicates simultaneous primary actions', async () => {
    let resolveSave: ((resume: Resume) => void) | undefined;
    const saveDraft = vi.fn(() => new Promise<Resume>((resolve) => { resolveSave = resolve; }));
    const exportSaved = vi.fn().mockResolvedValue({ blob: new Blob(['pdf']), filename: 'resume.pdf' });
    const download = vi.fn();
    const transaction = createExportTransaction({ saveDraft, exportSaved, download });

    const first = transaction.run();
    const second = transaction.run();
    resolveSave?.(savedResume());
    await Promise.all([first, second]);

    expect(saveDraft).toHaveBeenCalledTimes(1);
    expect(exportSaved).toHaveBeenCalledTimes(1);
    expect(download).toHaveBeenCalledTimes(1);
  });
});
