import type { DeclarativeTemplateManifest } from '@/types/template';

import { DeclarativeTemplateManifestSchema } from './schema';

const MAX_PAST_ENTRIES = 50;

export type TemplateEditHistoryState = {
  baseline: DeclarativeTemplateManifest;
  past: DeclarativeTemplateManifest[];
  present: DeclarativeTemplateManifest;
  future: DeclarativeTemplateManifest[];
  canUndo: boolean;
  canRedo: boolean;
  dirty: boolean;
};

export type TemplateEditHistoryAction =
  | { type: 'commit'; candidate: unknown }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'restore' }
  | { type: 'saved' }
  | { type: 'replace'; baseline: unknown };

function fingerprint(manifest: DeclarativeTemplateManifest): string {
  return JSON.stringify(manifest);
}

function buildState(
  baseline: DeclarativeTemplateManifest,
  past: DeclarativeTemplateManifest[],
  present: DeclarativeTemplateManifest,
  future: DeclarativeTemplateManifest[],
): TemplateEditHistoryState {
  return {
    baseline,
    past,
    present,
    future,
    canUndo: past.length > 0,
    canRedo: future.length > 0,
    dirty: fingerprint(present) !== fingerprint(baseline),
  };
}

function commit(
  state: TemplateEditHistoryState,
  candidate: unknown,
): TemplateEditHistoryState {
  const parsed = DeclarativeTemplateManifestSchema.safeParse(candidate);
  if (!parsed.success || fingerprint(parsed.data) === fingerprint(state.present)) return state;
  return buildState(
    state.baseline,
    [...state.past, state.present].slice(-MAX_PAST_ENTRIES),
    parsed.data,
    [],
  );
}

export function createTemplateEditHistory(
  baseline: DeclarativeTemplateManifest,
): TemplateEditHistoryState {
  const normalized = DeclarativeTemplateManifestSchema.parse(baseline);
  return buildState(normalized, [], normalized, []);
}

export function templateEditHistoryReducer(
  state: TemplateEditHistoryState,
  action: TemplateEditHistoryAction,
): TemplateEditHistoryState {
  switch (action.type) {
    case 'commit':
      return commit(state, action.candidate);
    case 'undo': {
      const previous = state.past.at(-1);
      if (!previous) return state;
      return buildState(
        state.baseline,
        state.past.slice(0, -1),
        previous,
        [state.present, ...state.future],
      );
    }
    case 'redo': {
      const next = state.future[0];
      if (!next) return state;
      return buildState(
        state.baseline,
        [...state.past, state.present].slice(-MAX_PAST_ENTRIES),
        next,
        state.future.slice(1),
      );
    }
    case 'restore':
      return commit(state, state.baseline);
    case 'saved':
      return buildState(state.present, [], state.present, []);
    case 'replace': {
      const parsed = DeclarativeTemplateManifestSchema.safeParse(action.baseline);
      return parsed.success ? buildState(parsed.data, [], parsed.data, []) : state;
    }
  }
}
