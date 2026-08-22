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
  Settings2,
  Upload,
  Loader2,
  FileUp,
  Sparkles,
  Play,
  FileText,
} from 'lucide-react';
import { toast } from 'sonner';
import { Link, useRouter } from '@/i18n/routing';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
import { CandidateDialog } from './candidate-dialog';
import { CandidateCompareTable } from './candidate-compare-table';
import { useFingerprint } from '@/hooks/use-fingerprint';
import { getAIHeaders } from '@/stores/settings-store';
import { sortCandidatesForSidebar } from '@/lib/recruit/summary';
import { stageFromSummary, type CandidateStage } from '@/lib/recruit/candidate-stage';
import { cn } from '@/lib/utils';
import type { CandidateSummary, DimensionConfig, RecruitJob } from '@/types/recruit';


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
  /** 非 null 表示给已有候选人重传简历，复用同一个弹窗 */
  const [resumeFor, setResumeFor] = useState<CandidateSummary | null>(null);
  /** 正在就地出题的候选人 id */
  const [generatingFor, setGeneratingFor] = useState<string | null>(null);
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

  const interviewingCount = useMemo(
    () => candidates.filter((c) => stageFromSummary(c) === 'interviewing').length,
    [candidates],
  );

  /** 有简历但没题目：就地出题，完了直接进面试台 */
  async function handleGenerate(id: string) {
    setGeneratingFor(id);
    try {
      const res = await fetch(`/api/recruit/candidates/${id}/questions`, {
        method: 'POST',
        headers: {
          ...(fingerprint ? { 'x-fingerprint': fingerprint } : {}),
          ...getAIHeaders(),
        },
      });
      if (!res.ok) throw new Error('generate failed');
      router.push(`/recruit/${jobId}/c/${id}/stage`);
    } catch {
      toast.error(t('errors.generateFailed'));
      setGeneratingFor(null);
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
      <div className="mx-auto max-w-7xl space-y-4 px-4 py-8">
        <Skeleton className="h-28 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }
  if (!job) return null;

  const dimensions = job.dimensions as DimensionConfig[];

  return (
    <div className="mx-auto max-w-7xl space-y-5 px-4 py-8">
      <div>
        <Link
          href="/recruit"
          className="inline-flex cursor-pointer items-center text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          {t('list.back')}
        </Link>

        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-2">
          <h1 className="min-w-0 flex-1 truncate text-2xl font-bold tracking-tight">{job.title}</h1>
          <div className="flex shrink-0 items-center gap-2">
            <Button
            variant="outline"
            size="sm"
            onClick={() => setEditOpen(true)}
            className="cursor-pointer gap-1.5"
          >
            <Settings2 className="h-3.5 w-3.5" />
            {t('list.jobSettings')}
          </Button>
          <Button size="sm" onClick={() => setAddOpen(true)} className="cursor-pointer gap-1.5">
            <Plus className="h-4 w-4" />
            {t('candidates.add')}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger className="cursor-pointer rounded-md p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800">
              <MoreVertical className="h-4 w-4 text-zinc-400" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem className="cursor-pointer" onClick={() => setDeleteJobOpen(true)}>
                <Trash2 className="mr-2 h-4 w-4" />
                {t('deleteJob')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          </div>
        </div>

        {/* 摘要只留三个数。之前这里排着八个维度色点——维度色在题目列表里
            用来判断题型，在候选人页只是彩纸屑。 */}
        <p className="mt-1.5 text-xs text-zinc-500">
          {t('list.summary', {
            total: candidates.length,
            interviewing: interviewingCount,
            questions: job.questionCount,
          })}
          <button
            type="button"
            onClick={() => setJdExpanded((v) => !v)}
            className="ml-2 cursor-pointer text-brand hover:text-brand-hover"
          >
            {jdExpanded ? t('overview.collapseJd') : t('overview.expandJd')}
          </button>
        </p>
      </div>

      {jdExpanded && (
        <Card className="p-4">
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
            {job.jobDescription}
          </p>
        </Card>
      )}

      {/* 搜索框只在人多的时候出现。一个候选人的时候摆个搜索框是滑稽的。 */}
      {candidates.length > 8 && (
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('list.searchPlaceholder')}
            className="h-9 pl-8 text-sm"
          />
        </div>
      )}

      <div className="grid grid-cols-[repeat(auto-fill,minmax(232px,1fr))] gap-3.5">
        {sorted.map((c) => (
          <CandidateCard
            key={c.id}
            jobId={jobId}
            candidate={c}
            onRename={() => setRenaming({ id: c.id, name: c.name })}
            onDelete={() => setDeleteCandidateId(c.id)}
            onResume={() => {
              setResumeFor(c);
              setAddOpen(true);
            }}
            onGenerate={() => void handleGenerate(c.id)}
            generating={generatingFor === c.id}
          />
        ))}
        {/* 末尾这张虚线卡是「只有一个候选人时页面不空」的关键 */}
        <button
          type="button"
          onClick={() => setAddOpen(true)}
          className="flex min-h-[106px] cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-zinc-200 text-sm text-zinc-500 transition-colors hover:border-brand hover:text-brand dark:border-zinc-700 dark:text-zinc-400"
        >
          <Plus className="h-5 w-5" />
          {t('candidates.add')}
        </button>
      </div>

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

      <CandidateDialog
        jobId={jobId}
        open={addOpen}
        onOpenChange={(o) => {
          setAddOpen(o);
          if (!o) setResumeFor(null);
        }}
        candidate={resumeFor}
        onDone={load}
      />
    </div>
  );
}

/**
 * 一张卡就是一份档案。顶部色带表明走到哪一步（面试中时长度即进度），
 * 底部整条就是主按钮——一张卡一个动作，点哪都对。
 */
function CandidateCard({
  jobId,
  candidate: c,
  onRename,
  onDelete,
  onResume,
  onGenerate,
  generating,
}: {
  jobId: string;
  candidate: CandidateSummary;
  onRename: () => void;
  onDelete: () => void;
  /** 缺简历时打开弹窗补 */
  onResume: () => void;
  /** 有简历但没题目时就地出题 */
  onGenerate: () => void;
  generating: boolean;
}) {
  const t = useTranslations('recruit');
  const tc = useTranslations('common');

  const stage = stageFromSummary(c);
  const look = STAGE_LOOK[stage];
  const action = ACTIONS[stage];
  const href = action.to ? `/recruit/${jobId}/c/${c.id}/${action.to}` : '';

  const label =
    stage === 'interviewing'
      ? t('actions.continueInterview', { done: c.answeredCount, total: c.questionCount })
      : t(`actions.${action.key}`);

  const sub =
    stage === 'done'
      ? c.recommendation && t(`recommendation.${c.recommendation}`)
      : stage === 'interviewing'
        ? t('questions.recorded', { done: c.answeredCount, total: c.questionCount })
        : stage === 'need_questions'
          ? t('list.noQuestions')
          : t('list.noResume');

  // 面试中：色带长度就是进度。其余阶段铺满，色带只表明阶段。
  const fill =
    stage === 'interviewing' && c.questionCount > 0
      ? Math.max(4, Math.round((c.answeredCount / c.questionCount) * 100))
      : 100;

  return (
    <div className="flex flex-col overflow-hidden rounded-xl border bg-white shadow-sm transition-shadow hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900">
      <div className="h-[3px] bg-zinc-100 dark:bg-zinc-800">
        <div className={cn('h-full', look.bar)} style={{ width: `${fill}%` }} />
      </div>

      <div className="flex items-center gap-3 px-4 pb-4 pt-4">
        <span
          className={cn(
            'grid h-9 w-9 shrink-0 place-items-center rounded-[10px] text-[15px] font-bold tracking-tight',
            look.mono,
          )}
        >
          {(c.name || '?').trim().charAt(0)}
        </span>
        <Link href={href} className="min-w-0 flex-1 cursor-pointer">
          <span className="block truncate text-[15px] font-semibold tracking-tight">
            {c.name || '—'}
          </span>
          <span className="block truncate text-[11.5px] text-zinc-500">{sub}</span>
        </Link>
        {c.overallScore !== null && (
          <span className="shrink-0 text-2xl font-bold tabular-nums tracking-tighter">
            {c.overallScore}
          </span>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger
            className="-mr-1 shrink-0 cursor-pointer rounded-md p-1 text-zinc-300 hover:bg-zinc-100 hover:text-zinc-600 dark:text-zinc-600 dark:hover:bg-zinc-800"
            aria-label={c.name}
          >
            <MoreVertical className="h-3.5 w-3.5" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {/* 传错文件是真实场景，没有这个入口就没法改简历了 */}
            <DropdownMenuItem className="cursor-pointer" onClick={onResume}>
              <Upload className="mr-2 h-4 w-4" />
              {t('addFlow.reupload')}
            </DropdownMenuItem>
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

      {/* 准备页没了：缺简历开弹窗、缺题目就地生成，只有后两个阶段才是跳转 */}
      {action.to ? (
        <Link href={href} className={cn(ACT_CLASS, action.solid && ACT_SOLID)}>
          <action.Icon className="h-3.5 w-3.5" />
          {label}
        </Link>
      ) : (
        <button
          type="button"
          onClick={stage === 'need_resume' ? onResume : onGenerate}
          disabled={generating}
          className={cn(ACT_CLASS, action.solid && ACT_SOLID, 'w-full')}
        >
          {generating ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <action.Icon className="h-3.5 w-3.5" />
          )}
          {generating ? t('questions.generating') : label}
        </button>
      )}
    </div>
  );
}

/**
 * 阶段色是这个模块的视觉身份：灰=待简历、琥珀=待出题、主题色=面试中、深主题色=已评价。
 *
 * 已评价原先用的是 zinc-900，换主题色之后满屏就它一块是黑的。改成 brand-hover
 * （同色相更深的一档）：既跟着主题走，又比「面试中」重一级——面试中的色带是
 * 按进度截断的，已评价是整条实心，两者不会看混。
 */
const STAGE_LOOK: Record<CandidateStage, { bar: string; mono: string }> = {
  need_resume: {
    bar: 'bg-zinc-300 dark:bg-zinc-600',
    mono: 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400',
  },
  need_questions: {
    bar: 'bg-amber-500',
    mono: 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-400',
  },
  interviewing: {
    bar: 'bg-brand',
    mono: 'bg-brand/10 text-brand',
  },
  done: {
    bar: 'bg-brand-hover',
    mono: 'bg-brand text-brand-foreground',
  },
};

const ACT_CLASS =
  'mt-auto flex cursor-pointer items-center justify-center gap-1.5 border-t py-3 text-[13px] font-medium transition-colors disabled:opacity-60 text-zinc-600 hover:bg-zinc-50 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-800';
const ACT_SOLID = 'border-brand bg-brand text-brand-foreground hover:bg-brand-hover dark:border-brand';

/** to 为空表示就地处理，不跳页 */
const ACTIONS: Record<
  CandidateStage,
  { key: string; to: string; Icon: typeof Play; solid: boolean }
> = {
  need_resume: { key: 'uploadResume', to: '', Icon: FileUp, solid: false },
  need_questions: { key: 'generateQuestions', to: '', Icon: Sparkles, solid: false },
  interviewing: { key: 'startInterview', to: 'stage', Icon: Play, solid: true },
  done: { key: 'viewReport', to: 'report', Icon: FileText, solid: false },
};
