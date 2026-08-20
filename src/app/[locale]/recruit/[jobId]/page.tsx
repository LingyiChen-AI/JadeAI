'use client';

import { use, useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useRouter } from '@/i18n/routing';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
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
import { CandidateTable } from '@/components/recruit/candidate-table';
import { JobFormDialog } from '@/components/recruit/job-form-dialog';
import { useFingerprint } from '@/hooks/use-fingerprint';
import type { CandidateSummary, RecruitJob } from '@/types/recruit';

export default function JobDetailPage({ params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = use(params);
  const t = useTranslations('recruit');
  const tc = useTranslations('common');
  const router = useRouter();
  const { fingerprint, isLoading: fpLoading } = useFingerprint();

  const [job, setJob] = useState<RecruitJob | null>(null);
  const [candidates, setCandidates] = useState<CandidateSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [deleteJobOpen, setDeleteJobOpen] = useState(false);

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

  if (loading) return <Skeleton className="h-64 rounded-xl" />;
  if (!job) return null;

  return (
    <div>
      <div className="mb-6 flex items-center justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold">{job.title}</h1>
          <p className="mt-1 text-sm text-zinc-500">
            {t('candidateCount', { count: candidates.length })}
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button variant="outline" onClick={() => setEditOpen(true)} className="cursor-pointer gap-2">
            <Pencil className="h-4 w-4" />
            {t('editJob')}
          </Button>
          <Button variant="outline" onClick={() => setDeleteJobOpen(true)} className="cursor-pointer gap-2">
            <Trash2 className="h-4 w-4" />
            {t('deleteJob')}
          </Button>
        </div>
      </div>

      <Card className="mb-6 p-5">
        <h2 className="mb-2 text-sm font-medium">{t('jobDescription')}</h2>
        <p className="whitespace-pre-wrap text-sm text-zinc-600 dark:text-zinc-400">
          {job.jobDescription}
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {job.dimensions.map((d) => (
            <span
              key={d.key}
              className="rounded-full bg-zinc-100 px-3 py-1 text-xs dark:bg-zinc-800"
            >
              {d.label} × {d.weight}
            </span>
          ))}
        </div>
      </Card>

      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-lg font-medium">{t('candidates.title')}</h2>
        <Button onClick={() => setAddOpen(true)} className="cursor-pointer gap-2 bg-brand hover:bg-brand-hover">
          <Plus className="h-4 w-4" />
          {t('candidates.add')}
        </Button>
      </div>

      <CandidateTable
        jobId={jobId}
        candidates={candidates}
        onDeleted={(id) => setCandidates((prev) => prev.filter((c) => c.id !== id))}
      />

      <JobFormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        job={job}
        onSaved={(updated) => setJob(updated)}
      />

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
            <Button onClick={handleAddCandidate} disabled={!newName.trim()} className="cursor-pointer">
              {t('save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
    </div>
  );
}
