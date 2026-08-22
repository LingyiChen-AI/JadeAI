import { NextResponse } from 'next/server';
import { resolveUser, getUserIdFromRequest } from '@/lib/auth/helpers';
import { recruitRepository } from '@/lib/db/repositories/recruit.repository';

/**
 * 候选人和评价表都不存 userId，归属通过 jobId 上溯到岗位判断。
 * 五个 route 都要做这件事，所以抽出来。
 *
 * 返回 NextResponse 表示校验失败，调用方直接 return 它。
 */

export async function requireUser(request: Request) {
  const fingerprint = getUserIdFromRequest(request);
  const user = await resolveUser(fingerprint);
  if (!user) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }
  return { user };
}

export async function requireOwnedJob(request: Request, jobId: string) {
  const auth = await requireUser(request);
  // NOTE: re-return `{ error: auth.error }` rather than `auth` itself — TS loses
  // the discriminated-union narrowing for callers two levels up if we return the
  // narrowed union variable directly instead of a fresh object literal.
  if ('error' in auth) return { error: auth.error };

  const job = await recruitRepository.findJob(jobId);
  if (!job) {
    return { error: NextResponse.json({ error: 'Job not found' }, { status: 404 }) };
  }
  if (job.userId !== auth.user.id) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }
  return { user: auth.user, job };
}

export async function requireOwnedCandidate(request: Request, candidateId: string) {
  const auth = await requireUser(request);
  // See note in requireOwnedJob above.
  if ('error' in auth) return { error: auth.error };

  const candidate = await recruitRepository.findCandidate(candidateId);
  if (!candidate) {
    return { error: NextResponse.json({ error: 'Candidate not found' }, { status: 404 }) };
  }
  const job = await recruitRepository.findJob(candidate.jobId);
  if (!job || job.userId !== auth.user.id) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }
  return { user: auth.user, job, candidate };
}
