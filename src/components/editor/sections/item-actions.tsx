'use client';

import { ArrowDown, ArrowUp, Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ItemActionsProps {
  index: number;
  total: number;
  labels: {
    insertAbove: string;
    moveUp: string;
    moveDown: string;
    remove: string;
  };
  onInsertAbove: () => void;
  onMove: (direction: -1 | 1) => void;
  onRemove: () => void;
}

export function ItemActions({
  index,
  total,
  labels,
  onInsertAbove,
  onMove,
  onRemove,
}: ItemActionsProps) {
  return (
    <div className="flex items-center gap-1">
      <Button variant="ghost" size="sm" className="h-7 w-7 cursor-pointer p-0 text-zinc-400 hover:text-brand" title={labels.insertAbove} onClick={onInsertAbove}>
        <Plus className="h-3.5 w-3.5" />
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className="h-7 w-7 cursor-pointer p-0 text-zinc-400 hover:text-brand disabled:cursor-not-allowed disabled:opacity-30"
        title={labels.moveUp}
        disabled={index === 0}
        onClick={() => onMove(-1)}
      >
        <ArrowUp className="h-3.5 w-3.5" />
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className="h-7 w-7 cursor-pointer p-0 text-zinc-400 hover:text-brand disabled:cursor-not-allowed disabled:opacity-30"
        title={labels.moveDown}
        disabled={index === total - 1}
        onClick={() => onMove(1)}
      >
        <ArrowDown className="h-3.5 w-3.5" />
      </Button>
      <Button variant="ghost" size="sm" className="h-7 w-7 cursor-pointer p-0 text-zinc-400 hover:text-red-500" title={labels.remove} onClick={onRemove}>
        <X className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
