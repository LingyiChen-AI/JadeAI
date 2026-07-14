export default async function AdminLayout({ children, params }: { children: React.ReactNode; params: Promise<{ locale: string }> }) {
  return <div className="min-h-screen bg-zinc-50 p-6 dark:bg-background">{children}</div>;
}
