import { LucideIcon, Inbox } from 'lucide-react';
import { cn } from '@/lib/utils';

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

export function EmptyState({ icon: Icon = Inbox, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center text-center py-12 px-4', className)}>
      <div className="rounded-full bg-slate-100 dark:bg-slate-700 p-4 mb-4">
        <Icon size={28} className="text-slate-400 dark:text-slate-300" />
      </div>
      <h3 className="text-base font-medium text-slate-700 dark:text-slate-200">{title}</h3>
      {description && (
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400 max-w-md">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
