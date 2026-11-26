import { getContext } from '@/lib/clinic';
import { PageHeader, Badge } from '@/components/bits';
import { signMany } from '@/lib/signed';
import { fmtDateTime } from '@/lib/utils';
import { removeMember, revokeApiKey, setClinicalAccess } from './actions';
import { HoursForm } from './hours';
import { ApiKeyForm, AutomationSettings, InsuranceSettings, BrandForm, ClinicForm, InviteForm, ProcedureRow, ProfessionalForm, ProfessionalProcedures, StageRow } from './forms';

export const metadata = { title: 'Clínica e equipe' };
const ROLE = { owner: 'Dono', admin: 'Administrador', staff: 'Equipe' } as const;

export default async function Page() {
  const { supabase, clinic, isAdmin, writable, user } = await getContext();
  const [pros, procs, stages, members, invites, keys, hours, proProcs] = await Promise.all([
    supabase.from('professionals').select('*').eq('clinic_id', clinic.id).order('name'),
    supabase.from('procedures').select('*').eq('clinic_id', clinic.id).order('name'),
    supabase.from('stages').select('id, name, color, kind').eq('clinic_id', clinic.id).order('position'),
    supabase.from('memberships').select('user_id, role, clinical_access, profile:profiles(full_name)').eq('clinic_id', clinic.id),
    isAdmin ? supabase.from('invites').select('email, role, expires_at, accepted_at').eq('clinic_id', clinic.id).is('accepted_at', null).order('created_at', { ascending: false }) : Promise.resolve({ data: [] }),
    isAdmin ? supabase.from('api_keys').select('id, name, prefix, last_used_at, revoked_at, created_at').eq('clinic_id', clinic.id).order('created_at', { ascending: false }) : Promise.resolve({ data: [] }),
    supabase.from('business_hours').select('weekday, start_time, end_time, professional_id').eq('clinic_id', clinic.id).order('weekday').order('start_time'),
    supabase.from('professional_procedures').select('professional_id, procedure_id, commission_pct').eq('clinic_id', clinic.id),
  ]);
  const clinicHours = (hours.data || []).filter((h) => !h.professional_id);
  const activeProcs = (procs.data || []).filter((p) => p.active);
  const cfg = { slot_procedure_id: clinic.slot_procedure_id ?? null, slot_minutes: clinic.slot_minutes ?? 30, slot_capacity: clinic.slot_capacity ?? 1, slot_days_ahead: clinic.slot_days_ahead ?? 21 };
  const urls = await signMany(supabase, [clinic.logo_path, ...(pros.data || []).map((p) => p.photo_path)]);
  const ro = !writable;

  return (
    <>
      <PageHeader title="Clínica e equipe" desc="Esses dados alimentam os criativos, os textos da IA e as automações." />
      <div className="space-y-6">
        <ClinicForm c={clinic} disabled={!isAdmin || ro} />
        <BrandForm clinicId={clinic.id} brand={clinic.brand} logoUrl={clinic.logo_path ? urls[clinic.logo_path] || null : null} disabled={!isAdmin || ro} />

        <section id="profissionais" className="card space-y-3">
          <h2 className="font-semibold">Profissionais</h2>
          <p className="text-sm text-slate-600">As fotos aparecem nos criativos. Use fotos com boa luz, de frente, com fundo simples.</p>
          {(pros.data || []).map((p) => (
            <div key={p.id} className="space-y-2">
              <ProfessionalForm clinicId={clinic.id} kind={clinic.kind} p={{ ...p, commission_pct: p.commission_pct === null ? null : Number(p.commission_pct), photo: p.photo_path ? urls[p.photo_path] || null : null }} />
              {p.attends && p.active && (
                <details className="rounded-lg border border-slate-200 p-3">
                  <summary className="cursor-pointer text-sm font-medium">Agenda de {p.name}: procedimentos, comissão e horário{(hours.data || []).some((h) => h.professional_id === p.id) ? ' (horário próprio)' : ''}</summary>
                  <div className="mt-3 space-y-5">
                    <ProfessionalProcedures pro={{ id: p.id, name: p.name, commission_pct: p.commission_pct === null ? null : Number(p.commission_pct) }} procs={activeProcs.map((x) => ({ id: x.id, name: x.name }))}
                      current={(proProcs.data || []).filter((x) => x.professional_id === p.id).map((x) => ({ procedure_id: x.procedure_id, commission_pct: x.commission_pct === null ? null : Number(x.commission_pct) }))} disabled={!isAdmin || ro} />
                    <HoursForm professional={{ id: p.id, name: p.name }} hours={(hours.data || []).filter((h) => h.professional_id === p.id)} disabled={!isAdmin || ro} procs={[]} cfg={cfg} />
                  </div>
                </details>
              )}
            </div>
          ))}
          {!ro && <ProfessionalForm clinicId={clinic.id} kind={clinic.kind} />}
        </section>

        <section className="card">
          <h2 className="mb-2 font-semibold">Procedimentos</h2>
          <p className="mb-2 text-sm text-slate-600">A duração preenche a Agenda sozinha e define quanto tempo a consulta ocupa. O retorno em dias é usado pela automação de retorno de procedimento.</p>
          {(procs.data || []).map((p) => <ProcedureRow key={p.id} p={{ ...p, price: p.price === null ? null : Number(p.price) }} />)}
          {!ro && <ProcedureRow />}
        </section>

        <HoursForm hours={clinicHours} disabled={!isAdmin || ro}
          procs={activeProcs.map((p) => ({ id: p.id, name: p.name, duration_min: p.duration_min }))} cfg={cfg} />

        {isAdmin && <InsuranceSettings accepts={!!clinic.accepts_insurance} list={clinic.insurances || []} disabled={ro} />}

        {isAdmin && <AutomationSettings url={clinic.waitlist_webhook_url} template={clinic.reminder_template} disabled={ro} />}

        {isAdmin && (
          <section className="card">
            <h2 className="mb-2 font-semibold">Etapas do funil</h2>
            {(stages.data || []).map((s) => <StageRow key={s.id} s={s} />)}
            {!ro && <StageRow />}
          </section>
        )}

        <section className="card space-y-3">
          <h2 className="font-semibold">Equipe</h2>
          <p className="text-sm text-slate-600">A ficha clínica (anamnese, evolução e fotos) só aparece para o dono e para quem tiver o acesso ligado aqui. Ligue para os dentistas e profissionais; a recepção normalmente não precisa.</p>
          <table className="tbl"><thead><tr><th>Nome</th><th>Perfil</th><th>Ficha clínica</th><th /></tr></thead><tbody>
            {(members.data || []).map((m) => (
              <tr key={m.user_id}><td>{(m.profile as unknown as { full_name: string } | null)?.full_name || '—'}{m.user_id === user.id && ' (você)'}</td><td>{ROLE[m.role as keyof typeof ROLE]}</td>
                <td>{m.role === 'owner' ? <Badge tone="green">sempre</Badge> : isAdmin && !ro ? (
                  <form action={setClinicalAccess} className="flex items-center gap-2"><input type="hidden" name="user_id" value={m.user_id} /><input type="hidden" name="value" value={m.clinical_access ? 'off' : 'on'} />
                    <Badge tone={m.clinical_access ? 'green' : 'slate'}>{m.clinical_access ? 'com acesso' : 'sem acesso'}</Badge>
                    <button className="text-xs underline" type="submit">{m.clinical_access ? 'Tirar acesso' : 'Dar acesso'}</button></form>
                ) : <Badge tone={m.clinical_access ? 'green' : 'slate'}>{m.clinical_access ? 'com acesso' : 'sem acesso'}</Badge>}</td>
                <td>{isAdmin && m.role !== 'owner' && m.user_id !== user.id && <form action={removeMember}><input type="hidden" name="user_id" value={m.user_id} /><button className="text-sm text-red-700 underline" type="submit">Remover</button></form>}</td></tr>
            ))}
          </tbody></table>
          {(invites.data || []).length > 0 && <p className="text-sm text-slate-600">Convites pendentes: {(invites.data as { email: string }[]).map((i) => i.email).join(', ')}</p>}
          {isAdmin && !ro && <InviteForm />}
        </section>

        {isAdmin && (
          <section className="card space-y-3">
            <h2 className="font-semibold">Chaves de API (automações)</h2>
            <p className="text-sm text-slate-600">Usadas pelo n8n das automações para ler a agenda e lançar leads no CRM. Guarde a chave em local seguro.</p>
            <ul className="space-y-1 text-sm">
              {(keys.data as { id: string; name: string; prefix: string; last_used_at: string | null; revoked_at: string | null }[]).map((k) => (
                <li key={k.id} className="flex flex-wrap items-center gap-2"><code>{k.prefix}…</code> {k.name} {k.revoked_at ? <Badge tone="red">revogada</Badge> : <Badge tone="green">ativa</Badge>}
                  <span className="text-xs text-slate-500">{k.last_used_at ? `último uso ${fmtDateTime(k.last_used_at)}` : 'nunca usada'}</span>
                  {!k.revoked_at && <form action={revokeApiKey}><input type="hidden" name="id" value={k.id} /><button className="text-xs text-red-700 underline" type="submit">Revogar</button></form>}</li>
              ))}
            </ul>
            {!ro && <ApiKeyForm />}
          </section>
        )}
      </div>
    </>
  );
}
