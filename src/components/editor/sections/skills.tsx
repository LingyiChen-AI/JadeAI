'use client';

import { useTranslations } from 'next-intl';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { EditableText } from '../fields/editable-text';
import { EditableList } from '../fields/editable-list';
import { ItemActions } from './item-actions';
import { generateId } from '@/lib/utils';
import type { ResumeSection, SkillsContent, SkillCategory } from '@/types/resume';

interface Props {
  section: ResumeSection;
  onUpdate: (content: Partial<SkillsContent>) => void;
}

export function SkillsSection({ section, onUpdate }: Props) {
  const t = useTranslations('editor.fields');
  const content = section.content as SkillsContent;
  const categories = Array.isArray(content.categories) ? content.categories : [];

  const labels = {
    insertAbove: t('insertAbove'),
    moveUp: t('moveUp'),
    moveDown: t('moveDown'),
    remove: t('removeItem'),
  };

  const createCategory = (): SkillCategory => ({
      id: generateId(),
      name: '',
      skills: [],
  });

  const addCategory = () => {
    onUpdate({ categories: [...categories, createCategory()] });
  };

  const insertCategory = (index: number) => {
    const updated = [...categories];
    updated.splice(index, 0, createCategory());
    onUpdate({ categories: updated });
  };

  const updateCategory = (index: number, data: Partial<SkillCategory>) => {
    const updated = categories.map((cat, i) => (i === index ? { ...cat, ...data } : cat));
    onUpdate({ categories: updated });
  };

  const removeCategory = (index: number) => {
    onUpdate({ categories: categories.filter((_, i) => i !== index) });
  };

  const moveCategory = (index: number, direction: -1 | 1) => {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= categories.length) return;
    const updated = [...categories];
    const [category] = updated.splice(index, 1);
    updated.splice(targetIndex, 0, category);
    onUpdate({ categories: updated });
  };

  return (
    <div className="space-y-4">
      {categories.map((cat, index) => (
        <div key={cat.id || `cat-${index}-${cat.name}`}>
          {index > 0 && <Separator className="mb-4" />}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <EditableText label={t('skillCategory')} value={cat.name} onChange={(v) => updateCategory(index, { name: v })} />
              <ItemActions index={index} total={categories.length} labels={labels} onInsertAbove={() => insertCategory(index)} onMove={(direction) => moveCategory(index, direction)} onRemove={() => removeCategory(index)} />
            </div>
            <EditableList label={t('technologies')} items={cat.skills} onChange={(v) => updateCategory(index, { skills: v })} sortable dragLabel={t('dragToReorder')} />
          </div>
        </div>
      ))}
      <Button variant="outline" size="sm" onClick={addCategory} className="w-full cursor-pointer gap-1">
        <Plus className="h-3.5 w-3.5" />
        {t('addItem')}
      </Button>
    </div>
  );
}
