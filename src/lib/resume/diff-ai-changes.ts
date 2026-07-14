import type { ResumeSection } from '@/types/resume';
import type { AIChangeSource, AIChangeValue, AIFieldChange, AIHistoryEntry } from '@/types/editor';

const MAX_VALUE_LENGTH = 2_000;

function cloneSections(sections: ResumeSection[]): ResumeSection[] {
  return structuredClone(sections);
}

function displayValue(value: unknown): AIChangeValue {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    if (value.startsWith('data:image/')) return '[image]';
    return value.length > MAX_VALUE_LENGTH ? `${value.slice(0, MAX_VALUE_LENGTH)}...` : value;
  }
  if (Array.isArray(value) && value.every((item) => typeof item === 'string')) {
    return value.map((item) => item.length > MAX_VALUE_LENGTH ? `${item.slice(0, MAX_VALUE_LENGTH)}...` : item);
  }
  try {
    const serialized = JSON.stringify(value);
    return serialized.length > MAX_VALUE_LENGTH
      ? `${serialized.slice(0, MAX_VALUE_LENGTH)}...`
      : serialized;
  } catch {
    return '[unavailable]';
  }
}

function valuesEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  try {
    return JSON.stringify(left) === JSON.stringify(right);
  } catch {
    return false;
  }
}

function rawValue(value: unknown): unknown {
  return structuredClone(value);
}

function changeId(resumeId: string, sectionId: string, fieldPath: string): string {
  return `${resumeId}:${sectionId}:${fieldPath}`;
}

interface DiffContext {
  resumeId: string;
  sectionId: string;
  sectionTitle: string;
  source: AIChangeSource;
  createdAt: number;
  changes: AIFieldChange[];
}

function pushChange(
  context: DiffContext,
  fieldPath: string,
  beforeRawValue: unknown,
  afterRawValue: unknown,
  kind: AIFieldChange['kind'] = 'field-updated',
  itemId?: string,
  beforeDisplaySource: unknown = beforeRawValue,
  afterDisplaySource: unknown = afterRawValue,
  indexes: { beforeIndex?: number; afterIndex?: number; beforeOrder?: string[]; afterOrder?: string[] } = {},
) {
  const beforeDisplayValue = displayValue(beforeDisplaySource);
  const afterDisplayValue = displayValue(afterDisplaySource);
  context.changes.push({
    id: changeId(context.resumeId, context.sectionId, fieldPath),
    resumeId: context.resumeId,
    sectionId: context.sectionId,
    sectionTitle: context.sectionTitle,
    itemId,
    fieldPath,
    kind,
    beforeRawValue: rawValue(beforeRawValue),
    afterRawValue: rawValue(afterRawValue),
    beforeDisplayValue,
    afterDisplayValue,
    beforeValue: beforeDisplayValue,
    afterValue: afterDisplayValue,
    source: context.source,
    createdAt: context.createdAt,
    ...indexes,
  });
}

function diffObject(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  prefix: string,
  context: DiffContext,
  itemId?: string,
) {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  keys.delete('id');

  for (const key of keys) {
    const previous = before[key];
    const next = after[key];
    if (valuesEqual(previous, next)) continue;

    const fieldPath = `${prefix}.${key}`;
    if (
      (key === 'items' || key === 'categories')
      && Array.isArray(previous)
      && Array.isArray(next)
    ) {
      diffEntityList(previous, next, fieldPath, context);
      continue;
    }

    if (
      previous && next
      && typeof previous === 'object' && !Array.isArray(previous)
      && typeof next === 'object' && !Array.isArray(next)
    ) {
      diffObject(
        previous as Record<string, unknown>,
        next as Record<string, unknown>,
        fieldPath,
        context,
        itemId,
      );
      continue;
    }

    pushChange(context, fieldPath, previous, next, 'field-updated', itemId);
  }
}

function diffEntityList(
  before: unknown[],
  after: unknown[],
  prefix: string,
  context: DiffContext,
) {
  const hasStableIds = [...before, ...after].every(
    (item) => item && typeof item === 'object' && typeof (item as { id?: unknown }).id === 'string',
  );
  if (!hasStableIds) {
    pushChange(context, prefix, before, after);
    return;
  }

  const beforeMap = new Map(before.map((item) => [(item as { id: string }).id, item as Record<string, unknown>]));
  const afterMap = new Map(after.map((item) => [(item as { id: string }).id, item as Record<string, unknown>]));
  const ids = new Set([...beforeMap.keys(), ...afterMap.keys()]);

  for (const id of ids) {
    const beforeIndex = before.findIndex((item) => (item as { id: string }).id === id);
    const afterIndex = after.findIndex((item) => (item as { id: string }).id === id);
    const previous = beforeMap.get(id);
    const next = afterMap.get(id);
    const itemPath = `${prefix}.${id}`;
    if (!previous) {
      pushChange(context, itemPath, null, next, 'item-added', id, null, next, { afterIndex, afterOrder: after.map((item) => (item as { id: string }).id) });
    } else if (!next) {
      pushChange(context, itemPath, previous, null, 'item-removed', id, previous, null, { beforeIndex, beforeOrder: before.map((item) => (item as { id: string }).id), afterOrder: after.map((item) => (item as { id: string }).id) });
    } else {
      diffObject(previous, next, itemPath, context, id);
    }
  }
}

