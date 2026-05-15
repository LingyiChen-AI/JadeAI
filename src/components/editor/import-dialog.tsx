'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslations } from 'next-intl';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useResumeStore } from '@/stores/resume-store';
import { getAIHeaders } from '@/stores/settings-store';
import {
  Upload,
  Loader2,
  CheckCircle2,
  AlertCircle,
  FileJson,
  FileText,
  FileIcon,
} from 'lucide-react';

interface ImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  resumeId: string;
}

type ImportState = 'idle' | 'importing' | 'success' | 'error';
type FileType = 'json' | 'markdown' | 'pdf';

function getHeaders() {
  const fingerprint = typeof window !== 'undefined' ? localStorage.getItem('jade_fingerprint') : null;
  const headers: Record<string, string> = {};
  if (fingerprint) headers['x-fingerprint'] = fingerprint;
  return headers;
}

function getJsonHeaders() {
  const fingerprint = typeof window !== 'undefined' ? localStorage.getItem('jade_fingerprint') : null;
  return {
    'Content-Type': 'application/json',
    ...(fingerprint ? { 'x-fingerprint': fingerprint } : {}),
  };
}

function getFileType(file: File): FileType {
  if (file.name.endsWith('.json')) return 'json';
  if (file.name.endsWith('.md') || file.name.endsWith('.markdown')) return 'markdown';
  if (file.name.endsWith('.pdf')) return 'pdf';
  return 'json';
}

function isSupportedFile(file: File): boolean {
  const ext = file.name.toLowerCase();
  return ext.endsWith('.json') || ext.endsWith('.md') || ext.endsWith('.markdown') || ext.endsWith('.pdf');
}

