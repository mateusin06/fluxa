export type ClinicKind = 'odonto' | 'estetica';
export type ClinicStatus = 'trial' | 'active' | 'past_due' | 'blocked' | 'canceled';
export type Role = 'owner' | 'admin' | 'staff';

export interface Brand { primary: string; secondary: string; accent: string; dark: string }

export interface Clinic {
  id: string; name: string; kind: ClinicKind; phone: string | null; whatsapp: string | null; email: string | null;
  document: string | null; city: string | null; state: string | null; address: string | null;
  responsible_name: string | null; responsible_reg: string | null; instagram: string | null; google_review_url: string | null;
  logo_path: string | null; brand: Brand; plan: 'sistema' | 'sistema_automacoes'; status: ClinicStatus;
  trial_ends_at: string; past_due_since: string | null; source: string; owner_id: string | null; created_at: string;
  slot_procedure_id: string | null; slot_minutes: number; slot_capacity: number; slot_days_ahead: number;
}

export interface Stage { id: string; clinic_id: string; name: string; position: number; kind: 'open' | 'won' | 'lost'; color: string }
export interface Contact {
  id: string; clinic_id: string; name: string; phone: string | null; email: string | null; birth_date: string | null;
  source: string; source_detail: string | null; tags: string[]; notes: string | null; consent_whatsapp: boolean;
  last_visit_at: string | null; created_at: string; updated_at: string;
}
export interface Deal {
  id: string; clinic_id: string; contact_id: string; stage_id: string; procedure_id: string | null; title: string;
  value: number; position: number; owner_id: string | null; expected_close: string | null; lost_reason: string | null;
  closed_at: string | null; created_at: string; updated_at: string;
}
export interface Activity {
  id: string; clinic_id: string; contact_id: string | null; deal_id: string | null;
  type: 'nota' | 'ligacao' | 'whatsapp' | 'email' | 'tarefa' | 'etapa' | 'sistema';
  body: string; due_at: string | null; done_at: string | null; user_id: string | null; created_at: string;
}
export interface Procedure { id: string; clinic_id: string; name: string; category: string | null; price: number | null; duration_min: number; return_days: number | null; active: boolean }
export interface Professional { id: string; clinic_id: string; name: string; specialty: string | null; registration: string | null; bio: string | null; photo_path: string | null; active: boolean }
export interface Appointment {
  id: string; clinic_id: string; contact_id: string | null; professional_id: string | null; procedure_id: string | null;
  starts_at: string; ends_at: string; status: 'livre' | 'agendado' | 'confirmado' | 'remarcar' | 'realizado' | 'faltou' | 'cancelado'; notes: string | null;
}

export interface CreativeContent {
  headline: string; destaque: string; subtitulo: string; bullets: string[]; cta: string; selo: string;
  rodape: string; fotoIndex: number; paleta: 'marca' | 'escuro' | 'claro';
}
export interface AdCopy { texto_principal: string; titulo: string; descricao: string; cta: string }
export interface Creative {
  id: string; clinic_id: string; brief_id: string | null; format: 'feed' | 'story' | 'quadrado'; template: string;
  content: CreativeContent; ad_copy: AdCopy; compliance: string[]; image_path: string | null; bg_path: string | null;
  status: 'rascunho' | 'aprovado' | 'arquivado'; created_at: string;
}
