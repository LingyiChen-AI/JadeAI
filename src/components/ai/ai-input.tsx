'use client';

import { useTranslations } from 'next-intl';
import { SendHorizonal, Sparkles } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { FormEvent, ChangeEvent } from 'react';

interface AIInputProps {
  input: string;
  onChange: (e: ChangeEvent<HTMLTextAreaElement>) => void;
  onSubmit: (e: FormEvent<HTMLFormElement>) => void;
  isLoading: boolean;
  models: string[];
  selectedModel?: string;
  onModelChange: (model: string) => void;
  beautify: boolean;
  onBeautifyChange: (enabled: boolean) => void;
}

export function AIInput({ input, onChange, onSubmit, isLoading, models, selectedModel, onModelChange, beautify, onBeautifyChange }: AIInputProps) {
  const t = useTranslations('ai');

  return (
    <form onSubmit={onSubmit} className="p-3">
      <div className="rounded-2xl border border-zinc-200 bg-zinc-50/50 transition-colors focus-within:border-zinc-300 focus-within:bg-white">
        {/* Textarea */}
        <textarea
          value={input}
          onChange={onChange}
          placeholder={t('placeholder')}
          rows={2}
          className="w-full resize-none bg-transparent px-4 pt-3 pb-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              const form = e.currentTarget.closest('form');
              if (form) form.requestSubmit();
            }
          }}
        />

        {/* Bottom toolbar */}
        <div className="flex items-center justify-between px-3 pb-2.5">
          {/* Model selector */}
          <div className="flex min-w-0 items-center gap-2">
            <Select value={selectedModel} onValueChange={onModelChange}>
              <SelectTrigger className="h-7 max-w-[180px] gap-1 rounded-full border-zinc-200 bg-white px-2.5 text-[11px] font-medium text-zinc-600 shadow-none">
                <span className="mr-0.5 inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" />
                <SelectValue placeholder="Model" />
              </SelectTrigger>
              <SelectContent>
                {models.map((id) => (
                  <SelectItem key={id} value={id} className="text-xs">
                    {id}
                  </SelectItem>
                ))}
                {models.length === 0 && selectedModel && (
                  <SelectItem value={selectedModel} className="text-xs">
                    {selectedModel}
                  </SelectItem>
                )}
              </SelectContent>
            </Select>
            <label className={`flex h-7 shrink-0 items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-2.5 text-[11px] font-medium text-zinc-600 ${isLoading ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}>
              <input
                type="checkbox"
                checked={beautify}
                disabled={isLoading}
                onChange={(event) => onBeautifyChange(event.target.checked)}
                className="h-3.5 w-3.5 accent-brand"
              />
              <Sparkles className="h-3 w-3" />
              <span>{t('beautify')}</span>
            </label>
          </div>

          {/* Send button */}
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full bg-zinc-200 text-zinc-500 transition-colors hover:bg-zinc-300 disabled:cursor-not-allowed disabled:opacity-40 [&:not(:disabled)]:bg-brand [&:not(:disabled)]:text-white [&:not(:disabled)]:hover:bg-brand-hover"
          >
            <SendHorizonal className="h-4 w-4" />
          </button>
        </div>
      </div>
    </form>
  );
}
