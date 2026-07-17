'use client';

import { useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { useRouter } from '@/i18n/routing';
import { Loader2, CheckCircle2, AlertTriangle, Sparkles } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { LanguageSelect } from '@/components/ui/language-select';
import { getAIHeaders } from '@/stores/settings-store';
import { TemplateSelector } from '@/components/templates/template-selector';
import type { ClientTemplateBindingChoice } from '@/lib/templates/apply-template-binding.server';

interface GenerateResumeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: () => void;
}

type GenerateState = 'form' | 'generating' | 'success' | 'error';

export function GenerateResumeDialog({ open, onOpenChange, onCreated }: GenerateResumeDialogProps) {
  const t = useTranslations('generateResume');
  const locale = useLocale();
  const router = useRouter();

  const [jobTitle, setJobTitle] = useState('');
  const [yearsOfExperience, setYearsOfExperience] = useState<number | ''>('');
  const [skills, setSkills] = useState('');
  const [industry, setIndustry] = useState('');
  const [experience, setExperience] = useState('');
  const [binding, setBinding] = useState<ClientTemplateBindingChoice>({ kind: 'legacy', templateSlug: 'classic' });
  const [language, setLanguage] = useState(locale);
  const [state, setState] = useState<GenerateState>('form');
  const [error, setError] = useState('');
  const [result, setResult] = useState<{ resumeId: string; title: string } | null>(null);

  const handleGenerate = async () => {
    if (!jobTitle.trim()) return;
    setState('generating');
    setError('');

    try {
      const fingerprint = typeof window !== 'undefined' ? localStorage.getItem('jade_fingerprint') : null;
      const res = await fetch('/api/ai/generate-resume', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(fingerprint ? { 'x-fingerprint': fingerprint } : {}),
          ...getAIHeaders(),
        },
        body: JSON.stringify({
          jobTitle: jobTitle.trim(),
          yearsOfExperience: yearsOfExperience === '' ? undefined : yearsOfExperience,
          skills: skills.trim()
            ? skills.split(/[\s,，、]+/).map(s => s.trim()).filter(Boolean)
            : undefined,
          industry: industry.trim() || undefined,
          experience: experience.trim() || undefined,
          binding,
          language,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Generation failed');
      }

      const data = await res.json();
      setResult(data);
      setState('success');
      onCreated?.();
    } catch (err: unknown) {
      setError(err instanceof Error && err.message ? err.message : 'Failed to generate resume');
      setState('error');
    }
  };

  const handleOpenResume = () => {
    if (result) {
      onOpenChange(false);
      router.push(`/editor/${result.resumeId}`);
    }
  };

  const handleRetry = () => {
    setState('form');
    setError('');
  };

  const handleClose = () => {
    onOpenChange(false);
    setTimeout(() => {
      setState('form');
      setJobTitle('');
      setYearsOfExperience('');
      setSkills('');
      setIndustry('');
      setExperience('');
      setBinding({ kind: 'legacy', templateSlug: 'classic' });
      setLanguage(locale);
      setError('');
      setResult(null);
    }, 200);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); }}>
      <DialogContent className="sm:max-w-2xl p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-0">
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-brand" />
            {t('title')}
          </DialogTitle>
          <DialogDescription>{t('description')}</DialogDescription>
        </DialogHeader>

        <div className="max-h-[70vh] overflow-y-auto px-6 py-4 space-y-4">
          {state === 'form' && (
            <>
              {/* Row 1: Job Title + Years + Industry */}
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                    {t('jobTitle')} *
                  </label>
                  <Input
                    value={jobTitle}
                    onChange={(e) => setJobTitle(e.target.value)}
                    placeholder={t('jobTitle')}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                    {t('yearsOfExperience')}
                  </label>
                  <Input
                    type="number"
                    min={0}
                    max={50}
                    value={yearsOfExperience}
                    onChange={(e) => setYearsOfExperience(e.target.value ? Number(e.target.value) : '')}
                    placeholder="3"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                    {t('industry')}
                  </label>
                  <Input
                    value={industry}
                    onChange={(e) => setIndustry(e.target.value)}
                    placeholder={t('industry')}
                  />
                </div>
              </div>

              {/* Skills */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  {t('skills')}
                </label>
                <Input
                  value={skills}
                  onChange={(e) => setSkills(e.target.value)}
                  placeholder={t('skillsPlaceholder')}
                />
              </div>

              {/* Work Experience */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  {t('experience')}
                </label>
                <Textarea
                  value={experience}
                  onChange={(e) => setExperience(e.target.value)}
                  placeholder={t('experiencePlaceholder')}
                  rows={4}
                  className="resize-none"
                />
              </div>

              <div className="space-y-3">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                    {t('language')}
                  </label>
                  <LanguageSelect value={language} onValueChange={setLanguage} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                    {t('template')}
                  </label>
                  <TemplateSelector value={binding} onChange={setBinding} />
                </div>
              </div>
            </>
          )}

          {state === 'generating' && (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <Loader2 className="h-8 w-8 animate-spin text-brand mb-3" />
              <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                {t('generating')}
              </p>
            </div>
          )}

          {state === 'success' && (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <CheckCircle2 className="h-8 w-8 text-green-500 mb-3" />
              <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                {t('success')}
              </p>
              <p className="text-xs text-zinc-500 mt-1">
                {t('successDescription')}
              </p>
            </div>
          )}

          {state === 'error' && (
            <div className="flex flex-col items-center justify-center py-6 text-center">
              <AlertTriangle className="h-8 w-8 text-red-500 mb-3" />
              <p className="text-sm font-medium text-red-600 dark:text-red-400">
                {error || t('error')}
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 border-t border-zinc-100 px-6 py-4 dark:border-zinc-800">
          {state === 'form' && (
            <>
              <Button
                variant="outline"
                onClick={handleClose}
                className="cursor-pointer"
              >
                {t('close')}
              </Button>
              <Button
                onClick={handleGenerate}
                disabled={!jobTitle.trim()}
                className="cursor-pointer bg-brand hover:bg-brand-hover"
              >
                {t('generate')}
              </Button>
            </>
          )}
          {state === 'success' && (
            <>
              <Button
                variant="outline"
                onClick={handleClose}
                className="cursor-pointer"
              >
                {t('close')}
              </Button>
              <Button
                onClick={handleOpenResume}
                className="cursor-pointer bg-brand hover:bg-brand-hover"
              >
                {t('openResume')}
              </Button>
            </>
          )}
          {state === 'error' && (
            <>
              <Button
                variant="outline"
                onClick={handleClose}
                className="cursor-pointer"
              >
                {t('close')}
              </Button>
              <Button
                onClick={handleRetry}
                className="cursor-pointer bg-brand hover:bg-brand-hover"
              >
                {t('generate')}
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
