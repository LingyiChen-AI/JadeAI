import { describe, expect, it, vi } from 'vitest';
import {
  AI_HISTORY_PANEL_LAYOUT_CLASS,
  getAIHistoryControls,
  getAIHistoryRows,
  restoreAIHistoryVersion,
} from './ai-history-panel';

describe('AI history panel controls', () => {
  it('disables both directions for stale or empty history', () => {
    expect(getAIHistoryControls({ entries: [], cursor: null, stale: false })).toEqual({ undo: false, redo: false });
    expect(getAIHistoryControls({ entries: [{ id: 'a' }, { id: 'b' }], cursor: 'b', stale: true })).toEqual({ undo: false, redo: false });
  });

  it('enables undo at the cursor and redo only when a newer entry exists', () => {
    expect(getAIHistoryControls({ entries: [{ id: 'a' }, { id: 'b' }], cursor: 'b', stale: false })).toEqual({ undo: true, redo: false });
    expect(getAIHistoryControls({ entries: [{ id: 'a' }, { id: 'b' }], cursor: 'a', stale: false })).toEqual({ undo: true, redo: true });
    expect(getAIHistoryControls({ entries: [{ id: 'a' }], cursor: null, stale: false })).toEqual({ undo: false, redo: true });
  });

  it('maps history entries to localized list rows', () => {
    const rows = getAIHistoryRows([
      { id: 'chat', source: 'chat-tool', createdAt: 1_700_000_000_000, changes: [{}, {}] },
      { id: 'translate', source: 'overwrite-translation', createdAt: 1_700_000_100_000, changes: [{}] },
    ], {
      chatLabel: 'AI assistant',
      translationLabel: 'Translation',
      formatTime: (createdAt) => `time:${createdAt}`,
    });

    expect(rows).toEqual([
      { id: 'chat', sourceLabel: 'AI assistant', createdAt: 1_700_000_000_000, timeLabel: 'time:1700000000000', changeCount: 2 },
      { id: 'translate', sourceLabel: 'Translation', createdAt: 1_700_000_100_000, timeLabel: 'time:1700000100000', changeCount: 1 },
    ]);
  });

  it('saves only a complete whole-resume restore', async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const complete = vi.fn().mockResolvedValue({ restored: 2, conflicts: [], skipped: [] });
    const partial = vi.fn().mockResolvedValue({ restored: 1, conflicts: [{ id: 'conflict' }], skipped: [] });

    await expect(restoreAIHistoryVersion(complete, save)).resolves.toMatchObject({ restored: 2 });
    await expect(restoreAIHistoryVersion(partial, save)).resolves.toMatchObject({ restored: 1 });

    expect(save).toHaveBeenCalledTimes(1);
  });

  it('constrains the dialog within a 360px viewport', () => {
    expect(AI_HISTORY_PANEL_LAYOUT_CLASS).toContain('w-[calc(100vw-2rem)]');
    expect(AI_HISTORY_PANEL_LAYOUT_CLASS).toContain('max-w-lg');
    expect(AI_HISTORY_PANEL_LAYOUT_CLASS).toContain('overflow-hidden');
  });
});
