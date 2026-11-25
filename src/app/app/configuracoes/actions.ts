'use server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { getContext } from '@/lib/clinic';
import { normPhone } from '@/lib/utils';
import { newApiKey } from '@/lib/apikey';
import { createAdminClient } from '@/lib/supabase/admin';
import { LIMITS } from '@/lib/plans';

type S = { error?: string; ok?: string; key?: string; link?: string } | null;
const blank = (v: FormDataEntryValue | null) => { const s = String(v ?? '').trim(); return s || null; };
const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const filePath = (cid: string, folder: string) => z.string().regex(new RegExp(`^${cid}/${folder}/[0-9a-f-]{36}\\.(png|jpg|jpeg|webp)$`));

async function admin() {
  const ctx = await getContext();
  if (!ctx.isAdmin) throw new Error('Apenas dono ou administrador');
  return ctx;
}

export async function saveClinic(_: S, fd: FormData): Promise<S> {
  try {
    const { supabase, clinic } = await admin();
    const phone = blank(fd.get('whatsapp'));
    const { error } = await supabase.from('clinics').update({
      name: blank(fd.get('name')) || clinic.name, whatsapp: phone ? normPhone(phone) : null, phone: phone ? normPhone(phone) : null,
      email: blank(fd.get('email')), document: blank(fd.get('document')), city: blank(fd.get('city')), state: (blank(fd.get('state')) || '').toUpperCase() || null,
      address: blank(fd.get('address')), responsible_name: blank(fd.get('responsible_name')), responsible_reg: blank(fd.get('responsible_reg')),
      instagram: blank(fd.get('instagram')), google_review_url: blank(fd.get('google_review_url')),
    }).eq('id', clinic.id);
    if (error) return { error: error.message };
    revalidatePath('/app', 'layout');
    return { ok: 'Dados salvos.' };
  } catch (e) { return { error: (e as Error).message }; }
}

export async function saveBrand(input: { primary: string; secondary: string; accent: string; dark: string; logo_path?: string | null }): Promise<S> {
  try {
    const { supabase, clinic } = await admin();
    const b = z.object({ primary: hex, secondary: hex, accent: hex, dark: hex, logo_path: filePath(clinic.id, 'marca').nullable().optional() }).parse(input);
    const patch: Record<string, unknown> = { brand: { primary: b.primary, secondary: b.secondary, accent: b.accent, dark: b.dark } };
    if (b.logo_path !== undefined) patch.logo_path = b.logo_path;
    const { error } = await supabase.from('clinics').update(patch).eq('id', clinic.id);
    if (error) return { error: error.message };
    revalidatePath('/app/configuracoes');
    return { ok: 'Identidade visual salva.' };
  } catch (e) { return { error: (e as Error).message }; }
}

export async function saveProfessional(input: { id?: string; name: string; specialty?: string; registration?: string; bio?: string; photo_path?: string | null; active?: boolean }): Promise<S> {
  const { supabase, clinic } = await getContext();
  const p = z.object({
    id: z.string().uuid().optional(), name: z.string().trim().min(2).max(120), specialty: z.string().max(120).optional(),
    registration: z.string().max(60).optional(), bio: z.string().max(600).optional(), photo_path: filePath(clinic.id, 'profissionais').nullable().optional(),
    active: z.boolean().optional(),
  }).safeParse(input);
  if (!p.success) return { error: p.error.issues[0].message };
  const row = { ...p.data, clinic_id: clinic.id };
  const q = p.data.id ? supabase.from('professionals').update(row).eq('id', p.data.id).eq('clinic_id', clinic.id) : supabase.from('professionals').insert(row);
  const { error } = await q;
  if (error) return { error: error.message };
  revalidatePath('/app/configuracoes');
  return { ok: 'Profissional salvo.' };
}

export async function saveProcedure(_: S, fd: FormData): Promise<S> {
  const { supabase, clinic } = await getContext();
  const id = blank(fd.get('id'));
  const row = {
    clinic_id: clinic.id, name: blank(fd.get('name')) || 'Procedimento', category: blank(fd.get('category')),
    price: fd.get('price') ? Number(String(fd.get('price')).replace(',', '.')) || null : null,
    duration_min: Math.min(600, Math.max(5, Number(fd.get('duration_min')) || 60)),
    return_days: fd.get('return_days') ? Math.min(1095, Math.max(1, Number(fd.get('return_days')))) : null,
    active: fd.get('active') !== 'off',
  };
  const { error } = id ? await supabase.from('procedures').update(row).eq('id', id).eq('clinic_id', clinic.id) : await supabase.from('procedures').insert(row);
  if (error) return { error: error.message };
  revalidatePath('/app/configuracoes');
  return { ok: 'Salvo.' };
}

