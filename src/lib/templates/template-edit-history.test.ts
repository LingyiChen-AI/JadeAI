import { describe, expect, test } from 'vitest';

import type { DeclarativeTemplateManifest } from '@/types/template';

import { createLocalTemplatePreset } from './local-template-presets';
import {
  createTemplateEditHistory,
  templateEditHistoryReducer,
} from './template-edit-history';

function manifest(accent = '#2563eb'): DeclarativeTemplateManifest {
  const value = createLocalTemplatePreset('ats-clean');
  value.colors.accent = accent;
  return value;
}

describe('template edit history', () => {
  test('creates a clean history from a schema-normalized baseline', () => {
    const source = manifest('#ABCDEF');
    const state = createTemplateEditHistory(source);

    expect(state.baseline.colors.accent).toBe('#abcdef');
    expect(state.present).toEqual(state.baseline);
    expect(state.past).toEqual([]);
    expect(state.future).toEqual([]);
    expect(state.canUndo).toBe(false);
    expect(state.canRedo).toBe(false);
    expect(state.dirty).toBe(false);
  });

  test('commits, undoes, and redoes valid manifests', () => {
    const initial = createTemplateEditHistory(manifest());
    const committed = templateEditHistoryReducer(initial, {
      type: 'commit', candidate: manifest('#ff0000'),
    });
    const undone = templateEditHistoryReducer(committed, { type: 'undo' });
    const redone = templateEditHistoryReducer(undone, { type: 'redo' });

    expect(committed.present.colors.accent).toBe('#ff0000');
    expect(committed.canUndo).toBe(true);
    expect(committed.canRedo).toBe(false);
    expect(committed.dirty).toBe(true);
    expect(undone.present).toEqual(initial.present);
    expect(undone.canUndo).toBe(false);
    expect(undone.canRedo).toBe(true);
    expect(undone.dirty).toBe(false);
    expect(redone.present).toEqual(committed.present);
    expect(redone.canUndo).toBe(true);
    expect(redone.canRedo).toBe(false);
    expect(redone.dirty).toBe(true);
  });

  test('clears the future when committing a branch after undo', () => {
    let state = createTemplateEditHistory(manifest());
    state = templateEditHistoryReducer(state, { type: 'commit', candidate: manifest('#111111') });
    state = templateEditHistoryReducer(state, { type: 'commit', candidate: manifest('#222222') });
    state = templateEditHistoryReducer(state, { type: 'undo' });
    expect(state.canRedo).toBe(true);

    state = templateEditHistoryReducer(state, { type: 'commit', candidate: manifest('#333333') });

    expect(state.present.colors.accent).toBe('#333333');
    expect(state.future).toEqual([]);
    expect(state.canRedo).toBe(false);
  });

  test('treats schema-normalized equal commits as no-ops', () => {
    const state = createTemplateEditHistory(manifest('#abcdef'));
    const next = templateEditHistoryReducer(state, {
      type: 'commit', candidate: manifest('#ABCDEF'),
    });

    expect(next).toBe(state);
  });

  test('ignores invalid schema candidates at the reducer boundary', () => {
    const state = createTemplateEditHistory(manifest());
    const next = templateEditHistoryReducer(state, {
      type: 'commit', candidate: { ...manifest(), colors: { accent: 'not-a-color' } },
    });

    expect(next).toBe(state);
  });

  test('restores the baseline as an ordinary reversible commit', () => {
    const initial = createTemplateEditHistory(manifest());
    const edited = templateEditHistoryReducer(initial, {
      type: 'commit', candidate: manifest('#ff0000'),
    });
    const restored = templateEditHistoryReducer(edited, { type: 'restore' });
    const undone = templateEditHistoryReducer(restored, { type: 'undo' });

    expect(restored.present).toEqual(initial.baseline);
    expect(restored.dirty).toBe(false);
    expect(restored.canUndo).toBe(true);
    expect(undone.present).toEqual(edited.present);
    expect(undone.dirty).toBe(true);
  });

  test('marks the present manifest saved and clears both stacks', () => {
    let state = createTemplateEditHistory(manifest());
    state = templateEditHistoryReducer(state, { type: 'commit', candidate: manifest('#ff0000') });
    state = templateEditHistoryReducer(state, { type: 'undo' });
    state = templateEditHistoryReducer(state, { type: 'redo' });

    const saved = templateEditHistoryReducer(state, { type: 'saved' });

    expect(saved.baseline).toEqual(state.present);
    expect(saved.present).toEqual(state.present);
    expect(saved.past).toEqual([]);
    expect(saved.future).toEqual([]);
    expect(saved.canUndo).toBe(false);
    expect(saved.canRedo).toBe(false);
    expect(saved.dirty).toBe(false);
  });

  test('replaces state with a fresh normalized baseline and clears history', () => {
    let state = createTemplateEditHistory(manifest());
    state = templateEditHistoryReducer(state, { type: 'commit', candidate: manifest('#ff0000') });

    const replaced = templateEditHistoryReducer(state, {
      type: 'replace', baseline: manifest('#ABCDEF'),
    });

    expect(replaced.baseline.colors.accent).toBe('#abcdef');
    expect(replaced.present).toEqual(replaced.baseline);
    expect(replaced.past).toEqual([]);
    expect(replaced.future).toEqual([]);
    expect(replaced.canUndo).toBe(false);
    expect(replaced.canRedo).toBe(false);
    expect(replaced.dirty).toBe(false);
  });

  test('ignores an invalid replacement baseline', () => {
    const state = createTemplateEditHistory(manifest());
    const next = templateEditHistoryReducer(state, {
      type: 'replace', baseline: { rendererKind: 'unknown' },
    });

    expect(next).toBe(state);
  });

  test('retains at most 50 past manifests', () => {
    let state = createTemplateEditHistory(manifest('#000000'));
    for (let index = 1; index <= 55; index += 1) {
      state = templateEditHistoryReducer(state, {
        type: 'commit', candidate: manifest(`#${index.toString(16).padStart(6, '0')}`),
      });
    }

    expect(state.past).toHaveLength(50);
    for (let index = 0; index < 50; index += 1) {
      state = templateEditHistoryReducer(state, { type: 'undo' });
    }
    expect(state.present.colors.accent).toBe('#000005');
    expect(state.canUndo).toBe(false);
    expect(state.canRedo).toBe(true);
  });
});
