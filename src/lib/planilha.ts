import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { normPhone } from '@/lib/utils';
import { freeSlotsPros, rowToSlot, slotId, slotRow, VIRTUAL_ROW0 } from '@/lib/slots';
import { checkFit, freePro, loadSchedule } from '@/lib/schedule';
import { cleanInsurance, decidePayer, acceptedInsurance, type InsClinic } from '@/lib/insurance';
import { applyContactInsurance, insClinic } from '@/lib/insurance-db';

/**
 * Adaptador "planilha" para as automações da biblioteca Fluxa (n8n).
 * Os fluxos foram feitos para o Google Sheets: leem abas com cabeçalho e gravam "Aba!ColunaLinha".
 * Aqui cada aba vira uma visão das tabelas do sistema, com a coluna extra `_row` (linha estável do registro).
 * Assim os mesmos fluxos funcionam com o sistema trocando só o endereço (usa_sistema = SIM no Config).
 * Colunas novas entram DEPOIS de `_row`, para não mudar a letra das colunas que os fluxos já usam.
 */

export const HEADERS: Record<string, string[]> = {
  Agenda: ['id', 'nome', 'telefone', 'data_hora', 'profissional', 'procedimento', 'status', 'lembrete1_em', 'lembrete2_em', 'alerta_em', 'confirmado_em', 'pos_enviado_em', 'avaliacao_pedida_em', 'nota', '_row', 'pagamento', 'convenio', 'guia'],
  Pacientes: ['id', 'nome', 'telefone', 'nascimento', 'ultimo_atendimento', 'proximo_agendamento', 'procedimento_ultimo', 'reativacao_em', 'retorno_msg_em', 'aniversario_enviado_ano', '_row', 'convenio', 'carteirinha'],
  Leads: ['id', 'nome', 'telefone', 'origem', 'criado_em', 'avaliacao_em', 'status', 'agenda_id', '_row', 'convenio', 'carteirinha', 'convenio_aceito'],
  Optout: ['telefone', '_row'],
  Espera: ['id', 'nome', 'telefone', 'procedimento', 'desde', 'status', 'oferta_em', 'ultima_oferta_slot', '_row'],
  Financeiro: ['id', 'nome', 'telefone', 'valor', 'vencimento', 'status', 'etapa_cobranca', 'link_pagamento', 'ultima_cobranca_em', 'alerta_gestor_em', '_row'],
  Log: ['timestamp', 'fluxo', 'nome', 'telefone', 'template', 'status_http', 'wa_id_ou_erro', '_row'],
  Respostas: ['timestamp', 'telefone', 'tipo', 'payload', 'texto', 'wa_id', '_row'],
  /** Só leitura: convênios que a clínica atende (Clínica e equipe → Convênios). Vazia = atende só particular. */
  Convenios: ['convenio', '_row'],
};
const SO_LEITURA = 'A aba Convenios é só leitura: os convênios são editados no sistema, em Clínica e equipe → Convênios.';
export const TABS = Object.keys(HEADERS);

const APPT_STATUS = new Set(['livre', 'agendado', 'confirmado', 'remarcar', 'cancelado', 'realizado', 'faltou']);
const HR = 3600000;
const p2 = (n: number) => String(n).padStart(2, '0');

/** ISO -> "AAAA-MM-DD HH:mm" no horário de Brasília (formato que os fluxos entendem). */
export function fmtDT(iso: string | null | undefined) {
  if (!iso) return '';
  const d = new Date(new Date(iso).getTime() - 3 * HR);
  return `${d.getUTCFullYear()}-${p2(d.getUTCMonth() + 1)}-${p2(d.getUTCDate())} ${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}`;
}
const fmtD = (iso: string | null | undefined) => (iso ? fmtDT(iso).slice(0, 10) : '');

