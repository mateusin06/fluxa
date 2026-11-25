'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

async function tokenize(pk: string, c: { number: string; holder_name: string; exp_month: number; exp_year: number; cvv: string }) {
  // Tokenização no navegador: o número do cartão nunca passa pelo servidor da Fluxa.
  const r = await fetch(`https://api.pagar.me/core/v5/tokens?appId=${encodeURIComponent(pk)}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'card', card: c }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.id) throw new Error(j.message || 'Cartão recusado na validação. Confira os dados.');
  return j.id as string;
}

export function Checkout({ publicKey, email, total }: { publicKey: string; email: string; total: string }) {
  const router = useRouter();
  const [method, setMethod] = useState<'credit_card' | 'boleto'>('credit_card');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok?: string; error?: string } | null>(null);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setBusy(true); setMsg(null);
    try {
      let cardToken: string | undefined;
      if (method === 'credit_card') {
        const [mm, yy] = String(fd.get('exp') || '').split('/').map((s) => Number(s.trim()));
        if (!mm || !yy) throw new Error('Validade no formato MM/AA');
        cardToken = await tokenize(publicKey, {
          number: String(fd.get('number') || '').replace(/\D/g, ''), holder_name: String(fd.get('holder') || ''),
          exp_month: mm, exp_year: yy < 100 ? 2000 + yy : yy, cvv: String(fd.get('cvv') || ''),
        });
      }
      const r = await fetch('/api/billing/subscribe', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          method, cardToken, name: fd.get('name'), email: fd.get('email'), document: fd.get('document'), phone: fd.get('phone'),
          zip: fd.get('zip'), line1: fd.get('line1'), city: fd.get('city'), state: String(fd.get('state') || '').toUpperCase(),
        }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || 'Falhou');
      setMsg({ ok: method === 'boleto' ? 'Assinatura criada. O boleto aparece aqui em instantes e também chega por e-mail.' : 'Pagamento em processamento. A liberação é automática assim que o Pagar.me confirmar.' });
      setTimeout(() => router.refresh(), 4000);
    } catch (x) { setMsg({ error: (x as Error).message }); } finally { setBusy(false); }
  }

  return (
    <form onSubmit={submit} className="card space-y-4">
      <h2 className="font-semibold">Assinar — {total}/mês</h2>
      <fieldset className="flex gap-4 text-sm">
        <legend className="label">Forma de pagamento</legend>
        <label className="flex items-center gap-2"><input type="radio" name="m" checked={method === 'credit_card'} onChange={() => setMethod('credit_card')} /> Cartão de crédito (recorrente)</label>
        <label className="flex items-center gap-2"><input type="radio" name="m" checked={method === 'boleto'} onChange={() => setMethod('boleto')} /> Boleto mensal</label>
      </fieldset>
      <div className="grid gap-3 sm:grid-cols-2">
        <div><label className="label" htmlFor="ck-name">Nome ou razão social</label><input id="ck-name" name="name" required className="field" /></div>
        <div><label className="label" htmlFor="ck-doc">CPF ou CNPJ</label><input id="ck-doc" name="document" required inputMode="numeric" className="field" /></div>
        <div><label className="label" htmlFor="ck-email">E-mail de cobrança</label><input id="ck-email" name="email" type="email" required defaultValue={email} className="field" /></div>
        <div><label className="label" htmlFor="ck-phone">Celular</label><input id="ck-phone" name="phone" required inputMode="tel" className="field" /></div>
        <div><label className="label" htmlFor="ck-zip">CEP</label><input id="ck-zip" name="zip" required inputMode="numeric" className="field" /></div>
        <div><label className="label" htmlFor="ck-line">Endereço (rua, número, bairro)</label><input id="ck-line" name="line1" required className="field" /></div>
        <div><label className="label" htmlFor="ck-city">Cidade</label><input id="ck-city" name="city" required className="field" /></div>
        <div><label className="label" htmlFor="ck-uf">UF</label><input id="ck-uf" name="state" required maxLength={2} className="field uppercase" /></div>
      </div>
      {method === 'credit_card' && (
        <div className="grid gap-3 rounded-lg bg-slate-50 p-3 sm:grid-cols-4">
          <div className="sm:col-span-2"><label className="label" htmlFor="ck-num">Número do cartão</label><input id="ck-num" name="number" required inputMode="numeric" autoComplete="cc-number" className="field" /></div>
          <div><label className="label" htmlFor="ck-exp">Validade (MM/AA)</label><input id="ck-exp" name="exp" required autoComplete="cc-exp" className="field" placeholder="08/29" /></div>
          <div><label className="label" htmlFor="ck-cvv">CVV</label><input id="ck-cvv" name="cvv" required inputMode="numeric" autoComplete="cc-csc" className="field" /></div>
          <div className="sm:col-span-4"><label className="label" htmlFor="ck-holder">Nome impresso no cartão</label><input id="ck-holder" name="holder" required autoComplete="cc-name" className="field" /></div>
        </div>
      )}
      {msg?.error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{msg.error}</p>}
      {msg?.ok && <p role="status" className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{msg.ok}</p>}
      <button type="submit" disabled={busy} className="btn btn-lima">{busy ? 'Processando...' : 'Assinar'}</button>
      <p className="text-xs text-slate-500">Pagamento processado pelo Pagar.me (grupo Stone). Cancele quando quiser, sem multa.</p>
    </form>
  );
}

export function CancelButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button type="button" disabled={busy} className="btn btn-danger" onClick={async () => {
      if (!window.confirm('Cancelar a assinatura? Você continua com acesso até o fim do período pago.')) return;
      setBusy(true);
      const r = await fetch('/api/billing/cancel', { method: 'POST' });
      const j = await r.json().catch(() => ({}));
      setBusy(false);
      if (!r.ok) window.alert(j.error || 'Falhou'); else router.refresh();
    }}>{busy ? 'Cancelando...' : 'Cancelar assinatura'}</button>
  );
}
