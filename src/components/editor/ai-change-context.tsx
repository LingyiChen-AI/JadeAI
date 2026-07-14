'use client';

import { createContext, useContext, useMemo } from 'react';
import { useEditorStore } from '@/stores/editor-store';
import type { AIFieldChange } from '@/types/editor';

interface AIChangeContextValue {
  sectionId: string;
  changes: AIFieldChange[];
  getChange: (fieldPath: string) => AIFieldChange | undefined;
  clearChange: (fieldPath: string) => void;
}

const AIChangeContext = createContext<AIChangeContextValue | null>(null);

export function AIChangeProvider({ sectionId, children }: { sectionId: string; children: React.ReactNode }) {
  const allChanges = useEditorStore((state) => state.aiChanges);
  const changes = useMemo(() => allChanges.filter((change) => change.sectionId === sectionId), [allChanges, sectionId]);
  const clearAiChangePath = useEditorStore((state) => state.clearAiChangePath);

  const value = useMemo<AIChangeContextValue>(() => ({
    sectionId,
    changes,
    getChange: (fieldPath) => changes.find((change) =>
      change.fieldPath === fieldPath
      || change.fieldPath.startsWith(`${fieldPath}.`)
      || (change.kind === 'item-added' && fieldPath.startsWith(`${change.fieldPath}.`))
    ),
    clearChange: (fieldPath) => clearAiChangePath(sectionId, fieldPath),
  }), [changes, clearAiChangePath, sectionId]);

  return <AIChangeContext.Provider value={value}>{children}</AIChangeContext.Provider>;
}

export function useAIChangeField(fieldPath?: string) {
  const context = useContext(AIChangeContext);
  if (!context || !fieldPath) {
    return { change: undefined, clear: () => undefined };
  }
  return {
    change: context.getChange(fieldPath),
    clear: () => context.clearChange(fieldPath),
  };
}

export function useAISectionChanges() {
  return useContext(AIChangeContext);
}