/** "AAAA-MM-DD HH:mm" ou "DD/MM/AAAA HH:mm" (Brasília) -> ISO. */
export function parseDT(s: string): string | null {
  const t = String(s || '').trim();
  let m = t.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{1,2}):(\d{2}))?/);
  if (m) return new Date(`${m[1]}-${m[2]}-${m[3]}T${p2(Number(m[4] || 0))}:${m[5] || '00'}:00-03:00`).toISOString();
  m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ ,]+(\d{1,2}):(\d{2}))?/);
  if (m) return new Date(`${m[3]}-${p2(Number(m[2]))}-${p2(Number(m[1]))}T${p2(Number(m[4] || 0))}:${m[5] || '00'}:00-03:00`).toISOString();
  return null;
}
const parseDate = (s: string) => { const iso = parseDT(s); return iso ? fmtD(iso) : null; };

const colIndex = (letters: string) => [...letters.toUpperCase()].reduce((a, c) => a * 26 + c.charCodeAt(0) - 64, 0) - 1;

type Db = SupabaseClient;
type Obj = Record<string, unknown>;
const S = (v: unknown) => (v === null || v === undefined ? '' : String(v));
const meta = (o: { meta?: unknown }) => ((o.meta as Obj) || {}) as Obj;

async function all<T>(q: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>, max = 20000): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; from < max; from += 1000) {
    const { data, error } = await q(from, from + 999);
    if (error) throw new Error(error.message);
    if (!data?.length) break;
    out.push(...data);
    if (data.length < 1000) break;
  }
  return out;
}

/**
 * Horários livres gerados do horário de atendimento (Configurações). Não existem na tabela:
 * cada um ganha um id "livre-AAAAMMDDHHmm" e uma linha >= 900000000 que codifica o horário.
 * Quando a automação grava nessa linha (lead escolheu o horário), a consulta é criada de verdade.
 */
async function virtualFree(db: Db, cid: string, list: Obj[]): Promise<Obj[]> {
  const s = await loadSchedule(db, cid);
  if (!s.hasHours) return [];
  const now = Date.now(), to = now + s.daysAhead * 86400000;
  const busy = list.filter((r) => !['cancelado', 'livre'].includes(String(r.status)))
    .map((r) => ({ start: new Date(r.starts_at as string).getTime(), end: new Date(r.ends_at as string).getTime(), pro: (r.professional_id as string | null) || null }));
  const manual = new Set(list.filter((r) => r.status === 'livre').map((r) => new Date(r.starts_at as string).getTime()));
  return freeSlotsPros({ pros: s.pros, clinicHours: s.hours, busy, from: now, to, durMin: s.slotMin, stepMin: s.slotMin, capacity: s.capacity, procId: s.slotProc?.id })
    .filter((x) => !manual.has(x.t))
    .map(({ t }) => ({ id: slotId(t), data_hora: fmtDT(new Date(t).toISOString()), status: 'livre', procedimento: '', _row: slotRow(t) }));
}

