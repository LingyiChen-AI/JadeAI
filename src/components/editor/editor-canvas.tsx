'use client';

import { useState, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  DragOverlay,
  type DragStartEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { ScrollArea } from '@/components/ui/scroll-area';
import { SortableSection } from './dnd/sortable-section';
import { SectionWrapper } from './section-wrapper';
import { useEditorStore } from '@/stores/editor-store';
import type { ResumeSection, SectionContent } from '@/types/resume';

interface EditorCanvasProps {
  sections: ResumeSection[];
  onUpdateSection: (sectionId: string, content: Partial<SectionContent>) => void;
  onRemoveSection: (sectionId: string) => void;
  onReorderSections: (sections: ResumeSection[]) => void;
}

export function EditorCanvas({
  sections,
  onUpdateSection,
  onRemoveSection,
  onReorderSections,
}: EditorCanvasProps) {
  const t = useTranslations('editor');
  const [activeId, setActiveId] = useState<string | null>(null);
  const { setDragging, aiChanges, clearAllAiChanges, requestAiChangeFocus, setMobileActiveTab } = useEditorStore();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      setActiveId(event.active.id as string);
      setDragging(true);
    },
    [setDragging]
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      setActiveId(null);
      setDragging(false);

      if (over && active.id !== over.id) {
        const oldIndex = sections.findIndex((s) => s.id === active.id);
        const newIndex = sections.findIndex((s) => s.id === over.id);

        if (oldIndex !== -1 && newIndex !== -1) {
          const newSections = [...sections];
          const [removed] = newSections.splice(oldIndex, 1);
          newSections.splice(newIndex, 0, removed);
          const reordered = newSections.map((s, i) => ({ ...s, sortOrder: i }));
          onReorderSections(reordered);
        }
      }
    },
    [sections, onReorderSections, setDragging]
  );

  const activeSection = activeId ? sections.find((s) => s.id === activeId) : null;
  const viewFirstChange = useCallback(() => {
    const first = sections
      .map((section) => aiChanges.find((change) => change.sectionId === section.id))
      .find((change): change is NonNullable<typeof change> => Boolean(change)) ?? aiChanges[0];
    if (!first) return;
    setMobileActiveTab('edit');
    requestAiChangeFocus(first);
  }, [aiChanges, requestAiChangeFocus, sections, setMobileActiveTab]);

  return (
    <div className="h-full min-w-0 overflow-hidden bg-zinc-50 dark:bg-zinc-950">
      <ScrollArea className="h-full">
        <div className="mx-auto max-w-3xl px-3 py-4 md:px-6 md:py-8">
          {aiChanges.length > 0 && (
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100">
              <span className="inline-flex items-center gap-1.5 font-semibold">
                <span className="rounded bg-amber-200 px-1.5 py-0.5 text-[10px] dark:bg-amber-800">AI</span>
                {t('aiChangesCount', { count: aiChanges.length })}
              </span>
              <div className="flex items-center gap-3">
                <button type="button" className="cursor-pointer underline-offset-2 hover:underline" onClick={viewFirstChange}>
                  {t('viewFirstAiChange')}
                </button>
                <button type="button" className="cursor-pointer underline-offset-2 hover:underline" onClick={clearAllAiChanges}>
                  {t('clearAiChanges')}
                </button>
              </div>
            </div>
          )}
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={sections.map((s) => s.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-3 md:space-y-4">
                {sections.map((section) => (
                  <SortableSection key={section.id} id={section.id}>
                    <SectionWrapper
                      section={section}
                      onUpdate={(content) => onUpdateSection(section.id, content)}
                      onRemove={() => onRemoveSection(section.id)}
                    />
                  </SortableSection>
                ))}
              </div>
            </SortableContext>

            <DragOverlay>
              {activeSection && (
                <div className="rounded-lg border-2 border-brand bg-white dark:bg-zinc-800 p-4 opacity-80 shadow-xl">
                  <p className="font-medium text-zinc-700 dark:text-zinc-200">{activeSection.title}</p>
                </div>
              )}
            </DragOverlay>
          </DndContext>
        </div>
      </ScrollArea>
    </div>
  );
}
