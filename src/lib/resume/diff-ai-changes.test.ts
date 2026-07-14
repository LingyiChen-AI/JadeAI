import { describe, expect, it } from 'vitest';
import type { ResumeSection } from '@/types/resume';
import { diffAIResumeSections, getResumeSectionsFingerprint, mergeAIChanges, snapshotResumeSections } from './diff-ai-changes';

function section(content: Record<string, unknown>, overrides: Partial<ResumeSection> = {}): ResumeSection {
  return {
    id: 'summary',
    resumeId: 'resume-1',
    type: 'summary',
    title: 'Summary',
    sortOrder: 0,
    visible: true,
    content: content as unknown as ResumeSection['content'],
    createdAt: new Date(0),
    updatedAt: new Date(0),
    ...overrides,
  };
}

function diff(before: ResumeSection[], after: ResumeSection[]) {
  return diffAIResumeSections({
    resumeId: 'resume-1',
    before,
    after,
    source: 'chat-tool',
    createdAt: 100,
  });
}

describe('diffAIResumeSections', () => {
  it('detects scalar, array, boolean and title changes without tracking layout metadata', () => {
    const before = [section({ text: 'Old', highlights: ['A'], current: false })];
    const after = [section(
      { text: 'New', highlights: ['A', 'B'], current: true },
      { title: 'Profile', sortOrder: 4, visible: false },
    )];

    expect(diff(before, after).map((change) => change.fieldPath)).toEqual([
      'title',
      'content.text',
      'content.highlights',
      'content.current',
    ]);
  });

  it('matches list entries by stable id instead of array position', () => {
    const first = { id: 'a', company: 'A', highlights: ['one'] };
    const second = { id: 'b', company: 'B', highlights: [] };
    const before = [section({ items: [first, second] }, { id: 'work', type: 'work_experience' })];
    const after = [section(
      { items: [{ ...second, company: 'B2' }, first] },
      { id: 'work', type: 'work_experience' },
    )];

    const changes = diff(before, after);
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({
      itemId: 'b',
      fieldPath: 'content.items.b.company',
      beforeValue: 'B',
      afterValue: 'B2',
    });
  });

  it('records added and removed entries and skill category fields', () => {
    const removed = { id: 'old', name: 'Old', skills: ['A'] };
    const added = { id: 'new', name: 'New', skills: ['B'] };
    const before = [section({ categories: [removed] }, { id: 'skills', type: 'skills' })];
    const after = [section({ categories: [added] }, { id: 'skills', type: 'skills' })];

    const changes = diff(before, after);
    expect(changes.map((change) => [change.kind, change.fieldPath])).toEqual([
      ['item-removed', 'content.categories.old'],
      ['item-added', 'content.categories.new'],
    ]);
    expect(changes[0].beforeRawValue).toEqual(removed);
    expect(changes[0].afterRawValue).toBeNull();
    expect(changes[0].beforeIndex).toBe(0);
    expect(changes[0].beforeOrder).toEqual(['old']);
    expect(changes[1].beforeRawValue).toBeNull();
    expect(changes[1].afterRawValue).toEqual(added);
    expect(changes[1].afterIndex).toBe(0);
    expect(changes[1].afterOrder).toEqual(['new']);
  });

  it('keeps complete raw values while truncating long display values', () => {
    const beforeText = 'A'.repeat(2_500);
    const afterText = 'B'.repeat(2_500);

    const [change] = diff(
      [section({ text: beforeText })],
      [section({ text: afterText })],
    );

    expect(change.beforeRawValue).toBe(beforeText);
    expect(change.afterRawValue).toBe(afterText);
    expect(change.beforeDisplayValue).toHaveLength(2_003);
    expect(change.afterDisplayValue).toHaveLength(2_003);
    expect(change.beforeDisplayValue).toBe(`${'A'.repeat(2_000)}...`);
    expect(change.afterDisplayValue).toBe(`${'B'.repeat(2_000)}...`);
  });

  it('records section additions and removals', () => {
    const added = section({ text: 'New' }, { id: 'new' });
    expect(diff([], [added])[0]).toMatchObject({ kind: 'section-added', afterIndex: 0, afterOrder: ['new'] });
    expect(diff([added], [])[0]).toMatchObject({ kind: 'section-removed', beforeIndex: 0, beforeOrder: ['new'], afterOrder: [] });
  });

  it('creates a detached snapshot', () => {
    const original = [section({ text: 'Old' })];
    const snapshot = snapshotResumeSections(original);
    (original[0].content as { text: string }).text = 'Changed';
    expect((snapshot[0].content as { text: string }).text).toBe('Old');
  });

  it('keeps history fingerprints stable across server-managed timestamp updates', () => {
    const original = JSON.parse(JSON.stringify([section({ text: 'Same' })])) as ResumeSection[];
    const saved = JSON.parse(JSON.stringify([
      section({ text: 'Same' }, { updatedAt: new Date(10) }),
    ])) as ResumeSection[];

    expect(getResumeSectionsFingerprint(saved)).toBe(getResumeSectionsFingerprint(original));
    expect(getResumeSectionsFingerprint([section({ text: 'Changed' })]))
      .not.toBe(getResumeSectionsFingerprint(original));
  });
});

describe('mergeAIChanges', () => {
  it('keeps the first before value and latest after value', () => {
    const first = diff([section({ text: 'A' })], [section({ text: 'B' })]);
    const second = diff([section({ text: 'B' })], [section({ text: 'C' })]);
    const merged = mergeAIChanges(first, second);
    expect(merged[0]).toMatchObject({ beforeValue: 'A', afterValue: 'C' });
    expect(merged[0]).toMatchObject({
      beforeRawValue: 'A',
      afterRawValue: 'C',
      beforeDisplayValue: 'A',
      afterDisplayValue: 'C',
    });
  });

  it('removes a change when the value returns to its original state', () => {
    const first = diff([section({ text: 'A' })], [section({ text: 'B' })]);
    const reverted = diff([section({ text: 'B' })], [section({ text: 'A' })]);
    expect(mergeAIChanges(first, reverted)).toEqual([]);
  });
});
