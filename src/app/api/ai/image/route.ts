import { NextResponse } from 'next/server';
import { z } from 'zod';
import { apiContext, jsonError } from '@/lib/api-ctx';
import { generateImage, QuotaError } from '@/lib/gemini';
import { createAdminClient } from '@/lib/supabase/admin';
import type { CreativeContent } from '@/lib/types';

export const maxDuration = 120;
const RATIO = { feed: '4:5', story: '9:16', quadrado: '1:1' } as const;

/**
 * Fundo fotográfico por IA.
 * - { grupo }: automático. Gera UM fundo por variação, usado em todos os formatos dela (feed, story...), a partir da "cena" que a IA de texto escreveu.
 * - { creativeId, descricao }: manual (botão "Fundo com IA" no estúdio), só para a arte aberta.
 */
export async function POST(req: Request) {
  const ctx = await apiContext();
  if ('error' in ctx) return ctx.error;
  const b = z.union([
    z.object({ grupo: z.string().uuid() }),
    z.object({ creativeId: z.string().uuid(), descricao: z.string().trim().min(3).max(400) }),
  ]).safeParse(await req.json().catch(() => ({})));
  if (!b.success) return jsonError(new Error('Descreva o fundo que você quer'), 400);
  const { supabase, clinic, user } = ctx;

  const q = supabase.from('creatives').select('id, format, content, bg_path').eq('clinic_id', clinic.id);
  const { data: crs } = 'grupo' in b.data ? await q.eq('content->>grupo', b.data.grupo) : await q.eq('id', b.data.creativeId);
  if (!crs?.length) return jsonError(new Error('Criativo não encontrado'), 404);

  const auto = 'grupo' in b.data;
  const setFundo = async (estado: 'ok' | 'sem', bg?: string) => {
    for (const c of crs) {
      await supabase.from('creatives').update({ ...(bg ? { bg_path: bg } : {}), content: { ...(c.content as CreativeContent), fundo: estado } }).eq('id', c.id);
    }
  };

  // Automático e já tem fundo (outra aba gerou antes): só devolve
  const pronto = auto ? crs.find((c) => c.bg_path)?.bg_path : null;
  if (pronto) {
    await setFundo('ok', pronto);
    const { data: signed } = await supabase.storage.from('clinic-files').createSignedUrl(pronto, 3600);
    return NextResponse.json({ ok: true, path: pronto, url: signed?.signedUrl, ids: crs.map((c) => c.id) });
  }

  const cena = auto ? ((crs[0].content as CreativeContent).cena || '').trim() : (b.data as { descricao: string }).descricao;
  if (!cena) { await setFundo('sem'); return jsonError(new Error('Sem cenário para o fundo'), 400); }
  // Um fundo serve a todos os formatos: gera no mais alto (story) e recorta para os outros
  const fmts = crs.map((c) => c.format as keyof typeof RATIO);
  const ratio = fmts.includes('story') ? '9:16' : fmts.includes('feed') ? '4:5' : RATIO[fmts[0]] || '4:5';

  const prompt = `Fotografia publicitária profissional para fundo de anúncio de uma clínica ${clinic.kind === 'odonto' ? 'odontológica' : 'de estética'} no Instagram.
Cena: ${cena}.
Estilo: editorial, moderno e sofisticado, como campanha de marca premium. Iluminação suave e bem trabalhada, profundidade de campo rasa com desfoque elegante,
cores harmoniosas que combinem com ${clinic.brand.primary} e ${clinic.brand.accent}, alta nitidez, aparência real (não ilustração).
Composição com bastante espaço limpo e pouco detalhado no centro e na metade de baixo, onde vai o texto do anúncio.
Proibido: pessoas, rostos, mãos, partes do corpo, dentes, pele em close, texto, letras, números, logotipos, marcas d'água, antes e depois.`;
  try {
    const img = await generateImage({ clinicId: clinic.id, plan: clinic.plan, userId: user.id, feature: auto ? 'fundo_auto' : 'fundo_ia' }, prompt, ratio);
    const ext = img.mime.includes('jpeg') ? 'jpg' : img.mime.includes('webp') ? 'webp' : 'png';
    const path = `${clinic.id}/ia/${crypto.randomUUID()}.${ext}`;
    const admin = createAdminClient();
    const up = await admin.storage.from('clinic-files').upload(path, Buffer.from(img.data, 'base64'), { contentType: img.mime });
    if (up.error) throw new Error(up.error.message);
    await setFundo('ok', path);
    const { data: signed } = await supabase.storage.from('clinic-files').createSignedUrl(path, 3600);
    return NextResponse.json({ ok: true, path, url: signed?.signedUrl, ids: crs.map((c) => c.id) });
  } catch (e) {
    // Automático que falhou não tenta de novo a cada visita: a arte segue com cor sólida e o botão "Fundo com IA" continua disponível
    if (auto) await setFundo('sem');
    return jsonError(e, e instanceof QuotaError ? 429 : 500);
  }
}
