'use client';

import { useTranslations } from 'next-intl';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { EditableText } from '../fields/editable-text';
import { FieldWrapper } from '../fields/field-wrapper';
import { ItemActions } from './item-actions';
import { generateId } from '@/lib/utils';
import type { ResumeSection, LanguagesContent, LanguageItem } from '@/types/resume';

interface Props {
  section: ResumeSection;
  onUpdate: (content: Partial<LanguagesContent>) => void;
}

export function LanguagesSection({ section, onUpdate }: Props) {
  const t = useTranslations('editor.fields');
  const content = section.content as LanguagesContent;
  const items = Array.isArray(content.items) ? content.items : [];

  const labels = {
    insertAbove: t('insertAbove'),
    moveUp: t('moveUp'),
    moveDown: t('moveDown'),
    remove: t('removeItem'),
  };

  const createItem = (): LanguageItem => ({ id: generateId(), language: '', proficiency: '' });

  const addItem = () => {
    onUpdate({ items: [...items, createItem()] });
  };

  const insertItem = (index: number) => {
    const updated = [...items];
    updated.splice(index, 0, createItem());
    onUpdate({ items: updated });
  };

  const updateItem = (index: number, data: Partial<LanguageItem>) => {
    const updated = items.map((item, i) => (i === index ? { ...item, ...data } : item));
    onUpdate({ items: updated });
  };

  const removeItem = (index: number) => {
    onUpdate({ items: items.filter((_, i) => i !== index) });
  };

  const moveItem = (index: number, direction: -1 | 1) => {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= items.length) return;
    const updated = [...items];
    const [item] = updated.splice(index, 1);
    updated.splice(targetIndex, 0, item);
    onUpdate({ items: updated });
  };

  return (
    <div className="space-y-4">
      {items.map((item, index) => (
        <div key={item.id || `lang-${index}`}>
          {index > 0 && <Separator className="mb-4" />}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-zinc-400">#{index + 1}</span>
              <ItemActions index={index} total={items.length} labels={labels} onInsertAbove={() => insertItem(index)} onMove={(direction) => moveItem(index, direction)} onRemove={() => removeItem(index)} />
            </div>
            <FieldWrapper>
              <EditableText label={t('language')} value={item.language} onChange={(v) => updateItem(index, { language: v })} />
              <EditableText label={t('proficiency')} value={item.proficiency} onChange={(v) => updateItem(index, { proficiency: v })} />
            </FieldWrapper>
            <EditableText label={t('description')} value={item.description || ''} onChange={(v) => updateItem(index, { description: v })} />
          </div>
        </div>
      ))}
      <Button variant="outline" size="sm" onClick={addItem} className="w-full cursor-pointer gap-1">
        <Plus className="h-3.5 w-3.5" />
        {t('addItem')}
      </Button>
    </div>
  );
}
