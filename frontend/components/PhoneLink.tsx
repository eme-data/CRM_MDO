'use client';
import { useState } from 'react';
import { Phone } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';

// Petit composant click-to-call. Affiche le numero comme un lien stylise ;
// au clic, POST /calls/click cote backend (qui choisit son provider via
// Settings : TEL_URI fait juste tomber sur l'URI tel:..., FREE_PRO declenche
// l'appel via API). Quel que soit le provider, on fallback toujours sur tel:
// pour que l'utilisateur ait une option meme si l'API distante est en panne.
//
// Note RGPD : l'evenement click cree un CallLog OUTBOUND (avec le numero
// compose) mais sans contenu sensible — c'est l'equivalent d'un journal
// d'appels classique.

interface PhoneLinkProps {
  number?: string | null;
  // Si false, le numero est affiche en texte brut sans handler (lecture seule).
  clickable?: boolean;
  className?: string;
  // Compact = juste l'icone (utile dans les tableaux)
  iconOnly?: boolean;
}

export function PhoneLink({ number, clickable = true, className, iconOnly }: PhoneLinkProps) {
  const [busy, setBusy] = useState(false);
  if (!number) return <span className="text-slate-400">-</span>;

  if (!clickable) {
    return <span className={className}>{number}</span>;
  }

  async function handleClick(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setBusy(true);
    try {
      const res = await api.post('/calls/click', { number });
      toast.success(
        res.provider === 'FREE_PRO'
          ? 'Appel declenche via Free PRO'
          : 'Numero enregistre — composez sur votre poste',
      );
      // Fallback: ouvre tel: pour l'utilisateur (mobile / softphone systeme)
      window.location.href = 'tel:' + (number ?? '');
    } catch (err: any) {
      toast.error(err.message);
      // Toujours offrir le fallback tel: meme si le backend a echoue
      window.location.href = 'tel:' + (number ?? '');
    } finally {
      setBusy(false);
    }
  }

  return (
    <a
      href={'tel:' + number}
      onClick={handleClick}
      className={
        'inline-flex items-center gap-1 text-mdo-600 hover:underline ' +
        (busy ? 'opacity-50 pointer-events-none ' : '') +
        (className ?? '')
      }
      title="Appeler"
    >
      <Phone size={iconOnly ? 14 : 12} />
      {!iconOnly && <span>{number}</span>}
    </a>
  );
}
