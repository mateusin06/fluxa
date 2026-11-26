'use client';
import { useEffect } from 'react';

/**
 * No celular as tabelas .tbl viram cartões (globals.css). Aqui cada célula ganha o nome
 * da coluna (data-label), lido do cabeçalho. Observa a página para pegar tabelas novas.
 */
export function TableLabels() {
  useEffect(() => {
    const label = () => {
      document.querySelectorAll<HTMLTableElement>('table.tbl').forEach((t) => {
        const heads = Array.from(t.querySelectorAll('thead th')).map((th) => (th.textContent || '').trim());
        if (!heads.length) return;
        t.querySelectorAll('tbody tr, tfoot tr').forEach((tr) => {
          let col = 0;
          Array.from(tr.children).forEach((cell) => {
            const td = cell as HTMLTableCellElement;
            if (!td.hasAttribute('data-label')) td.setAttribute('data-label', heads[col] || '');
            col += td.colSpan || 1;
          });
        });
      });
    };
    label();
    let raf = 0;
    const mo = new MutationObserver(() => { cancelAnimationFrame(raf); raf = requestAnimationFrame(label); });
    mo.observe(document.body, { childList: true, subtree: true });
    return () => { mo.disconnect(); cancelAnimationFrame(raf); };
  }, []);
  return null;
}
