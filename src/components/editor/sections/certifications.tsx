'use client';

import { useTranslations } from 'next-intl';
import { Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { EditableText } from '../fields/editable-text';
import { FieldWrapper } from '../fields/field-wrapper';
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

  const addItem = () => {
    const newItem: CertificationItem = { id: generateId(), name: '', issuer: '', date: '' };
    onUpdate({ items: [...items, newItem] } as any);
  };

  const updateItem = (index: number, data: Partial<CertificationItem>) => {
    const updated = items.map((item, i) => (i === index ? { ...item, ...data } : item));
    onUpdate({ items: updated } as any);
  };

  const removeItem = (index: number) => {
    onUpdate({ items: items.filter((_, i) => i !== index) } as any);
  };

  return (
    <div className="space-y-4">
      {items.map((item, index) => (
        <div key={item.id || `cert-${index}`}>
          {index > 0 && <Separator className="mb-4" />}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-zinc-400">#{index + 1}</span>
              <Button variant="ghost" size="sm" className="h-7 cursor-pointer p-1 text-zinc-400 hover:text-red-500" onClick={() => removeItem(index)}>
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
            <FieldWrapper>
              <EditableText label={t('certName')} value={item.name} onChange={(v) => updateItem(index, { name: v })} changePath={`content.items.${item.id}.name`} />
              <EditableText label={t('issuer')} value={item.issuer} onChange={(v) => updateItem(index, { issuer: v })} changePath={`content.items.${item.id}.issuer`} />
            </FieldWrapper>
            <EditableText label={t('certDate')} value={item.date} onChange={(v) => updateItem(index, { date: v })} changePath={`content.items.${item.id}.date`} />
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
