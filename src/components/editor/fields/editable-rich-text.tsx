'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Bold,
  IndentDecrease,
  IndentIncrease,
  List,
  ListOrdered,
  RemoveFormatting,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { renderRichTextHtml } from '@/lib/resume/rich-text';
import { useAIChangeField } from '../ai-change-context';

interface EditableRichTextProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
  changePath?: string;
}

export function EditableRichText({ label, value, onChange, placeholder, rows = 3, changePath }: EditableRichTextProps) {
  const t = useTranslations('editor.richText');
  const { change, clear } = useAIChangeField(changePath);
  const editorRef = useRef<HTMLDivElement>(null);
  const emittedRef = useRef<string | null>(null);
  const [activeCommands, setActiveCommands] = useState<Record<string, boolean>>({});

  const refreshCommandState = useCallback(() => {
    if (typeof document.queryCommandState !== 'function') return;
    setActiveCommands({
      bold: document.queryCommandState('bold'),
      insertUnorderedList: document.queryCommandState('insertUnorderedList'),
      insertOrderedList: document.queryCommandState('insertOrderedList'),
    });
  }, []);

  useEffect(() => {
    if (!editorRef.current || emittedRef.current === value) return;
    editorRef.current.innerHTML = renderRichTextHtml(value);
  }, [value]);

  useEffect(() => {
    document.addEventListener('selectionchange', refreshCommandState);
    return () => document.removeEventListener('selectionchange', refreshCommandState);
  }, [refreshCommandState]);

  const emit = () => {
    if (!editorRef.current) return;
    const next = serializeEditor(editorRef.current);
    emittedRef.current = next;
    clear();
    onChange(next);
  };

  const command = (name: string) => {
    editorRef.current?.focus();
    document.execCommand(name, false);
    emit();
    refreshCommandState();
  };

  const controls = [
    { name: 'bold', icon: Bold, command: 'bold', toggle: true },
    { name: 'bulletList', icon: List, command: 'insertUnorderedList', toggle: true },
    { name: 'orderedList', icon: ListOrdered, command: 'insertOrderedList', toggle: true },
    { name: 'outdent', icon: IndentDecrease, command: 'outdent' },
    { name: 'indent', icon: IndentIncrease, command: 'indent' },
    { name: 'clearFormatting', icon: RemoveFormatting, command: 'removeFormat' },
  ] as const;

  return (
    <div data-ai-change-path={changePath} tabIndex={change ? -1 : undefined} className={`space-y-1 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-amber-500 ${change ? 'bg-amber-50 p-1 ring-1 ring-amber-300/80 dark:bg-amber-950/30 dark:ring-amber-700' : ''}`}>
      <label className="flex items-center gap-1 text-xs font-medium text-zinc-500 dark:text-zinc-400">
        {label}
        {change && <span className="rounded bg-amber-200 px-1 py-0.5 text-[9px] font-bold uppercase text-amber-800 dark:bg-amber-800 dark:text-amber-100">AI</span>}
      </label>
      <div className="overflow-hidden rounded-md border border-zinc-200 bg-white focus-within:border-zinc-400 focus-within:ring-2 focus-within:ring-zinc-200 dark:border-zinc-700 dark:bg-zinc-950 dark:focus-within:border-zinc-500 dark:focus-within:ring-zinc-800">
        <div className="flex h-8 items-center gap-0.5 overflow-x-auto border-b border-zinc-200 px-1 dark:border-zinc-700" role="toolbar">
          {controls.map(({ name, icon: Icon, command: commandName, ...control }) => (
            <button
              key={name}
              type="button"
              aria-label={t(name)}
              aria-pressed={'toggle' in control ? Boolean(activeCommands[commandName]) : undefined}
              title={t(name)}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => command(commandName)}
            >
              <Icon className="h-3.5 w-3.5" />
            </button>
          ))}
        </div>
        <div
          ref={editorRef}
          role="textbox"
          aria-label={label}
          aria-multiline="true"
          contentEditable
          suppressContentEditableWarning
          data-placeholder={placeholder || label}
          className="rich-text-editor w-full overflow-y-auto px-3 py-2 text-sm outline-none empty:before:pointer-events-none empty:before:text-zinc-400 empty:before:content-[attr(data-placeholder)] [&_ol]:list-decimal [&_ul]:list-disc [&_p]:min-h-[1.25em]"
          style={{ minHeight: `${Math.max(1, rows) * 1.5}rem` }}
          onInput={emit}
          onKeyDown={(event) => {
            if (event.key !== 'Tab') return;
            event.preventDefault();
            command(event.shiftKey ? 'outdent' : 'indent');
          }}
          onPaste={(event) => {
            event.preventDefault();
            document.execCommand('insertText', false, event.clipboardData.getData('text/plain'));
            emit();
          }}
        />
      </div>
    </div>
  );
}

function inlineMarkdown(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent || '';
  if (!(node instanceof HTMLElement)) return '';
  const content = Array.from(node.childNodes).map(inlineMarkdown).join('');
  if (node.tagName === 'STRONG' || node.tagName === 'B') return content ? `**${content}**` : '';
  if (node.tagName === 'CODE') return content ? `\`${content}\`` : '';
  if (node.tagName === 'BR') return '\n';
  return content;
}

function elementIndent(element: HTMLElement, fallback = 0): number {
  const value = Number(element.dataset.indent ?? fallback);
  return Math.max(0, Math.min(3, Number.isFinite(value) ? value : 0));
}

function serializeList(list: HTMLElement, inheritedIndent = 0): string[] {
  const indent = elementIndent(list, inheritedIndent);
  const marker = list.tagName === 'OL' ? '1.' : '-';
  const lines: string[] = [];
  for (const child of Array.from(list.children)) {
    if (child.tagName !== 'LI') continue;
    const item = child as HTMLElement;
    const text = Array.from(item.childNodes)
      .filter((node) => !(node instanceof HTMLElement && (node.tagName === 'UL' || node.tagName === 'OL')))
      .map(inlineMarkdown).join('').trim();
    if (text) lines.push(`${'\t'.repeat(indent)}${marker} ${text}`);
    for (const nested of Array.from(item.children)) {
      if (nested.tagName === 'UL' || nested.tagName === 'OL') {
        lines.push(...serializeList(nested as HTMLElement, Math.min(3, indent + 1)));
      }
    }
  }
  return lines;
}

function serializeBlocks(root: HTMLElement, inheritedIndent = 0): string[] {
  const lines: string[] = [];
  for (const node of Array.from(root.childNodes)) {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = (node.textContent || '').trim();
      if (text) lines.push(text);
      continue;
    }
    if (!(node instanceof HTMLElement)) continue;
    if (node.tagName === 'BLOCKQUOTE') {
      lines.push(...serializeBlocks(node, Math.min(3, inheritedIndent + 1)));
      continue;
    }
    if (node.tagName === 'UL' || node.tagName === 'OL') {
      lines.push(...serializeList(node, inheritedIndent));
      continue;
    }
    if (node.tagName === 'BR') {
      lines.push('');
      continue;
    }
    const text = Array.from(node.childNodes).map(inlineMarkdown).join('').trim();
    const indent = Math.max(inheritedIndent, elementIndent(node));
    lines.push(`${'\t'.repeat(Math.min(3, indent))}${text}`.trimEnd());
  }
  return lines;
}

export function serializeEditor(root: HTMLElement): string {
  return serializeBlocks(root).join('\n').replace(/^\n+|\n+$/g, '');
}
