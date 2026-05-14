'use client';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface PaginationProps {
  page: number;
  pageCount: number;
  total: number;
  onChange: (page: number) => void;
  // Libelle au singulier/pluriel selon l'entite affichee ("societe", "contrat"...).
  // Le compteur ajoute automatiquement le "s" si total > 1.
  itemLabel?: string;
}

// Bar de pagination simple a poser sous une table. Masquee si une seule page
// (pas de bruit visuel quand la pagination n'est pas necessaire).
export function Pagination({
  page,
  pageCount,
  total,
  onChange,
  itemLabel = 'resultat',
}: PaginationProps) {
  if (pageCount <= 1) return null;
  const label = total > 1 ? itemLabel + 's' : itemLabel;
  return (
    <div className="flex items-center justify-between px-3 py-2 border-t bg-slate-50/60 dark:bg-slate-800/40 dark:border-slate-700">
      <span className="text-sm text-slate-600 dark:text-slate-300">
        Page {page} / {pageCount} <span className="text-slate-400 mx-1">·</span> {total} {label}
      </span>
      <div className="flex gap-2">
        <button
          type="button"
          className="btn btn-secondary"
          disabled={page <= 1}
          onClick={() => onChange(page - 1)}
          aria-label="Page precedente"
        >
          <ChevronLeft size={16} className="mr-1" /> Precedent
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          disabled={page >= pageCount}
          onClick={() => onChange(page + 1)}
          aria-label="Page suivante"
        >
          Suivant <ChevronRight size={16} className="ml-1" />
        </button>
      </div>
    </div>
  );
}
