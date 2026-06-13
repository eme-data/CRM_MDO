'use client';
import { useEffect, useRef, useState } from 'react';
import { Sparkles, Send, User } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';

interface Turn { role: 'user' | 'assistant'; text: string }

const SUGGESTIONS = [
  'Combien de tickets ouverts en ce moment ?',
  'Quel est mon MRR et mon pipeline ?',
  'Quels contrats expirent dans les 60 jours ?',
  'Montre-moi les clients dont le nom contient « mairie »',
];

export default function AssistantPage() {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api.get('/ai/status').then((r) => setEnabled(r.enabled)).catch(() => setEnabled(false));
  }, []);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [turns, busy]);

  async function send(question: string) {
    const q = question.trim();
    if (!q || busy) return;
    setInput('');
    setTurns((t) => [...t, { role: 'user', text: q }]);
    setBusy(true);
    try {
      const r: any = await api.post('/ai/assistant', { question: q });
      setTurns((t) => [...t, { role: 'assistant', text: r.answer ?? '(pas de réponse)' }]);
    } catch (e: any) {
      toast.error(e.message);
      setTurns((t) => [...t, { role: 'assistant', text: 'Désolé, une erreur est survenue.' }]);
    } finally { setBusy(false); }
  }

  return (
    <div className="max-w-3xl mx-auto flex flex-col h-[calc(100vh-8rem)]">
      <h1 className="text-2xl font-bold flex items-center gap-2 mb-2">
        <Sparkles size={24} className="text-purple-600" /> Assistant CRM
      </h1>
      <p className="text-sm text-slate-500 mb-4">
        Pose une question sur tes données (clients, tickets, contrats, revenus). L'assistant interroge le CRM en lecture seule.
      </p>

      {enabled === false && (
        <div className="card p-4 bg-amber-50 border-amber-200 text-sm text-amber-800">
          L'IA n'est pas activée. Configure-la dans <strong>Réglages &gt; IA</strong> (clé Anthropic + activation).
        </div>
      )}

      {enabled && (
        <>
          <div className="flex-1 overflow-y-auto space-y-3 pr-1">
            {turns.length === 0 && (
              <div className="space-y-2">
                <div className="text-xs uppercase tracking-wide text-slate-400">Suggestions</div>
                {SUGGESTIONS.map((s) => (
                  <button key={s} onClick={() => send(s)} className="block w-full text-left card p-3 text-sm hover:border-purple-300 hover:bg-purple-50/40">
                    {s}
                  </button>
                ))}
              </div>
            )}
            {turns.map((t, i) => (
              <div key={i} className={'flex gap-2 ' + (t.role === 'user' ? 'justify-end' : 'justify-start')}>
                {t.role === 'assistant' && <div className="h-8 w-8 rounded-full bg-purple-100 text-purple-600 flex items-center justify-center shrink-0"><Sparkles size={16} /></div>}
                <div className={'rounded-lg px-3 py-2 text-sm whitespace-pre-wrap max-w-[80%] ' + (t.role === 'user' ? 'bg-mdo-600 text-white' : 'bg-white border')}>
                  {t.text}
                </div>
                {t.role === 'user' && <div className="h-8 w-8 rounded-full bg-mdo-100 text-mdo-600 flex items-center justify-center shrink-0"><User size={16} /></div>}
              </div>
            ))}
            {busy && (
              <div className="flex gap-2 justify-start">
                <div className="h-8 w-8 rounded-full bg-purple-100 text-purple-600 flex items-center justify-center shrink-0"><Sparkles size={16} /></div>
                <div className="rounded-lg px-3 py-2 text-sm bg-white border text-slate-400">L'assistant réfléchit…</div>
              </div>
            )}
            <div ref={endRef} />
          </div>

          <form onSubmit={(e) => { e.preventDefault(); send(input); }} className="mt-3 flex gap-2">
            <input
              className="input flex-1"
              placeholder="Pose ta question…"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={busy}
            />
            <button type="submit" disabled={busy || !input.trim()} className="btn btn-primary">
              <Send size={16} />
            </button>
          </form>
        </>
      )}
    </div>
  );
}
