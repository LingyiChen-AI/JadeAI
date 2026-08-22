import { InterviewStage } from '@/components/recruit/interview-stage';

export default async function StagePage({
  params,
}: {
  params: Promise<{ jobId: string; candidateId: string }>;
}) {
  const { jobId, candidateId } = await params;
  return <InterviewStage jobId={jobId} candidateId={candidateId} />;
}
