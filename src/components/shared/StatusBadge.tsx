import { cn } from '@/lib/utils';

interface StatusBadgeProps {
  status: 'active' | 'exited' | 'pending' | 'completed';
  className?: string;
}

const statusStyles = {
  active: 'bg-success/10 text-success border-success/20',
  exited: 'bg-destructive/10 text-destructive border-destructive/20',
  pending: 'bg-warning/10 text-warning border-warning/20',
  completed: 'bg-primary/10 text-primary border-primary/20',
};

const statusLabels = {
  active: 'Active',
  exited: 'Exited',
  pending: 'Pending',
  completed: 'Completed',
};

export function StatusBadge({ status, className }: StatusBadgeProps) {
  return (
    <span className={cn(
      'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors',
      statusStyles[status],
      className
    )}>
      <span className={cn(
        'h-1.5 w-1.5 rounded-full',
        status === 'active' && 'bg-success',
        status === 'exited' && 'bg-destructive',
        status === 'pending' && 'bg-warning',
        status === 'completed' && 'bg-primary',
      )} />
      {statusLabels[status]}
    </span>
  );
}
