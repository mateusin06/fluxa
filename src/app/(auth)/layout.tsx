import Link from 'next/link';
import { Logo } from '@/components/logo';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-ink px-4 py-10">
      <div className="w-full max-w-md">
        <Link href="/" className="mb-8 flex justify-center" aria-label="Fluxa, página inicial"><Logo dark /></Link>
        <div className="rounded-2xl bg-white p-6 shadow-xl sm:p-8">{children}</div>
      </div>
    </main>
  );
}
