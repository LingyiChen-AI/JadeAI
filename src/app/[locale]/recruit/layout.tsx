import { Header } from '@/components/layout/header';
import { SettingsDialog } from '@/components/settings/settings-dialog';

export default function RecruitLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-background">
      <Header />
      {/* 工作区要用满宽屏；岗位列表页自己再收窄 */}
      <main className="mx-auto max-w-[1600px] px-4 py-8">{children}</main>
      <SettingsDialog />
    </div>
  );
}
