import { NextResponse } from 'next/server';
import { z } from 'zod';
import { apiContext, jsonError } from '@/lib/api-ctx';
import { generateImage, QuotaError } from '@/lib/gemini';
import { createAdminClient } from '@/lib/supabase/admin';

export const maxDuration = 120;
const RATIO = { feed: '4:5', story: '9:16', quadrado: '1:1' } as const;

export async function POST(req: Request) {
  const ctx = await apiContext();
  if ('error' in ctx) return ctx.error;
  const b = z.object({ creativeId: z.string().uuid(), descricao: z.string().trim().min(3).max(400) }).safeParse(await req.json().catch(() => ({})));
  if (!b.success) return jsonError(new Error('Descreva o fundo que você quer'), 400);
  const { supabase, clinic, user } = ctx;
  const { data: cr } = await supabase.from('creatives').select('id, format').eq('id', b.data.creativeId).eq('clinic_id', clinic.id).maybeSingle();
  if (!cr) return jsonError(new Error('Criativo não encontrado'), 404);

  const prompt = `Fotografia publicitária de fundo para anúncio de uma clínica ${clinic.kind === 'odonto' ? 'odontológica' : 'de estética'}: ${b.data.descricao}.
Sem pessoas, sem rostos, sem mãos, sem texto, sem letras, sem logotipos, sem marcas d'água. Iluminação suave, aparência real e profissional,
espaço livre para texto sobreposto, cores que combinem com ${clinic.brand.primary} e ${clinic.brand.accent}.`;
  try {
    const img = await generateImage({ clinicId: clinic.id, plan: clinic.plan, userId: user.id, feature: 'fundo_ia' }, prompt, RATIO[cr.format as keyof typeof RATIO]);
    const ext = img.mime.includes('jpeg') ? 'jpg' : img.mime.includes('webp') ? 'webp' : 'png';
    const path = `${clinic.id}/ia/${crypto.randomUUID()}.${ext}`;
    const admin = createAdminClient();
    const up = await admin.storage.from('clinic-files').upload(path, Buffer.from(img.data, 'base64'), { contentType: img.mime });
    if (up.error) throw new Error(up.error.message);
    await supabase.from('creatives').update({ bg_path: path, template: 'tipografico' }).eq('id', cr.id);
    const { data: signed } = await supabase.storage.from('clinic-files').createSignedUrl(path, 3600);
    return NextResponse.json({ ok: true, path, url: signed?.signedUrl });
  } catch (e) {
    return jsonError(e, e instanceof QuotaError ? 429 : 500);
  }
}
