'use client';

import { X } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAIChangeField } from '../ai-change-context';

interface EditableSelectProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { label: string; value: string }[];
  placeholder?: string;
  changePath?: string;
}

export function EditableSelect({ label, value, onChange, options, placeholder, changePath }: EditableSelectProps) {
  const { change, clear } = useAIChangeField(changePath);
  return (
    <div data-ai-change-path={changePath} tabIndex={change ? -1 : undefined} className={`space-y-1 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-amber-500 ${change ? 'bg-amber-50 p-1 ring-1 ring-amber-300/80 dark:bg-amber-950/30 dark:ring-amber-700' : ''}`}>
      <label className="flex items-center gap-1 text-xs font-medium text-zinc-500 dark:text-zinc-400">
        {label}
        {change && <span className="rounded bg-amber-200 px-1 py-0.5 text-[9px] font-bold uppercase text-amber-800 dark:bg-amber-800 dark:text-amber-100">AI</span>}
      </label>
      <div className="relative">
        <Select value={value || ''} onValueChange={(next) => { clear(); onChange(next); }}>
          <SelectTrigger size="sm" className="w-full text-sm">
            <SelectValue placeholder={placeholder || label} />
          </SelectTrigger>
          <SelectContent>
            {options.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {value && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); clear(); onChange(''); }}
            className="absolute top-1/2 right-7 -translate-y-1/2 rounded p-0.5 text-zinc-400 transition-colors hover:text-zinc-600 dark:hover:text-zinc-300"
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </div>
    </div>
  );
}
