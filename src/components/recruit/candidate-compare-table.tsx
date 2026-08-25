'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Eye } from 'lucide-react';
import { Link } from '@/i18n/routing';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useFingerprint } from '@/hooks/use-fingerprint';
import { cn } from '@/lib/utils';
import type {
  CandidateSummary,
  DimensionConfig,
  DimensionScore,
  Recommendation,
  RecruitEvaluation,
} from '@/types/recruit';

const RECOMMENDATION_STYLE: Record<Recommendation, string> = {
  strong_hire: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
  hire: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
  hold: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  no_hire: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300',
};

interface Row {
  id: string;
  name: string;
  overallScore: number;
  recommendation: Recommendation;
  scoreByKey: Map<string, DimensionScore>;
}

interface CandidateCompareTableProps {
  jobId: string;
  dimensions: DimensionConfig[];
  /** 只传已评价的候选人 */
  evaluated: CandidateSummary[];
}

export function CandidateCompareTable({ jobId, dimensions, evaluated }: CandidateCompareTableProps) {
  const t = useTranslations('recruit');
  const { fingerprint, isLoading: fpLoading } = useFingerprint();
  const [rows, setRows] = useState<Row[] | null>(null);

  useEffect(() => {
    if (fpLoading) return;
    // 拉取中途 evaluated 变了的话，旧响应不能覆盖新数据
    let cancelled = false;

    void (async () => {
      // 摘要接口不返回维度分，逐个拉详情。候选人通常个位数，并发即可。
      const results = await Promise.all(
        evaluated.map(async (c) => {
          try {
            const res = await fetch(`/api/recruit/candidates/${c.id}`, {
              headers: fingerprint ? { 'x-fingerprint': fingerprint } : {},
            });
            if (!res.ok) return null;
            const data = await res.json();
            const evaluation = data.evaluation as RecruitEvaluation | null;
            if (!evaluation) return null;
            return {
              id: c.id,
              name: c.name,
              overallScore: evaluation.overallScore,
              recommendation: evaluation.recommendation,
              scoreByKey: new Map(evaluation.dimensionScores.map((d) => [d.key, d])),
            } satisfies Row;
          } catch {
            return null;
          }
        }),
      );
      if (cancelled) return;
      setRows(
        results.filter((r): r is Row => r !== null).sort((a, b) => b.overallScore - a.overallScore),
      );
    })();

    return () => {
      cancelled = true;
    };
  }, [fpLoading, evaluated, fingerprint]);

  if (rows === null) return <Skeleton className="h-40 rounded-xl" />;
  if (rows.length < 2) return null;

  return (
    <div>
      <h2 className="mb-3 text-sm font-medium">{t('overview.compare')}</h2>
      <Card className="overflow-x-auto p-0 shadow-sm">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="border-b bg-zinc-50/80 text-left text-xs text-zinc-500 dark:bg-zinc-900/80">
            <tr>
              <th className="w-[180px] px-5 py-3.5 font-medium">{t('candidates.name')}</th>
              {dimensions.map((d) => (
                <th key={d.key} className="px-3 py-3 text-center font-medium">
                  {d.label}
                </th>
              ))}
              <th className="px-3 py-3 text-center font-medium">{t('candidates.score')}</th>
              <th className="w-[120px] px-4 py-3.5 font-medium">{t('candidates.recommendation')}</th>
              <th className="w-[110px] px-5 py-3.5 text-right font-medium">{t('actions.operation')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.id}
                className="border-b transition-colors last:border-0 hover:bg-zinc-50/70 dark:hover:bg-zinc-900/60"
              >
                <td className="px-5 py-3.5">
                  <Link
                    href={`/recruit/${jobId}/c/${r.id}/report`}
                    className="cursor-pointer font-medium hover:text-brand"
                  >
                    {r.name || '—'}
                  </Link>
                </td>
                {dimensions.map((d) => {
                  const s = r.scoreByKey.get(d.key);
                  // weight 为 0 表示这个维度一道题都没问到，显示 — 而不是 0，
                  // 否则「没考」和「考了得 0 分」看起来一样。
                  const notAsked = !s || s.weight === 0;
                  return (
                    <td
                      key={d.key}
                      className={cn(
                        'px-3 py-3 text-center tabular-nums',
                        notAsked && 'text-zinc-300 dark:text-zinc-600',
                      )}
                    >
                      {notAsked ? '—' : s.score}
                    </td>
                  );
                })}
                <td className="px-3 py-3 text-center font-semibold tabular-nums">{r.overallScore}</td>
                <td className="px-4 py-3.5">
                  <Badge className={RECOMMENDATION_STYLE[r.recommendation]}>
                    {t(`recommendation.${r.recommendation}`)}
                  </Badge>
                </td>
                <td className="px-5 py-3.5 text-right">
                  <Link
                    href={`/recruit/${jobId}/c/${r.id}/stage?mode=view`}
                    className="inline-flex cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-md border border-zinc-200 bg-white px-2.5 py-1.5 text-xs font-medium text-zinc-700 shadow-sm transition-colors hover:border-brand/40 hover:text-brand dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
                  >
                    <Eye className="h-3.5 w-3.5" />
                    {t('actions.viewRecord')}
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
