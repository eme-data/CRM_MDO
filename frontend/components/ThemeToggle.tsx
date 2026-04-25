'use client';
import { useEffect, useState } from 'react';
import { Sun, Moon } from 'lucide-react';

const KEY = 'crm_mdo_theme';

export function ThemeToggle() {
  const [theme, setTheme] = useState<'light' | 'dark'>('light');

  useEffect(() => {
    const saved = (localStorage.getItem(KEY) as 'light' | 'dark') || 'light';
    setTheme(saved);
    apply(saved);
  }, []);

  function apply(t: 'light' | 'dark') {
    if (t === 'dark') document.documentElement.classList.add('dark');
    else document.documentElement.classList.remove('dark');
  }

  function toggle() {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    localStorage.setItem(KEY, next);
    apply(next);
  }

  return (
    <button
      onClick={toggle}
      className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-slate-300 hover:bg-slate-800 w-full"
    >
      {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
      <span>{theme === 'dark' ? 'Mode clair' : 'Mode sombre'}</span>
    </button>
  );
}
