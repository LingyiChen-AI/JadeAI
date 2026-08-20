import { ReportPanel } from '@/components/recruit/report-panel';

export default async function ReportPage({
  params,
}: {
  params: Promise<{ jobId: string; candidateId: string }>;
}) {
  const { jobId, candidateId } = await params;
  return <ReportPanel jobId={jobId} candidateId={candidateId} />;
}
