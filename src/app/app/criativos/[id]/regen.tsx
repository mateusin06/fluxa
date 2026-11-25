'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

export function RegenerateButton({ briefId }: { briefId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  return (
    <span className="flex items-center gap-2">
      <button type="button" disabled={busy} className="btn btn-lima" onClick={async () => {
        setBusy(true); setErr('');
        const r = await fetch('/api/ai/creatives', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ briefId, variacoes: 3 }) });
        const j = await r.json().catch(() => ({}));
        setBusy(false);
        if (!r.ok) setErr(j.error || 'Falhou'); else router.refresh();
      }}>{busy ? 'Gerando...' : 'Gerar mais 3 variações'}</button>
      {err && <span role="alert" className="text-sm text-red-700">{err}</span>}
    </span>
  );
}