export function ImportDialog({ open, onOpenChange, resumeId }: ImportDialogProps) {
  const t = useTranslations('import');
  const { currentResume, setResume, save } = useResumeStore();

  const [state, setState] = useState<ImportState>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileType, setFileType] = useState<FileType>('json');
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setState('idle');
      setErrorMessage('');
      setSelectedFile(null);
      setFileType('json');
    }
  }, [open]);

  const handleFileSelect = useCallback((file: File) => {
    if (!isSupportedFile(file)) {
      setState('error');
      setErrorMessage(t('invalidFormat'));
      setSelectedFile(null);
      return;
    }
    setSelectedFile(file);
    setFileType(getFileType(file));
    setState('idle');
    setErrorMessage('');
  }, [t]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelect(file);
  }, [handleFileSelect]);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFileSelect(file);
  }, [handleFileSelect]);

  const handleImport = useCallback(async () => {
    if (!selectedFile || !currentResume) return;

    setState('importing');
    setErrorMessage('');

    try {
      if (fileType === 'pdf') {
        // PDF import: use existing parse API with FormData
        const aiHeaders = getAIHeaders();
        if (!aiHeaders['x-api-key']) {
          setState('error');
          setErrorMessage(t('noApiKey'));
          return;
        }

        const formData = new FormData();
        formData.append('file', selectedFile);
        formData.append('template', currentResume.template);
        formData.append('language', currentResume.language);

        const res = await fetch('/api/resume/parse', {
          method: 'POST',
          headers: { ...getHeaders(), ...aiHeaders },
          body: formData,
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          setState('error');
          setErrorMessage(errData.error || t('error'));
          return;
        }
        const parsedResume = await res.json();

        // Update current resume with parsed sections
        setResume({
          ...currentResume,
          title: parsedResume.title ?? currentResume.title,
          sections: parsedResume.sections,
        });

        // Mark dirty and save
        useResumeStore.setState({ isDirty: true });
        await save();

        setState('success');
        setTimeout(() => onOpenChange(false), 1500);
      } else if (fileType === 'markdown') {
        // Markdown import: use AI to parse
        const aiHeaders = getAIHeaders();
        if (!aiHeaders['x-api-key']) {
          setState('error');
          setErrorMessage(t('noApiKey'));
          return;
        }

        const text = await selectedFile.text();
        const res = await fetch('/api/resume/parse-markdown', {
          method: 'POST',
          headers: { ...getJsonHeaders(), ...aiHeaders },
          body: JSON.stringify({
            content: text,
            template: currentResume.template,
            language: currentResume.language,
          }),
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          setState('error');
          setErrorMessage(errData.error || t('error'));
          return;
        }
        const parsedResume = await res.json();

        // Update current resume with parsed sections
        setResume({
          ...currentResume,
          title: parsedResume.title ?? currentResume.title,
          sections: parsedResume.sections,
        });

        // Mark dirty and save
        useResumeStore.setState({ isDirty: true });
        await save();

        setState('success');
        setTimeout(() => onOpenChange(false), 1500);
      } else {
        // JSON import: existing logic
        const text = await selectedFile.text();
        const data = JSON.parse(text);

        if (!Array.isArray(data.sections)) {
          setState('error');
          setErrorMessage(t('invalidFormat'));
          return;
        }

        setResume({
          ...currentResume,
          title: data.title ?? currentResume.title,
          template: data.template ?? currentResume.template,
          themeConfig: data.themeConfig ?? currentResume.themeConfig,
          sections: data.sections,
        });

        // Mark dirty and save
        useResumeStore.setState({ isDirty: true });
        await save();

        setState('success');
        setTimeout(() => onOpenChange(false), 1500);
      }
    } catch (err: any) {
      setState('error');
      if (err instanceof SyntaxError) {
        setErrorMessage(t('invalidFormat'));
      } else {
        setErrorMessage(err.message || t('error'));
      }
    }
  }, [selectedFile, fileType, currentResume, setResume, save, onOpenChange, t]);

  const isLoading = state === 'importing';

  const renderFileIcon = () => {
    if (fileType === 'pdf') return <FileIcon className="mb-3 h-8 w-8 text-green-500" />;
    if (fileType === 'markdown') return <FileText className="mb-3 h-8 w-8 text-green-500" />;
    return <FileJson className="mb-3 h-8 w-8 text-green-500" />;
  };

  const getLoadingText = () => {
    if (fileType === 'pdf') return t('parsingPdf');
    if (fileType === 'markdown') return t('parsingMarkdown');
    return t('importing');
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !isLoading) onOpenChange(false); }}>
      <DialogContent className="sm:max-w-lg p-0 gap-0 overflow-hidden" onPointerDownOutside={(e) => { if (isLoading) e.preventDefault(); }}>
        <DialogHeader className="px-6 pt-6 pb-0">
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5 text-brand" />
            {t('title')}
          </DialogTitle>
          <DialogDescription>{t('description')}</DialogDescription>
        </DialogHeader>

        <div className="px-6 py-5">
          {(state === 'idle' || state === 'error') && selectedFile && (
            <div className="flex flex-col items-center justify-center overflow-hidden rounded-lg border-2 border-dashed p-8 text-center border-green-300 bg-green-50/50 dark:border-green-700 dark:bg-green-950/20">
              {renderFileIcon()}
              <p className="max-w-full truncate text-sm font-medium text-zinc-700 dark:text-zinc-300">
                {selectedFile.name}
              </p>
              <p className="mt-1 text-xs text-zinc-400">{t('dragHint')}</p>
            </div>
          )}

          {(state === 'idle' || state === 'error') && !selectedFile && (
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`flex cursor-pointer flex-col items-center justify-center overflow-hidden rounded-lg border-2 border-dashed p-8 text-center transition-colors ${
                isDragging
                  ? 'border-brand bg-brand-muted dark:bg-brand-muted'
                  : 'border-zinc-300 hover:border-brand hover:bg-brand-muted/30 dark:border-zinc-600 dark:hover:border-brand dark:hover:bg-brand-muted/10'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".json,.md,.markdown,.pdf"
                onChange={handleInputChange}
                className="hidden"
              />
              <Upload className="mb-3 h-8 w-8 text-zinc-400" />
              <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                {t('selectFile')}
              </p>
              <p className="mt-1 text-xs text-zinc-400">{t('dragHint')}</p>
            </div>
          )}

          {state === 'error' && errorMessage && (
            <div className="flex items-center gap-2 rounded-md bg-red-50 px-3 py-2 dark:bg-red-950/30 mt-3">
              <AlertCircle className="h-4 w-4 shrink-0 text-red-500" />
              <p className="text-sm text-red-600 dark:text-red-400">
                {errorMessage}
              </p>
            </div>
          )}

          {state === 'importing' && (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <Loader2 className="mb-3 h-8 w-8 animate-spin text-brand" />
              <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                {getLoadingText()}
              </p>
            </div>
          )}

          {state === 'success' && (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <CheckCircle2 className="mb-3 h-8 w-8 text-green-500" />
              <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                {t('success')}
              </p>
            </div>
          )}
        </div>

        <DialogFooter className="border-t border-zinc-100 px-6 py-4 dark:border-zinc-800">
          {(state === 'idle' || state === 'error') && (
            <>
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                className="cursor-pointer"
              >
                {t('cancel')}
              </Button>
              <Button
                onClick={handleImport}
                disabled={!selectedFile || isLoading}
                className="cursor-pointer bg-brand hover:bg-brand-hover"
              >
                {t('importBtn')}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