// ---------------------------------------------------------------- leitura
export async function readTab(db: Db, cid: string, tab: string): Promise<string[][]> {
  const H = HEADERS[tab];
  if (!H) throw new Error(`A aba "${tab}" não existe no modo sistema. Abas disponíveis: ${TABS.join(', ')}.`);
  const row = (o: Obj) => H.map((h) => S(o[h]));
  const now = Date.now();

  if (tab === 'Agenda') {
    const from = new Date(now - 120 * 86400000).toISOString(), to = new Date(now + 120 * 86400000).toISOString();
    const list = await all<Obj>((a, b) => db.from('appointments')
      .select('id, starts_at, ends_at, status, meta, sheet_row, procedure_text, professional_id, payer, insurance, insurance_auth, contact:contacts(name, phone), professional:professionals(name), procedure:procedures(name)')
      .eq('clinic_id', cid).gte('starts_at', from).lt('starts_at', to).order('sheet_row').range(a, b));
    const rows = list.map((r) => {
      const c = (r.contact as Obj) || {}, m = meta(r);
      return row({ ...m, id: r.id, nome: c.name, telefone: c.phone, data_hora: fmtDT(r.starts_at as string), profissional: (r.professional as Obj)?.name,
        procedimento: (r.procedure as Obj)?.name || r.procedure_text || m.procedimento, status: r.status, _row: r.sheet_row,
        pagamento: r.payer, convenio: r.insurance || '', guia: r.insurance_auth || '' });
    });
    return [H, ...rows, ...(await virtualFree(db, cid, list)).map(row)];
  }

  if (tab === 'Pacientes' || tab === 'Leads' || tab === 'Optout') {
    const q = (a: number, b: number) => {
      let x = db.from('contacts').select('id, name, phone, birth_date, last_visit_at, consent_whatsapp, source_detail, created_at, meta, sheet_row, insurance, insurance_card').eq('clinic_id', cid);
      if (tab === 'Leads') x = x.eq('meta->>lead', 'sim');
      if (tab === 'Optout') x = x.eq('consent_whatsapp', false);
      return x.order('sheet_row').range(a, b);
    };
    const list = await all<Obj>(q);
    if (tab === 'Optout') {
      const extra = await all<Obj>((a, b) => db.from('sheet_rows').select('data, sheet_row').eq('clinic_id', cid).eq('tab', 'Optout').order('sheet_row').range(a, b));
      return [H, ...list.filter((c) => c.phone).map((c) => row({ telefone: c.phone, _row: c.sheet_row })), ...extra.map((r) => row({ telefone: (r.data as Obj).telefone, _row: 'x' + r.sheet_row }))];
    }
    if (tab === 'Leads') {
      const ic = await insClinic(db, cid);
      return [H, ...list.map((c) => { const m = meta(c); return row({ ...m, id: m.lead_id || c.id, nome: c.name, telefone: c.phone, origem: m.origem || c.source_detail, criado_em: m.criado_em || fmtDT(c.created_at as string), _row: c.sheet_row,
        convenio: c.insurance || '', carteirinha: c.insurance_card || '', convenio_aceito: c.insurance ? (acceptedInsurance(ic, c.insurance as string) ? 'sim' : 'nao') : '' }); })];
    }
    // Pacientes: último atendimento, próximo agendamento e último procedimento vêm da agenda
    const done = await all<Obj>((a, b) => db.from('appointments').select('contact_id, starts_at, procedure_text, procedure:procedures(name), meta')
      .eq('clinic_id', cid).eq('status', 'realizado').order('starts_at', { ascending: false }).range(a, b), 40000);
    const next = await all<Obj>((a, b) => db.from('appointments').select('contact_id, starts_at')
      .eq('clinic_id', cid).in('status', ['agendado', 'confirmado']).gt('starts_at', new Date().toISOString()).order('starts_at').range(a, b));
    const last = new Map<string, Obj>(), nx = new Map<string, string>();
    done.forEach((d) => { if (d.contact_id && !last.has(d.contact_id as string)) last.set(d.contact_id as string, d); });
    next.forEach((d) => { if (d.contact_id && !nx.has(d.contact_id as string)) nx.set(d.contact_id as string, d.starts_at as string); });
    return [H, ...list.map((c) => {
      const m = meta(c), l = last.get(c.id as string);
      const lv = [l?.starts_at as string | undefined, c.last_visit_at as string | undefined].filter(Boolean).sort().pop();
      return row({ ...m, id: c.id, nome: c.name, telefone: c.phone, nascimento: c.birth_date || '', ultimo_atendimento: fmtD(lv), proximo_agendamento: fmtDT(nx.get(c.id as string)),
        procedimento_ultimo: (l?.procedure as Obj)?.name || l?.procedure_text || meta(l || {}).procedimento || '', _row: c.sheet_row,
        convenio: c.insurance || '', carteirinha: c.insurance_card || '' });
    })];
  }

  if (tab === 'Espera') {
    const list = await all<Obj>((a, b) => db.from('waitlist').select('id, status, procedure_text, meta, sheet_row, created_at, contact:contacts(name, phone), procedure:procedures(name)')
      .eq('clinic_id', cid).neq('status', 'cancelado').order('sheet_row').range(a, b));
    return [H, ...list.map((r) => { const c = (r.contact as Obj) || {}; return row({ ...meta(r), id: r.id, nome: c.name, telefone: c.phone, procedimento: (r.procedure as Obj)?.name || r.procedure_text, desde: fmtDT(r.created_at as string), status: r.status, _row: r.sheet_row }); })];
  }

  if (tab === 'Financeiro') {
    const list = await all<Obj>((a, b) => db.from('charges').select('id, amount, due_date, status, payment_link, meta, sheet_row, contact:contacts(name, phone)')
      .eq('clinic_id', cid).neq('status', 'cancelado').eq('payer', 'paciente').order('sheet_row').range(a, b));
    return [H, ...list.map((r) => { const c = (r.contact as Obj) || {}; return row({ ...meta(r), id: r.id, nome: c.name, telefone: c.phone, valor: Number(r.amount).toFixed(2), vencimento: r.due_date, status: r.status, link_pagamento: r.payment_link, _row: r.sheet_row }); })];
  }

  if (tab === 'Convenios') {
    const ic = await insClinic(db, cid);
    return [H, ...(ic.accepts_insurance ? ic.insurances || [] : []).map((n, i) => row({ convenio: n, _row: i + 2 }))];
  }

  // Log e Respostas
  const list = await all<Obj>((a, b) => db.from('sheet_rows').select('data, sheet_row').eq('clinic_id', cid).eq('tab', tab).order('sheet_row', { ascending: false }).range(a, b), 5000);
  return [H, ...list.reverse().map((r) => row({ ...(r.data as Obj), _row: r.sheet_row }))];
}

