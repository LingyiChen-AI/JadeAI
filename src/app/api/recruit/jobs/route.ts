import { NextRequest, NextResponse } from 'next/server';
import { recruitRepository } from '@/lib/db/repositories/recruit.repository';
import { createJobInputSchema } from '@/lib/ai/recruit-schema';
import { requireUser } from '@/lib/recruit/access';

export async function GET(request: NextRequest) {
  const auth = await requireUser(request);
  if ('error' in auth) return auth.error;

  const jobs = await recruitRepository.findJobsByUserId(auth.user.id);
  return NextResponse.json({ jobs });
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
