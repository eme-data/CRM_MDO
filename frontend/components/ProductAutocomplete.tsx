'use client';
import { useEffect, useRef, useState } from 'react';
import { Search } from 'lucide-react';

export interface ProductLite {
  id: string;
  code?: string;
  name: string;
  description?: string | null;
  category?: string | null;
  sellingPriceHt?: any;
  purchasePriceHt?: any;
  vatRate?: any;
}

const eur = (n: number) => n.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });

// Champ d'autocompletion sur le catalogue Produits : on tape, on filtre par
// nom/code, on selectionne -> onSelect(produit). Reutilisable (devis, stock...).
export function ProductAutocomplete({
  products, onSelect, placeholder = 'Rechercher un produit du catalogue…', initialLabel = '', className = '',
}: {
  products: ProductLite[];
  onSelect: (p: ProductLite) => void;
  placeholder?: string;
  initialLabel?: string;
  className?: string;
}) {
  const [query, setQuery] = useState(initialLabel);
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => { setQuery(initialLabel); }, [initialLabel]);
  useEffect(() => {
    function onDoc(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const q = query.trim().toLowerCase();
  const matches = (q
    ? products.filter((p) => (p.name + ' ' + (p.code ?? '') + ' ' + (p.category ?? '')).toLowerCase().includes(q))
    : products
  ).slice(0, 8);

  function pick(p: ProductLite) {
    onSelect(p);
    setQuery(p.code ? `[${p.code}] ${p.name}` : p.name);
    setOpen(false);
  }

  return (
    <div className={'relative ' + className} ref={ref}>
      <div className="relative">
        <Search size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          className="input text-xs py-1 pl-7 w-full"
          placeholder={placeholder}
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); setHi(0); }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setHi((h) => Math.min(h + 1, matches.length - 1)); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => Math.max(h - 1, 0)); }
            else if (e.key === 'Enter') { if (open && matches[hi]) { e.preventDefault(); pick(matches[hi]); } }
            else if (e.key === 'Escape') setOpen(false);
          }}
        />
      </div>
      {open && matches.length > 0 && (
        <div className="absolute z-50 mt-1 w-full max-h-64 overflow-y-auto rounded-md border border-slate-200 bg-white shadow-lg text-xs">
          {matches.map((p, idx) => (
            <button
              type="button"
              key={p.id}
              onMouseDown={(e) => { e.preventDefault(); pick(p); }}
              onMouseEnter={() => setHi(idx)}
              className={'w-full text-left px-3 py-2 flex items-center justify-between gap-2 ' + (idx === hi ? 'bg-mdo-50' : 'hover:bg-slate-50')}
            >
              <span className="truncate">{p.code && <span className="font-mono text-slate-400">{p.code} </span>}{p.name}</span>
              {p.sellingPriceHt != null && <span className="text-slate-500 whitespace-nowrap">{eur(Number(p.sellingPriceHt))}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
