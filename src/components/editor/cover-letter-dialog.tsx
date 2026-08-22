'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2, AlertTriangle, Copy, Check, Download, RotateCcw, FileText } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { LanguageSelect } from '@/components/ui/language-select';
import { cn } from '@/lib/utils';
import { getAIHeaders } from '@/stores/settings-store';
import { useResumeStore } from '@/stores/resume-store';

interface CoverLetterDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  resumeId: string;
}

interface CoverLetterResult {
  title: string;
  content: string;
}

type Tone = 'formal' | 'friendly' | 'confident';

export function CoverLetterDialog({ open, onOpenChange, resumeId }: CoverLetterDialogProps) {
  const t = useTranslations('coverLetter');

  const [jobDescription, setJobDescription] = useState('');
  const [tone, setTone] = useState<Tone>('formal');
  const [language, setLanguage] = useState('en');
  const [isGenerating, setIsGenerating] = useState(false);
  const [result, setResult] = useState<CoverLetterResult | null>(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  const handleGenerate = async () => {
    if (!jobDescription.trim()) return;
    setIsGenerating(true);
    setError('');

    try {
      // 服务端按 resumeId 回库读简历，先把未保存的改动落库，否则写的是上一版
      await useResumeStore.getState().flushSave();
      const fingerprint = typeof window !== 'undefined' ? localStorage.getItem('jade_fingerprint') : null;
      const res = await fetch('/api/ai/cover-letter', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(fingerprint ? { 'x-fingerprint': fingerprint } : {}),
          ...getAIHeaders(),
        },
        body: JSON.stringify({ resumeId, jobDescription, tone, language }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Generation failed');
      }

      const data: CoverLetterResult = await res.json();
      setResult(data);
    } catch (err: any) {
      setError(err.message || 'Failed to generate cover letter');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopy = async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
    }
  };

  const handleDownload = () => {
    if (!result) return;
    const blob = new Blob([result.content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${result.title || 'cover-letter'}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleGenerateAgain = () => {
    setResult(null);
    setError('');
    setCopied(false);
  };

  const handleClose = () => {
    onOpenChange(false);
    setTimeout(() => {
      setResult(null);
      setJobDescription('');
      setTone('formal');
      setLanguage('en');
      setError('');
      setCopied(false);
    }, 200);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); }}>
      <DialogContent className="sm:max-w-2xl p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-0">
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-brand" />
            {t('title')}
          </DialogTitle>
          <DialogDescription>{t('description')}</DialogDescription>
        </DialogHeader>

        {!result ? (
          /* ---------- Input State ---------- */
          <div className="px-6 py-4 space-y-4">
            {/* Job Description */}
            <Textarea
              placeholder={t('jdPlaceholder')}
              value={jobDescription}
              onChange={(e) => setJobDescription(e.target.value)}
              rows={6}
              className="h-[160px] max-h-[160px] overflow-y-auto resize-none text-sm"
              disabled={isGenerating}
            />

            {/* Tone Selector */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                {t('tone')}
              </label>
              <div className="flex gap-2">
                {(['formal', 'friendly', 'confident'] as Tone[]).map((t_tone) => (
                  <button
                    key={t_tone}
                    type="button"
                    className={cn(
                      'flex-1 cursor-pointer rounded-lg border px-3 py-2 text-sm font-medium transition-colors',
                      tone === t_tone
                        ? 'border-brand bg-brand-muted text-brand dark:bg-brand-muted dark:text-brand dark:border-brand'
                        : 'border-zinc-200 text-zinc-600 hover:border-zinc-300 dark:border-zinc-700 dark:text-zinc-400 dark:hover:border-zinc-600'
                    )}
                    onClick={() => setTone(t_tone)}
                    disabled={isGenerating}
                  >
                    {t(`tone${t_tone.charAt(0).toUpperCase() + t_tone.slice(1)}` as any)}
                  </button>
                ))}
              </div>
            </div>

            {/* Language */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                {t('language')}
              </label>
              <LanguageSelect value={language} onValueChange={setLanguage} disabled={isGenerating} />
            </div>

            {error && (
              <div className="flex items-center gap-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-950/30 dark:text-red-400">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                {error}
              </div>
            )}

            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={handleClose}
                className="cursor-pointer"
              >
                {t('close')}
              </Button>
              <Button
                onClick={handleGenerate}
                disabled={isGenerating || !jobDescription.trim()}
                className="cursor-pointer bg-brand hover:bg-brand-hover"
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                    {t('generating')}
                  </>
                ) : (
                  t('generate')
                )}
              </Button>
            </div>
          </div>
        ) : (
          /* ---------- Result State ---------- */
          <>
            <ScrollArea className="max-h-[60vh]">
              <div className="px-6 py-4 space-y-4">
                {/* Title */}
                <h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
                  {result.title}
                </h3>
                {/* Content */}
                <div className="rounded-lg border border-zinc-150 bg-zinc-50/50 p-4 dark:border-zinc-800 dark:bg-zinc-900/50">
                  <p className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
                    {result.content}
                  </p>
                </div>
              </div>
            </ScrollArea>

            {/* Footer */}
            <div className="flex justify-between gap-2 border-t border-zinc-100 px-6 py-4 dark:border-zinc-800">
              <Button
                variant="outline"
                onClick={handleGenerateAgain}
                className="cursor-pointer gap-1.5"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                {t('generateAgain')}
              </Button>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={handleCopy}
                  className="cursor-pointer gap-1.5"
                >
                  {copied ? (
                    <>
                      <Check className="h-3.5 w-3.5 text-green-500" />
                      {t('copied')}
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5" />
                      {t('copyToClipboard')}
                    </>
                  )}
                </Button>
                <Button
                  variant="outline"
                  onClick={handleDownload}
                  className="cursor-pointer gap-1.5"
                >
                  <Download className="h-3.5 w-3.5" />
                  {t('downloadTxt')}
                </Button>
                <Button
                  variant="outline"
                  onClick={handleClose}
                  className="cursor-pointer"
                >
                  {t('close')}
                </Button>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
