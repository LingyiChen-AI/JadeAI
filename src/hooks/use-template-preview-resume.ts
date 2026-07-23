'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import type { normalizeResumeForTemplate } from '@/lib/templates/template-document';

export type ResumePreviewInput = Parameters<typeof normalizeResumeForTemplate>[0];

export type TemplatePreviewResumeOption = {
  id: string;
  title: string;
};

export type TemplatePreviewResumeState = {
  status: 'loading' | 'ready' | 'fallback';
  options: DeepReadonly<TemplatePreviewResumeOption[]>;
  selectedId: string | 'fixture';
  resume: DeepReadonly<ResumePreviewInput>;
  select(id: string | 'fixture'): void;
};

export type DeepReadonly<T> = T extends (...args: never[]) => unknown
  ? T
  : T extends readonly (infer Item)[]
    ? readonly DeepReadonly<Item>[]
    : T extends object
      ? { readonly [Key in keyof T]: DeepReadonly<T[Key]> }
      : T;

function deepFreeze<T>(value: T): DeepReadonly<T> {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const item of Object.values(value)) deepFreeze(item);
    Object.freeze(value);
  }
  return value as DeepReadonly<T>;
}

export const TEMPLATE_PREVIEW_FIXTURE = deepFreeze({
  title: 'Jade Template',
  language: 'en',
  sections: [
    {
      type: 'personal_info', title: 'Jade Template', sortOrder: 0, visible: true,
      content: { fullName: 'Jade Template', jobTitle: 'Product Designer', email: 'template@example.com', location: 'Berlin' },
    },
    {
      type: 'summary', title: 'Profile', sortOrder: 1, visible: true,
      content: { text: 'A fixed preview fixture for local template design.' },
    },
    {
      type: 'qr_codes', title: 'Links', sortOrder: 2, visible: true,
      content: { items: [{ label: 'Portfolio', url: 'https://example.com' }] },
    },
  ],
} satisfies ResumePreviewInput);

const FIXTURE_OPTION: DeepReadonly<TemplatePreviewResumeOption> = deepFreeze({
  id: 'fixture',
  title: TEMPLATE_PREVIEW_FIXTURE.title,
});

const MAX_OPTIONS = 1_000;
const MAX_SECTIONS = 256;
const MAX_ARRAY_LENGTH = 500;
const MAX_OBJECT_KEYS = 100;
const MAX_JSON_DEPTH = 8;
const MAX_JSON_NODES = 4_000;
const MAX_STRING_BYTES = 20_000;
const MAX_RESPONSE_BYTES = 1_000_000;
const MAX_ID_LENGTH = 128;
const MAX_LABEL_LENGTH = 500;

function requestHeaders(): Record<string, string> {
  const fingerprint = typeof window === 'undefined'
    ? null
    : localStorage.getItem('jade_fingerprint');
  return fingerprint ? { 'x-fingerprint': fingerprint } : {};
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function withFixtureOption(
  options: DeepReadonly<TemplatePreviewResumeOption[]>,
): DeepReadonly<TemplatePreviewResumeOption[]> {
  return options.some((option) => option.id === 'fixture')
    ? options
    : deepFreeze([...options, FIXTURE_OPTION]);
}

function byteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function hasBoundedResponseSize(value: unknown): boolean {
  try {
    const serialized = JSON.stringify(value);
    return typeof serialized === 'string' && byteLength(serialized) <= MAX_RESPONSE_BYTES;
  } catch {
    return false;
  }
}

function cloneBoundedJson(
  value: unknown,
  state: { nodes: number },
  depth = 0,
): unknown {
  state.nodes += 1;
  if (state.nodes > MAX_JSON_NODES || depth > MAX_JSON_DEPTH) throw new Error('JSON bounds exceeded');
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('Invalid JSON number');
    return value;
  }
  if (typeof value === 'string') {
    if (byteLength(value) > MAX_STRING_BYTES) throw new Error('JSON string bounds exceeded');
    return value;
  }
  if (Array.isArray(value)) {
    if (value.length > MAX_ARRAY_LENGTH) throw new Error('JSON array bounds exceeded');
    return value.map((item) => cloneBoundedJson(item, state, depth + 1));
  }
  if (!isRecord(value)) throw new Error('Invalid JSON value');
  const entries = Object.entries(value);
  if (entries.length > MAX_OBJECT_KEYS) throw new Error('JSON object bounds exceeded');
  return Object.fromEntries(entries.map(([key, item]) => {
    if (byteLength(key) > MAX_LABEL_LENGTH) throw new Error('JSON key bounds exceeded');
    return [key, cloneBoundedJson(item, state, depth + 1)];
  }));
}

function parseOptions(value: unknown): DeepReadonly<TemplatePreviewResumeOption[]> | null {
  if (!Array.isArray(value) || value.length > MAX_OPTIONS || !hasBoundedResponseSize(value)) return null;
  const options: TemplatePreviewResumeOption[] = [];
  const ids = new Set<string>();
  for (const item of value) {
    if (
      !isRecord(item)
      || typeof item.id !== 'string'
      || item.id.length === 0
      || byteLength(item.id) > MAX_ID_LENGTH
      || item.id === 'fixture'
      || ids.has(item.id)
      || typeof item.title !== 'string'
      || byteLength(item.title) > MAX_LABEL_LENGTH
    ) {
      return null;
    }
    ids.add(item.id);
    options.push({ id: item.id, title: item.title });
  }
  return deepFreeze(options);
}

