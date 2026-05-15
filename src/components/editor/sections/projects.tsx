'use client';

import { useTranslations } from 'next-intl';
import { Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { EditableText } from '../fields/editable-text';
import { EditableDate } from '../fields/editable-date';
import { EditableMarkdown } from '../fields/editable-markdown';
import { EditableTextareaList } from '../fields/editable-textarea-list';
import { FieldWrapper } from '../fields/field-wrapper';
import { generateId } from '@/lib/utils';
import type { ResumeSection, ProjectsContent, ProjectItem } from '@/types/resume';

interface Props {
  section: ResumeSection;
  onUpdate: (content: Partial<ProjectsContent>) => void;
}

export function ProjectsSection({ section, onUpdate }: Props) {
  const t = useTranslations('editor.fields');
  const content = section.content as ProjectsContent;
  const items = content.items || [];

  const addItem = () => {
    const newItem: ProjectItem = {
      id: generateId(),
      name: '',
      description: '',
      technologies: [],
      highlights: [],
    };
    onUpdate({ items: [...items, newItem] } as any);
  };

  const updateItem = (index: number, data: Partial<ProjectItem>) => {
    const updated = items.map((item, i) => (i === index ? { ...item, ...data } : item));
    onUpdate({ items: updated } as any);
  };

  const removeItem = (index: number) => {
    onUpdate({ items: items.filter((_, i) => i !== index) } as any);
  };

  return (
    <div className="space-y-4">
      {items.map((item, index) => (
        <div key={item.id || `proj-${index}`}>
          {index > 0 && <Separator className="mb-4" />}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-zinc-400">#{index + 1}</span>
              <Button variant="ghost" size="sm" className="h-7 cursor-pointer p-1 text-zinc-400 hover:text-red-500" onClick={() => removeItem(index)}>
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
            <FieldWrapper>
              <EditableText label={t('projectName')} value={item.name} onChange={(v) => updateItem(index, { name: v })} />
              <EditableText label={t('website')} value={item.url || ''} onChange={(v) => updateItem(index, { url: v })} />
            </FieldWrapper>
            <FieldWrapper>
              <EditableDate label={t('startDate')} value={item.startDate || ''} onChange={(v) => updateItem(index, { startDate: v })} />
              <EditableDate label={t('endDate')} value={item.endDate || ''} onChange={(v) => updateItem(index, { endDate: v })} />
            </FieldWrapper>
            <EditableMarkdown label={t('description')} value={item.description} onChange={(v) => updateItem(index, { description: v })} />
            <EditableTextareaList label={t('technologies')} items={item.technologies} onChange={(v) => updateItem(index, { technologies: v })} />
            <EditableTextareaList label={t('highlights')} items={item.highlights} onChange={(v) => updateItem(index, { highlights: v })} />
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
