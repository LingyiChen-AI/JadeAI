'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { X, Plus, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { PRESET_DIMENSION_KEYS } from '@/lib/recruit/dimensions';
import { allocateQuestions } from '@/lib/recruit/scoring';
import { cn } from '@/lib/utils';
import type { DimensionConfig } from '@/types/recruit';

interface DimensionChipsProps {
  value: DimensionConfig[];
  onChange: (next: DimensionConfig[]) => void;
  /** 传入后每个已选维度显示分到几题，权重的效果肉眼可见 */
  questionCount?: number;
}

export function DimensionChips({ value, onChange, questionCount }: DimensionChipsProps) {
  const t = useTranslations('recruit.dimensions');
  const [customName, setCustomName] = useState('');

  const selectedByKey = new Map(value.map((d) => [d.key, d]));
  const allocation = questionCount ? allocateQuestions(value, questionCount) : null;

  function togglePreset(key: string) {
    if (selectedByKey.has(key)) {
      onChange(value.filter((d) => d.key !== key));
    } else {
      onChange([...value, { key, label: t(key), weight: 2, custom: false }]);
    }
  }

  function setWeight(key: string, weight: number) {
    onChange(value.map((d) => (d.key === key ? { ...d, weight } : d)));
  }

  function addCustom() {
    const name = customName.trim();
    if (!name || selectedByKey.has(name)) return;
    // 自定义维度的 key 用名字本身，好在 prompt 和打分结果里对得上
    onChange([...value, { key: name, label: name, weight: 2, custom: true }]);
    setCustomName('');
  }

  function remove(key: string) {
    onChange(value.filter((d) => d.key !== key));
  }

  return (
    <div className="space-y-4">
      <div>
        <Label className="text-sm font-medium">{t('title')}</Label>
        <p className="mt-1 text-xs text-zinc-500">{t('hint')}</p>
      </div>

      {/* 预置维度：两行 chip，未选中时不占纵向空间 */}
      <div className="flex flex-wrap gap-2">
        {PRESET_DIMENSION_KEYS.map((key) => {
          const selected = selectedByKey.has(key);
          return (
            <button
              key={key}
              type="button"
              onClick={() => togglePreset(key)}
              className={cn(
                'inline-flex cursor-pointer items-center gap-1 rounded-full border px-3 py-1.5 text-sm transition-colors',
                selected
                  ? 'border-brand bg-brand text-white'
                  : 'border-zinc-200 text-zinc-600 hover:border-zinc-300 dark:border-zinc-700 dark:text-zinc-300',
              )}
            >
              {selected && <Check className="h-3.5 w-3.5" />}
              {t(key)}
            </button>
          );
        })}
        {value
          .filter((d) => d.custom)
          .map((d) => (
            <span
              key={d.key}
              className="inline-flex items-center gap-1 rounded-full border border-dashed border-brand bg-brand/10 px-3 py-1.5 text-sm text-brand"
            >
              {d.label}
              <button
                type="button"
                onClick={() => remove(d.key)}
                className="cursor-pointer"
                aria-label={d.label}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </span>
          ))}
      </div>

      {/* 权重：只为已选中的维度展开，两列排布 */}
      {value.length > 0 && (
        <div className="grid gap-x-6 gap-y-3 rounded-lg border bg-zinc-50 p-4 sm:grid-cols-2 dark:bg-zinc-900">
          {value.map((d) => (
            <div key={d.key} className="flex items-center gap-3">
              <span className="w-20 shrink-0 truncate text-xs text-zinc-600 dark:text-zinc-400">
                {d.label}
              </span>
              <Slider
                className="flex-1 cursor-pointer"
                min={1}
                max={5}
                step={1}
                value={[d.weight]}
                onValueChange={([w]) => setWeight(d.key, w)}
              />
              <span className="w-6 shrink-0 text-right text-xs tabular-nums text-zinc-500">
                {d.weight}
              </span>
              {allocation && (
                <span className="w-12 shrink-0 text-right text-xs text-zinc-400">
                  {t('perDimension', { count: allocation[d.key] ?? 0 })}
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-2">
        <Input
          value={customName}
          onChange={(e) => setCustomName(e.target.value)}
          placeholder={t('customPlaceholder')}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              addCustom();
            }
          }}
        />
        <Button type="button" variant="outline" onClick={addCustom} className="cursor-pointer gap-2">
          <Plus className="h-4 w-4" />
          {t('addCustom')}
        </Button>
      </div>

      {value.length === 0 && <p className="text-sm text-red-500">{t('atLeastOne')}</p>}
    </div>
  );
}
