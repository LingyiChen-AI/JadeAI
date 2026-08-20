'use client';

import { use } from 'react';
import { JobOverview } from '@/components/recruit/job-overview';

export default function JobDetailPage({ params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = use(params);
  return <JobOverview jobId={jobId} />;
}
