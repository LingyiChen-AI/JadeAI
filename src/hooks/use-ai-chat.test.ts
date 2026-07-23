import { describe, expect, it, vi } from 'vitest';
import * as diffModule from '@/lib/resume/diff-ai-changes';
import { newlyCompletedToolTypes, shouldReloadAIWriteback } from './use-ai-chat';
import type { UIMessage } from 'ai';
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
  it('only classifies tool parts completed since the previous count', () => {
    const messages = [
      {
        role: 'assistant',
        parts: [
          { type: 'tool-updateResumeStyle', state: 'output-available' },
          { type: 'tool-updateSection', state: 'output-available' },
        ],
      },
      {
        role: 'assistant',
        parts: [{ type: 'tool-rewriteText', state: 'output-available' }],
      },
    ] as unknown as UIMessage[];

    expect(newlyCompletedToolTypes(messages, 2)).toEqual(['tool-rewriteText']);
  });

  it('groups completed tools until the whole assistant response settles', () => {
    expect(shouldReloadAIWriteback(0, 1, 'streaming')).toBe(false);
    expect(shouldReloadAIWriteback(0, 2, 'submitted')).toBe(false);
    expect(shouldReloadAIWriteback(0, 2, 'ready')).toBe(true);
    expect(shouldReloadAIWriteback(2, 2, 'ready')).toBe(false);
  });

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

  it('records an authorized style-only writeback even when sections are unchanged', async () => {
    const writer = historyWriter();
    const input = writeback('chat-tool');
    const entry = await diffModule.recordAIWriteback({
      ...input,
      after: input.before,
      beforeStyle: { themeConfig: { primaryColor: '#111111' } },
      afterStyle: { themeConfig: { primaryColor: '#222222' } },
      beautify: true,
    }, writer);

    expect(entry).toMatchObject({
      beautify: true,
      beforeStyle: { themeConfig: { primaryColor: '#111111' } },
      afterStyle: { themeConfig: { primaryColor: '#222222' } },
    });
    expect(entry?.changes).toEqual(expect.arrayContaining([
      expect.objectContaining({
        sectionId: '__resume_style__',
        fieldPath: 'themeConfig.primaryColor',
        kind: 'style-updated',
      }),
    ]));
    expect(writer.appendHistory).toHaveBeenCalledOnce();
    expect(writer.mergeChanges).not.toHaveBeenCalled();
  });
});
