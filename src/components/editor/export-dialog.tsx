'use client';

import { useState, useEffect, useCallback, useRef, useId } from 'react';
import { useTranslations } from 'next-intl';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ResumeSaveError } from '@/stores/resume-store';
import { usePdfExport } from '@/hooks/use-pdf-export';
import { PdfExportError } from '@/lib/pdf/request-resume-pdf';
import type { PdfLayout } from '@/lib/pdf/layout';
import type { Resume } from '@/types/resume';
import { FileDown, FileText, Globe, AlignLeft, Braces, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';

interface ExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  resume: Resume;
  beforeExport?: () => Promise<void>;
  includeTimestamp?: boolean;
}

type ExportFormat = 'pdf' | 'docx' | 'html' | 'txt' | 'json';
type ExportState = 'idle' | 'exporting' | 'success' | 'error';
const FORMAT_OPTIONS = [
  { value: 'docx', icon: FileText, labelKey: 'docx', descKey: 'docxDescription' },
  { value: 'html', icon: Globe, labelKey: 'html', descKey: 'htmlDescription' },
  { value: 'txt', icon: AlignLeft, labelKey: 'txt', descKey: 'txtDescription' },
  { value: 'json', icon: Braces, labelKey: 'json', descKey: 'jsonDescription' },
] as const;
const PDF_OPTIONS = [
  { value: 'a4', labelKey: 'pdfA4' },
  { value: 'fit-one-page', labelKey: 'pdfFitOnePage' },
  { value: 'continuous', labelKey: 'pdfContinuous' },
] as const;

