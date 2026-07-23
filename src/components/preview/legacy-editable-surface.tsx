'use client';

import { Fragment, type ReactNode, useMemo, useState } from 'react';
import type { EditableResumeContract } from './editable-resume-context';
import type { ResumeFieldSource } from '@/types/editable-resume';
import type { Resume } from '@/types/resume';

export interface LegacyFieldCandidate {
  source: ResumeFieldSource;
  value: string;
  displayValue: string;
}

const OMITTED_CONTENT_KEYS = new Set(['id', 'avatar']);

function fieldKind(key: string, listValue: boolean): ResumeFieldSource['kind'] {
  if (listValue) return 'list-value';
  if (/description|text|highlight/i.test(key)) return 'rich-text';
  if (/date/i.test(key)) return 'date';
  if (/url|website|linkedin|github|repo/i.test(key)) return 'url';
  return 'text';
}

function displayValue(value: string): string {
  return value
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/(\*\*|__|~~|`)/g, '')
    .replace(/(^|\s)[*_](?=\S)|(?<=\S)[*_](?=\s|$)/g, '$1')
    .trim();
}

function collectCandidates(
  value: unknown,
  sectionId: string,
  output: LegacyFieldCandidate[],
  path: readonly (string | number)[] = [],
  itemId?: string,
): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      if (item && typeof item === 'object' && !Array.isArray(item)) {
        const record = item as Record<string, unknown>;
        const nestedId = typeof record.id === 'string' ? record.id : itemId;
        collectCandidates(item, sectionId, output, nestedId ? [] : [...path, index], nestedId);
        return;
      }
      collectCandidates(item, sectionId, output, [...path, index], itemId);
    });
    return;
  }
  if (typeof value === 'string' || typeof value === 'number') {
    const raw = String(value);
    const last = path.at(-1);
    const key = String(typeof last === 'number' ? path.at(-2) ?? 'value' : last ?? 'value');
    output.push({
      value: raw,
      displayValue: displayValue(raw),
      source: {
        sectionId,
        ...(itemId ? { itemId } : {}),
        fieldPath: path,
        kind: fieldKind(key, typeof last === 'number'),
        label: key,
      },
    });
    return;
  }
  if (!value || typeof value !== 'object') return;

  Object.entries(value as Record<string, unknown>).forEach(([key, nested]) => {
    if (OMITTED_CONTENT_KEYS.has(key) || key.startsWith('_')) return;
    if (Array.isArray(nested) || (nested && typeof nested === 'object')) {
      collectCandidates(nested, sectionId, output, [...path, key], itemId);
      return;
    }
    if (typeof nested !== 'string' && typeof nested !== 'number') return;
    const raw = String(nested);
    const sourcePath = [...path, key];
    output.push({
      value: raw,
      displayValue: displayValue(raw),
      source: {
        sectionId,
        ...(itemId ? { itemId } : {}),
        fieldPath: sourcePath,
        kind: fieldKind(key, typeof path.at(-1) === 'number'),
        label: key,
      },
    });
  });
}

export function buildLegacyFieldCandidates(resume: Resume): LegacyFieldCandidate[] {
  const output: LegacyFieldCandidate[] = [];
  resume.sections.filter((section) => section.visible).forEach((section) => {
    if (section.title) {
      output.push({
        value: section.title,
        displayValue: section.title,
        source: { sectionId: section.id, fieldPath: ['title'], kind: 'text', label: 'title' },
      });
    }
    collectCandidates(section.content, section.id, output);
  });
  return output;
}

function resolveCandidate(
  target: HTMLElement,
  candidates: readonly LegacyFieldCandidate[],
): { candidate: LegacyFieldCandidate; host: HTMLElement } | null {
  const scope = target.closest<HTMLElement>('[data-section]') ?? target.parentElement;
  const possibleHosts: HTMLElement[] = [];
  let node: HTMLElement | null = target;
  while (node) {
    possibleHosts.push(node);
    if (node === scope) break;
    node = node.parentElement;
  }
  const host = possibleHosts.find((element) => {
    const text = element.textContent?.trim() ?? '';
    return text && candidates.some((candidate) => candidate.displayValue === text);
  }) ?? target;
  const targetText = host.textContent?.trim() ?? '';
  if (!targetText) return null;
  const sectionText = scope?.textContent ?? targetText;
  const sectionScores = new Map<string, number>();
  candidates.forEach((candidate) => {
    if (candidate.displayValue && sectionText.includes(candidate.displayValue)) {
      sectionScores.set(candidate.source.sectionId, (sectionScores.get(candidate.source.sectionId) ?? 0) + 1);
    }
  });

  const scoredSections = [...sectionScores.entries()].sort((left, right) => right[1] - left[1]);
  const likelySectionId = scoredSections[0]?.[0];
  const exactCandidates = candidates.filter((candidate) => (
    candidate.displayValue === targetText
    && (!likelySectionId || candidate.source.sectionId === likelySectionId)
  ));
  if (exactCandidates.length > 1) {
    const renderedMatches = scope
      ? [scope, ...Array.from(scope.querySelectorAll<HTMLElement>('*'))].filter((element) => (
          element instanceof HTMLElement
          && element.textContent?.trim() === targetText
          && !Array.from(element.children).some((child) => child.textContent?.trim() === targetText)
        ))
      : [];
    const occurrence = renderedMatches.indexOf(host);
    if (occurrence >= 0 && occurrence < exactCandidates.length) {
      return { candidate: exactCandidates[occurrence], host };
    }
  }

  const candidate = candidates
    .filter((candidate) => candidate.displayValue === targetText
      || targetText.includes(candidate.displayValue)
      || candidate.displayValue.includes(targetText))
    .map((candidate) => ({
      candidate,
      score: (candidate.displayValue === targetText ? 10_000 : 0)
        + (sectionScores.get(candidate.source.sectionId) ?? 0) * 100
        + Math.min(candidate.displayValue.length, targetText.length),
    }))
    .sort((left, right) => right.score - left.score)[0]?.candidate ?? null;
  return candidate ? { candidate, host } : null;
}

type ActiveEditor = LegacyFieldCandidate & {
  rect: { top: number; left: number; width: number; height: number };
  typography: { font: string; color: string; lineHeight: string; textAlign: string };
};

export function LegacyEditableSurface({
  resume,
  edit,
  children,
}: {
  resume: Resume;
  edit?: EditableResumeContract;
  children: ReactNode;
}) {
  const candidates = useMemo(() => buildLegacyFieldCandidates(resume), [resume]);
  const [active, setActive] = useState<ActiveEditor | null>(null);
  const [value, setValue] = useState('');

  if (!edit?.enabled) return <Fragment>{children}</Fragment>;

  const commit = () => {
    if (!active) return;
    const current = active;
    setActive(null);
    if (value !== current.value) edit.updateField(current.source, value);
  };

  const cancel = () => setActive(null);
  const beginEditing = (candidate: LegacyFieldCandidate, host: HTMLElement) => {
    const rect = host.getBoundingClientRect();
    const style = window.getComputedStyle(host);
    setValue(candidate.value);
    setActive({
      ...candidate,
      rect: { top: rect.top, left: rect.left, width: rect.width, height: rect.height },
      typography: { font: style.font, color: style.color, lineHeight: style.lineHeight, textAlign: style.textAlign },
    });
  };
  const multiline = active?.source.kind === 'rich-text' || active?.source.kind === 'multiline';
  const controlStyle = active ? {
    position: 'fixed' as const,
    zIndex: 80,
    top: active.rect.top,
    left: active.rect.left,
    width: Math.max(active.rect.width, 120),
    minHeight: active.rect.height,
    font: active.typography.font,
    color: active.typography.color,
    lineHeight: active.typography.lineHeight,
    textAlign: active.typography.textAlign as React.CSSProperties['textAlign'],
  } : undefined;

  return (
    <div
      className="contents"
      onClickCapture={(event) => {
        const target = event.target instanceof HTMLElement ? event.target : null;
        if (!target || target.closest('[data-legacy-edit-control]') || target.closest('button,input,textarea,select')) return;
        const resolved = resolveCandidate(target, candidates);
        if (!resolved) return;
        event.preventDefault();
        event.stopPropagation();
        beginEditing(resolved.candidate, resolved.host);
      }}
    >
      {children}
      <div className="flex flex-wrap gap-1 print:hidden" data-legacy-edit-control>
        {candidates.filter((candidate) => !candidate.displayValue).map((candidate) => {
          const key = [candidate.source.sectionId, candidate.source.itemId, ...candidate.source.fieldPath]
            .filter((part) => part !== undefined)
            .join('.');
          return (
            <button
              key={key}
              type="button"
              aria-label={`${candidate.source.label}: ${edit.emptyLabel ?? 'Add field'}`}
              className="rounded-sm border border-dashed border-zinc-300 px-1 text-[10px] text-zinc-400"
              onClick={(event) => beginEditing(candidate, event.currentTarget)}
            >
              {edit.emptyLabel ?? 'Add field'}
            </button>
          );
        })}
      </div>
      {active && (multiline ? (
        <textarea
          data-legacy-edit-control
          autoFocus
          rows={Math.max(2, value.split('\n').length)}
          aria-label={active.source.label}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === 'Escape') { event.preventDefault(); cancel(); }
          }}
          className="rounded-sm border-2 border-brand bg-white p-1 shadow-lg outline-none"
          style={controlStyle}
        />
      ) : (
        <input
          data-legacy-edit-control
          autoFocus
          type={active.source.kind === 'url' ? 'url' : 'text'}
          aria-label={active.source.label}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === 'Escape') { event.preventDefault(); cancel(); }
            if (event.key === 'Enter') { event.preventDefault(); commit(); }
          }}
          className="rounded-sm border-2 border-brand bg-white px-1 shadow-lg outline-none"
          style={controlStyle}
        />
      ))}
    </div>
  );
}
