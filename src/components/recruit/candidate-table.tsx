'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Trash2, ArrowUpDown } from 'lucide-react';
import { toast } from 'sonner';
import { Link } from '@/i18n/routing';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useFingerprint } from '@/hooks/use-fingerprint';
import type { CandidateSummary, Recommendation } from '@/types/recruit';

const RECOMMENDATION_STYLE: Record<Recommendation, string> = {
  strong_hire: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
  hire: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
  hold: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  no_hire: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300',
};

interface CandidateTableProps {
  jobId: string;
  candidates: CandidateSummary[];
  onDeleted: (candidateId: string) => void;
}

export function CandidateTable({ jobId, candidates, onDeleted }: CandidateTableProps) {
  const t = useTranslations('recruit');
  const tc = useTranslations('common');
  const { fingerprint } = useFingerprint();
  const [sortByScore, setSortByScore] = useState(true);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  // 未评价的排最后：没分数的人挤在有分数的人中间，横向对比就没法看了。
  const sorted = sortByScore
    ? [...candidates].sort((a, b) => (b.overallScore ?? -1) - (a.overallScore ?? -1))
    : candidates;

  async function handleDelete() {
    if (!deleteId) return;
    try {
      const res = await fetch(`/api/recruit/candidates/${deleteId}`, {
        method: 'DELETE',
        headers: fingerprint ? { 'x-fingerprint': fingerprint } : {},
      });
      if (!res.ok) throw new Error('delete failed');
      onDeleted(deleteId);
    } catch {
      toast.error(t('errors.saveFailed'));
    } finally {
      setDeleteId(null);
    }
  }

  if (candidates.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-zinc-200 dark:border-zinc-700 py-16">
        <p className="text-zinc-500 dark:text-zinc-400">{t('candidates.empty')}</p>
      </div>
    );
  }

  return (
    <Card className="overflow-hidden">
      <table className="w-full text-sm">
        <thead className="border-b bg-zinc-50 text-left text-xs text-zinc-500 dark:bg-zinc-900">
          <tr>
            <th className="px-4 py-3 font-medium">{t('candidates.name')}</th>
            <th className="px-4 py-3 font-medium">{t('candidates.status')}</th>
            <th className="px-4 py-3 font-medium">
              <button
                className="inline-flex cursor-pointer items-center gap-1 hover:text-zinc-900 dark:hover:text-zinc-100"
                onClick={() => setSortByScore((v) => !v)}
              >
                {t('candidates.score')}
                <ArrowUpDown className="h-3 w-3" />
              </button>
            </th>
            <th className="px-4 py-3 font-medium">{t('candidates.recommendation')}</th>
            <th className="w-12 px-4 py-3" />
          </tr>
        </thead>
        <tbody>
          {sorted.map((c) => (
            <tr key={c.id} className="border-b last:border-0">
              <td className="px-4 py-3">
                <Link
                  href={`/recruit/${jobId}/c/${c.id}`}
                  className="cursor-pointer font-medium hover:text-brand"
                >
                  {c.name || '—'}
                </Link>
              </td>
              <td className="px-4 py-3 text-zinc-500">{t(`status.${c.status}`)}</td>
              <td className="px-4 py-3 tabular-nums">
                {c.overallScore ?? <span className="text-zinc-400">—</span>}
              </td>
              <td className="px-4 py-3">
                {c.recommendation ? (
                  <Badge className={RECOMMENDATION_STYLE[c.recommendation]}>
                    {t(`recommendation.${c.recommendation}`)}
                  </Badge>
                ) : (
                  <span className="text-xs text-zinc-400">{t('candidates.notEvaluated')}</span>
                )}
              </td>
              <td className="px-4 py-3">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="cursor-pointer"
                  onClick={() => setDeleteId(c.id)}
                >
                  <Trash2 className="h-4 w-4 text-zinc-400" />
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{tc('delete')}</AlertDialogTitle>
            <AlertDialogDescription>{t('candidates.deleteConfirm')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="cursor-pointer">{tc('cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="cursor-pointer bg-red-600 hover:bg-red-700">
              {tc('delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
