'use client';

import { useTranslations } from 'next-intl';
import { X, Plus } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { PRESET_DIMENSION_KEYS } from '@/lib/recruit/dimensions';
import { allocateQuestions } from '@/lib/recruit/scoring';
import type { DimensionConfig } from '@/types/recruit';

interface DimensionEditorProps {
  value: DimensionConfig[];
  onChange: (next: DimensionConfig[]) => void;
  /** 传入后每个维度会显示「本维度出几题」，让权重的效果肉眼可见 */
  questionCount?: number;
}

export function DimensionEditor({ value, onChange, questionCount }: DimensionEditorProps) {
  const t = useTranslations('recruit.dimensions');
  const [customName, setCustomName] = useState('');

  const selectedByKey = new Map(value.map((d) => [d.key, d]));
  const allocation = questionCount ? allocateQuestions(value, questionCount) : null;

  function togglePreset(key: string, on: boolean) {
    if (on) {
      onChange([...value, { key, label: t(key), weight: 2, custom: false }]);
    } else {
      onChange(value.filter((d) => d.key !== key));
    }
  }

  function setWeight(key: string, weight: number) {
    onChange(value.map((d) => (d.key === key ? { ...d, weight } : d)));
  }

  function addCustom() {
    const name = customName.trim();
    if (!name) return;
    // 自定义维度的 key 用名字本身，好在 prompt 和打分结果里对得上。
    if (selectedByKey.has(name)) return;
    onChange([...value, { key: name, label: name, weight: 2, custom: true }]);
    setCustomName('');
  }

  function removeCustom(key: string) {
    onChange(value.filter((d) => d.key !== key));
  }

  const customDimensions = value.filter((d) => d.custom);

  return (
    <div className="space-y-4">
      <div>
        <Label className="text-sm font-medium">{t('title')}</Label>
        <p className="mt-1 text-xs text-zinc-500">{t('hint')}</p>
      </div>

      <div className="space-y-3">
        {PRESET_DIMENSION_KEYS.map((key) => {
          const selected = selectedByKey.get(key);
          return (
            <div key={key} className="flex items-center gap-3 rounded-md border p-3">
              <Switch
                checked={Boolean(selected)}
                onCheckedChange={(on) => togglePreset(key, on)}
                className="cursor-pointer"
              />
              <span className="w-24 shrink-0 text-sm">{t(key)}</span>
              {selected && (
                <>
                  <Slider
                    className="flex-1"
                    min={1}
                    max={5}
                    step={1}
                    value={[selected.weight]}
                    onValueChange={([w]) => setWeight(key, w)}
                  />
                  <span className="w-8 shrink-0 text-right text-sm tabular-nums text-zinc-500">
                    {selected.weight}
                  </span>
                  {allocation && (
                    <span className="w-14 shrink-0 text-right text-xs text-zinc-400">
                      {t('perDimension', { count: allocation[key] ?? 0 })}
                    </span>
                  )}
                </>
              )}
            </div>
          );
        })}

        {customDimensions.map((d) => (
          <div key={d.key} className="flex items-center gap-3 rounded-md border border-dashed p-3">
            <span className="w-24 shrink-0 truncate text-sm">{d.label}</span>
            <Slider
              className="flex-1"
              min={1}
              max={5}
              step={1}
              value={[d.weight]}
              onValueChange={([w]) => setWeight(d.key, w)}
            />
            <span className="w-8 shrink-0 text-right text-sm tabular-nums text-zinc-500">
              {d.weight}
            </span>
            {allocation && (
              <span className="w-14 shrink-0 text-right text-xs text-zinc-400">
                {t('perDimension', { count: allocation[d.key] ?? 0 })}
              </span>
            )}
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => removeCustom(d.key)}
              className="cursor-pointer"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </div>

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

      {value.length === 0 && (
        <p className="text-sm text-red-500">{t('atLeastOne')}</p>
      )}
    </div>
  );
}
