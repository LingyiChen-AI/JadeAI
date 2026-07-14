'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useResumeStore } from '@/stores/resume-store';
import { useEditorStore } from '@/stores/editor-store';
import type { ResumeSection, SectionContent } from '@/types/resume';

function getHeaders() {
  const fingerprint = typeof window !== 'undefined' ? localStorage.getItem('jade_fingerprint') : null;
  return {
    'Content-Type': 'application/json',
    ...(fingerprint ? { 'x-fingerprint': fingerprint } : {}),
  };
}

export function useEditor(resumeId: string) {
  const { setResume, sections, currentResume, updateSection, addSection, removeSection, reorderSections } = useResumeStore();
  const { pushSnapshot } = useEditorStore();
  const loadGenerationRef = useRef(0);
  const [serverHead, setServerHead] = useState<{
    resumeId: string;
    userId: string;
    revision: number;
    sections: ResumeSection[];
  } | null>(null);
  const loadResume = useCallback(async () => {
    const generation = ++loadGenerationRef.current;
    try {
      const res = await fetch(`/api/resume/${resumeId}`, { headers: getHeaders() });
      if (res.ok) {
        const data = await res.json();
        if (generation !== loadGenerationRef.current) return;
        const loadedResume = {
          ...data,
          sections: data.sections || [],
          themeConfig: data.themeConfig || {},
          createdAt: new Date(data.createdAt),
          updatedAt: new Date(data.updatedAt),
        };
        setResume(loadedResume);
        const normalized = useResumeStore.getState().currentResume;
        setServerHead({
          resumeId: loadedResume.id,
          userId: loadedResume.userId,
          revision: loadedResume.revision,
          sections: structuredClone(normalized?.sections ?? loadedResume.sections),
        });
      }
    } catch (error) {
      console.error('Failed to load resume:', error);
    }
  }, [resumeId, setResume]);

  useEffect(() => {
    // The async loader updates the head only after the network response resolves.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadResume();
    return () => {
      loadGenerationRef.current += 1;
      void cleanupEditorSession(resumeId);
    };
  }, [loadResume, resumeId]);

  const handleUpdateSection = useCallback(
    (sectionId: string, content: Partial<SectionContent>) => {
      pushSnapshot(sections);
      updateSection(sectionId, content);
    },
    [sections, pushSnapshot, updateSection]
  );

  const handleAddSection = useCallback(
    (section: ResumeSection) => {
      pushSnapshot(sections);
      addSection(section);
    },
    [sections, pushSnapshot, addSection]
  );

  const handleRemoveSection = useCallback(
    (sectionId: string) => {
      pushSnapshot(sections);
      removeSection(sectionId);
    },
    [sections, pushSnapshot, removeSection]
  );

  const handleReorder = useCallback(
    (newSections: ResumeSection[]) => {
      pushSnapshot(sections);
      reorderSections(newSections);
    },
    [sections, pushSnapshot, reorderSections]
  );

  return {
    resume: currentResume,
    sections,
    updateSection: handleUpdateSection,
    addSection: handleAddSection,
    removeSection: handleRemoveSection,
    reorderSections: handleReorder,
    loadResume,
    serverHead,
  };
}

export async function cleanupEditorSession(resumeId: string): Promise<void> {
  useEditorStore.getState().reset();
  const session = useResumeStore.getState();
  if (session.currentResume?.id !== resumeId) return;
  if (!session.isDirty) {
    session.reset();
    return;
  }

  await session.save();
  const current = useResumeStore.getState();
  if (current.currentResume?.id === resumeId && !current.isDirty) current.reset();
}
