import { NextRequest, NextResponse } from 'next/server';
import { recruitRepository } from '@/lib/db/repositories/recruit.repository';
import { updateCandidateInputSchema } from '@/lib/ai/recruit-schema';
import { requireOwnedCandidate } from '@/lib/recruit/access';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await requireOwnedCandidate(request, id);
  if ('error' in access) return access.error;

  const evaluation = await recruitRepository.findEvaluation(id);
  return NextResponse.json({
    candidate: access.candidate,
    job: access.job,
    evaluation,
  });
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await requireOwnedCandidate(request, id);
  if ('error' in access) return access.error;

  const body = await request.json();
  const parsed = updateCandidateInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid input', details: parsed.error.issues },
      { status: 400 },
    );
  }

  const candidate = await recruitRepository.updateCandidate(id, parsed.data as any);
  return NextResponse.json({ candidate });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await requireOwnedCandidate(request, id);
  if ('error' in access) return access.error;

  await recruitRepository.deleteCandidate(id);
  return NextResponse.json({ success: true });
}
