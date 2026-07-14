'use client';

import { useTranslations } from 'next-intl';
import { Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { EditableText } from '../fields/editable-text';
import { EditableDate } from '../fields/editable-date';
import { EditableList } from '../fields/editable-list';
import { FieldWrapper } from '../fields/field-wrapper';
import { generateId } from '@/lib/utils';
import type { ResumeSection, EducationContent, EducationItem } from '@/types/resume';

interface Props {
  section: ResumeSection;
  onUpdate: (content: Partial<EducationContent>) => void;
}

export function EducationSection({ section, onUpdate }: Props) {
  const t = useTranslations('editor.fields');
  const content = section.content as EducationContent;
  const items = Array.isArray(content.items) ? content.items : [];

  const addItem = () => {
    const newItem: EducationItem = {
      id: generateId(),
      institution: '',
      degree: '',
      field: '',
      startDate: '',
      endDate: '',
      highlights: [],
    };
    onUpdate({ items: [...items, newItem] } as any);
  };

  const updateItem = (index: number, data: Partial<EducationItem>) => {
    const updated = items.map((item, i) => (i === index ? { ...item, ...data } : item));
    onUpdate({ items: updated } as any);
  };

  const removeItem = (index: number) => {
    onUpdate({ items: items.filter((_, i) => i !== index) } as any);
  };

  return (
    <div className="space-y-4">
      {items.map((item, index) => (
        <div key={item.id || `edu-${index}`}>
          {index > 0 && <Separator className="mb-4" />}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-zinc-400">#{index + 1}</span>
              <Button variant="ghost" size="sm" className="h-7 cursor-pointer p-1 text-zinc-400 hover:text-red-500" onClick={() => removeItem(index)}>
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
            <FieldWrapper>
              <EditableText label={t('institution')} value={item.institution} onChange={(v) => updateItem(index, { institution: v })} changePath={`content.items.${item.id}.institution`} />
              <EditableText label={t('degree')} value={item.degree} onChange={(v) => updateItem(index, { degree: v })} changePath={`content.items.${item.id}.degree`} />
            </FieldWrapper>
            <FieldWrapper>
              <EditableText label={t('field')} value={item.field} onChange={(v) => updateItem(index, { field: v })} changePath={`content.items.${item.id}.field`} />
              <EditableText label={t('gpa')} value={item.gpa || ''} onChange={(v) => updateItem(index, { gpa: v })} changePath={`content.items.${item.id}.gpa`} />
            </FieldWrapper>
            <FieldWrapper>
              <EditableDate label={t('startDate')} value={item.startDate} onChange={(v) => updateItem(index, { startDate: v })} changePath={`content.items.${item.id}.startDate`} />
              <EditableDate label={t('endDate')} value={item.endDate} onChange={(v) => updateItem(index, { endDate: v })} changePath={`content.items.${item.id}.endDate`} />
            </FieldWrapper>
            <EditableList label={t('highlights')} items={item.highlights} onChange={(v) => updateItem(index, { highlights: v })} changePath={`content.items.${item.id}.highlights`} />
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