export function ExportDialog({ open, onOpenChange, resume, beforeExport, includeTimestamp = true }: ExportDialogProps) {
  const t = useTranslations('export');
  const groupId = useId();
  const [selectedFormat, setSelectedFormat] = useState<ExportFormat>('pdf');
  const [selectedLayout, setSelectedLayout] = useState<PdfLayout>('a4');
  const [state, setState] = useState<ExportState>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [canPrintFallback, setCanPrintFallback] = useState(false);
  const [failedResume, setFailedResume] = useState<Resume | null>(null);
  const { exportPdf, isExporting } = usePdfExport(resume);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const request = useRef<AbortController | null>(null);
  const busy = useRef(false);
  const current = useRef(resume);

  useEffect(() => {
    current.current = resume;
  }, [resume]);
  useEffect(() => {
    if (open) {
      setState('idle');
      setErrorMessage('');
      setSelectedFormat('pdf');
      setSelectedLayout('a4');
      setCanPrintFallback(false);
    }
    return () => { if (closeTimer.current) clearTimeout(closeTimer.current); };
  }, [open]);
  useEffect(() => () => { request.current?.abort(); }, [resume.id]);

  // Browser printing is an explicit alternative; it does not reproduce PDF layouts.
  const handlePrintFallback = useCallback(async () => {
    if (busy.current || failedResume !== resume) return;
    busy.current = true;
    setState('exporting');
    try {
      await beforeExport?.();
      if (current.current !== failedResume) {
        throw new DOMException('Resume changed before printing', 'AbortError');
      }
      const controller = new AbortController();
      request.current = controller;
      const fingerprint = localStorage.getItem('jade_fingerprint');
      const res = await fetch(`/api/resume/${encodeURIComponent(resume.id)}/export?format=html&forPrint=true`, {
        headers: { ...(fingerprint ? { 'x-fingerprint': fingerprint } : {}) }, signal: controller.signal,
      });
      if (!res.ok) throw new Error(t('error'));
      const html = await res.text();
      if (controller.signal.aborted || current.current !== failedResume) {
        throw new DOMException('Resume changed before printing', 'AbortError');
      }
      const iframe = document.createElement('iframe');
      iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
      iframe.setAttribute('aria-hidden', 'true');
      iframe.onload = () => {
        const win = iframe.contentWindow;
        if (!win) { iframe.remove(); return; }
        setTimeout(() => {
          win.focus();
          win.print();
          setTimeout(() => iframe.remove(), 60_000);
        }, 400);
      };
      iframe.srcdoc = html;
      document.body.appendChild(iframe);
      onOpenChange(false);
      setState('idle');
    } catch (err) {
      setState('error');
      setCanPrintFallback(false);
      setErrorMessage(err instanceof DOMException && err.name === 'AbortError' ? t('resumeChanged') : err instanceof Error ? err.message : t('error'));
    } finally { busy.current = false; }
  }, [resume, failedResume, beforeExport, onOpenChange, t]);

  const handleExport = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    let saved = !beforeExport;
    const resumeId = resume.id;
    const assertCurrent = () => {
      if (current.current !== resume) {
        throw new DOMException('Resume changed during export', 'AbortError');
      }
    };
    const save = async () => { await beforeExport?.(); saved = true; assertCurrent(); };
    setState('exporting');
    setErrorMessage('');
    setCanPrintFallback(false);
    try {
      const title = resume.title || 'resume';
      const now = new Date();
      const timestamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;
      const filename = `${title}${includeTimestamp ? `-${timestamp}` : ''}.${selectedFormat}`;
      if (selectedFormat === 'pdf') {
        await exportPdf(filename, selectedLayout, save);
      } else {
        await save();
        const controller = new AbortController();
        request.current = controller;
        const fingerprint = localStorage.getItem('jade_fingerprint');
        const res = await fetch(`/api/resume/${encodeURIComponent(resumeId)}/export?format=${selectedFormat}`, {
          headers: { ...(fingerprint ? { 'x-fingerprint': fingerprint } : {}) }, signal: controller.signal,
        });
        if (!res.ok) {
          const data: unknown = await res.json().catch(() => null);
          throw new Error(data && typeof data === 'object' && 'error' in data && typeof data.error === 'string' ? data.error : t('error'));
        }
        const blob = await res.blob();
        assertCurrent();
        if (controller.signal.aborted) throw new DOMException('Export cancelled', 'AbortError');
        const url = URL.createObjectURL(blob);
        try {
          const a = document.createElement('a');
          a.href = url;
          a.download = filename;
          document.body.appendChild(a);
          a.click();
          a.remove();
        } finally { URL.revokeObjectURL(url); }
      }
      setState('success');
      closeTimer.current = setTimeout(() => onOpenChange(false), 1500);
    } catch (err: unknown) {
      setState('error');
      const cancelled = err instanceof DOMException && err.name === 'AbortError';
      const message = err instanceof PdfExportError
        ? t(err.code, { fields: err.fields.join(', ') || err.message, reason: err.message })
        : err instanceof Error ? err.message : t('error');
      setErrorMessage(cancelled ? t('resumeChanged') : message);
      setFailedResume(resume);
      const renderFailed = err instanceof PdfExportError && (err.code === 'pdfRenderFailed' || err.code === 'pdfTimeout');
      setCanPrintFallback(saved && !(err instanceof ResumeSaveError) && !cancelled && renderFailed && selectedFormat === 'pdf');
    } finally { busy.current = false; }
  }, [resume, selectedFormat, selectedLayout, beforeExport, exportPdf, includeTimestamp, onOpenChange, t]);

  const isLoading = state === 'exporting' || isExporting;
  const selectedCard = 'border-brand bg-brand-muted dark:border-brand dark:bg-brand-muted';
  const idleCard = 'border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-900';
  const canPrint = canPrintFallback && failedResume === resume;
  return (
    <Dialog open={open} onOpenChange={value => { if (!value && !isLoading) onOpenChange(false); }}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] gap-0 overflow-y-auto p-0 sm:max-w-lg">
        <DialogHeader className="px-6 pb-0 pt-6">
          <DialogTitle className="flex items-center gap-2"><FileDown className="size-5 text-brand" />{t('title')}</DialogTitle>
          <DialogDescription>{t('description')}</DialogDescription>
        </DialogHeader>
        <div className="px-6 py-5">
          {state === 'idle' && (
            <div aria-label={t('description')} className="grid grid-cols-[minmax(0,1.35fr)_repeat(2,minmax(0,1fr))] gap-2 sm:grid-cols-3 sm:gap-3">
              <div className={`row-span-2 min-w-0 rounded-lg border-2 p-2 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand has-[:focus-visible]:ring-offset-2 has-[:focus-visible]:ring-offset-background sm:p-3 ${selectedFormat === 'pdf' ? selectedCard : idleCard}`}>
                <button type="button" aria-pressed={selectedFormat === 'pdf'} onClick={() => setSelectedFormat('pdf')}
                  className="flex w-full cursor-pointer flex-col items-center gap-2 rounded-md py-1 text-center focus-visible:outline-none">
                  <FileDown className={`size-6 ${selectedFormat === 'pdf' ? 'text-brand' : 'text-muted-foreground'}`} />
                  <span className="text-sm font-medium">{t('pdf')}</span>
                  <span className="text-xs text-muted-foreground">{t('pdfDescription')}</span>
                </button>
                {/* Keep native fieldset contents above the card's focus-ring paint layer. */}
                <fieldset className="relative mt-3 space-y-1">
                  <legend className="sr-only">{t('pdfLayout')}</legend>
                  {PDF_OPTIONS.map(option => (
                    <label key={option.value} title={option.value === 'fit-one-page' ? t('pdfOnePageTooltip') : undefined}
                      className="flex cursor-pointer items-start gap-1.5 rounded-md px-1 py-2 text-xs leading-4 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand sm:gap-2">
                      <input type="radio" name={`${groupId}-pdf-layout`} value={option.value}
                        checked={selectedLayout === option.value && selectedFormat === 'pdf'}
                        onChange={() => { setSelectedFormat('pdf'); setSelectedLayout(option.value); }}
                        className="mt-0.5 size-3 shrink-0 accent-brand" />
                      <span>{t(option.labelKey)}</span>
                    </label>
                  ))}
                </fieldset>
              </div>
              {FORMAT_OPTIONS.map(format => {
                const Icon = format.icon;
                const selected = selectedFormat === format.value;
                return <button key={format.value} type="button" aria-pressed={selected} onClick={() => setSelectedFormat(format.value)}
                  className={`flex min-w-0 cursor-pointer flex-col items-center gap-2 rounded-lg border-2 px-2 py-4 text-center transition-colors hover:border-brand hover:bg-brand-muted/50 focus-visible:outline-brand sm:p-4 ${selected ? selectedCard : idleCard}`}>
                  <Icon className={`size-6 ${selected ? 'text-brand' : 'text-muted-foreground'}`} />
                  <span className="text-sm font-medium">{t(format.labelKey)}</span>
                  <span className="text-xs text-muted-foreground">{t(format.descKey)}</span>
                </button>;
              })}
            </div>
          )}
          {state === 'exporting' && <div role="status" className="flex flex-col items-center justify-center py-8 text-center">
            <Loader2 className="mb-3 size-8 animate-spin text-brand" /><p className="text-sm font-medium text-muted-foreground">{t('exporting')}</p>
          </div>}
          {state === 'success' && <div role="status" className="flex flex-col items-center justify-center py-8 text-center">
            <CheckCircle2 className="mb-3 size-8 text-green-500" /><p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">{t('success')}</p>
          </div>}
          {state === 'error' && <div role="alert" className="flex flex-col items-center justify-center py-6 text-center">
            <AlertCircle className="mb-3 size-8 text-destructive" /><p className="break-all text-sm font-medium text-destructive">{errorMessage || t('error')}</p>
            {canPrint && <>
              <p className="mt-3 text-xs text-muted-foreground">{t('pdfFailedHint')}</p>
              <p className="mt-2 text-xs text-muted-foreground">{t('printFallbackLimit')}</p>
              <Button variant="outline" onClick={handlePrintFallback} className="mt-3 cursor-pointer gap-1.5"><FileDown className="size-3.5" />{t('printFallback')}</Button>
            </>}
          </div>}
        </div>
        <DialogFooter className="border-t px-6 py-4">
          {(state === 'idle' || state === 'error') && <>
            <Button variant="outline" onClick={() => onOpenChange(false)} className="cursor-pointer">{t('cancel')}</Button>
            <Button onClick={handleExport} disabled={isLoading} className="cursor-pointer bg-brand hover:bg-brand-hover">{t('export')}</Button>
          </>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