function parseResume(value: unknown): DeepReadonly<ResumePreviewInput> | null {
  if (
    !isRecord(value)
    || !hasBoundedResponseSize(value)
    || typeof value.title !== 'string'
    || byteLength(value.title) > MAX_LABEL_LENGTH
    || (value.language !== 'en' && value.language !== 'zh')
    || !Array.isArray(value.sections)
    || value.sections.length > MAX_SECTIONS
  ) {
    return null;
  }

  const sections: ResumePreviewInput['sections'][number][] = [];
  const cloneState = { nodes: 0 };
  for (const section of value.sections) {
    if (
      !isRecord(section)
      || typeof section.type !== 'string'
      || byteLength(section.type) > MAX_LABEL_LENGTH
      || typeof section.title !== 'string'
      || byteLength(section.title) > MAX_LABEL_LENGTH
      || typeof section.sortOrder !== 'number'
      || !Number.isSafeInteger(section.sortOrder)
      || typeof section.visible !== 'boolean'
      || !Object.hasOwn(section, 'content')
    ) {
      return null;
    }
    try {
      sections.push({
        type: section.type,
        title: section.title,
        sortOrder: section.sortOrder,
        visible: section.visible,
        content: cloneBoundedJson(section.content, cloneState),
      });
    } catch {
      return null;
    }
  }

  return deepFreeze({ title: value.title, language: value.language, sections });
}

export function useTemplatePreviewResume(): TemplatePreviewResumeState {
  const [status, setStatus] = useState<TemplatePreviewResumeState['status']>('loading');
  const [options, setOptions] = useState<DeepReadonly<TemplatePreviewResumeOption[]>>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [resume, setResume] = useState<DeepReadonly<ResumePreviewInput>>(TEMPLATE_PREVIEW_FIXTURE);
  const selectedIdRef = useRef<string | null>(null);
  const selectionGenerationRef = useRef(0);
  const detailGenerationRef = useRef(0);

  const enterFallback = useCallback(() => {
    detailGenerationRef.current += 1;
    selectedIdRef.current = 'fixture';
    setStatus('fallback');
    setSelectedId('fixture');
    setResume(TEMPLATE_PREVIEW_FIXTURE);
    setOptions(withFixtureOption);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const selectionGeneration = selectionGenerationRef.current;

    void (async () => {
      try {
        const response = await fetch('/api/resume', {
          headers: requestHeaders(),
          signal: controller.signal,
        });
        if (!response.ok) throw new Error('Resume list request failed');
        const nextOptions = parseOptions(await response.json());
        if (!nextOptions || nextOptions.length === 0) {
          if (!controller.signal.aborted && selectionGenerationRef.current === selectionGeneration) enterFallback();
          return;
        }
        if (controller.signal.aborted) return;
        setOptions(selectedIdRef.current === 'fixture' ? withFixtureOption(nextOptions) : nextOptions);
        if (selectionGenerationRef.current === selectionGeneration) {
          selectedIdRef.current = nextOptions[0].id;
          setSelectedId(nextOptions[0].id);
        }
      } catch {
        if (!controller.signal.aborted && selectionGenerationRef.current === selectionGeneration) enterFallback();
      }
    })();

    return () => controller.abort();
  }, [enterFallback]);

  useEffect(() => {
    if (selectedId === null) return;
    const detailGeneration = ++detailGenerationRef.current;
    if (selectedId === 'fixture') {
      setStatus('fallback');
      setResume(TEMPLATE_PREVIEW_FIXTURE);
      setOptions(withFixtureOption);
      return;
    }

    const controller = new AbortController();
    setStatus('loading');

    void (async () => {
      try {
        const response = await fetch(`/api/resume/${encodeURIComponent(selectedId)}`, {
          headers: requestHeaders(),
          signal: controller.signal,
        });
        if (!response.ok) throw new Error('Resume detail request failed');
        const nextResume = parseResume(await response.json());
        if (!nextResume) throw new Error('Malformed resume detail');
        if (
          controller.signal.aborted
          || detailGenerationRef.current !== detailGeneration
          || selectedIdRef.current !== selectedId
        ) return;
        setResume(nextResume);
        setStatus('ready');
      } catch {
        if (
          !controller.signal.aborted
          && detailGenerationRef.current === detailGeneration
          && selectedIdRef.current === selectedId
        ) enterFallback();
      }
    })();

    return () => controller.abort();
  }, [selectedId, enterFallback]);

  const select = useCallback((id: string | 'fixture') => {
    selectionGenerationRef.current += 1;
    detailGenerationRef.current += 1;
    selectedIdRef.current = id;
    setSelectedId(id);
  }, []);

  return {
    status,
    options,
    selectedId: selectedId ?? 'fixture',
    resume,
    select,
  };
}
