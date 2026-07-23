'use client';

import { use } from 'react';
import { ExportWorkbenchPage } from '@/components/export-workbench/export-workbench-page';

export default function ExportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <ExportWorkbenchPage resumeId={id} />;
}
