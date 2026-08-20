import { PrepPanel } from '@/components/recruit/prep-panel';

export default async function PrepPage({
  params,
}: {
  params: Promise<{ jobId: string; candidateId: string }>;
}) {
  const { jobId, candidateId } = await params;
  return <PrepPanel jobId={jobId} candidateId={candidateId} />;
}
