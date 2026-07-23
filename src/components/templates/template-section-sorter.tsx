'use client';

import { useCallback, useMemo } from 'react';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ArrowDown, ArrowUp, GripVertical } from 'lucide-react';

import type { DeclarativeTemplateManifest } from '@/types/template';

type TemplateSlot = DeclarativeTemplateManifest['sectionSlots'][number];
type SectionType = TemplateSlot['sectionType'];
type Placement = TemplateSlot['placement'];

export function reorderTemplateSlots(
  slots: readonly TemplateSlot[],
  active: string,
  over: string | null | undefined,
): TemplateSlot[] | null {
  if (!over || active === over) return null;
  const oldIndex = slots.findIndex((slot) => slot.sectionType === active);
  const newIndex = slots.findIndex((slot) => slot.sectionType === over);
  if (oldIndex < 0 || newIndex < 0) return null;
  return arrayMove([...slots], oldIndex, newIndex).map((slot, order) => ({ ...slot, order }));
}

export interface TemplateSectionSorterProps {
  slots: readonly TemplateSlot[];
  onChange: (slots: TemplateSlot[]) => void;
  labels: TemplateSectionAnnouncementLabels;
  sectionLabels?: Partial<Record<SectionType, string>>;
  advancedRenderer?: (slot: TemplateSlot) => React.ReactNode;
  advancedContent?: React.ReactNode | ((slot: TemplateSlot) => React.ReactNode);
}

export interface TemplateSectionAnnouncementLabels {
  dragHandle: (section: string) => string;
  moveUp: (section: string) => string;
  moveDown: (section: string) => string;
  placement: (section: string) => string;
  advanced: string;
  placements: Record<Placement, string>;
  dragStart: (section: string) => string;
  dragOver: (section: string, over: string) => string;
  dragEnd: (section: string, over: string) => string;
  dragCancel: (section: string) => string;
}

export function createTemplateSectionAnnouncements(labels: TemplateSectionAnnouncementLabels, resolve = (id: string) => id) {
  return {
    onDragStart: ({ active }: { active: { id: string | number } }) => labels.dragStart(resolve(String(active.id))),
    onDragOver: ({ active, over }: { active: { id: string | number }; over: { id: string | number } | null }) =>
      over ? labels.dragOver(resolve(String(active.id)), resolve(String(over.id))) : labels.dragCancel(resolve(String(active.id))),
    onDragEnd: ({ active, over }: { active: { id: string | number }; over: { id: string | number } | null }) =>
      over ? labels.dragEnd(resolve(String(active.id)), resolve(String(over.id))) : labels.dragCancel(resolve(String(active.id))),
    onDragCancel: ({ active }: { active: { id: string | number } }) => labels.dragCancel(resolve(String(active.id))),
  };
}

const placements: Placement[] = ['header', 'main', 'sidebar', 'footer'];

function deriveRowIds(slots: readonly TemplateSlot[]): string[] {
  const typeCounts = new Map<SectionType, number>();
  slots.forEach((slot) => typeCounts.set(slot.sectionType, (typeCounts.get(slot.sectionType) ?? 0) + 1));
  const occurrences = new Map<string, number>();
  return slots.map((slot) => {
    if (typeCounts.get(slot.sectionType) === 1) return slot.sectionType;
    const semanticKey = `${slot.sectionType}|${slot.placement}`;
    const occurrence = occurrences.get(semanticKey) ?? 0;
    occurrences.set(semanticKey, occurrence + 1);
    return `${slot.sectionType}::${slot.placement}::${occurrence}`;
  });
}

function SortableSlotRow({
  slot,
  index,
  count,
  label,
  rowId,
  onMove,
  onPlacementChange,
  advanced,
  labels,
}: {
  slot: TemplateSlot;
  index: number;
  count: number;
  label: string;
  rowId: string;
  onMove: (direction: -1 | 1) => void;
  onPlacementChange: (placement: Placement) => void;
  advanced?: React.ReactNode;
  labels: TemplateSectionAnnouncementLabels;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: rowId });
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : undefined }} className="flex items-center gap-2">
      <button type="button" aria-label={labels.dragHandle(label)} className="cursor-grab" {...attributes} {...listeners}><GripVertical className="h-4 w-4" /></button>
      <span className="min-w-0 flex-1">{label}</span>
      <button type="button" aria-label={labels.moveUp(label)} onClick={() => onMove(-1)} disabled={index === 0}><ArrowUp className="h-4 w-4" /></button>
      <button type="button" aria-label={labels.moveDown(label)} onClick={() => onMove(1)} disabled={index === count - 1}><ArrowDown className="h-4 w-4" /></button>
      <label>
        <span className="sr-only">{labels.placement(label)}</span>
        <select aria-label={labels.placement(label)} value={slot.placement} onChange={(event) => onPlacementChange(event.target.value as Placement)}>
          {placements.map((placement) => <option key={placement} value={placement}>{labels.placements[placement]}</option>)}
        </select>
      </label>
      {advanced ? <details><summary>{labels.advanced}</summary><div>{advanced}</div></details> : null}
    </div>
  );
}

export function TemplateSectionSorter({ slots, onChange, labels: announcementLabels, sectionLabels = {}, advancedRenderer, advancedContent }: TemplateSectionSorterProps) {
  const sensors = useSensors(useSensor(PointerSensor), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const rowIds = deriveRowIds(slots);
  const rows = useMemo(() => slots.map((slot, index) => ({ slot, index, id: rowIds[index] })), [rowIds, slots]);
  const labels = useMemo(() => Object.fromEntries(rows.map(({ slot, id }) => [id, sectionLabels[slot.sectionType] ?? slot.sectionType])) as Record<string, string>, [rows, sectionLabels]);
  const move = useCallback((index: number, direction: -1 | 1) => {
    const target = slots[index + direction];
    if (!target) return;
    const next = arrayMove([...slots], index, index + direction).map((slot, order) => ({ ...slot, order }));
    onChange(next);
  }, [onChange, slots]);
  const dragEnd = useCallback((event: DragEndEvent) => {
    const activeIndex = rows.findIndex(({ id }) => id === String(event.active.id));
    const overIndex = rows.findIndex(({ id }) => id === (event.over ? String(event.over.id) : ''));
    if (activeIndex < 0 || overIndex < 0 || activeIndex === overIndex) return;
    const next = arrayMove([...slots], activeIndex, overIndex).map((slot, order) => ({ ...slot, order }));
    onChange(next);
  }, [onChange, rows, slots]);
  return <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={dragEnd} accessibility={{ announcements: createTemplateSectionAnnouncements(announcementLabels, (id) => labels[id] ?? sectionLabels[id as SectionType] ?? id) }}>
    <SortableContext items={rows.map(({ id }) => id)} strategy={verticalListSortingStrategy}>
      <div className="space-y-2">{slots.map((slot, index) => {
        const rowId = rows[index].id;
        const advanced = advancedRenderer ? advancedRenderer(slot) : (typeof advancedContent === 'function' ? advancedContent(slot) : advancedContent);
        return <SortableSlotRow key={rowId} rowId={rowId} slot={slot} index={index} count={slots.length} label={labels[rowId]} onMove={(direction) => move(index, direction)} onPlacementChange={(placement) => {
          const next = slots.map((candidate, candidateIndex) => candidateIndex === index ? { ...candidate, placement } : candidate);
          onChange(next);
        }} advanced={advanced} labels={announcementLabels} />;
      })}</div>
    </SortableContext>
  </DndContext>;
}
