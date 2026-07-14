import { describe, expect, it, vi } from 'vitest';
import * as diffModule from '@/lib/resume/diff-ai-changes';
import type { AIChangeSource } from '@/types/editor';

const originalSection = {
  id: 'section-1',
  resumeId: 'resume-1',
  type: 'summary' as const,
  title: 'Summary',
  content: { text: 'Before' },
  sortOrder: 0,
  visible: true,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
};

function writeback(source: AIChangeSource, enabled = true) {
  return {
    enabled,
    resumeId: 'resume-1',
    userId: 'user-1',
    before: [{ ...originalSection, content: { text: 'Before' } }],
    after: [{ ...originalSection, content: { text: 'After' } }],
    source,
    serverRevision: 5,
    createdAt: 100,
    entryId: 'history-1',
  };
}

function historyWriter() {
  const appendHistory = vi.fn().mockResolvedValue(undefined);
  const mergeChanges = vi.fn();
  const onPersistenceError = vi.fn();
  return { appendHistory, mergeChanges, onPersistenceError };
}

describe('AI writeback history', () => {
  it.each(['chat-tool', 'overwrite-translation'] as const)(
    'appends one %s entry before merging the visible changes',
    async (source) => {
      const writer = historyWriter();
      await diffModule.recordAIWriteback(writeback(source), writer);

      expect(writer.appendHistory).toHaveBeenCalledWith(expect.objectContaining({
        id: 'history-1',
        resumeId: 'resume-1',
        userId: 'user-1',
        source,
        serverRevision: 5,
        beforeSections: [{ ...originalSection, content: { text: 'Before' } }],
        afterSections: [{ ...originalSection, content: { text: 'After' } }],
      }));
      expect(writer.appendHistory.mock.invocationCallOrder[0])
        .toBeLessThan(writer.mergeChanges.mock.invocationCallOrder[0]);
    },
  );

  it('does not append or merge for an unchanged writeback', async () => {
    const writer = historyWriter();
    const { recordAIWriteback } = diffModule;

    const input = writeback('chat-tool');
    await recordAIWriteback({ ...input, after: input.before }, writer);

    expect(writer.appendHistory).not.toHaveBeenCalled();
    expect(writer.mergeChanges).not.toHaveBeenCalled();
  });

  it('does not append for disabled historical, failed, or copy-mode writebacks', async () => {
    const writer = historyWriter();
    const { recordAIWriteback } = diffModule;

    await recordAIWriteback(writeback('chat-tool', false), writer);
    await recordAIWriteback(writeback('overwrite-translation', false), writer);

    expect(writer.appendHistory).not.toHaveBeenCalled();
    expect(writer.mergeChanges).not.toHaveBeenCalled();
  });

  it('keeps the AI writeback successful when local history persistence degrades', async () => {
    const writer = historyWriter();
    writer.appendHistory.mockRejectedValueOnce(new Error('IndexedDB unavailable'));
    const { recordAIWriteback } = diffModule;

    await expect(recordAIWriteback(writeback('chat-tool'), writer)).resolves.toEqual(
      expect.objectContaining({ source: 'chat-tool' }),
    );
    expect(writer.onPersistenceError).toHaveBeenCalledOnce();
    expect(writer.mergeChanges).toHaveBeenCalledOnce();
  });
});
