'use client';

import { JobList } from '@/components/recruit/job-list';

export default function RecruitPage() {
  // 容器和 Header、面试模拟保持完全一致，标题才会和 logo 左对齐
  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <JobList />
    </div>
  );
}
