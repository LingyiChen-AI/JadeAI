'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  ChevronLeft,
  Plus,
  Search,
  MoreVertical,
  Pencil,
  Trash2,
  FileUp,
  Sparkles,
  Play,
  FileText,
} from 'lucide-react';
import { toast } from 'sonner';
import { Link, useRouter } from '@/i18n/routing';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import { JobFormDialog } from './job-form-dialog';
import { CandidateCompareTable } from './candidate-compare-table';
import { useFingerprint } from '@/hooks/use-fingerprint';
import { sortCandidatesForSidebar } from '@/lib/recruit/summary';
import { stageFromSummary, type CandidateStage } from '@/lib/recruit/candidate-stage';
import { dimensionColor } from '@/lib/recruit/dimension-colors';
import { allocateQuestions } from '@/lib/recruit/scoring';
import { cn } from '@/lib/utils';
import type {
  CandidateSummary,
  DimensionConfig,
  RecruitJob,
  Recommendation,
} from '@/types/recruit';

const RECOMMENDATION_STYLE: Record<Recommendation, string> = {
  strong_hire: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
  hire: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
  hold: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  no_hire: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300',
};

export function CandidateList({ jobId }: { jobId: string }) {
  const t = useTranslations('recruit');
  const tc = useTranslations('common');
  const router = useRouter();
  const { fingerprint, isLoading: fpLoading } = useFingerprint();

  const [job, setJob] = useState<RecruitJob | null>(null);
  const [candidates, setCandidates] = useState<CandidateSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [jdExpanded, setJdExpanded] = useState(false);

  const [editOpen, setEditOpen] = useState(false);
  const [deleteJobOpen, setDeleteJobOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const [deleteCandidateId, setDeleteCandidateId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/recruit/jobs/${jobId}`, {
        headers: fingerprint ? { 'x-fingerprint': fingerprint } : {},
      });
      if (!res.ok) throw new Error('load failed');
      const data = await res.json();
      setJob(data.job);
      setCandidates(data.candidates);
    } catch {
      toast.error(t('errors.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [jobId, fingerprint, t]);

  useEffect(() => {
    if (fpLoading) return;
    load();
  }, [fpLoading, load]);

  const sorted = useMemo(() => {
    const filtered = query.trim()
      ? candidates.filter((c) => c.name.toLowerCase().includes(query.trim().toLowerCase()))
      : candidates;
    return sortCandidatesForSidebar(filtered);
  }, [candidates, query]);

  // 必须 memo：这个数组是对比表 effect 的依赖，每次渲染都新建的话，
  // 点一下「展开全文」就会把所有候选人详情重拉一遍。
  const evaluated = useMemo(
    () => candidates.filter((c) => c.overallScore !== null),
    [candidates],
  );

  async function handleAddCandidate() {
    const name = newName.trim();
    if (!name) return;
    try {
      const res = await fetch(`/api/recruit/jobs/${jobId}/candidates`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(fingerprint ? { 'x-fingerprint': fingerprint } : {}),
        },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) throw new Error('create failed');
      const data = await res.json();
      setNewName('');
      setAddOpen(false);
      // 新人一定是「没简历」，直接送进准备页，省一次点击
      router.push(`/recruit/${jobId}/c/${data.candidate.id}/prep`);
    } catch {
      toast.error(t('errors.saveFailed'));
    }
  }

  async function handleRenameCandidate() {
    if (!renaming) return;
    const name = renaming.name.trim();
    if (!name) return;
    try {
      const res = await fetch(`/api/recruit/candidates/${renaming.id}`, {
        method: 'PATCH',
        headers: {
          'content-type': 'application/json',
          ...(fingerprint ? { 'x-fingerprint': fingerprint } : {}),
        },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) throw new Error('rename failed');
      setCandidates((prev) => prev.map((c) => (c.id === renaming.id ? { ...c, name } : c)));
      setRenaming(null);
    } catch {
      toast.error(t('errors.saveFailed'));
    }
  }

  async function handleDeleteCandidate() {
    if (!deleteCandidateId) return;
    const id = deleteCandidateId;
    try {
      const res = await fetch(`/api/recruit/candidates/${id}`, {
        method: 'DELETE',
        headers: fingerprint ? { 'x-fingerprint': fingerprint } : {},
      });
      if (!res.ok) throw new Error('delete failed');
      setCandidates((prev) => prev.filter((c) => c.id !== id));
      setDeleteCandidateId(null);
    } catch {
      toast.error(t('errors.saveFailed'));
    }
  }

  async function handleDeleteJob() {
    try {
      const res = await fetch(`/api/recruit/jobs/${jobId}`, {
        method: 'DELETE',
        headers: fingerprint ? { 'x-fingerprint': fingerprint } : {},
      });
      if (!res.ok) throw new Error('delete failed');
      router.push('/recruit');
    } catch {
      toast.error(t('errors.saveFailed'));
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl space-y-4 px-4 py-8">
        <Skeleton className="h-28 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }
  if (!job) return null;

  const dimensions = job.dimensions as DimensionConfig[];
  const allocation = allocateQuestions(dimensions, job.questionCount);

  return (
    <div className="mx-auto max-w-5xl space-y-5 px-4 py-8">
      <div>
        <Link
          href="/recruit"
          className="inline-flex cursor-pointer items-center text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          {t('list.back')}
        </Link>
        <div className="mt-1 flex items-start justify-between gap-2">
          <h1 className="min-w-0 truncate text-2xl font-bold">{job.title}</h1>
          <DropdownMenu>
            <DropdownMenuTrigger className="mt-1 cursor-pointer rounded-md p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800">
              <MoreVertical className="h-4 w-4 text-zinc-400" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem className="cursor-pointer" onClick={() => setEditOpen(true)}>
                <Pencil className="mr-2 h-4 w-4" />
                {t('editJob')}
              </DropdownMenuItem>
              <DropdownMenuItem className="cursor-pointer" onClick={() => setDeleteJobOpen(true)}>
                <Trash2 className="mr-2 h-4 w-4" />
                {t('deleteJob')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* JD 和维度收成一行摘要。这一页的任务是「找到人 → 点按钮」，
          JD 你早就知道了，它不该占最大的面积。想看点「展开 JD」。 */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500">
        <span>{t('overview.stats', { total: candidates.length, evaluated: evaluated.length })}</span>
        <span className="text-zinc-300 dark:text-zinc-700">·</span>
        <span>{t('dimensions.perDimension', { count: job.questionCount })}</span>
        <span className="text-zinc-300 dark:text-zinc-700">·</span>
        <span className="inline-flex flex-wrap items-center gap-1.5">
          {dimensions.map((d) => (
            <span
              key={d.key}
              title={`${d.label} · ${t('dimensions.perDimension', { count: allocation[d.key] ?? 0 })}`}
              className="inline-flex items-center gap-1"
            >
              <span className={cn('h-1.5 w-1.5 rounded-full', dimensionColor(d.key).dot)} />
              {d.label}
            </span>
          ))}
        </span>
        <button
          type="button"
          onClick={() => setJdExpanded((v) => !v)}
          className="cursor-pointer text-brand hover:text-brand-hover"
        >
          {jdExpanded ? t('overview.collapseJd') : t('overview.expandJd')}
        </button>
      </div>

      {jdExpanded && (
        <Card className="p-4">
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
            {job.jobDescription}
          </p>
        </Card>
      )}

      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('list.searchPlaceholder')}
            className="h-9 pl-8 text-sm"
          />
        </div>
        <Button onClick={() => setAddOpen(true)} className="h-9 shrink-0 cursor-pointer gap-1.5">
          <Plus className="h-4 w-4" />
          {t('candidates.add')}
        </Button>
      </div>

      {sorted.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-zinc-200 py-14 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
          {t('candidates.empty')}
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border dark:border-zinc-800">
          {sorted.map((c, i) => (
            <CandidateRow
              key={c.id}
              jobId={jobId}
              candidate={c}
              first={i === 0}
              onRename={() => setRenaming({ id: c.id, name: c.name })}
              onDelete={() => setDeleteCandidateId(c.id)}
            />
          ))}
        </div>
      )}

      {evaluated.length >= 2 && (
        <CandidateCompareTable jobId={jobId} dimensions={dimensions} evaluated={evaluated} />
      )}

      <JobFormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        job={job}
        onSaved={(updated) => setJob(updated)}
      />

      <AlertDialog open={deleteJobOpen} onOpenChange={setDeleteJobOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{tc('delete')}</AlertDialogTitle>
            <AlertDialogDescription>{t('deleteJobConfirm')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="cursor-pointer">{tc('cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteJob}
              className="cursor-pointer bg-red-600 hover:bg-red-700"
            >
              {tc('delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={renaming !== null} onOpenChange={(open) => !open && setRenaming(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{tc('rename')}</DialogTitle>
          </DialogHeader>
          <Input
            value={renaming?.name ?? ''}
            onChange={(e) => setRenaming((prev) => (prev ? { ...prev, name: e.target.value } : prev))}
            placeholder={t('candidates.namePlaceholder')}
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleRenameCandidate();
            }}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenaming(null)} className="cursor-pointer">
              {t('cancel')}
            </Button>
            <Button
              onClick={handleRenameCandidate}
              disabled={!renaming?.name.trim()}
              className="cursor-pointer"
            >
              {t('save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={deleteCandidateId !== null}
        onOpenChange={(open) => !open && setDeleteCandidateId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('candidates.delete')}</AlertDialogTitle>
            <AlertDialogDescription>{t('candidates.deleteConfirm')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="cursor-pointer">{tc('cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteCandidate}
              className="cursor-pointer bg-red-600 hover:bg-red-700"
            >
              {tc('delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('candidates.add')}</DialogTitle>
          </DialogHeader>
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder={t('candidates.namePlaceholder')}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleAddCandidate();
            }}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)} className="cursor-pointer">
              {t('cancel')}
            </Button>
            <Button
              onClick={handleAddCandidate}
              disabled={!newName.trim()}
              className="cursor-pointer"
            >
              {t('save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/**
 * 一行一个候选人。右侧的主按钮随所处阶段变化——一行一个动作，
 * 不用先进工作台再去找 Tab。
 */
function CandidateRow({
  jobId,
  candidate: c,
  first,
  onRename,
  onDelete,
}: {
  jobId: string;
  candidate: CandidateSummary;
  first: boolean;
  onRename: () => void;
  onDelete: () => void;
}) {
  const t = useTranslations('recruit');
  const tc = useTranslations('common');

  const stage = stageFromSummary(c);
  const action = ACTIONS[stage];
  const label =
    stage === 'interviewing'
      ? t('actions.continueInterview', { done: c.answeredCount, total: c.questionCount })
      : t(`actions.${action.key}`);

  return (
    <div
      className={cn(
        'flex items-center gap-3 bg-white px-4 py-3 dark:bg-zinc-900',
        !first && 'border-t dark:border-zinc-800',
      )}
    >
      <span className="min-w-0 flex-1 truncate text-sm font-medium">{c.name || '—'}</span>

      {c.overallScore !== null && (
        <span className="shrink-0 text-sm font-semibold tabular-nums">{c.overallScore}</span>
      )}
      {c.recommendation && (
        <Badge className={cn('shrink-0 px-1.5 py-0 text-[10px]', RECOMMENDATION_STYLE[c.recommendation])}>
          {t(`recommendation.${c.recommendation}`)}
        </Badge>
      )}
      {stage === 'interviewing' && (
        <span className="hidden shrink-0 text-xs text-zinc-400 sm:inline">
          {t('list.progress', { done: c.answeredCount, total: c.questionCount })}
        </span>
      )}

      <Link
        href={`/recruit/${jobId}/c/${c.id}/${action.to}`}
        className={cn(
          'inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
          action.solid
            ? 'bg-brand text-brand-foreground hover:bg-brand-hover'
            : 'border text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800',
        )}
      >
        <action.Icon className="h-3.5 w-3.5" />
        {label}
      </Link>

      <DropdownMenu>
        <DropdownMenuTrigger
          className="shrink-0 cursor-pointer rounded-md p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          aria-label={c.name}
        >
          <MoreVertical className="h-3.5 w-3.5 text-zinc-400" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem className="cursor-pointer" onClick={onRename}>
            <Pencil className="mr-2 h-4 w-4" />
            {tc('rename')}
          </DropdownMenuItem>
          <DropdownMenuItem className="cursor-pointer" onClick={onDelete}>
            <Trash2 className="mr-2 h-4 w-4" />
            {t('candidates.delete')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

const ACTIONS: Record<
  CandidateStage,
  { key: string; to: string; Icon: typeof Play; solid: boolean }
> = {
  need_resume: { key: 'uploadResume', to: 'prep', Icon: FileUp, solid: false },
  need_questions: { key: 'generateQuestions', to: 'prep', Icon: Sparkles, solid: false },
  interviewing: { key: 'startInterview', to: 'stage', Icon: Play, solid: true },
  done: { key: 'viewReport', to: 'report', Icon: FileText, solid: false },
};
