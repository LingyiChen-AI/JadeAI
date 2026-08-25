import { InterviewStage } from '@/components/recruit/interview-stage';

export default async function StagePage({
  params,
  searchParams,
}: {
  params: Promise<{ jobId: string; candidateId: string }>;
  searchParams: Promise<{ mode?: string }>;
}) {
  const { jobId, candidateId } = await params;
  const { mode } = await searchParams;
  return <InterviewStage jobId={jobId} candidateId={candidateId} readOnly={mode === 'view'} />;
}
