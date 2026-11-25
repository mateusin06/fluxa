'use server';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { CLINIC_COOKIE } from '@/lib/clinic';

export async function switchClinic(fd: FormData) {
  const id = String(fd.get('clinic_id') || '');
  if (!/^[0-9a-f-]{36}$/i.test(id)) return;
  (await cookies()).set(CLINIC_COOKIE, id, { httpOnly: true, sameSite: 'lax', secure: true, path: '/', maxAge: 31536000 });
  redirect('/app');
}
