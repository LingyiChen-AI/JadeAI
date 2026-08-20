'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ChevronLeft, Plus, Search, MoreVertical, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Link, useRouter, usePathname } from '@/i18n/routing';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
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
import { useFingerprint } from '@/hooks/use-fingerprint';
import { sortCandidatesForSidebar } from '@/lib/recruit/summary';
import { cn } from '@/lib/utils';
import type { CandidateSummary, RecruitJob, Recommendation } from '@/types/recruit';

const STATUS_DOT: Record<string, string> = {
  pending: 'bg-zinc-300 dark:bg-zinc-600',
  questions_ready: 'bg-amber-400',
  evaluated: 'bg-emerald-500',
};

const RECOMMENDATION_STYLE: Record<Recommendation, string> = {
  strong_hire: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
  hire: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
  hold: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  no_hire: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300',
};

export function CandidateSidebar({ jobId }: { jobId: string }) {
  const t = useTranslations('recruit');
  const tc = useTranslations('common');
  const router = useRouter();
  const pathname = usePathname();
  const { fingerprint, isLoading: fpLoading } = useFingerprint();

  const [job, setJob] = useState<RecruitJob | null>(null);
  const [candidates, setCandidates] = useState<CandidateSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [editOpen, setEditOpen] = useState(false);
  const [deleteJobOpen, setDeleteJobOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [newName, setNewName] = useState('');

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
      await load();
      router.push(`/recruit/${jobId}/c/${data.candidate.id}`);
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

  return (
    <aside className="w-full shrink-0 lg:w-[280px]">
      <div className="mb-4">
        <Link
          href="/recruit"
          className="inline-flex cursor-pointer items-center text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          {t('title')}
        </Link>
        <div className="mt-1 flex items-start justify-between gap-2">
          <h1 className="min-w-0 truncate text-xl font-bold" title={job?.title}>
            {job?.title ?? ''}
          </h1>
          <DropdownMenu>
            <DropdownMenuTrigger className="cursor-pointer rounded-md p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800">
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

      <div className="mb-3 flex gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('candidates.search')}
            className="h-9 pl-8 text-sm"
          />
        </div>
        <Button
          size="icon"
          onClick={() => setAddOpen(true)}
          className="h-9 w-9 shrink-0 cursor-pointer bg-brand hover:bg-brand-hover"
          title={t('candidates.add')}
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-14 rounded-lg" />
          ))}
        </div>
      ) : sorted.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-zinc-200 py-10 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
          {t('candidates.empty')}
        </div>
      ) : (
        <nav className="space-y-1">
          {sorted.map((c) => {
            const href = `/recruit/${jobId}/c/${c.id}`;
            const active = pathname.endsWith(`/c/${c.id}`);
            return (
              <Link
                key={c.id}
                href={href}
                className={cn(
                  'flex cursor-pointer items-center gap-2 rounded-lg border-l-2 px-3 py-2.5 transition-colors',
                  active
                    ? 'border-brand bg-brand/5'
                    : 'border-transparent hover:bg-zinc-100 dark:hover:bg-zinc-800',
                )}
              >
                <span className={cn('h-2 w-2 shrink-0 rounded-full', STATUS_DOT[c.status])} />
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{c.name || '—'}</span>
                {c.overallScore !== null && (
                  <span className="shrink-0 text-sm tabular-nums text-zinc-600 dark:text-zinc-300">
                    {c.overallScore}
                  </span>
                )}
                {c.recommendation && (
                  <Badge
                    className={cn('shrink-0 px-1.5 py-0 text-[10px]', RECOMMENDATION_STYLE[c.recommendation])}
                  >
                    {t(`recommendation.${c.recommendation}`)}
                  </Badge>
                )}
              </Link>
            );
          })}
        </nav>
      )}

      {job && (
        <JobFormDialog
          open={editOpen}
          onOpenChange={setEditOpen}
          job={job}
          onSaved={(updated) => setJob(updated)}
        />
      )}

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
              className="cursor-pointer bg-brand hover:bg-brand-hover"
            >
              {t('save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </aside>
  );
}
