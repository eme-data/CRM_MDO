'use client';
import { useEffect, useState } from 'react';
import { Plus, Check } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/utils';

const PRIORITY_COLOR: Record<string, string> = {
  LOW: 'bg-slate-100 text-slate-700',
  NORMAL: 'bg-blue-100 text-blue-700',
  HIGH: 'bg-amber-100 text-amber-700',
  URGENT: 'bg-red-100 text-red-700',
};

export default function TasksPage() {
  const [tasks, setTasks] = useState<any[]>([]);
  const [status, setStatus] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [newTask, setNewTask] = useState<any>({ title: '', priority: 'NORMAL' });

  async function load() {
    const p = status ? '?status=' + status : '';
    setTasks(await api.get('/tasks' + p));
  }
  useEffect(() => { load(); }, [status]);

  async function toggleDone(t: any) {
    await api.patch('/tasks/' + t.id, { status: t.status === 'DONE' ? 'TODO' : 'DONE' });
    load();
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    await api.post('/tasks', newTask);
    toast.success('Tache creee');
    setShowForm(false);
    setNewTask({ title: '', priority: 'NORMAL' });
    load();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Taches</h1>
        <button onClick={() => setShowForm(!showForm)} className="btn btn-primary"><Plus size={16} className="mr-1" /> Nouvelle tache</button>
      </div>
      {showForm && (
        <form onSubmit={create} className="card p-4 flex flex-wrap gap-2">
          <input className="input flex-1 min-w-[200px]" required placeholder="Titre..." value={newTask.title} onChange={(e) => setNewTask({ ...newTask, title: e.target.value })} />
          <select className="input max-w-[150px]" value={newTask.priority} onChange={(e) => setNewTask({ ...newTask, priority: e.target.value })}>
            <option value="LOW">Basse</option>
            <option value="NORMAL">Normale</option>
            <option value="HIGH">Haute</option>
            <option value="URGENT">Urgente</option>
          </select>
          <input type="date" className="input max-w-[180px]" onChange={(e) => setNewTask({ ...newTask, dueDate: e.target.value })} />
          <button type="submit" className="btn btn-primary">Ajouter</button>
        </form>
      )}
      <div className="card p-4">
        <div className="flex gap-2 mb-4">
          {[['', 'Toutes'], ['TODO', 'A faire'], ['DOING', 'En cours'], ['DONE', 'Terminees']].map(([v, l]) => (
            <button key={v} onClick={() => setStatus(v)} className={'btn ' + (status === v ? 'btn-primary' : 'btn-secondary')}>{l}</button>
          ))}
        </div>
        <div className="space-y-2">
          {tasks.length === 0 ? (
            <p className="text-slate-400 text-sm">Aucune tache</p>
          ) : tasks.map((t) => (
            <div key={t.id} className="flex items-center gap-3 p-3 border rounded-md hover:bg-slate-50">
              <button onClick={() => toggleDone(t)} className={'w-6 h-6 rounded border-2 flex items-center justify-center ' + (t.status === 'DONE' ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-slate-300')}>
                {t.status === 'DONE' && <Check size={14} />}
              </button>
              <div className="flex-1">
                <div className={t.status === 'DONE' ? 'line-through text-slate-400' : 'font-medium'}>{t.title}</div>
                <div className="text-xs text-slate-500">
                  {t.dueDate && 'Echeance : ' + formatDate(t.dueDate)}
                  {t.company && ' - ' + t.company.name}
                  {t.contract && ' - ' + t.contract.reference}
                </div>
              </div>
              <span className={'badge ' + PRIORITY_COLOR[t.priority]}>{t.priority}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
