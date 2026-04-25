'use client';
import { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { Bell, Check, CheckCheck } from 'lucide-react';
import { api } from '@/lib/api';
import { formatDateTime } from '@/lib/utils';

interface Notif {
  id: string;
  type: string;
  title: string;
  body: string | null;
  url: string | null;
  readAt: string | null;
  createdAt: string;
}

export function NotificationBell() {
  const [count, setCount] = useState(0);
  const [items, setItems] = useState<Notif[]>([]);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  async function loadCount() {
    try {
      const res = await api.get('/notifications/unread-count');
      setCount(res.count ?? 0);
    } catch {}
  }

  async function loadItems() {
    try {
      const list = await api.get('/notifications?limit=20');
      setItems(list);
    } catch {}
  }

  useEffect(() => {
    loadCount();
    const interval = setInterval(loadCount, 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  async function toggle() {
    if (!open) await loadItems();
    setOpen(!open);
  }

  async function markRead(id: string) {
    await api.post('/notifications/' + id + '/read');
    setItems((prev) => prev.map((n) => (n.id === id ? { ...n, readAt: new Date().toISOString() } : n)));
    loadCount();
  }

  async function markAllRead() {
    await api.post('/notifications/read-all');
    setItems((prev) => prev.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })));
    setCount(0);
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={toggle}
        className="relative flex items-center gap-3 rounded-md px-3 py-2 text-sm text-slate-300 hover:bg-slate-800 w-full"
      >
        <Bell size={18} />
        <span>Notifications</span>
        {count > 0 && (
          <span className="ml-auto inline-flex items-center justify-center rounded-full bg-red-500 px-2 py-0.5 text-xs text-white font-semibold">
            {count > 99 ? '99+' : count}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute left-full bottom-0 ml-2 w-80 max-h-[70vh] overflow-y-auto rounded-md bg-white text-slate-800 shadow-xl border border-slate-200 z-50">
          <div className="flex items-center justify-between p-3 border-b">
            <span className="font-semibold text-sm">Notifications</span>
            {count > 0 && (
              <button onClick={markAllRead} className="text-xs text-mdo-600 hover:underline inline-flex items-center gap-1">
                <CheckCheck size={12} /> Tout marquer lu
              </button>
            )}
          </div>
          {items.length === 0 ? (
            <p className="p-6 text-center text-sm text-slate-400">Aucune notification</p>
          ) : (
            <ul>
              {items.map((n) => (
                <li
                  key={n.id}
                  className={'border-b last:border-b-0 ' + (n.readAt ? 'bg-white' : 'bg-mdo-50')}
                >
                  <div className="p-3 flex gap-2">
                    <div className="flex-1 min-w-0">
                      {n.url ? (
                        <Link
                          href={n.url}
                          onClick={() => { setOpen(false); markRead(n.id); }}
                          className="text-sm font-medium text-mdo-700 hover:underline block"
                        >
                          {n.title}
                        </Link>
                      ) : (
                        <p className="text-sm font-medium">{n.title}</p>
                      )}
                      {n.body && <p className="text-xs text-slate-600 truncate">{n.body}</p>}
                      <p className="text-xs text-slate-400 mt-1">{formatDateTime(n.createdAt)}</p>
                    </div>
                    {!n.readAt && (
                      <button
                        onClick={() => markRead(n.id)}
                        className="text-slate-400 hover:text-emerald-600"
                        title="Marquer comme lu"
                      >
                        <Check size={14} />
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
