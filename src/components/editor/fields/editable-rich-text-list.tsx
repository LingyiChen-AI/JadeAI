'use client';

import { Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAIChangeField } from '../ai-change-context';
import { EditableRichText } from './editable-rich-text';

interface EditableRichTextListProps {
  label: string;
  items: string[];
  onChange: (items: string[]) => void;
  placeholder?: string;
  changePath?: string;
}

/** A string[] field whose individual entries retain the canonical rich-text markup. */
export function EditableRichTextList({ label, items, onChange, placeholder, changePath }: EditableRichTextListProps) {
  const { change, clear } = useAIChangeField(changePath);
  const values = Array.isArray(items) ? items : [];

  const updateItem = (index: number, value: string) => {
    const next = [...values];
    next[index] = value;
    clear();
    onChange(next);
  };

  const addItem = () => {
    clear();
    onChange([...values, '']);
  };

  const removeItem = (index: number) => {
    clear();
    onChange(values.filter((_, itemIndex) => itemIndex !== index));
  };

  return (
    <div data-ai-change-path={changePath} tabIndex={change ? -1 : undefined} className={`space-y-2 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-amber-500 ${change ? 'bg-amber-50 p-1 ring-1 ring-amber-300/80 dark:bg-amber-950/30 dark:ring-amber-700' : ''}`}>
      <label className="flex items-center gap-1 text-xs font-medium text-zinc-500 dark:text-zinc-400">
        {label}
        {change && <span className="rounded bg-amber-200 px-1 py-0.5 text-[9px] font-bold uppercase text-amber-800 dark:bg-amber-800 dark:text-amber-100">AI</span>}
      </label>
      <div className="space-y-2">
        {values.map((item, index) => (
          <div key={index} className="flex min-w-0 items-start gap-1">
            <div className="min-w-0 flex-1">
              <EditableRichText
                label={`${label} ${index + 1}`}
                value={item}
                onChange={(value) => updateItem(index, value)}
                placeholder={placeholder}
                rows={2}
                changePath={changePath ? `${changePath}.${index}` : undefined}
              />
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-label={`Remove ${label} ${index + 1}`}
              className="mt-5 h-8 w-8 shrink-0 cursor-pointer p-0 text-zinc-400 hover:text-red-500"
              onClick={() => removeItem(index)}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        ))}
        <Button type="button" variant="outline" size="sm" onClick={addItem} className="h-7 cursor-pointer gap-1 text-xs">
          <Plus className="h-3 w-3" />
          Add
        </Button>
      </div>
    </div>
  );
}
