'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2, Check } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ResumeDropzone } from './resume-dropzone';
import { useFingerprint } from '@/hooks/use-fingerprint';
import { getAIHeaders } from '@/stores/settings-store';
import type { RecruitCandidate } from '@/types/recruit';

interface ResumePanelProps {
  candidate: RecruitCandidate;
  onUpdated: (candidate: RecruitCandidate) => void;
}

export function ResumePanel({ candidate, onUpdated }: ResumePanelProps) {
  const t = useTranslations('recruit');
  const { fingerprint } = useFingerprint();
  const [uploading, setUploading] = useState(false);
  const [text, setText] = useState(candidate.resumeText);
  const [saving, setSaving] = useState(false);

  async function handleFile(file: File) {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch(`/api/recruit/candidates/${candidate.id}/resume`, {
        method: 'POST',
        headers: {
          ...(fingerprint ? { 'x-fingerprint': fingerprint } : {}),
          ...getAIHeaders(),
        },
        body: formData,
      });
      if (!res.ok) throw new Error('parse failed');
      const data = await res.json();
      setText(data.candidate.resumeText);
      onUpdated(data.candidate);
    } catch {
      toast.error(t('errors.parseFailed'));
    } finally {
      setUploading(false);
    }
  }

  async function handleSaveText() {
    setSaving(true);
    try {
      const res = await fetch(`/api/recruit/candidates/${candidate.id}`, {
        method: 'PATCH',
        headers: {
          'content-type': 'application/json',
          ...(fingerprint ? { 'x-fingerprint': fingerprint } : {}),
        },
        body: JSON.stringify({ resumeText: text }),
      });
      if (!res.ok) throw new Error('save failed');
      const data = await res.json();
      onUpdated(data.candidate);
      toast.success(t('resume.saved'));
    } catch {
      toast.error(t('errors.saveFailed'));
    } finally {
      setSaving(false);
    }
  }

  // 上传 PDF 时服务端已经把解析结果落库了，此时 text 与库里一致。
  // 只置灰按钮而不给任何提示的话，「有内容却点不动」看起来就是坏的。
  const dirty = text !== candidate.resumeText;

  return (
    <div className="space-y-5">
      <ResumeDropzone uploading={uploading} onFile={handleFile} />

      <div className="space-y-2">
        <Label htmlFor="resume-text">{t('resume.paste')}</Label>
        <Textarea
          id="resume-text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={t('resume.pastePlaceholder')}
          // Textarea 带 field-sizing-content，rows 无效，必须用 min-h 抬下限。
          // max-h 同样必要：简历动辄上千字，不封顶的话输入框会一路撑到几千像素。
          className="max-h-[480px] min-h-[320px] overflow-y-auto"
        />
        <div className="flex items-center justify-end gap-3">
          {!dirty && text.trim() && (
            <span className="inline-flex items-center gap-1 text-xs text-zinc-500 dark:text-zinc-400">
              <Check className="h-3.5 w-3.5 text-brand" />
              {t('resume.saved')}
            </span>
          )}
          <Button
            onClick={handleSaveText}
            disabled={saving || !dirty}
            className="cursor-pointer gap-2 bg-brand hover:bg-brand-hover"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {t('resume.savePaste')}
          </Button>
        </div>
      </div>
    </div>
  );
}
