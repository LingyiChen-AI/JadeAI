import Image from 'next/image';
import { Link } from '@/i18n/routing';

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-zinc-50 px-4 dark:bg-zinc-950">
      {/* Animated gradient blobs */}
      <div
        className="absolute right-[10%] top-[10%] h-[600px] w-[600px] rounded-full opacity-20 blur-[120px] dark:opacity-[0.07]"
        style={{ background: 'radial-gradient(circle, #ec4899, transparent 70%)' }}
      />
      <div
        className="absolute -bottom-20 left-[5%] h-[500px] w-[500px] rounded-full opacity-15 blur-[120px] dark:opacity-[0.05]"
        style={{ background: 'radial-gradient(circle, #a855f7, transparent 70%)' }}
      />
      <div
        className="absolute left-[40%] top-[60%] h-[300px] w-[300px] rounded-full opacity-10 blur-[100px] dark:opacity-[0.05]"
        style={{ background: 'radial-gradient(circle, #3b82f6, transparent 70%)' }}
      />

      {/* Dot grid */}
      <div
        className="absolute inset-0 opacity-[0.03] dark:opacity-[0.04]"
        style={{
          backgroundImage: 'radial-gradient(circle, #71717a 1px, transparent 1px)',
          backgroundSize: '24px 24px',
        }}
      />

      {/* Logo - top left */}
      <div className="absolute left-6 top-6 z-20">
        <Link href="/" className="transition-opacity hover:opacity-80">
          <Image src="/logo-offer.svg" alt="小逆offer" width={100} height={30} />
        </Link>
      </div>

      {/* Glass card */}
      <div className="relative z-10 w-full max-w-[400px]">
        <div className="rounded-2xl border border-white/60 bg-white/70 p-8 shadow-xl shadow-zinc-900/5 backdrop-blur-xl sm:p-10 dark:border-zinc-800/60 dark:bg-zinc-900/70 dark:shadow-black/20">
          {children}
        </div>
      </div>
    </div>
  );
}
