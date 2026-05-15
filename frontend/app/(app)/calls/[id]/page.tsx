'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, Sparkles, PhoneIncoming, PhoneOutgoing, FileText } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { formatDateTime } from '@/lib/utils';

export default function CallDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const [c, setC] = useState<any>(null);
  const [transcribing, setTranscribing] = useState(false);

  async function load() { setC(await api.get('/calls/' + id)); }
  useEffect(() => { load(); }, [id]);

  async function transcribe() {
    setTranscribing(true);
    try {
      const r = await api.post('/call-transcription/calls/' + id + '/transcribe');
      toast.success('Transcription terminee (' + r.transcriptLength + ' caracteres' + (r.hasSummary ? ' + resume IA' : '') + ')');
      load();
    } catch (err: any) { toast.error(err.message); }
    finally { setTranscribing(false); }
  }

  async function saveNotes(notes: string) {
    try {
      await api.patch('/calls/' + id + '/notes', { notes });
      toast.success('Notes enregistrees', { duration: 1500 });
    } catch (err: any) { toast.error(err.message); }
  }

  if (!c) return <div>Chargement...</div>;

  const Icon = c.direction === 'INBOUND' ? PhoneIncoming : PhoneOutgoing;

  return (
    <div className="space-y-6 max-w-4xl">
      <Link href="/calls" className="inline-flex items-center text-sm text-slate-500 hover:text-slate-700">
        <ArrowLeft size={14} className="mr-1" /> Retour appels
      </Link>

      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-3">
            <Icon size={28} className={c.direction === 'INBOUND' ? 'text-blue-500' : 'text-emerald-500'} />
            Appel {c.direction === 'INBOUND' ? 'entrant' : 'sortant'}
          </h1>
          <div className="text-sm text-slate-600 mt-1">
            <span className="font-mono">{c.fromNumber}</span> → <span className="font-mono">{c.toNumber}</span>
            {' · '}{formatDateTime(c.startedAt)}
            {c.durationSec && ' · ' + Math.floor(c.durationSec / 60) + 'm' + String(c.durationSec % 60).padStart(2, '0') + 's'}
          </div>
          {c.contact && (
            <p className="text-sm mt-1">Contact : <Link href={'/contacts/' + c.contact.id} className="text-mdo-600 hover:underline">{c.contact.firstName} {c.contact.lastName}</Link></p>
          )}
          {c.company && (
            <p className="text-sm">Societe : <Link href={'/companies/' + c.company.id} className="text-mdo-600 hover:underline">{c.company.name}</Link></p>
          )}
        </div>
        {c.recordingUrl && !c.transcript && (
          <button onClick={transcribe} disabled={transcribing} className="btn btn-primary">
            <Sparkles size={14} className="mr-1" /> {transcribing ? 'Transcription...' : 'Transcrire (IA)'}
          </button>
        )}
      </div>

      {c.recordingUrl && (
        <div className="card p-4">
          <h3 className="font-semibold text-sm mb-2">Enregistrement</h3>
          <audio controls src={c.recordingUrl} className="w-full" />
        </div>
      )}

      {c.summary && (
        <div className="card p-5 border-purple-200 bg-purple-50/50 space-y-2">
          <h3 className="font-semibold flex items-center gap-2 text-purple-700">
            <Sparkles size={16} /> Resume IA
            {c.transcribedAt && <span className="text-xs text-slate-500 font-normal">({formatDateTime(c.transcribedAt)})</span>}
          </h3>
          <pre className="text-sm whitespace-pre-wrap font-sans">{c.summary}</pre>
        </div>
      )}

      {c.transcript && (
        <div className="card p-5">
          <h3 className="font-semibold flex items-center gap-2 mb-2">
            <FileText size={16} /> Transcription complete
            {c.transcriptionLanguage && <span className="text-xs text-slate-500 font-normal">[{c.transcriptionLanguage}]</span>}
          </h3>
          <p className="text-sm whitespace-pre-wrap text-slate-700">{c.transcript}</p>
        </div>
      )}

      {c.transcriptionStatus === 'FAILED' && c.transcriptionError && (
        <div className="card p-4 border-red-200 bg-red-50">
          <p className="text-sm text-red-700">Transcription echouee : {c.transcriptionError}</p>
        </div>
      )}

      <div className="card p-5">
        <h3 className="font-semibold mb-2">Notes manuelles</h3>
        <textarea
          className="input min-h-[120px]"
          placeholder="Notes ajoutees a la main par le tech..."
          defaultValue={c.notes ?? ''}
          onBlur={(e) => saveNotes(e.target.value)}
        />
        <p className="text-xs text-slate-500 mt-2">Sauvegarde auto au blur.</p>
      </div>
    </div>
  );
}