export async function saveStage(_: S, fd: FormData): Promise<S> {
  try {
    const { supabase, clinic } = await admin();
    const id = blank(fd.get('id'));
    const name = blank(fd.get('name'));
    if (!name) return { error: 'Nome obrigatório' };
    if (id) {
      const { error } = await supabase.from('stages').update({ name, color: blank(fd.get('color')) || '#64748B' }).eq('id', id).eq('clinic_id', clinic.id);
      if (error) return { error: error.message };
    } else {
      const { data: last } = await supabase.from('stages').select('position').eq('clinic_id', clinic.id).eq('kind', 'open').order('position', { ascending: false }).limit(1).maybeSingle();
      const pos = (last?.position ?? 0) + 1;
      await supabase.from('stages').update({ position: pos + 10 }).eq('clinic_id', clinic.id).neq('kind', 'open');
      const { error } = await supabase.from('stages').insert({ clinic_id: clinic.id, name, position: pos, kind: 'open' });
      if (error) return { error: error.message };
    }
    revalidatePath('/app/configuracoes'); revalidatePath('/app/crm');
    return { ok: 'Funil atualizado.' };
  } catch (e) { return { error: (e as Error).message }; }
}

export async function inviteMember(_: S, fd: FormData): Promise<S> {
  try {
    const { supabase, clinic, user } = await admin();
    const email = z.string().email('E-mail inválido').parse(String(fd.get('email') || '').trim().toLowerCase());
    const role = z.enum(['admin', 'staff']).parse(fd.get('role'));
    const { count } = await supabase.from('memberships').select('user_id', { count: 'exact', head: true }).eq('clinic_id', clinic.id);
    if ((count || 0) >= LIMITS[clinic.plan].usuarios) return { error: `Seu plano permite até ${LIMITS[clinic.plan].usuarios} usuários.` };
    const { data, error } = await supabase.from('invites').insert({ clinic_id: clinic.id, email, role, invited_by: user.id }).select('token').single();
    if (error) return { error: error.message };
    const link = `${process.env.NEXT_PUBLIC_APP_URL || ''}/convite/${data.token}`;
    // Cria o acesso e envia o e-mail de convite do Supabase (se a pessoa ainda não tem conta).
    const adm = createAdminClient();
    await adm.auth.admin.inviteUserByEmail(email, { redirectTo: `${process.env.NEXT_PUBLIC_APP_URL || ''}/auth/confirm?next=${encodeURIComponent('/nova-senha?depois=/convite/' + data.token)}` }).catch(() => null);
    revalidatePath('/app/configuracoes');
    return { ok: 'Convite criado. Se a pessoa já tem conta, envie o link abaixo.', link };
  } catch (e) { return { error: (e as Error).message }; }
}

export async function removeMember(fd: FormData) {
  const { supabase, clinic } = await admin();
  await supabase.from('memberships').delete().eq('clinic_id', clinic.id).eq('user_id', z.string().uuid().parse(fd.get('user_id')));
  revalidatePath('/app/configuracoes');
}

export async function createApiKey(_: S, fd: FormData): Promise<S> {
  try {
    const { clinic, user } = await admin();
    const k = newApiKey();
    const adm = createAdminClient();
    const { error } = await adm.from('api_keys').insert({ clinic_id: clinic.id, name: blank(fd.get('name')) || 'n8n', prefix: k.prefix, key_hash: k.hash, created_by: user.id });
    if (error) return { error: error.message };
    revalidatePath('/app/configuracoes');
    return { ok: 'Chave criada. Copie agora: ela não aparece de novo.', key: k.key };
  } catch (e) { return { error: (e as Error).message }; }
}

export async function revokeApiKey(fd: FormData) {
  const { clinic } = await admin();
  await createAdminClient().from('api_keys').update({ revoked_at: new Date().toISOString() }).eq('id', z.string().uuid().parse(fd.get('id'))).eq('clinic_id', clinic.id);
  revalidatePath('/app/configuracoes');
}
