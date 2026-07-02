'use client';

import { GripVertical, Plus, X } from 'lucide-react';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

interface EditableListProps {
  label: string;
  items: string[];
  onChange: (items: string[]) => void;
  placeholder?: string;
  sortable?: boolean;
  dragLabel?: string;
}

export function EditableList({ label, items, onChange, placeholder, sortable = false, dragLabel }: EditableListProps) {
  const currentItems = items || [];
  const itemIds = currentItems.map((_, index) => `item-${index}`);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const addItem = () => onChange([...(items || []), '']);

  const updateItem = (index: number, value: string) => {
    const updated = [...(items || [])];
    updated[index] = value;
    onChange(updated);
  };

  const removeItem = (index: number) => {
    onChange((items || []).filter((_, i) => i !== index));
  };

  const moveItem = (from: number, to: number) => {
    if (from === to) return;
    const updated = [...(items || [])];
    const [item] = updated.splice(from, 1);
    updated.splice(to, 0, item);
    onChange(updated);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const from = itemIds.indexOf(active.id as string);
    const to = itemIds.indexOf(over.id as string);
    if (from === -1 || to === -1) return;

    moveItem(from, to);
  };

  const renderItem = (item: string, index: number, id?: string) => {
    const content = (
      <>
        <Input
          value={item}
          onChange={(e) => updateItem(index, e.target.value)}
          placeholder={placeholder}
          className="h-8 text-sm"
        />
        <Button
          variant="ghost"
          size="sm"
          className="h-8 w-8 shrink-0 cursor-pointer p-0 text-zinc-400 hover:text-red-500"
          onClick={() => removeItem(index)}
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </>
    );

    if (!sortable || !id) {
      return (
        <div key={index} className="flex items-center gap-1">
          {content}
        </div>
      );
    }

    return (
      <SortableListItem key={id} id={id} dragLabel={dragLabel}>
        {content}
      </SortableListItem>
    );
  };

  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400">{label}</label>
      <div className="space-y-1.5">
        {sortable ? (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
              <div className="space-y-1.5">
                {currentItems.map((item, index) => renderItem(item, index, itemIds[index]))}
              </div>
            </SortableContext>
          </DndContext>
        ) : (
          currentItems.map((item, index) => renderItem(item, index))
        )}
        <Button
          variant="outline"
          size="sm"
          onClick={addItem}
          className="h-7 cursor-pointer gap-1 text-xs"
        >
          <Plus className="h-3 w-3" />
          Add
        </Button>
      </div>
    </div>
  );
}

interface SortableListItemProps {
  id: string;
  dragLabel?: string;
  children: React.ReactNode;
}

function SortableListItem({ id, dragLabel, children }: SortableListItemProps) {
  const {
    attributes,
    listeners,
    setActivatorNodeRef,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="flex items-center gap-1">
      <button
        ref={setActivatorNodeRef}
        type="button"
        className="shrink-0 cursor-grab text-zinc-300 active:cursor-grabbing"
        aria-label={dragLabel}
        title={dragLabel}
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4" />
      </button>
      {children}
    </div>
  );
}