export function snapshotResumeSections(sections: ResumeSection[]): ResumeSection[] {
  return cloneSections(sections);
}

export function diffAIResumeSections({
  resumeId,
  before,
  after,
  source,
  createdAt = Date.now(),
}: {
  resumeId: string;
  before: ResumeSection[];
  after: ResumeSection[];
  source: AIChangeSource;
  createdAt?: number;
}): AIFieldChange[] {
  const changes: AIFieldChange[] = [];
  const beforeMap = new Map(before.map((section) => [section.id, section]));
  const afterMap = new Map(after.map((section) => [section.id, section]));
  const sectionIds = new Set([...beforeMap.keys(), ...afterMap.keys()]);

  for (const sectionId of sectionIds) {
    const previous = beforeMap.get(sectionId);
    const next = afterMap.get(sectionId);
    const beforeIndex = before.findIndex((section) => section.id === sectionId);
    const afterIndex = after.findIndex((section) => section.id === sectionId);
    const sectionTitle = next?.title || previous?.title || 'Section';
    const context: DiffContext = { resumeId, sectionId, sectionTitle, source, createdAt, changes };

    if (!previous && next) {
      pushChange(context, 'section', null, next, 'section-added', undefined, null, next.title, { afterIndex, afterOrder: after.map((section) => section.id) });
      continue;
    }
    if (previous && !next) {
      pushChange(context, 'section', previous, null, 'section-removed', undefined, previous.title, null, { beforeIndex, beforeOrder: before.map((section) => section.id), afterOrder: after.map((section) => section.id) });
      continue;
    }
    if (!previous || !next) continue;

    if (previous.title !== next.title) {
      pushChange(context, 'title', previous.title, next.title, 'title-updated');
    }
    diffObject(
      previous.content as unknown as Record<string, unknown>,
      next.content as unknown as Record<string, unknown>,
      'content',
      context,
    );
  }

  return changes;
}

export function mergeAIChanges(
  existing: AIFieldChange[],
  incoming: AIFieldChange[],
): AIFieldChange[] {
  const merged = new Map(existing.map((change) => [change.id, change]));

  for (const change of incoming) {
    const prior = merged.get(change.id);
    const next = prior
      ? {
          ...change,
          beforeRawValue: prior.beforeRawValue,
          beforeDisplayValue: prior.beforeDisplayValue,
          beforeValue: prior.beforeValue,
          createdAt: prior.createdAt,
        }
      : change;
    if (valuesEqual(next.beforeRawValue, next.afterRawValue)) {
      merged.delete(change.id);
    } else {
      merged.set(change.id, next);
    }
  }

  return [...merged.values()].sort((left, right) => left.createdAt - right.createdAt);
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value as Record<string, unknown>)
      .filter((key) => key !== 'createdAt' && key !== 'updatedAt')
      .sort().map((key) => [
      key,
      canonicalize((value as Record<string, unknown>)[key]),
    ]));
  }
  return value;
}

export function getResumeSectionsFingerprint(sections: ResumeSection[]): string {
  const input = JSON.stringify(canonicalize(sections));
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export interface AIWritebackInput {
  enabled?: boolean;
  entryId?: string;
  resumeId: string;
  userId: string;
  before: ResumeSection[];
  after: ResumeSection[];
  source: AIChangeSource;
  serverRevision: number;
  createdAt?: number;
}

export interface AIWritebackWriter {
  appendHistory: (entry: AIHistoryEntry) => Promise<void>;
  mergeChanges: (resumeId: string, changes: AIFieldChange[]) => void;
  onPersistenceError?: (error: unknown) => void;
}

/** Persist a successful AI mutation before exposing its field-level diff. */
export async function recordAIWriteback(
  input: AIWritebackInput,
  writer: AIWritebackWriter,
): Promise<AIHistoryEntry | null> {
  if (input.enabled === false) return null;

  const beforeSections = snapshotResumeSections(input.before);
  const afterSections = snapshotResumeSections(input.after);
  const createdAt = input.createdAt ?? Date.now();
  const changes = diffAIResumeSections({
    resumeId: input.resumeId,
    before: beforeSections,
    after: afterSections,
    source: input.source,
    createdAt,
  });
  if (changes.length === 0) return null;

  const entry: AIHistoryEntry = {
    id: input.entryId ?? (typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${input.resumeId}:${createdAt}`),
    resumeId: input.resumeId,
    userId: input.userId,
    beforeSections,
    afterSections,
    changes,
    source: input.source,
    createdAt,
    serverRevision: input.serverRevision,
    contentFingerprint: getResumeSectionsFingerprint(afterSections),
  };

  try {
    await writer.appendHistory(entry);
  } catch (error) {
    writer.onPersistenceError?.(error);
  }
  writer.mergeChanges(input.resumeId, changes);
  return entry;
}
