'use server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { getContext } from '@/lib/clinic';

const pathOf = (clinicId: string) => z.string().regex(new RegExp(`^${clinicId}/[a-z]+/[0-9a-f-]{36}\\.(png|jpg|jpeg|webp)$`));

export async function createBrief(input: unknown): Promise<{ id?: string; error?: string }> {
  const { supabase, clinic, user, writable } = await getContext();
  if (!writable) return { error: 'Clínica em modo somente leitura' };
  const p = z.object({
    title: z.string().trim().min(2).max(100),
    objective: z.string().max(40),
    procedure_id: z.string().uuid().nullable(),
    professional_ids: z.array(z.string().uuid()).max(6),
    audience: z.string().max(300).optional(),
    tone: z.string().max(80).optional(),
    offer: z.string().max(500).optional(),
    instructions: z.string().max(1500).optional(),
    formats: z.array(z.enum(['feed', 'story', 'quadrado'])).min(1),
    photo_paths: z.array(pathOf(clinic.id)).max(6),
  }).safeParse(input);
  if (!p.success) return { error: p.error.issues[0].message };
  const { data, error } = await supabase.from('creative_briefs').insert({ ...p.data, clinic_id: clinic.id, created_by: user.id }).select('id').single();
  if (error) return { error: error.message };
  return { id: data.id };
}

const content = z.object({
  headline: z.string().max(120), destaque: z.string().max(60), subtitulo: z.string().max(220), bullets: z.array(z.string().max(70)).max(4),
  cta: z.string().max(40), selo: z.string().max(30), rodape: z.string().max(200).optional().default(''), fotoIndex: z.number().int().min(-1).max(20),
  paleta: z.enum(['marca', 'escuro', 'claro']),
});

export async function saveCreative(input: unknown): Promise<{ ok?: boolean; error?: string }> {
  const { supabase, clinic } = await getContext();
  const p = z.object({
    id: z.string().uuid(), template: z.enum(['destaque', 'lateral', 'lista', 'autoridade', 'tipografico']), content,
    ad_copy: z.object({ texto_principal: z.string().max(3000), titulo: z.string().max(100), descricao: z.string().max(100), cta: z.string().max(40) }),
  }).safeParse(input);
  if (!p.success) return { error: p.error.issues[0].message };
  const { error } = await supabase.from('creatives').update({ template: p.data.template, content: p.data.content, ad_copy: p.data.ad_copy }).eq('id', p.data.id).eq('clinic_id', clinic.id);
  if (error) return { error: error.message };
  return { ok: true };
}

export async function setCreativeImage(id: string, path: string) {
  const { supabase, clinic } = await getContext();
  const p = z.object({ id: z.string().uuid(), path: pathOf(clinic.id) }).safeParse({ id, path });
  if (!p.success) return { error: 'Arquivo inválido' };
  const { error } = await supabase.from('creatives').update({ image_path: p.data.path, status: 'aprovado' }).eq('id', p.data.id).eq('clinic_id', clinic.id);
  return error ? { error: error.message } : { ok: true };
}

export async function archiveCreative(id: string) {
  const { supabase, clinic } = await getContext();
  await supabase.from('creatives').update({ status: 'arquivado' }).eq('id', z.string().uuid().parse(id)).eq('clinic_id', clinic.id);
  revalidatePath('/app/criativos');
}

export async function deleteBrief(fd: FormData) {
  const { supabase, clinic } = await getContext();
  await supabase.from('creative_briefs').delete().eq('id', z.string().uuid().parse(fd.get('id'))).eq('clinic_id', clinic.id);
  revalidatePath('/app/criativos');
}
