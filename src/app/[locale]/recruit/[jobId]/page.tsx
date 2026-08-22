import { CandidateList } from '@/components/recruit/candidate-list';

export default async function JobPage({ params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  return <CandidateList jobId={jobId} />;
}
