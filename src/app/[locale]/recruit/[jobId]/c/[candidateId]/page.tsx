'use client';

import { use } from 'react';
import { CandidateWorkspace } from '@/components/recruit/candidate-workspace';

export default function CandidatePage({
  params,
}: {
  params: Promise<{ jobId: string; candidateId: string }>;
}) {
  const { jobId, candidateId } = use(params);
  return <CandidateWorkspace jobId={jobId} candidateId={candidateId} />;
}
