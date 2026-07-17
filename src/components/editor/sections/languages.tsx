'use client';

import { useTranslations } from 'next-intl';
import { Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { EditableText } from '../fields/editable-text';
import { EditableRichText } from '../fields/editable-rich-text';
import { FieldWrapper } from '../fields/field-wrapper';
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

  const addItem = () => {
    const newItem: LanguageItem = { id: generateId(), language: '', proficiency: '' };
    onUpdate({ items: [...items, newItem] } as any);
  };

  const updateItem = (index: number, data: Partial<LanguageItem>) => {
    const updated = items.map((item, i) => (i === index ? { ...item, ...data } : item));
    onUpdate({ items: updated } as any);
  };

  const removeItem = (index: number) => {
    onUpdate({ items: items.filter((_, i) => i !== index) } as any);
  };

  return (
    <div className="space-y-4">
      {items.map((item, index) => (
        <div key={item.id || `lang-${index}`}>
          {index > 0 && <Separator className="mb-4" />}
          <div className="space-y-3">
            <FieldWrapper>
              <EditableText label={t('language')} value={item.language} onChange={(v) => updateItem(index, { language: v })} changePath={`content.items.${item.id}.language`} />
              <div className="flex items-end gap-1">
                <div className="flex-1">
                  <EditableText label={t('proficiency')} value={item.proficiency} onChange={(v) => updateItem(index, { proficiency: v })} changePath={`content.items.${item.id}.proficiency`} />
                </div>
                <Button variant="ghost" size="sm" className="h-8 w-8 cursor-pointer p-0 text-zinc-400 hover:text-red-500" onClick={() => removeItem(index)}>
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            </FieldWrapper>
            <EditableRichText label={t('description')} value={(item as any).description || ''} onChange={(v) => updateItem(index, { description: v } as any)} changePath={`content.items.${item.id}.description`} />
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
