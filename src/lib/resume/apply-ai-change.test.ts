import { describe, expect, it } from 'vitest';
import type { AIFieldChange } from '@/types/editor';
import type { ResumeSection } from '@/types/resume';
import { applyAIChanges } from './apply-ai-change';

function section(content: Record<string, unknown>, overrides: Partial<ResumeSection> = {}): ResumeSection {
  return {
    id: 'summary', resumeId: 'resume-1', type: 'summary', title: 'Summary', sortOrder: 0,
    visible: true, content: content as unknown as ResumeSection['content'], createdAt: new Date(0), updatedAt: new Date(0), ...overrides,
  };
}

function change(overrides: Partial<AIFieldChange>): AIFieldChange {
  return {
    id: 'c1', resumeId: 'resume-1', sectionId: 'summary', sectionTitle: 'Summary', fieldPath: 'content.text',
    kind: 'field-updated', beforeRawValue: 'old', afterRawValue: 'new', beforeDisplayValue: 'old', afterDisplayValue: 'new',
    beforeValue: 'old', afterValue: 'new', source: 'chat-tool', createdAt: 1, ...overrides,
  };
}

describe('applyAIChanges', () => {
  it('restores a scalar field and section title', () => {
    const current = [section({ text: 'new' }, { title: 'New title' })];
    const result = applyAIChanges(current, [
      change({ id: 'text', fieldPath: 'content.text' }),
      change({ id: 'title', fieldPath: 'title', beforeRawValue: 'Summary', afterRawValue: 'New title', beforeValue: 'Summary', afterValue: 'New title' }),
    ], { scope: 'section', sectionId: 'summary' });
    expect(result.sections[0].content).toMatchObject({ text: 'old' });
    expect(result.sections[0].title).toBe('Summary');
    expect(result.restored).toBe(2);
  });

  it('restores stable-id list additions and removals without reordering unrelated items', () => {
    const original = { id: 'old', name: 'Old' };
    const added = { id: 'new', name: 'New' };
    const current = [section({ items: [added] }, { id: 'work', type: 'work_experience' })];
    const changes = [
      change({ id: 'add', sectionId: 'work', fieldPath: 'content.items.new', itemId: 'new', kind: 'item-added', beforeRawValue: null, afterRawValue: added }),
      change({ id: 'remove', sectionId: 'work', fieldPath: 'content.items.old', itemId: 'old', kind: 'item-removed', beforeRawValue: original, afterRawValue: null }),
    ];
    const result = applyAIChanges(current, changes, { scope: 'section', sectionId: 'work' });
    expect((result.sections[0].content as { items: unknown[] }).items).toEqual([original]);
    expect(result.restored).toBe(2);
  });

  it('does not overwrite a field changed after the AI edit and reports a conflict', () => {
    const result = applyAIChanges([section({ text: 'human edit' })], [change({})], { scope: 'change', changeId: 'c1' });
    expect((result.sections[0].content as { text: string }).text).toBe('human edit');
    expect(result.restored).toBe(0);
    expect(result.conflicts).toHaveLength(1);
  });

  it('partially restores a section while leaving conflicting changes untouched', () => {
    const current = [section({ text: 'new', other: 'human' })];
    const changes = [change({ id: 'text' }), change({ id: 'other', fieldPath: 'content.other', beforeRawValue: 'a', afterRawValue: 'b' })];
    const result = applyAIChanges(current, changes, { scope: 'section', sectionId: 'summary' });
    expect(result.sections[0].content).toMatchObject({ text: 'old', other: 'human' });
    expect(result.restored).toBe(1);
    expect(result.skipped).toHaveLength(0);
    expect(result.conflicts).toHaveLength(1);
  });

  it('restores a complete snapshot only when the current snapshot matches the after snapshot', () => {
    const before = [section({ text: 'before' })];
    const after = [section({ text: 'after' })];
    expect(applyAIChanges(after, [], { scope: 'snapshot', beforeSections: before, afterSections: after }).sections).toEqual(before);
    const conflict = applyAIChanges([section({ text: 'human' })], [], { scope: 'snapshot', beforeSections: before, afterSections: after });
    expect(conflict.sections[0].content).toMatchObject({ text: 'human' });
    expect(conflict.conflicts).toHaveLength(1);
  });

  it('ignores server-managed section timestamps when restoring a snapshot', () => {
    const before = [section({ text: 'before' })];
    const after = [section({ text: 'after' })];
    const savedBefore = [section({ text: 'before' }, { updatedAt: new Date(10) })];

    const result = applyAIChanges(savedBefore, [], {
      scope: 'snapshot', beforeSections: after, afterSections: before,
    });

    expect(result.restored).toBe(1);
    expect(result.sections[0].content).toEqual({ text: 'after' });
  });

  it('uses itemId over a misleading path suffix and accepts bracket paths', () => {
    const current = [section({ items: [{ id: 'a', name: 'new' }, { id: 'b', name: 'other' }] }, { id: 'work' })];
    const result = applyAIChanges(current, [change({ sectionId: 'work', itemId: 'a', fieldPath: 'content.items[wrong].name', beforeRawValue: 'old', afterRawValue: 'new' })], { scope: 'change', changeId: 'c1' });
    expect((result.sections[0].content as { items: Array<{ id: string; name: string }> }).items[0].name).toBe('old');
    expect(result.conflicts).toHaveLength(0);
  });

  it('restores deleted entries and sections at their recorded positions', () => {
    const before = [section({ items: [{ id: 'a' }, { id: 'b' }, { id: 'c' }] }, { id: 'work' }), section({ text: 'x' }, { id: 'extra' })];
    const current = [section({ items: [{ id: 'a' }, { id: 'c' }] }, { id: 'work' })];
    const result = applyAIChanges(current, [
      change({ sectionId: 'work', itemId: 'b', fieldPath: 'content.items.b', kind: 'item-removed', beforeRawValue: { id: 'b' }, afterRawValue: null, beforeIndex: 1 }),
      change({ sectionId: 'extra', fieldPath: 'section', kind: 'section-removed', beforeRawValue: before[1], afterRawValue: null, beforeIndex: 1 }),
    ], { scope: 'change' });
    expect((result.sections[0].content as { items: Array<{ id: string }> }).items.map((item) => item.id)).toEqual(['a', 'b', 'c']);
    expect(result.sections.map((item) => item.id)).toEqual(['work', 'extra']);
  });

  it('keeps inputs immutable and treats object key order as equal', () => {
    const current = [section({ value: { a: 1, b: 2 } })];
    const original = structuredClone(current);
    const result = applyAIChanges(current, [change({ beforeRawValue: { b: 2, a: 1 }, afterRawValue: { a: 1, b: 2 }, fieldPath: 'content.value' })], { scope: 'change', changeId: 'c1' });
    expect(result.restored).toBe(1);
    expect(current).toEqual(original);
  });

  it('compares undefined, NaN, Dates and arrays structurally', () => {
    const value = { missing: undefined, score: Number.NaN, date: new Date(10), values: [1, undefined] };
    const result = applyAIChanges([section({ value })], [change({ fieldPath: 'content.value', beforeRawValue: 'before', afterRawValue: { values: [1, undefined], date: new Date(10), score: Number.NaN, missing: undefined } })], { scope: 'change', changeId: 'c1' });
    expect(result.restored).toBe(1);
    const conflict = applyAIChanges([section({ value: { score: null } })], [change({ fieldPath: 'content.value', afterRawValue: { score: Number.NaN } })], { scope: 'change', changeId: 'c1' });
    expect(conflict.conflicts).toHaveLength(1);
  });

  it('reports a list item conflict without counting out-of-scope changes as skipped', () => {
    const result = applyAIChanges([section({ items: [{ id: 'a', name: 'human' }] }, { id: 'work' })], [
      change({ sectionId: 'work', itemId: 'a', fieldPath: 'content.items.a.name', beforeRawValue: 'old', afterRawValue: 'new' }),
      change({ id: 'other', sectionId: 'summary' }),
    ], { scope: 'section', sectionId: 'work' });
    expect(result.conflicts).toHaveLength(1);
    expect(result.skipped).toHaveLength(0);
  });

  it('reports a selected change as skipped when its target section is missing', () => {
    const result = applyAIChanges([], [change({ sectionId: 'missing' })], { scope: 'change', changeId: 'c1' });
    expect(result.skipped).toHaveLength(1);
    expect(result.conflicts).toHaveLength(0);
  });

  it('does not count a missing parent path as restored', () => {
    const result = applyAIChanges([section({})], [change({ fieldPath: 'content.missing.value', beforeRawValue: undefined, afterRawValue: undefined })], { scope: 'change', changeId: 'c1' });
    expect(result.restored).toBe(0);
    expect(result.skipped).toHaveLength(1);
  });

  it('conflicts when list order changed after an AI deletion', () => {
    const result = applyAIChanges([section({ items: [{ id: 'c' }, { id: 'a' }] }, { id: 'work' })], [
      change({ sectionId: 'work', itemId: 'b', fieldPath: 'content.items.b', kind: 'item-removed', beforeRawValue: { id: 'b' }, afterRawValue: null, beforeIndex: 1, afterOrder: ['a', 'c'] }),
    ], { scope: 'change', changeId: 'c1' });
    expect(result.conflicts).toHaveLength(1);
    expect((result.sections[0].content as { items: Array<{ id: string }> }).items.map((item) => item.id)).toEqual(['c', 'a']);
  });

  it('conflicts when a section was inserted after an AI section deletion', () => {
    const removed = section({ text: 'removed' }, { id: 'removed' });
    const current = [section({ text: 'a' }, { id: 'a' }), section({ text: 'human' }, { id: 'human' })];
    const result = applyAIChanges(current, [change({ sectionId: 'removed', fieldPath: 'section', kind: 'section-removed', beforeRawValue: removed, afterRawValue: null, beforeIndex: 1, afterOrder: ['a'] })], { scope: 'change', changeId: 'c1' });
    expect(result.conflicts).toHaveLength(1);
    expect(result.sections.map((item) => item.id)).toEqual(['a', 'human']);
  });
});
