import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { env } from '@/lib/env';

/** Cliente de serviço: ignora o RLS. Use só em rotas do servidor depois de checar permissão. */
export function createAdminClient() {
  return createClient(env.supabaseUrl, env.serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
