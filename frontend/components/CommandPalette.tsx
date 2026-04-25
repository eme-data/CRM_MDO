'use client';
import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Search, Building2, Users, Target, FileText, LifeBuoy, X } from 'lucide-react';
import { api } from '@/lib/api';

interface Hit {
  type: string;
  id: string;
  title: string;
  subtitle?: string;
  url: string;
}

const ICON: Record<string, any> = {
  company: Building2,
  contact: Users,
  opportunity: Target,
  contract: FileText,
  ticket: LifeBuoy,
};

export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<Hit[]>([]);
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<any>(null);

  // Ctrl+K / Cmd+K toggle
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen(true);
        setTimeout(() => inputRef.current?.focus(), 50);
      }
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (!open || q.trim().length < 2) { setHits([]); return; }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const list = await api.get('/search?q=' + encodeURIComponent(q.trim()));
        setHits(list);
        setSelected(0);
      } catch {}
    }, 200);
  }, [q, open]);

  function go(h: Hit) {
    setOpen(false);
    setQ('');
    router.push(h.url);
  }

  function onKeyNav(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSelected((s) => Math.min(s + 1, hits.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSelected((s) => Math.max(s - 1, 0)); }
    else if (e.key === 'Enter' && hits[selected]) { go(hits[selected]); }
  }

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 flex items-start justify-center pt-24"
      onClick={() => setOpen(false)}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-xl card overflow-hidden shadow-2xl"
      >
        <div className="flex items-center gap-2 p-3 border-b border-slate-200 dark:border-slate-700">
          <Search size={18} className="text-slate-400" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKeyNav}
            placeholder="Rechercher societe, contact, opportunite, contrat, ticket..."
            className="flex-1 bg-transparent outline-none text-sm"
          />
          <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200">
            <X size={16} />
          </button>
        </div>
        <div className="max-h-96 overflow-y-auto">
          {hits.length === 0 ? (
            <p className="p-6 text-center text-sm text-slate-400">
              {q.trim().length < 2 ? 'Tapez au moins 2 caracteres' : 'Aucun resultat'}
            </p>
          ) : hits.map((h, i) => {
            const Icon = ICON[h.type] ?? Search;
            return (
              <button
                key={h.type + ':' + h.id}
                onMouseEnter={() => setSelected(i)}
                onClick={() => go(h)}
                className={
                  'w-full flex items-center gap-3 px-4 py-2 text-left ' +
                  (selected === i ? 'bg-mdo-50 dark:bg-mdo-700/30' : '')
                }
              >
                <Icon size={16} className="text-slate-400" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{h.title}</div>
                  {h.subtitle && <div className="text-xs text-slate-500 dark:text-slate-400 truncate">{h.subtitle}</div>}
                </div>
                <span className="text-xs text-slate-400">{h.type}</span>
              </button>
            );
          })}
        </div>
        <div className="px-4 py-2 text-xs text-slate-400 border-t border-slate-200 dark:border-slate-700">
          Echap pour fermer - Fleches haut/bas pour naviguer - Entree pour ouvrir
        </div>
      </div>
    </div>
  );
}
