'use client';

import { use, useEffect, useState } from 'react';
import { AlertTriangle, Settings } from 'lucide-react';
import { InterviewReportView } from '@/components/interview/interview-report';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { useSettingsStore, getAIHeaders } from '@/stores/settings-store';
import { useUIStore } from '@/stores/ui-store';
import { useTranslations } from 'next-intl';
import type { InterviewReport, InterviewSession } from '@/types/interview';

export default function ReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [report, setReport] = useState<InterviewReport | null>(null);
  const [session, setSession] = useState<InterviewSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const hydrated = useSettingsStore((s) => s._hydrated);
  const { openModal, setSettingsTab } = useUIStore();
  const t = useTranslations('interview.report');

  useEffect(() => {
    if (!hydrated) return;

    const fp = localStorage.getItem('jade_fingerprint');
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(fp ? { 'x-fingerprint': fp } : {}),
      ...getAIHeaders(),
    };

    fetch(`/api/interview/${id}`, { headers })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || t('loadError'));
        return data;
      })
      .then(({ session: s, report: r }) => {
        setSession(s);
        if (r) {
          setReport(r);
          setLoading(false);
        } else {
          fetch(`/api/interview/${id}/report`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ locale: document.documentElement.lang || 'zh' }),
          })
            .then(async (res) => {
              const data = await res.json().catch(() => ({}));
              if (!res.ok) throw new Error(data.error || t('generationError'));
              return data as InterviewReport;
            })
            .then((data) => setReport(data))
            .catch((err) => setError(err instanceof Error ? err.message : t('generationError')))
            .finally(() => setLoading(false));
        }
      })
      .catch((err) => {
        console.error(err);
        setError(err instanceof Error ? err.message : t('loadError'));
        setLoading(false);
      });
  }, [id, hydrated, t]);

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl space-y-6 py-8">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <div role="alert" className="mx-auto flex max-w-xl flex-col items-center gap-3 py-20 text-center">
        <AlertTriangle className="h-8 w-8 text-amber-500" />
        <h1 className="text-lg font-semibold text-zinc-800 dark:text-zinc-200">{t('generationErrorTitle')}</h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">{t('generationErrorHint')}</p>
        <p className="max-w-full break-words text-xs text-zinc-400">{error}</p>
        <Button
          variant="outline"
          onClick={() => {
            setSettingsTab('ai');
            openModal('settings');
          }}
        >
          <Settings className="mr-1.5 h-4 w-4" />
          {t('openAISettings')}
        </Button>
      </div>
    );
  }

  if (!report || !session) {
    return <div className="py-20 text-center text-zinc-500">{t('loadError')}</div>;
  }

  return <InterviewReportView report={report} session={session} />;
}
