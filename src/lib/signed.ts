import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

/** URLs temporárias (1h) para arquivos privados da clínica. */
export async function signMany(sb: SupabaseClient, paths: (string | null | undefined)[]) {
  const list = [...new Set(paths.filter((p): p is string => !!p))];
  if (!list.length) return {} as Record<string, string>;
  const { data } = await sb.storage.from('clinic-files').createSignedUrls(list, 3600);
  const out: Record<string, string> = {};
  (data || []).forEach((d) => { if (d.path && d.signedUrl) out[d.path] = d.signedUrl; });
  return out;
}
