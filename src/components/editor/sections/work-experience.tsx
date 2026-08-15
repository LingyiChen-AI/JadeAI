'use client';

import { useTranslations } from 'next-intl';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { EditableText } from '../fields/editable-text';
import { EditableDate } from '../fields/editable-date';
import { EditableRichText } from '../fields/editable-rich-text';
import { EditableList } from '../fields/editable-list';
import { FieldWrapper } from '../fields/field-wrapper';
import { ItemActions } from './item-actions';
import { generateId } from '@/lib/utils';
import type { ResumeSection, WorkExperienceContent, WorkExperienceItem } from '@/types/resume';

interface Props {
  section: ResumeSection;
  onUpdate: (content: Partial<WorkExperienceContent>) => void;
}

export function WorkExperienceSection({ section, onUpdate }: Props) {
  const t = useTranslations('editor.fields');
  const content = section.content as WorkExperienceContent;
  const items = Array.isArray(content.items) ? content.items : [];

  const labels = {
    insertAbove: t('insertAbove'),
    moveUp: t('moveUp'),
    moveDown: t('moveDown'),
    remove: t('removeItem'),
  };

  const createItem = (): WorkExperienceItem => ({
      id: generateId(),
      company: '',
      position: '',
      location: '',
      startDate: '',
      endDate: null,
      current: false,
      description: '',
      technologies: [],
      highlights: [],
  });

  const addItem = () => {
    onUpdate({ items: [...items, createItem()] });
  };

  const insertItem = (index: number) => {
    const updated = [...items];
    updated.splice(index, 0, createItem());
    onUpdate({ items: updated });
  };

  const updateItem = (index: number, data: Partial<WorkExperienceItem>) => {
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
        <div key={item.id || `we-${index}`}>
          {index > 0 && <Separator className="mb-4" />}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-zinc-400">#{index + 1}</span>
              <ItemActions index={index} total={items.length} labels={labels} onInsertAbove={() => insertItem(index)} onMove={(direction) => moveItem(index, direction)} onRemove={() => removeItem(index)} />
            </div>
            <FieldWrapper>
              <EditableText label={t('company')} value={item.company} onChange={(v) => updateItem(index, { company: v })} />
              <EditableText label={t('position')} value={item.position} onChange={(v) => updateItem(index, { position: v })} />
            </FieldWrapper>
            <FieldWrapper>
              <EditableDate label={t('startDate')} value={item.startDate} onChange={(v) => updateItem(index, { startDate: v })} />
              <EditableDate label={t('endDate')} value={item.endDate || ''} onChange={(v) => updateItem(index, { endDate: v || null, current: !v })} />
            </FieldWrapper>
            <EditableRichText label={t('description')} value={item.description} onChange={(v) => updateItem(index, { description: v })} />
            <EditableList label={t('technologies')} items={item.technologies || []} onChange={(v) => updateItem(index, { technologies: v })} />
            <EditableList label={t('highlights')} items={item.highlights} onChange={(v) => updateItem(index, { highlights: v })} />
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
