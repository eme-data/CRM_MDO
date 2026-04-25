'use client';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Save, TestTube, Eye, EyeOff, RefreshCw, Building2, Send, Inbox } from 'lucide-react';
import { api } from '@/lib/api';

interface SettingItem {
  key: string;
  category: string;
  label: string;
  description?: string | null;
  isSecret: boolean;
  value: string | null;
  isSet: boolean;
  envFallback: boolean;
  updatedAt: string;
}

const CATEGORY_META: Record<string, { title: string; icon: any; description: string }> = {
  lookup: {
    title: 'Annuaire entreprises',
    icon: Building2,
    description: 'Cles API pour la recherche automatique de societes (Pappers et INSEE Sirene).',
  },
  smtp: {
    title: 'SMTP - emails sortants',
    icon: Send,
    description: 'Configuration du serveur SMTP pour envoyer les emails (alertes, replies tickets).',
  },
  imap: {
    title: 'IMAP - emails entrants',
    icon: Inbox,
    description: 'Boite mail scannee toutes les 2 minutes pour creer des tickets automatiquement.',
  },
};

const ORDER = ['lookup', 'smtp', 'imap'];

export default function AdminSettingsPage() {
  const [groups, setGroups] = useState<Record<string, SettingItem[]>>({});
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [reveal, setReveal] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [testEmail, setTestEmail] = useState('');
  const [testing, setTesting] = useState<'smtp' | 'imap' | null>(null);

  async function load() {
    setLoading(true);
    try {
      const data = await api.get('/admin/settings');
      setGroups(data);
      const dft: Record<string, string> = {};
      for (const cat of Object.values(data) as SettingItem[][]) {
        for (const s of cat) dft[s.key] = s.value ?? '';
      }
      setDrafts(dft);
    } catch (err: any) {
      toast.error(err.message ?? 'Acces refuse - reserve aux administrateurs');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function save(key: string) {
    setSavingKey(key);
    try {
      const value = drafts[key] ?? '';
      await api.patch('/admin/settings/' + encodeURIComponent(key), { value });
      toast.success('Sauvegarde');
      await load();
    } catch (err: any) {
      toast.error(err.message ?? 'Erreur');
    } finally {
      setSavingKey(null);
    }
  }

  async function testSmtp() {
    setTesting('smtp');
    try {
      const res = await api.post('/admin/settings/test/smtp', testEmail ? { to: testEmail } : {});
      toast.success(res.message ?? 'Test SMTP OK');
    } catch (err: any) {
      toast.error(err.message ?? 'Echec test SMTP');
    } finally {
      setTesting(null);
    }
  }

  async function testImap() {
    setTesting('imap');
    try {
      const res = await api.post('/admin/settings/test/imap');
      toast.success(res.message ?? 'Test IMAP OK');
    } catch (err: any) {
      toast.error(err.message ?? 'Echec test IMAP');
    } finally {
      setTesting(null);
    }
  }

  if (loading) return <div>Chargement...</div>;

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-3xl font-bold">Parametres administrateur</h1>
        <p className="text-sm text-slate-500 mt-1">
          Configuration runtime du CRM. Les modifications sont prises en compte immediatement (pas de redemarrage).
          Les variables d'environnement (.env) servent de fallback si la valeur est vide ici.
        </p>
      </div>

      {ORDER.map((cat) => {
        const items = groups[cat] ?? [];
        if (items.length === 0) return null;
        const meta = CATEGORY_META[cat];
        const Icon = meta?.icon ?? Building2;
        return (
          <div key={cat} className="card p-6 space-y-4">
            <div className="flex items-center gap-3 pb-2 border-b">
              <Icon size={20} className="text-mdo-500" />
              <div>
                <h2 className="font-semibold">{meta?.title ?? cat}</h2>
                {meta?.description && <p className="text-xs text-slate-500">{meta.description}</p>}
              </div>
            </div>

            <div className="space-y-3">
              {items.map((s) => (
                <SettingRow
                  key={s.key}
                  setting={s}
                  draft={drafts[s.key] ?? ''}
                  reveal={Boolean(reveal[s.key])}
                  saving={savingKey === s.key}
                  onChange={(v) => setDrafts((d) => ({ ...d, [s.key]: v }))}
                  onToggleReveal={() => setReveal((r) => ({ ...r, [s.key]: !r[s.key] }))}
                  onSave={() => save(s.key)}
                />
              ))}
            </div>

            {cat === 'smtp' && (
              <div className="border-t pt-4 flex flex-wrap items-end gap-2">
                <div className="flex-1 min-w-[200px]">
                  <label className="label">Tester l'envoi</label>
                  <input
                    type="email"
                    className="input"
                    placeholder="email@destinataire.fr (optionnel)"
                    value={testEmail}
                    onChange={(e) => setTestEmail(e.target.value)}
                  />
                </div>
                <button
                  onClick={testSmtp}
                  disabled={testing === 'smtp'}
                  className="btn btn-secondary"
                >
                  <TestTube size={14} className="mr-1" />
                  {testing === 'smtp' ? 'Test en cours...' : 'Tester SMTP'}
                </button>
              </div>
            )}

            {cat === 'imap' && (
              <div className="border-t pt-4">
                <button
                  onClick={testImap}
                  disabled={testing === 'imap'}
                  className="btn btn-secondary"
                >
                  <TestTube size={14} className="mr-1" />
                  {testing === 'imap' ? 'Test en cours...' : 'Tester IMAP'}
                </button>
              </div>
            )}
          </div>
        );
      })}

      <button onClick={load} className="text-sm text-slate-500 hover:text-slate-700 inline-flex items-center gap-1">
        <RefreshCw size={12} /> Recharger
      </button>
    </div>
  );
}

function SettingRow({
  setting: s,
  draft,
  reveal,
  saving,
  onChange,
  onToggleReveal,
  onSave,
}: {
  setting: SettingItem;
  draft: string;
  reveal: boolean;
  saving: boolean;
  onChange: (v: string) => void;
  onToggleReveal: () => void;
  onSave: () => void;
}) {
  const isPassword = s.isSecret;
  const placeholder = s.isSet
    ? (isPassword ? '******** (laisser vide pour conserver)' : '')
    : (s.envFallback ? '(valeur depuis .env)' : '');

  return (
    <div>
      <div className="flex justify-between items-center mb-1">
        <label className="text-sm font-medium">
          {s.label}
          {s.isSet ? (
            <span className="ml-2 text-xs text-emerald-600">OK</span>
          ) : s.envFallback ? (
            <span className="ml-2 text-xs text-amber-600">.env fallback</span>
          ) : (
            <span className="ml-2 text-xs text-slate-400">non defini</span>
          )}
        </label>
        <span className="text-xs text-slate-400 font-mono">{s.key}</span>
      </div>
      {s.description && <p className="text-xs text-slate-500 mb-1">{s.description}</p>}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <input
            type={isPassword && !reveal ? 'password' : 'text'}
            className="input pr-9"
            placeholder={placeholder}
            value={draft}
            onChange={(e) => onChange(e.target.value)}
          />
          {isPassword && (
            <button
              type="button"
              onClick={onToggleReveal}
              className="absolute right-2 top-2.5 text-slate-400 hover:text-slate-600"
              title={reveal ? 'Masquer' : 'Afficher'}
            >
              {reveal ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          )}
        </div>
        <button onClick={onSave} disabled={saving} className="btn btn-primary text-xs">
          <Save size={12} className="mr-1" /> {saving ? '...' : 'Sauver'}
        </button>
      </div>
    </div>
  );
}
