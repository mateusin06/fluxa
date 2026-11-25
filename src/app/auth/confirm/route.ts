import { NextResponse, type NextRequest } from 'next/server';
import type { EmailOtpType } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';

// Links de e-mail (confirmação, convite, recuperação): token_hash ou code.
export async function GET(req: NextRequest) {
  const u = req.nextUrl;
  const next = u.searchParams.get('next') || '/app';
  const safe = next.startsWith('/') && !next.startsWith('//') ? next : '/app';
  const supabase = await createClient();
  const code = u.searchParams.get('code');
  const tokenHash = u.searchParams.get('token_hash');
  const type = u.searchParams.get('type') as EmailOtpType | null;
  let error: string | null = null;
  if (code) error = (await supabase.auth.exchangeCodeForSession(code)).error?.message || null;
  else if (tokenHash && type) error = (await supabase.auth.verifyOtp({ token_hash: tokenHash, type })).error?.message || null;
  else error = 'Link inválido';
  const to = new URL(error ? `/entrar?erro=${encodeURIComponent('Link expirado ou inválido. Entre ou peça outro link.')}` : safe, req.url);
  return NextResponse.redirect(to);
}
