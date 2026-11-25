import { NextResponse } from 'next/server';
import { v1 } from '@/lib/v1';
import { append, batchUpdate, readTab } from '@/lib/planilha';

// Mesma interface do Google Sheets (values:batchGet, values:batchUpdate, values/Aba!A:Z:append),
// para os fluxos da biblioteca funcionarem com o sistema trocando só o endereço.
export const maxDuration = 60;

const tabOf = (range: string) => decodeURIComponent(range).split('!')[0].replace(/^'|'$/g, '');

export async function GET(req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const a = await v1(req); if ('error' in a) return a.error;
  const path = (await params).path.map(decodeURIComponent).join('/');
  if (path !== 'values:batchGet') return NextResponse.json({ error: 'Rota não suportada: ' + path }, { status: 404 });
  const ranges = new URL(req.url).searchParams.getAll('ranges');
  try {
    const valueRanges = [];
    for (const r of ranges) valueRanges.push({ range: r, majorDimension: 'ROWS', values: await readTab(a.db, a.clinicId, tabOf(r)) });
    return NextResponse.json({ spreadsheetId: 'fluxa-sistema', valueRanges });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const a = await v1(req); if ('error' in a) return a.error;
  const path = (await params).path.map(decodeURIComponent).join('/');
  const body = await req.json().catch(() => ({}));
  try {
    if (path === 'values:batchUpdate') {
      const n = await batchUpdate(a.db, a.clinicId, body.data || []);
      return NextResponse.json({ spreadsheetId: 'fluxa-sistema', totalUpdatedCells: n });
    }
    const m = path.match(/^values\/(.+):append$/);
    if (m) {
      const n = await append(a.db, a.clinicId, tabOf(m[1]), body.values || []);
      return NextResponse.json({ spreadsheetId: 'fluxa-sistema', updates: { updatedRows: n } });
    }
    return NextResponse.json({ error: 'Rota não suportada: ' + path }, { status: 404 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
