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
import { DimensionChips } from './dimension-chips';
import { interviewDimensions } from '@/lib/recruit/dimensions';
import { detectGoRole } from '@/lib/ai/recruit-blueprint';
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
    const describe = (key: string) => tDim(`descriptions.${key}`);
    setDimensions(interviewDimensions(
      job?.dimensions ?? [],
      detectGoRole(job?.title ?? '', job?.jobDescription ?? ''),
      (key) => tDim(key),
      describe,
    ));
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
      {/* 必须带 sm: 前缀：DialogContent 基类里的 sm:max-w-lg 是个 variant，
          tailwind-merge 不会拿无前缀的 max-w-* 去覆盖它，写 max-w-2xl 是无效的 */}
      <DialogContent
        className="max-h-[85vh] overflow-y-auto sm:max-w-4xl"
        // Radix 打开时会聚焦第一个可聚焦元素，且对 input 会连带 select() 全选。
        // 编辑岗位时那就是「岗位名称」，一进来整个标题反白，手一抖就没了。
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
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
              // Textarea 是 field-sizing-content，rows 不起作用，只能用 min/max-h：
              // 不封顶的话一份长 JD 会把整个弹窗撑到几千像素
              className="max-h-[240px] min-h-[160px] overflow-y-auto"
            />
          </div>

          <div className="space-y-2">
            <Label>
              {t('questionCount')}：{questionCount}
            </Label>
            <Slider
              className="cursor-pointer"
              min={QUESTION_COUNT_MIN}
              max={QUESTION_COUNT_MAX}
              step={1}
              value={[questionCount]}
              onValueChange={([v]) => setQuestionCount(v)}
            />
          </div>

          <DimensionChips
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
