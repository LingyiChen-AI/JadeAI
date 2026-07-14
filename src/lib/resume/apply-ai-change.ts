import type { AIFieldChange } from '@/types/editor';
import type { ResumeSection } from '@/types/resume';

export interface RestoreResult {
  sections: ResumeSection[];
  restored: number;
  skipped: AIFieldChange[];
  conflicts: AIFieldChange[];
}

export type ApplyAIChangesOptions =
  | { scope: 'change'; changeId?: string; sectionId?: string }
  | { scope: 'section'; sectionId: string }
  | { scope: 'snapshot'; beforeSections: ResumeSection[]; afterSections: ResumeSection[] };

function clone<T>(value: T): T {
  return structuredClone(value);
}

function equal(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (typeof left !== typeof right || left === null || right === null) return false;
  if (left instanceof Date && right instanceof Date) return left.getTime() === right.getTime();
  if (typeof left === 'number' && typeof right === 'number') return Number.isNaN(left) && Number.isNaN(right);
  if (Array.isArray(left) || Array.isArray(right)) return Array.isArray(left) && Array.isArray(right)
    && left.length === right.length && left.every((value, index) => equal(value, right[index]));
  if (typeof left === 'object' && typeof right === 'object') {
    const leftRecord = left as Record<string, unknown>;
    const rightRecord = right as Record<string, unknown>;
    const leftKeys = Object.keys(leftRecord);
    const rightKeys = Object.keys(rightRecord);
    return leftKeys.length === rightKeys.length
      && leftKeys.every((key) => Object.hasOwn(rightRecord, key) && equal(leftRecord[key], rightRecord[key]));
  }
  return false;
}

function snapshotContent(sections: ResumeSection[]) {
  return sections.map((section) => {
    const comparable = { ...section } as Partial<ResumeSection>;
    delete comparable.createdAt;
    delete comparable.updatedAt;
    return comparable;
  });
}

