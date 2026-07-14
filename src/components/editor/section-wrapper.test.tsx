import { describe, expect, it, vi } from 'vitest';
vi.mock('next-intl', () => ({ useTranslations: () => Object.assign((key: string) => key, { has: () => false }) }));
import { restoreSectionAIChanges } from './section-wrapper';

describe('section AI change actions', () => {
  it('restores one change without confirmation', () => {
    const restore = vi.fn().mockReturnValue({ restored: 1, conflicts: [], skipped: [] });

    const result = restoreSectionAIChanges({
      sectionId: 'section-1',
      changeId: 'change-1',
      restore,
    });

    expect(result).toEqual({ restored: 1, conflicts: [], skipped: [] });
    expect(restore).toHaveBeenCalledWith({ scope: 'change', changeId: 'change-1' });
  });

  it('restores all changes in a section through the section scope', () => {
    const restore = vi.fn().mockReturnValue({ restored: 2, conflicts: [], skipped: [] });

    restoreSectionAIChanges({ sectionId: 'section-1', restore });

    expect(restore).toHaveBeenCalledWith({ scope: 'section', sectionId: 'section-1' });
  });

  it('returns conflict feedback without pretending every change was restored', () => {
    const restore = vi.fn().mockReturnValue({
      restored: 1,
      conflicts: [{ id: 'change-2' }],
      skipped: [],
    });

    const result = restoreSectionAIChanges({ sectionId: 'section-1', restore });

    expect(result.conflicts).toHaveLength(1);
    expect(result.restored).toBe(1);
  });
});
