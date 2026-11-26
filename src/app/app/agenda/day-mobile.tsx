'use client';
import { useEffect } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

/** No celular, a agenda abre na visão de um dia (a semana inteira não cabe na tela). */
export function DayOnMobile() {
  const router = useRouter();
  const path = usePathname();
  const sp = useSearchParams();
  useEffect(() => {
    if (sp.get('modo') || !window.matchMedia('(max-width: 639.98px)').matches) return;
    const q = new URLSearchParams(sp.toString());
    q.set('modo', 'dia');
    router.replace(`${path}?${q.toString()}${window.location.hash}`, { scroll: false });
  }, [path, router, sp]);
  return null;
}
