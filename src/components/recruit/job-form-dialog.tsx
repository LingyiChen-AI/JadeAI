'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Slider } from '@/components/ui/slider';
import { DimensionEditor } from './dimension-editor';
import { defaultDimensions } from '@/lib/recruit/dimensions';
import { useFingerprint } from '@/hooks/use-fingerprint';
import {
  QUESTION_COUNT_DEFAULT,
  QUESTION_COUNT_MAX,
  QUESTION_COUNT_MIN,
  type DimensionConfig,
  type RecruitJob,
} from '@/types/recruit';

interface JobFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 传入表示编辑，不传表示新建 */
  job?: RecruitJob | null;
  onSaved: (job: RecruitJob) => void;
}

export function JobFormDialog({ open, onOpenChange, job, onSaved }: JobFormDialogProps) {
  const t = useTranslations('recruit');
  const tDim = useTranslations('recruit.dimensions');
  const { fingerprint } = useFingerprint();

  const [title, setTitle] = useState('');
  const [jobDescription, setJobDescription] = useState('');
  const [questionCount, setQuestionCount] = useState(QUESTION_COUNT_DEFAULT);
  const [dimensions, setDimensions] = useState<DimensionConfig[]>([]);
  const [saving, setSaving] = useState(false);

  // 每次打开都重置成当前岗位的值——不这么做的话，编辑完 A 再打开 B 会看到 A 的内容。
  useEffect(() => {
    if (!open) return;
    setTitle(job?.title ?? '');
    setJobDescription(job?.jobDescription ?? '');
    setQuestionCount(job?.questionCount ?? QUESTION_COUNT_DEFAULT);
    setDimensions(job?.dimensions ?? defaultDimensions((key) => tDim(key)));
  }, [open, job, tDim]);

  const canSave = title.trim() && jobDescription.trim() && dimensions.length > 0 && !saving;

  async function handleSave() {
    setSaving(true);
    try {
      const url = job ? `/api/recruit/jobs/${job.id}` : '/api/recruit/jobs';
      const res = await fetch(url, {
        method: job ? 'PATCH' : 'POST',
        headers: {
          'content-type': 'application/json',
          ...(fingerprint ? { 'x-fingerprint': fingerprint } : {}),
        },
        body: JSON.stringify({ title, jobDescription, dimensions, questionCount }),
      });
      if (!res.ok) throw new Error('save failed');
      const data = await res.json();
      onSaved(data.job);
      onOpenChange(false);
    } catch {
      toast.error(t('errors.saveFailed'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{job ? t('editJob') : t('createJob')}</DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="job-title">{t('jobTitle')}</Label>
            <Input
              id="job-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t('jobTitlePlaceholder')}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="job-jd">{t('jobDescription')}</Label>
            <Textarea
              id="job-jd"
              value={jobDescription}
              onChange={(e) => setJobDescription(e.target.value)}
              placeholder={t('jobDescriptionPlaceholder')}
              rows={8}
            />
          </div>

          <div className="space-y-2">
            <Label>
              {t('questionCount')}：{questionCount}
            </Label>
            <Slider
              min={QUESTION_COUNT_MIN}
              max={QUESTION_COUNT_MAX}
              step={1}
              value={[questionCount]}
              onValueChange={([v]) => setQuestionCount(v)}
            />
          </div>

          <DimensionEditor
            value={dimensions}
            onChange={setDimensions}
            questionCount={questionCount}
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} className="cursor-pointer">
            {t('cancel')}
          </Button>
          <Button
            onClick={handleSave}
            disabled={!canSave}
            className="cursor-pointer bg-brand hover:bg-brand-hover"
          >
            {t('save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
