'use client';

import { useRef } from 'react';
import { useTranslations } from 'next-intl';
import { Upload, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ResumeDropzoneProps {
  uploading: boolean;
  onFile: (file: File) => void;
}

/**
 * 横向紧凑上传区。原来是 280px 高的空卡片，中间只放一个按钮——
 * 占了屏幕四分之一却只承载一个动作。
 */
export function ResumeDropzone({ uploading, onFile }: ResumeDropzoneProps) {
  const t = useTranslations('recruit.resume');
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="flex items-center gap-4 rounded-xl border-2 border-dashed border-zinc-200 px-5 py-4 dark:border-zinc-700">
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onFile(file);
          // 清空 input，否则同一个文件重传第二次不会触发 change
          if (inputRef.current) inputRef.current.value = '';
        }}
      />
      {uploading ? (
        <Loader2 className="h-5 w-5 shrink-0 animate-spin text-zinc-400" />
      ) : (
        <Upload className="h-5 w-5 shrink-0 text-zinc-400" />
      )}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{uploading ? t('parsing') : t('upload')}</p>
        {!uploading && <p className="mt-0.5 text-xs text-zinc-400">{t('uploadHint')}</p>}
      </div>
      <Button
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        className="shrink-0 cursor-pointer gap-2 bg-brand hover:bg-brand-hover"
      >
        {t('upload')}
      </Button>
    </div>
  );
}
