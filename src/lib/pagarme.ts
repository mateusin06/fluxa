import 'server-only';
import { env } from '@/lib/env';

// API Core v5 do Pagar.me (grupo Stone). Autenticação: Basic com a chave secreta como usuário.
const BASE = 'https://api.pagar.me/core/v5';

async function pg<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(BASE + path, {
    method: init.method || 'GET',
    headers: {
      Authorization: 'Basic ' + Buffer.from(env.pagarmeSecret + ':').toString('base64'),
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
    signal: AbortSignal.timeout(30_000),
    cache: 'no-store',
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : {};
  if (!res.ok) {
    const msg = json?.message || res.statusText;
    const errs = json?.errors ? ' ' + JSON.stringify(json.errors) : '';
    throw new Error(`Pagar.me ${res.status}: ${msg}${errs}`.slice(0, 600));
  }
  return json as T;
}

export interface BillingCustomer {
  name: string; email: string; document: string; phone: string;
  address?: { zip: string; line1: string; city: string; state: string };
}

export async function createCustomer(c: BillingCustomer, clinicId: string) {
  const doc = c.document.replace(/\D/g, '');
  const ph = c.phone.replace(/\D/g, '').replace(/^55/, '');
  return pg<{ id: string }>('/customers', {
    method: 'POST',
    body: {
      name: c.name,
      email: c.email,
      code: clinicId,
      document: doc,
      document_type: doc.length > 11 ? 'CNPJ' : 'CPF',
      type: doc.length > 11 ? 'company' : 'individual',
      phones: { mobile_phone: { country_code: '55', area_code: ph.slice(0, 2), number: ph.slice(2) } },
      ...(c.address ? { address: { line_1: c.address.line1, zip_code: c.address.zip.replace(/\D/g, ''), city: c.address.city, state: c.address.state, country: 'BR' } } : {}),
      metadata: { clinic_id: clinicId },
    },
  });
}

export interface SubItem { description: string; cents: number }

export async function createSubscription(p: {
  customerId: string; clinicId: string; method: 'credit_card' | 'boleto'; cardToken?: string; items: SubItem[];
}) {
  return pg<{ id: string; status: string; next_billing_at?: string }>('/subscriptions', {
    method: 'POST',
    body: {
      customer_id: p.customerId,
      payment_method: p.method,
      currency: 'BRL',
      interval: 'month',
      interval_count: 1,
      billing_type: 'prepaid',
      installments: 1,
      ...(p.method === 'credit_card' ? { card_token: p.cardToken } : { boleto_due_days: 3 }),
      items: p.items.map((i) => ({ description: i.description, quantity: 1, pricing_scheme: { scheme_type: 'unit', price: i.cents } })),
      metadata: { clinic_id: p.clinicId },
    },
  });
}

export interface PgSubscription {
  id: string; status: 'active' | 'canceled' | 'future' | 'failed' | string; next_billing_at?: string;
  current_cycle?: { end_at?: string }; metadata?: Record<string, string>; customer?: { id: string };
}

export const getSubscription = (id: string) => pg<PgSubscription>(`/subscriptions/${encodeURIComponent(id)}`);

export const cancelSubscription = (id: string) =>
  pg<PgSubscription>(`/subscriptions/${encodeURIComponent(id)}`, { method: 'DELETE', body: { cancel_pending_invoices: true } });

export const addSubscriptionItem = (id: string, item: SubItem) =>
  pg<{ id: string }>(`/subscriptions/${encodeURIComponent(id)}/items`, {
    method: 'POST',
    body: { description: item.description, quantity: 1, pricing_scheme: { scheme_type: 'unit', price: item.cents } },
  });
