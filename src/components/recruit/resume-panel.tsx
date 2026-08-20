'use client';

import { useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Upload, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
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
  const fileInputRef = useRef<HTMLInputElement>(null);
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
      // 清空 input，否则同一个文件重传第二次不会触发 change
      if (fileInputRef.current) fileInputRef.current.value = '';
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
    } catch {
      toast.error(t('errors.saveFailed'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf,image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
          }}
        />
        <div className="flex flex-col items-center gap-3 py-6 text-center">
          {uploading ? (
            <>
              <Loader2 className="h-8 w-8 animate-spin text-zinc-400" />
              <p className="text-sm text-zinc-500">{t('resume.parsing')}</p>
            </>
          ) : (
            <>
              <Upload className="h-8 w-8 text-zinc-400" />
              <Button onClick={() => fileInputRef.current?.click()}>{t('resume.upload')}</Button>
              <p className="text-xs text-zinc-400">{t('resume.uploadHint')}</p>
            </>
          )}
        </div>
      </Card>

      <div className="space-y-2">
        <Label htmlFor="resume-text">{t('resume.paste')}</Label>
        <Textarea
          id="resume-text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={t('resume.pastePlaceholder')}
          rows={16}
        />
        <div className="flex justify-end">
          <Button onClick={handleSaveText} disabled={saving || text === candidate.resumeText}>
            {t('resume.savePaste')}
          </Button>
        </div>
      </div>
    </div>
  );
}
