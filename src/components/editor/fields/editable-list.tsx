'use client';

import { Plus, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useAIChangeField } from '../ai-change-context';

interface EditableListProps {
  label: string;
  items: string[];
  onChange: (items: string[]) => void;
  placeholder?: string;
  changePath?: string;
}

export function EditableList({ label, items, onChange, placeholder, changePath }: EditableListProps) {
  const { change, clear } = useAIChangeField(changePath);
  const addItem = () => { clear(); onChange([...(items || []), '']); };

  const updateItem = (index: number, value: string) => {
    const updated = [...(items || [])];
    updated[index] = value;
    clear();
    onChange(updated);
  };

  const removeItem = (index: number) => {
    clear();
    onChange((items || []).filter((_, i) => i !== index));
  };

  return (
    <div data-ai-change-path={changePath} tabIndex={change ? -1 : undefined} className={`space-y-1 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-amber-500 ${change ? 'bg-amber-50 p-1 ring-1 ring-amber-300/80 dark:bg-amber-950/30 dark:ring-amber-700' : ''}`}>
      <label className="flex items-center gap-1 text-xs font-medium text-zinc-500 dark:text-zinc-400">
        {label}
        {change && <span className="rounded bg-amber-200 px-1 py-0.5 text-[9px] font-bold uppercase text-amber-800 dark:bg-amber-800 dark:text-amber-100">AI</span>}
      </label>
      <div className="space-y-1.5">
        {(items || []).map((item, index) => (
          <div key={index} className="flex items-center gap-1">
            <Input
              value={item}
              onChange={(e) => updateItem(index, e.target.value)}
              placeholder={placeholder}
              className="h-8 text-sm"
            />
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 shrink-0 cursor-pointer p-0 text-zinc-400 hover:text-red-500"
              onClick={() => removeItem(index)}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        ))}
        <Button
          variant="outline"
          size="sm"
          onClick={addItem}
          className="h-7 cursor-pointer gap-1 text-xs"
        >
          <Plus className="h-3 w-3" />
          Add
        </Button>
      </div>
    </div>
  );
}
