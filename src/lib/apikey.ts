import 'server-only';
import { createHash, randomBytes, timingSafeEqual } from 'crypto';
import { createAdminClient } from '@/lib/supabase/admin';

export const hashKey = (k: string) => createHash('sha256').update(k).digest('hex');

export function newApiKey() {
  const key = 'flx_' + randomBytes(24).toString('base64url');
  return { key, prefix: key.slice(0, 10), hash: hashKey(key) };
}

export function safeEqual(a: string, b: string) {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Autentica chamadas da API v1 (n8n das automações). Devolve o id da clínica. */
export async function clinicFromApiKey(req: Request): Promise<string | null> {
  const h = req.headers.get('authorization') || '';
  const key = (req.headers.get('x-api-key') || '').trim() || (h.startsWith('Bearer ') ? h.slice(7).trim() : '');
  if (!key.startsWith('flx_')) return null;
  const admin = createAdminClient();
  const { data } = await admin.from('api_keys').select('id, clinic_id, revoked_at').eq('key_hash', hashKey(key)).maybeSingle();
  if (!data || data.revoked_at) return null;
  await admin.from('api_keys').update({ last_used_at: new Date().toISOString() }).eq('id', data.id);
  return data.clinic_id as string;
}

export function internalAuthorized(req: Request): boolean {
  const t = req.headers.get('x-fluxa-token') || '';
  const expected = process.env.INTERNAL_API_TOKEN || '';
  return !!expected && safeEqual(t, expected);
}
