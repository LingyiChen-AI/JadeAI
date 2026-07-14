'use client';

import { Textarea } from '@/components/ui/textarea';
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
  const { change, clear } = useAIChangeField(changePath);
  return (
    <div data-ai-change-path={changePath} tabIndex={change ? -1 : undefined} className={`space-y-1 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-amber-500 ${change ? 'bg-amber-50 p-1 ring-1 ring-amber-300/80 dark:bg-amber-950/30 dark:ring-amber-700' : ''}`}>
      <label className="flex items-center gap-1 text-xs font-medium text-zinc-500 dark:text-zinc-400">
        {label}
        {change && <span className="rounded bg-amber-200 px-1 py-0.5 text-[9px] font-bold uppercase text-amber-800 dark:bg-amber-800 dark:text-amber-100">AI</span>}
      </label>
      <Textarea
        value={value || ''}
        onChange={(e) => { clear(); onChange(e.target.value); }}
        placeholder={placeholder || label}
        rows={rows}
        className="text-sm resize-none"
      />
    </div>
  );
}