// ---------------------------------------------------------------- escrita
async function contactByPhone(db: Db, cid: string, phone: string | null, name?: string, create = true, extra: Obj = {}) {
  if (!phone) return null;
  const { data } = await db.from('contacts').select('id, meta').eq('clinic_id', cid).eq('phone', phone).maybeSingle();
  if (data) return data as { id: string; meta: Obj };
  if (!create) return null;
  const { data: c, error } = await db.from('contacts').insert({ clinic_id: cid, name: name || phone, phone, source: 'whatsapp', ...extra }).select('id, meta').single();
  if (error) throw new Error(error.message);
  return c as { id: string; meta: Obj };
}

/** Pagamento pedido pela automação (colunas pagamento/convenio da Agenda) ou o convênio do paciente. */
async function payerOf(db: Db, cid: string, contactId: string | null | undefined, sets: Record<string, string>, ic?: InsClinic) {
  if (!contactId) return { payer: 'particular' as const, insurance: null, insurance_auth: null };
  const clinic = ic || (await insClinic(db, cid));
  const { data: ct } = await db.from('contacts').select('insurance').eq('id', contactId).maybeSingle();
  const want = /conv/i.test(sets.pagamento || '') || (cleanInsurance(sets.convenio) && !/partic/i.test(sets.pagamento || '')) ? 'convenio' : /partic/i.test(sets.pagamento || '') ? 'particular' : '';
  const p = decidePayer(clinic, ct?.insurance, want, sets.convenio);
  return { payer: p.payer, insurance: p.insurance, insurance_auth: p.payer === 'convenio' ? (sets.guia || '').trim().slice(0, 40) || null : null };
}

async function byName(db: Db, table: 'procedures' | 'professionals', cid: string, name: string) {
  if (!name) return null;
  const { data } = await db.from(table).select('id').eq('clinic_id', cid).ilike('name', name.trim()).limit(1);
  return data?.[0]?.id || null;
}

async function procByName(db: Db, cid: string, name: string) {
  if (!name) return null;
  const { data } = await db.from('procedures').select('id, name, duration_min, price').eq('clinic_id', cid).ilike('name', name.trim()).limit(1);
  return (data?.[0] as { id: string; name: string; duration_min: number; price: number | null } | undefined) || null;
}