/** Accept both dotted paths emitted by diffing and bracket paths from callers. */
function normalizePath(path: string): string[] {
  return path
    .replace(/\[(['"]?)([^\]'"]+)\1\]/g, '.$2')
    .split('.')
    .map((part) => part.trim())
    .filter(Boolean);
}

function findSection(sections: ResumeSection[], sectionId: string): ResumeSection | undefined {
  return sections.find((section) => section.id === sectionId);
}

function readPath(section: ResumeSection, tokens: string[]): unknown {
  let value: unknown = section;
  for (const token of tokens) {
    if (value === null || value === undefined || typeof value !== 'object') return undefined;
    if (Array.isArray(value)) {
      const item = value.find((candidate) => candidate && typeof candidate === 'object' && (candidate as { id?: unknown }).id === token);
      value = item;
    } else {
      value = (value as Record<string, unknown>)[token];
    }
  }
  return value;
}

function writePath(section: ResumeSection, tokens: string[], nextValue: unknown): boolean {
  if (tokens.length === 0) return false;
  let target: unknown = section;
  for (let index = 0; index < tokens.length - 1; index += 1) {
    const token = tokens[index];
    if (target === null || target === undefined || typeof target !== 'object') return false;
    if (Array.isArray(target)) {
      target = target.find((candidate) => candidate && typeof candidate === 'object' && (candidate as { id?: unknown }).id === token);
    } else {
      target = (target as Record<string, unknown>)[token];
    }
  }
  if (target === null || target === undefined || typeof target !== 'object') return false;
  const key = tokens[tokens.length - 1];
  if (Array.isArray(target)) {
    const index = target.findIndex((candidate) => candidate && typeof candidate === 'object' && (candidate as { id?: unknown }).id === key);
    if (index < 0) return false;
    target[index] = clone(nextValue);
  } else {
    (target as Record<string, unknown>)[key] = clone(nextValue);
  }
  return true;
}

function stableOrder(values: unknown[]): string[] | null {
  const ids = values.map((value) => value && typeof value === 'object' ? (value as { id?: unknown }).id : undefined);
  return ids.every((id) => typeof id === 'string') ? ids as string[] : null;
}

function applyChange(sections: ResumeSection[], baseline: ResumeSection[], change: AIFieldChange): 'restored' | 'conflict' | 'skipped' {
  if (change.kind === 'section-added' || change.kind === 'section-removed') {
    if (change.afterOrder && !equal(baseline.map((section) => section.id), change.afterOrder)) return 'conflict';
    const index = sections.findIndex((section) => section.id === change.sectionId);
    const current = index >= 0 ? sections[index] : null;
    if (!equal(current, change.afterRawValue)) return 'conflict';
    if (change.kind === 'section-added') {
      if (index < 0) return 'skipped';
      sections.splice(index, 1);
    } else {
      if (index >= 0 || !change.beforeRawValue) return 'skipped';
      sections.splice(change.beforeIndex ?? sections.length, 0, clone(change.beforeRawValue as ResumeSection));
    }
    return 'restored';
  }
  const section = findSection(sections, change.sectionId);
  if (!section) return 'skipped';
  const tokens = normalizePath(change.fieldPath);
  if (tokens[0] === 'section') tokens.shift();
  if (change.itemId) {
    const listIndex = tokens.findIndex((token) => token === 'items' || token === 'categories');
    if (listIndex >= 0 && tokens.length > listIndex + 1) tokens[listIndex + 1] = change.itemId;
  }

  // List additions/removals are addressed by stable item IDs. The list itself
  // remains ordered, and unrelated entries are never reconstructed by index.
  if ((change.kind === 'item-added' || change.kind === 'item-removed') && tokens.length >= 3) {
    const list = readPath(section, tokens.slice(0, -1));
    const itemId = tokens[tokens.length - 1];
    if (!Array.isArray(list)) return 'skipped';
    const baselineSection = findSection(baseline, change.sectionId);
    const baselineList = baselineSection ? readPath(baselineSection, tokens.slice(0, -1)) : undefined;
    const currentOrder = Array.isArray(baselineList) ? stableOrder(baselineList) : null;
    if (change.afterOrder && (!currentOrder || !equal(currentOrder, change.afterOrder))) return 'conflict';
    const currentItem = list.find((item) => item && typeof item === 'object' && (item as { id?: unknown }).id === itemId);
    if (!equal(currentItem ?? null, change.afterRawValue)) return 'conflict';
    const index = list.findIndex((item) => item && typeof item === 'object' && (item as { id?: unknown }).id === itemId);
    if (change.kind === 'item-added') {
      if (index < 0) return 'skipped';
      list.splice(index, 1);
    } else {
      if (index >= 0) return 'skipped';
      if (change.beforeRawValue === null || change.beforeRawValue === undefined) return 'skipped';
      list.splice(change.beforeIndex ?? list.length, 0, clone(change.beforeRawValue));
    }
    return 'restored';
  }

  const current = readPath(section, tokens);
  if (!equal(current, change.afterRawValue)) return 'conflict';
  return writePath(section, tokens, change.beforeRawValue) ? 'restored' : 'skipped';
}

function snapshotIssue(beforeSections: ResumeSection[], afterSections: ResumeSection[]): AIFieldChange {
  return {
    id: 'snapshot', resumeId: beforeSections[0]?.resumeId ?? afterSections[0]?.resumeId ?? '',
    sectionId: beforeSections[0]?.id ?? afterSections[0]?.id ?? '', sectionTitle: beforeSections[0]?.title ?? 'Resume',
    fieldPath: 'sections', kind: 'field-updated', beforeRawValue: beforeSections, afterRawValue: afterSections,
    beforeDisplayValue: null, afterDisplayValue: null, beforeValue: null, afterValue: null,
    source: 'chat-tool', createdAt: 0,
  };
}

export function applyAIChanges(
  currentSections: ResumeSection[],
  changes: AIFieldChange[],
  options: ApplyAIChangesOptions,
): RestoreResult {
  if (options.scope === 'snapshot') {
    if (equal(snapshotContent(currentSections), snapshotContent(options.afterSections))) {
      return { sections: clone(options.beforeSections), restored: 1, skipped: [], conflicts: [] };
    }
    return { sections: clone(currentSections), restored: 0, skipped: [], conflicts: [snapshotIssue(options.beforeSections, options.afterSections)] };
  }

  const selected = options.scope === 'change'
    ? changes.filter((change) => (!options.changeId || change.id === options.changeId) && (!options.sectionId || change.sectionId === options.sectionId))
    : changes.filter((change) => change.sectionId === options.sectionId);
  const skipped: AIFieldChange[] = [];
  const result = clone(currentSections);
  const conflicts: AIFieldChange[] = [];
  let restored = 0;
  for (const change of selected) {
    const status = applyChange(result, currentSections, change);
    if (status === 'restored') restored += 1;
    else if (status === 'conflict') conflicts.push(change);
    else skipped.push(change);
  }
  return { sections: result, restored, skipped, conflicts };
}
