import { CandidateSidebar } from '@/components/recruit/candidate-sidebar';

/**
 * 岗位工作区：左栏候选人 + 右侧内容。
 *
 * 左栏放在 layout 而不是各页面里，切换候选人时走客户端导航，
 * 左栏不重新挂载——搜索词和滚动位置都不会丢。
 */
export default async function JobWorkspaceLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ jobId: string }>;
}) {
  const { jobId } = await params;

  return (
    <div className="flex flex-col gap-6 lg:flex-row">
      <CandidateSidebar jobId={jobId} />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