/** Lead (ou a automação) escolheu um horário livre gerado: cria a consulta, ocupando a duração do procedimento. */
async function bookVirtual(db: Db, cid: string, row: number, sets: Record<string, string>) {
  const start = rowToSlot(row);
  if (start === null) throw new Error(`Agenda: linha ${row} não encontrada`);
  const status = APPT_STATUS.has(sets.status) ? sets.status : 'agendado';
  if (status === 'livre' || status === 'cancelado') return; // nada a fazer num horário que ainda não existe
  const phone = normPhone(sets.telefone);
  if (!phone) throw new Error('Agenda: para marcar um horário livre é preciso o telefone do paciente');
  const sc = await loadSchedule(db, cid);
  const proc = (await procByName(db, cid, sets.procedimento)) || sc.slotProc;
  const dur = proc?.duration_min || sc.slotMin;
  const end = start + dur * 60000;
  // profissional: o pedido pela automação, ou o primeiro livre que faz o procedimento
  let proId = await byName(db, 'professionals', cid, sets.profissional);
  if (!proId && sc.pros.length) {
    const p = await freePro(db, cid, sc, start, end, proc?.id);
    if (!p) throw new Error('Agenda: esse horário acabou de ser ocupado');
    proId = p.id;
  }
  const fit = await checkFit(db, cid, sc, start, end, { proId });
  if (fit.full || !fit.inside || fit.proBusy) throw new Error('Agenda: esse horário acabou de ser ocupado');
  const c = await contactByPhone(db, cid, phone, sets.nome);
  const m: Obj = {};
  for (const [k, v] of Object.entries(sets)) if (!['id', '_row', 'nome', 'telefone', 'data_hora', 'status', 'procedimento', 'profissional', 'pagamento', 'convenio', 'guia', 'carteirinha'].includes(k) && v) m[k] = v;
  m.slot_id = slotId(start);
  if (cleanInsurance(sets.convenio)) await applyContactInsurance(db, cid, c!.id, { convenio: sets.convenio, carteirinha: sets.carteirinha });
  const pay = await payerOf(db, cid, c!.id, sets);
  const { error } = await db.from('appointments').insert({
    clinic_id: cid, contact_id: c!.id, status, starts_at: new Date(start).toISOString(), ends_at: new Date(end).toISOString(),
    procedure_id: proc?.id || null, procedure_text: proc ? null : (sets.procedimento || null), price: proc?.price ?? null,
    professional_id: proId, meta: m, ...pay,
  });
  if (error) throw new Error('Agenda: ' + error.message);
  await db.from('activities').insert({ clinic_id: cid, contact_id: c!.id, type: 'sistema', body: `Automação: consulta ${status} pelo WhatsApp (${dur} min${pay.payer === 'convenio' ? `, convênio ${pay.insurance}` : ''}).` });
}

async function timeline(db: Db, cid: string, phone: string | null, body: string, type: 'whatsapp' | 'sistema' = 'sistema') {
  const p = normPhone(phone);
  if (!p) return;
  const { data } = await db.from('contacts').select('id').eq('clinic_id', cid).eq('phone', p).maybeSingle();
  if (data) await db.from('activities').insert({ clinic_id: cid, contact_id: data.id, type, body: body.slice(0, 1000) });
}

async function moveLeadDeal(db: Db, cid: string, contactId: string, status: string) {
  const { data: stages } = await db.from('stages').select('id, name, kind, position').eq('clinic_id', cid).order('position');
  if (!stages?.length) return;
  const target = status === 'agendado' ? stages.find((s) => s.kind === 'open' && /agend/i.test(s.name))
    : status === 'virou_paciente' ? stages.find((s) => s.kind === 'won')
    : status === 'perdido' ? stages.find((s) => s.kind === 'lost') : null;
  if (!target) return;
  const { data: deal } = await db.from('deals').select('id').eq('contact_id', contactId).is('closed_at', null).order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (deal) await db.from('deals').update({ stage_id: target.id }).eq('id', deal.id);
}

