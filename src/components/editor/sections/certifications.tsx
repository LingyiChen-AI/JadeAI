'use client';

import { useTranslations } from 'next-intl';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { EditableText } from '../fields/editable-text';
import { FieldWrapper } from '../fields/field-wrapper';
import { ItemActions } from './item-actions';
import { generateId } from '@/lib/utils';
import type { ResumeSection, CertificationsContent, CertificationItem } from '@/types/resume';

interface Props {
  section: ResumeSection;
  onUpdate: (content: Partial<CertificationsContent>) => void;
}

export function CertificationsSection({ section, onUpdate }: Props) {
  const t = useTranslations('editor.fields');
  const content = section.content as CertificationsContent;
  const items = Array.isArray(content.items) ? content.items : [];

  const labels = {
    insertAbove: t('insertAbove'),
    moveUp: t('moveUp'),
    moveDown: t('moveDown'),
    remove: t('removeItem'),
  };

  const createItem = (): CertificationItem => ({ id: generateId(), name: '', issuer: '', date: '' });

  const addItem = () => {
    onUpdate({ items: [...items, createItem()] });
  };

  const insertItem = (index: number) => {
    const updated = [...items];
    updated.splice(index, 0, createItem());
    onUpdate({ items: updated });
  };

  const updateItem = (index: number, data: Partial<CertificationItem>) => {
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
        <div key={item.id || `cert-${index}`}>
          {index > 0 && <Separator className="mb-4" />}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-zinc-400">#{index + 1}</span>
              <ItemActions index={index} total={items.length} labels={labels} onInsertAbove={() => insertItem(index)} onMove={(direction) => moveItem(index, direction)} onRemove={() => removeItem(index)} />
            </div>
            <FieldWrapper>
              <EditableText label={t('certName')} value={item.name} onChange={(v) => updateItem(index, { name: v })} />
              <EditableText label={t('issuer')} value={item.issuer} onChange={(v) => updateItem(index, { issuer: v })} />
            </FieldWrapper>
            <EditableText label={t('certDate')} value={item.date} onChange={(v) => updateItem(index, { date: v })} />
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
