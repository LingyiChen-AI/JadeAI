'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { X, Plus, Check, Pencil, Sparkles, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Textarea } from '@/components/ui/textarea';
import { PRESET_DIMENSION_KEYS } from '@/lib/recruit/dimensions';
import { dimensionColor } from '@/lib/recruit/dimension-colors';
import { cn } from '@/lib/utils';
import type { DimensionConfig } from '@/types/recruit';

interface DimensionChipsProps {
  value: DimensionConfig[];
  onChange: (next: DimensionConfig[]) => void;
  onAIRecognize?: () => void;
  aiRecognizing?: boolean;
}

export function DimensionChips({ value, onChange, onAIRecognize, aiRecognizing = false }: DimensionChipsProps) {
  const t = useTranslations('recruit.dimensions');
  const [customName, setCustomName] = useState('');
  const [customDescription, setCustomDescription] = useState('');
  const [customOpen, setCustomOpen] = useState(false);
  /** 正在编辑考察重点的维度 key，一次只开一个，不然弹窗高度失控 */
  const [editingKey, setEditingKey] = useState<string | null>(null);

  const selectedByKey = new Map(value.map((d) => [d.key, d]));
  const editing = editingKey ? selectedByKey.get(editingKey) : undefined;

  function togglePreset(key: string) {
    if (selectedByKey.has(key)) {
      onChange(value.filter((d) => d.key !== key));
      if (editingKey === key) setEditingKey(null);
    } else {
      // 预置维度的考察重点从 i18n 预填。这段文字会原样进出题 prompt，
      // 用户想改也随时能改。
      onChange([
        ...value,
        { key, label: t(key), description: t(`descriptions.${key}`), weight: 2, custom: false },
      ]);
    }
  }

  function patch(key: string, data: Partial<DimensionConfig>) {
    onChange(value.map((d) => (d.key === key ? { ...d, ...data } : d)));
  }

  function addCustom() {
    const name = customName.trim();
    const description = customDescription.trim();
    if (!name || !description || selectedByKey.has(name)) return;
    // 自定义维度的 key 用名字本身，好在 prompt 和打分结果里对得上
    onChange([...value, { key: name, label: name, description, weight: 2, custom: true }]);
    setCustomName('');
    setCustomDescription('');
    setCustomOpen(false);
  }

  function remove(key: string) {
    onChange(value.filter((d) => d.key !== key));
    if (editingKey === key) setEditingKey(null);
  }

  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-center justify-between gap-3">
          <Label className="text-sm font-medium">{t('title')}</Label>
          {onAIRecognize && (
            <Button type="button" variant="outline" size="sm" onClick={onAIRecognize} disabled={aiRecognizing} className="cursor-pointer gap-1.5">
              {aiRecognizing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
              {aiRecognizing ? t('recognizing') : t('aiRecognize')}
            </Button>
          )}
        </div>
        <p className="mt-1 text-xs text-zinc-500">{t('hint')}</p>
        <p className="mt-1 text-xs font-medium text-zinc-700 dark:text-zinc-300">
          {t('totalQuestions', { count: value.reduce((sum, dimension) => sum + dimension.weight, 0) })}
        </p>
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
                // 选中用主题色淡底而不是实心填充：八个维度全选时实心色块会糊成一片，
                // 也和下面自定义维度的淡底样式对不上
                selected
                  ? 'border-brand bg-brand/10 text-brand'
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

      {/* 权重：只为已选中的维度展开。两列排布——八个维度排一列要占 250px 高，
          弹窗就得滚。grid 的列宽是固定的 1fr，滑块 min-w-0 才不会被两侧
          定宽的文字挤成一条线 */}
      {value.length > 0 && (
        <div className="grid grid-cols-1 gap-x-6 gap-y-2.5 rounded-lg border bg-zinc-50 p-4 sm:grid-cols-2 dark:bg-zinc-900">
          {value.map((d) => (
            <div key={d.key} className="flex items-center gap-2.5">
              {/* 和题目列表里的小圆点同色，配色即维度 */}
              <span
                className={cn('h-2 w-2 shrink-0 rounded-full', dimensionColor(d.key).dot)}
                aria-hidden
              />
              <span className="w-14 shrink-0 truncate text-xs text-zinc-600 dark:text-zinc-400">
                {d.label}
              </span>
              <Slider
                  className="min-w-0 flex-1 cursor-pointer"
                min={1}
                max={5}
                step={1}
                value={[d.weight]}
                onValueChange={([w]) => patch(d.key, { weight: w })}
              />
              <span className="w-10 shrink-0 text-right text-xs font-medium tabular-nums text-zinc-600">
                {t('perDimension', { count: d.weight })}
              </span>
              <button
                type="button"
                onClick={() => setEditingKey(editingKey === d.key ? null : d.key)}
                aria-label={t('editDescription')}
                title={d.description}
                className={cn(
                  'shrink-0 cursor-pointer rounded p-1 transition-colors',
                  editingKey === d.key
                    ? 'text-brand'
                    : 'text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200',
                )}
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* 考察重点编辑区：一次只展开一个，放在网格下面而不是每行内嵌，
          八行都内嵌的话弹窗要长一倍 */}
      {editing && (
        <div className="space-y-1.5 rounded-lg border border-brand/40 bg-brand/5 p-3">
          <Label htmlFor="dimension-description" className="text-xs font-medium">
            {t('descriptionLabel')} · {editing.label}
          </Label>
          <Textarea
            id="dimension-description"
            value={editing.description ?? ''}
            onChange={(e) => patch(editing.key, { description: e.target.value })}
            placeholder={t('descriptionPlaceholder')}
            className="max-h-[200px] min-h-[96px] bg-white dark:bg-zinc-900"
          />
          <p className="text-[11px] text-zinc-500">{t('descriptionHint')}</p>
        </div>
      )}

      {/* 自定义维度默认收起：描述是必填的，展开后是两行表单，
          一直摊在那里会把弹窗撑高 */}
      {customOpen ? (
        <div className="space-y-2 rounded-lg border p-3">
          <Input
            value={customName}
            onChange={(e) => setCustomName(e.target.value)}
            placeholder={t('customPlaceholder')}
            autoFocus
          />
          <Textarea
            value={customDescription}
            onChange={(e) => setCustomDescription(e.target.value)}
            placeholder={t('descriptionPlaceholder')}
            className="max-h-[200px] min-h-[80px]"
          />
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] text-zinc-500">{t('descriptionHint')}</p>
            <div className="flex shrink-0 gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setCustomOpen(false)}
                className="cursor-pointer"
              >
                <X className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={addCustom}
                disabled={!customName.trim() || !customDescription.trim()}
                className="cursor-pointer gap-1.5 bg-brand hover:bg-brand-hover"
              >
                <Plus className="h-4 w-4" />
                {t('addCustom')}
              </Button>
            </div>
          </div>
          {customName.trim() && !customDescription.trim() && (
            <p className="text-[11px] text-amber-600">{t('customDescriptionRequired')}</p>
          )}
        </div>
      ) : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setCustomOpen(true)}
          className="cursor-pointer gap-1.5"
        >
          <Plus className="h-4 w-4" />
          {t('addCustom')}
        </Button>
      )}

      {value.length === 0 && <p className="text-sm text-red-500">{t('atLeastOne')}</p>}
    </div>
  );
}