async function updateAppointment(db: Db, cid: string, row: number, sets: Record<string, string>) {
  if (row >= VIRTUAL_ROW0) return bookVirtual(db, cid, row, sets);
  const { data: a } = await db.from('appointments').select('id, starts_at, ends_at, status, contact_id, meta').eq('clinic_id', cid).eq('sheet_row', row).maybeSingle();
  if (!a) throw new Error(`Agenda: linha ${row} não encontrada`);
  const patch: Obj = {}, m = { ...meta(a) };
  const phone = sets.telefone !== undefined ? normPhone(sets.telefone) : null;
  if (phone) patch.contact_id = (await contactByPhone(db, cid, phone, sets.nome))?.id;
  for (const [k, v] of Object.entries(sets)) {
    if (k === 'nome' || k === 'telefone' || k === 'id' || k === '_row') continue;
    if (k === 'data_hora') {
      const iso = parseDT(v); if (!iso) continue;
      const dur = new Date(a.ends_at).getTime() - new Date(a.starts_at).getTime();
      patch.starts_at = iso; patch.ends_at = new Date(new Date(iso).getTime() + (dur > 0 ? dur : HR)).toISOString();
    } else if (k === 'status') {
      if (APPT_STATUS.has(v)) patch.status = v;
    } else if (k === 'procedimento') {
      const pr = await procByName(db, cid, v);
      if (pr) { patch.procedure_id = pr.id; patch.procedure_text = null; } else if (v) { patch.procedure_text = v.slice(0, 120); }
    } else if (k === 'profissional') {
      const id = await byName(db, 'professionals', cid, v); if (id) patch.professional_id = id;
    } else if (k === 'pagamento' || k === 'convenio' || k === 'guia') {
      // tratado logo abaixo
    } else m[k] = v;
  }
  if (sets.pagamento !== undefined || sets.convenio !== undefined || sets.guia !== undefined) {
    Object.assign(patch, await payerOf(db, cid, (patch.contact_id as string) || a.contact_id, sets));
  }
  patch.meta = m;
  const { error } = await db.from('appointments').update(patch).eq('id', a.id);
  if (error) throw new Error('Agenda: ' + error.message);
  const contactId = (patch.contact_id as string) || a.contact_id;
  if (patch.status && patch.status !== a.status && contactId) {
    await db.from('activities').insert({ clinic_id: cid, contact_id: contactId, type: 'sistema', body: `Automação: consulta ${patch.status}` });
    if (patch.status === 'realizado') await db.from('contacts').update({ last_visit_at: a.starts_at }).eq('id', contactId);
  }
}

async function updateContact(db: Db, cid: string, tab: string, row: number, sets: Record<string, string>) {
  const { data: c } = await db.from('contacts').select('id, meta').eq('clinic_id', cid).eq('sheet_row', row).maybeSingle();
  if (!c) throw new Error(`${tab}: linha ${row} não encontrada`);
  const patch: Obj = {}, m = { ...meta(c) };
  for (const [k, v] of Object.entries(sets)) {
    if (k === 'id' || k === '_row' || k === 'ultimo_atendimento' || k === 'proximo_agendamento' || k === 'procedimento_ultimo') continue;
    if (k === 'nome') { if (v.trim()) patch.name = v.trim(); }
    else if (k === 'telefone') { const p = normPhone(v); if (p) patch.phone = p; }
    else if (k === 'nascimento') patch.birth_date = parseDate(v);
    else if (k === 'convenio') patch.insurance = cleanInsurance(v);
    else if (k === 'carteirinha') patch.insurance_card = v.trim().slice(0, 40) || null;
    else if (k === 'convenio_aceito') { /* calculado pelo sistema */ }
    else m[k] = v;
  }
  patch.meta = m;
  const { error } = await db.from('contacts').update(patch).eq('id', c.id);
  if (error) throw new Error(`${tab}: ${error.message}`);
  if (tab === 'Leads' && sets.status) await moveLeadDeal(db, cid, c.id, sets.status);
}

async function updateSimple(db: Db, cid: string, tab: 'Espera' | 'Financeiro', row: number, sets: Record<string, string>) {
  const table = tab === 'Espera' ? 'waitlist' : 'charges';
  const { data: r } = await db.from(table).select('id, meta').eq('clinic_id', cid).eq('sheet_row', row).maybeSingle();
  if (!r) throw new Error(`${tab}: linha ${row} não encontrada`);
  const patch: Obj = {}, m = { ...meta(r) };
  for (const [k, v] of Object.entries(sets)) {
    if (['id', '_row', 'nome', 'telefone', 'desde'].includes(k)) continue;
    if (k === 'status') { patch.status = v; if (tab === 'Financeiro' && v === 'pago') patch.paid_at = new Date().toISOString(); }
    else if (tab === 'Financeiro' && k === 'link_pagamento') patch.payment_link = v;
    else if (tab === 'Financeiro' && k === 'valor') patch.amount = Number(String(v).replace(/\./g, '').replace(',', '.')) || 0;
    else if (tab === 'Financeiro' && k === 'vencimento') patch.due_date = parseDate(v);
    else m[k] = v;
  }
  patch.meta = m;
  const { error } = await db.from(table).update(patch).eq('id', r.id);
  if (error) throw new Error(`${tab}: ${error.message}`);
}

