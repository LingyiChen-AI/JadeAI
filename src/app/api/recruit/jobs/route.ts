import { NextRequest, NextResponse } from 'next/server';
import { recruitRepository } from '@/lib/db/repositories/recruit.repository';
import { createJobInputSchema } from '@/lib/ai/recruit-schema';
import { requireUser } from '@/lib/recruit/access';
import { aggregateJobStats } from '@/lib/recruit/job-stats';

export async function GET(request: NextRequest) {
  const auth = await requireUser(request);
  if ('error' in auth) return auth.error;

  const [jobs, statRows] = await Promise.all([
    recruitRepository.findJobsByUserId(auth.user.id),
    recruitRepository.findCandidateStatsByUserId(auth.user.id),
  ]);
  // 岗位卡片要显示候选人数/已面/通过，按 jobId 聚合后一起返回
  return NextResponse.json({ jobs, stats: aggregateJobStats(statRows) });
}

export async function POST(request: NextRequest) {
  const auth = await requireUser(request);
  if ('error' in auth) return auth.error;

  const body = await request.json();
  const parsed = createJobInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid input', details: parsed.error.issues },
      { status: 400 },
    );
  }

  const job = await recruitRepository.createJob({
    userId: auth.user.id,
    ...parsed.data,
  });
  return NextResponse.json({ job }, { status: 201 });
}
