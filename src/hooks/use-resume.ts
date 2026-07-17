'use client';

import { useState, useCallback } from 'react';
import type { Resume } from '@/types/resume';
import type { ClientTemplateBindingChoice } from '@/lib/templates/apply-template-binding.server';

function getHeaders() {
  const fingerprint = typeof window !== 'undefined' ? localStorage.getItem('jade_fingerprint') : null;
  return {
    'Content-Type': 'application/json',
    ...(fingerprint ? { 'x-fingerprint': fingerprint } : {}),
  };
}

export function useResume() {
  const [resumes, setResumes] = useState<Resume[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const fetchResumes = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/resume', { headers: getHeaders() });
      if (res.ok) {
        const data = await res.json();
        setResumes(data);
      }
    } catch (error) {
      console.error('Failed to fetch resumes:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const createResume = useCallback(async (data: { title?: string; template?: string; language?: string; binding?: ClientTemplateBindingChoice }) => {
    try {
      const res = await fetch('/api/resume', {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(data),
      });
      if (res.ok) {
        const resume = await res.json();
        setResumes((prev) => [resume, ...prev]);
        return resume;
      }
    } catch (error) {
      console.error('Failed to create resume:', error);
    }
    return null;
  }, []);

  const deleteResume = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/resume/${id}`, {
        method: 'DELETE',
        headers: getHeaders(),
      });
      if (res.ok) {
        setResumes((prev) => prev.filter((r) => r.id !== id));
        return true;
      }
    } catch (error) {
      console.error('Failed to delete resume:', error);
    }
    return false;
  }, []);

  const renameResume = useCallback(async (id: string, title: string) => {
    try {
      const res = await fetch(`/api/resume/${id}`, {
        method: 'PUT',
        headers: getHeaders(),
        body: JSON.stringify({ title }),
      });
      if (res.ok) {
        setResumes((prev) => prev.map((r) => r.id === id ? { ...r, title } : r));
        return true;
      }
    } catch (error) {
      console.error('Failed to rename resume:', error);
    }
    return false;
  }, []);

  const duplicateResume = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/resume/${id}/duplicate`, {
        method: 'POST',
        headers: getHeaders(),
      });
      if (res.ok) {
        const resume = await res.json();
        setResumes((prev) => [resume, ...prev]);
        return resume;
      }
    } catch (error) {
      console.error('Failed to duplicate resume:', error);
    }
    return null;
  }, []);

  return {
    resumes,
    isLoading,
    fetchResumes,
    createResume,
    deleteResume,
    renameResume,
    duplicateResume,
  };
}