/** Aplica um values:batchUpdate do Google Sheets. */
export async function batchUpdate(db: Db, cid: string, data: { range: string; values: unknown[][] }[]) {
  const groups = new Map<string, Record<string, string>>();
  for (const d of data || []) {
    const m = String(d.range || '').match(/^'?([^'!]+)'?!([A-Z]+)(\d+)$/i);
    if (!m) throw new Error('Intervalo inválido: ' + d.range);
    const tab = m[1], H = HEADERS[tab];
    if (!H) throw new Error(`A aba "${tab}" não existe no modo sistema`);
    if (tab === 'Convenios') throw new Error(SO_LEITURA);
    const col = H[colIndex(m[2])];
    if (!col) throw new Error(`Coluna fora da aba ${tab}: ${m[2]}`);
    const key = `${tab}|${m[3]}`;
    const g = groups.get(key) || {};
    g[col] = S(d.values?.[0]?.[0]);
    groups.set(key, g);
  }
  for (const [key, sets] of groups) {
    const [tab, r] = key.split('|');
    const row = Number(r);
    if (tab === 'Agenda') await updateAppointment(db, cid, row, sets);
    else if (tab === 'Pacientes' || tab === 'Leads' || tab === 'Optout') await updateContact(db, cid, tab, row, sets);
    else if (tab === 'Espera' || tab === 'Financeiro') await updateSimple(db, cid, tab, row, sets);
    else {
      const { data: r0 } = await db.from('sheet_rows').select('id, data').eq('clinic_id', cid).eq('tab', tab).eq('sheet_row', row).maybeSingle();
      if (r0) await db.from('sheet_rows').update({ data: { ...(r0.data as Obj), ...sets } }).eq('id', r0.id);
    }
  }
  return data.length;
}

