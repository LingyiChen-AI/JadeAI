'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useAuth } from './use-auth';
import { createPdfSnapshot } from '@/lib/pdf/snapshot';
import { requestResumePdf } from '@/lib/pdf/request-resume-pdf';
import type { PdfLayout } from '@/lib/pdf/layout';
import type { Resume } from '@/types/resume';

/** Export current data only when requested. Editing never starts PDF generation. */
export function usePdfExport(resume: Resume) {
  const { user } = useAuth();
  const identityKey = user?.id ?? null;
  const [isExporting, setIsExporting] = useState(false);
  const pending = useRef<AbortController | null>(null);
  useEffect(() => () => { pending.current?.abort(); }, [resume, identityKey]);

  const exportPdf = useCallback(async (filename: string, layout: PdfLayout, beforeExport?: () => Promise<void>) => {
    if (pending.current) throw new Error('PDF download is already in progress');
    const controller = new AbortController();
    pending.current = controller;
    setIsExporting(true);
    try {
      await beforeExport?.();
      controller.signal.throwIfAborted();
      const blob = await requestResumePdf(resume.id, createPdfSnapshot(resume), layout, {
        signal: controller.signal,
        fingerprint: localStorage.getItem('jade_fingerprint'),
      });
      controller.signal.throwIfAborted();
      const url = URL.createObjectURL(blob);
      try {
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        link.remove();
      } finally { URL.revokeObjectURL(url); }
    } finally {
      if (pending.current === controller) pending.current = null;
      setIsExporting(false);
    }
  }, [resume]);
  return { exportPdf, isExporting };
}
