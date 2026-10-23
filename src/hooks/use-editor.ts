'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useFingerprint } from './use-fingerprint';
import { useResumeStore } from '@/stores/resume-store';
import { useEditorStore } from '@/stores/editor-store';
import type { ResumeSection } from '@/types/resume';

export function useEditor(resumeId: string) {
  const { fingerprint, isLoading: fingerprintLoading } = useFingerprint();
  const [failedId, setFailedId] = useState<string | null>(null);
  const request = useRef<AbortController | null>(null);
  const { setResume, sections, currentResume, updateSection, addSection, removeSection, reorderSections, reset: resetResume } = useResumeStore();
  const { pushSnapshot, reset: resetEditor } = useEditorStore();

  const loadResume = useCallback(async () => {
    if (fingerprintLoading) return;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setFailedId(null);
    try {
      const res = await fetch(`/api/resume/${resumeId}`, {
        headers: fingerprint ? { 'x-fingerprint': fingerprint } : {},
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`Resume loading failed (${res.status})`);
      const data = await res.json();
      if (!controller.signal.aborted) {
        setResume({
          ...data,
          sections: data.sections || [],
          themeConfig: data.themeConfig || {},
          createdAt: new Date(data.createdAt),
          updatedAt: new Date(data.updatedAt),
        });
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        console.error('Failed to load resume:', error);
        setFailedId(resumeId);
      }
    }
  }, [resumeId, setResume, fingerprintLoading, fingerprint]);

  useEffect(() => {
    void loadResume();
    return () => {
      request.current?.abort();
      resetResume();
      resetEditor();
    };
  }, [loadResume, resetResume, resetEditor]);

  const handleUpdateSection = useCallback(
    (sectionId: string, content: Partial<ResumeSection['content']>) => {
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
    resume: currentResume?.id === resumeId ? currentResume : null,
    loadError: failedId === resumeId,
    sections,
    updateSection: handleUpdateSection,
    addSection: handleAddSection,
    removeSection: handleRemoveSection,
    reorderSections: handleReorder,
    loadResume,
  };
}