/** Aplica um values/Aba!A:Z:append. */
export async function append(db: Db, cid: string, tab: string, rows: unknown[][]) {
  const H = HEADERS[tab];
  if (!H) throw new Error(`A aba "${tab}" não existe no modo sistema`);
  if (tab === 'Convenios') throw new Error(SO_LEITURA);
  for (const values of rows || []) {
    const o: Record<string, string> = {};
    H.forEach((h, i) => { o[h] = S(values?.[i]).trim(); });
    if (tab === 'Optout') {
      const p = normPhone(o.telefone);
      const c = await contactByPhone(db, cid, p, undefined, false);
      if (c) { await db.from('contacts').update({ consent_whatsapp: false }).eq('id', c.id); await db.from('activities').insert({ clinic_id: cid, contact_id: c.id, type: 'sistema', body: 'Pediu para não receber mensagens automáticas (PARAR).' }); }
      else await db.from('sheet_rows').insert({ clinic_id: cid, tab, data: { telefone: p || o.telefone } });
    } else if (tab === 'Leads') {
      const p = normPhone(o.telefone);
      const anuncio = /an[uú]ncio/i.test(o.origem);
      const c = await contactByPhone(db, cid, p, o.nome, true, { source: anuncio ? 'anuncio' : 'whatsapp', source_detail: o.origem || null });
      if (!c) continue;
      const m = { ...meta(c), lead: 'sim', lead_id: o.id, origem: o.origem, criado_em: o.criado_em, status: o.status || 'novo', avaliacao_em: o.avaliacao_em, agenda_id: o.agenda_id };
      await db.from('contacts').update({ meta: m }).eq('id', c.id);
      const { data: open } = await db.from('deals').select('id').eq('contact_id', c.id).is('closed_at', null).limit(1);
      if (!open?.length) {
        const { data: st } = await db.from('stages').select('id').eq('clinic_id', cid).eq('kind', 'open').order('position').limit(1).maybeSingle();
        if (st) await db.from('deals').insert({ clinic_id: cid, contact_id: c.id, stage_id: st.id, title: 'Avaliação', value: 0 });
      }
      await db.from('activities').insert({ clinic_id: cid, contact_id: c.id, type: 'whatsapp', body: `Lead entrou pelo WhatsApp (${o.origem || 'sem origem'}).` });
      const ins = await applyContactInsurance(db, cid, c.id, { convenio: o.convenio, carteirinha: o.carteirinha });
      if (ins === 'aceito') {
        const { data: ct } = await db.from('contacts').select('insurance').eq('id', c.id).maybeSingle();
        await db.from('deals').update({ title: `Avaliação (convênio ${ct?.insurance})` }).eq('contact_id', c.id).is('closed_at', null).eq('title', 'Avaliação');
      }
    } else if (tab === 'Agenda') {
      const iso = parseDT(o.data_hora);
      if (!iso) throw new Error('Agenda: data_hora inválida no append');
      const c = await contactByPhone(db, cid, normPhone(o.telefone), o.nome);
      const m: Obj = {};
      ['lembrete1_em', 'lembrete2_em', 'alerta_em', 'confirmado_em', 'pos_enviado_em', 'avaliacao_pedida_em', 'nota'].forEach((k) => { if (o[k]) m[k] = o[k]; });
      const proc = await procByName(db, cid, o.procedimento);
      const dur = proc?.duration_min || (await loadSchedule(db, cid)).slotMin || 60;
      const status = APPT_STATUS.has(o.status) ? o.status : (c ? 'agendado' : 'livre');
      if (c && cleanInsurance(o.convenio)) await applyContactInsurance(db, cid, c.id, { convenio: o.convenio });
      const pay = await payerOf(db, cid, c?.id, o);
      const { error } = await db.from('appointments').insert({ clinic_id: cid, contact_id: c?.id || null, starts_at: iso, ends_at: new Date(new Date(iso).getTime() + dur * 60000).toISOString(),
        status, procedure_id: proc?.id || null, procedure_text: proc ? null : (o.procedimento || null), price: proc?.price ?? null,
        professional_id: await byName(db, 'professionals', cid, o.profissional), meta: m, ...pay });
      if (error) throw new Error('Agenda: ' + error.message);
    } else if (tab === 'Pacientes') {
      const c = await contactByPhone(db, cid, normPhone(o.telefone), o.nome);
      if (c && o.nascimento) await db.from('contacts').update({ birth_date: parseDate(o.nascimento) }).eq('id', c.id);
      if (c && cleanInsurance(o.convenio)) await applyContactInsurance(db, cid, c.id, { convenio: o.convenio, carteirinha: o.carteirinha });
    } else if (tab === 'Espera') {
      const c = await contactByPhone(db, cid, normPhone(o.telefone), o.nome);
      if (c) await db.from('waitlist').insert({ clinic_id: cid, contact_id: c.id, procedure_id: await byName(db, 'procedures', cid, o.procedimento), procedure_text: o.procedimento || null, status: ['aguardando', 'ofertado', 'agendado'].includes(o.status) ? o.status : 'aguardando' });
    } else if (tab === 'Financeiro') {
      const c = await contactByPhone(db, cid, normPhone(o.telefone), o.nome);
      const due = parseDate(o.vencimento);
      if (c && due) await db.from('charges').insert({ clinic_id: cid, contact_id: c.id, amount: Number(String(o.valor).replace(/\./g, '').replace(',', '.')) || 0, due_date: due, status: o.status === 'pago' ? 'pago' : 'aberto', payment_link: o.link_pagamento || null });
    } else {
      // Log e Respostas: guardados e refletidos na linha do tempo do paciente
      const data: Obj = { ...o }; delete data._row;
      await db.from('sheet_rows').insert({ clinic_id: cid, tab, data });
      if (tab === 'Log') {
        const ok = /^2\d\d$/.test(o.status_http);
        await timeline(db, cid, o.telefone, `Automação ${o.fluxo}: mensagem "${o.template}" ${ok ? 'enviada' : 'com erro (' + o.wa_id_ou_erro + ')'}.`);
      } else if (tab === 'Respostas') {
        await timeline(db, cid, o.telefone, `Respondeu no WhatsApp: ${o.texto || o.payload || o.tipo}`, 'whatsapp');
      }
    }
  }
  return (rows || []).length;
}
