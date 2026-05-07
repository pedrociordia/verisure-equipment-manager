import { cn } from '@/lib/utils';

export type FilterType = 'all' | 'new' | 'modified' | 'unchanged' | 'warnings' | 'errors';

interface FilterItem {
  type: FilterType;
  label: string;
  count: number;
  color: string;
  hidden?: boolean;
}

interface ImportFiltersProps {
  active: FilterType;
  onChange: (type: FilterType) => void;
  counts: { all: number; new: number; modified: number; unchanged: number; warnings: number; errors: number };
  newLabel?: string;
}

export function ImportFilters({ active, onChange, counts, newLabel = 'New' }: ImportFiltersProps) {
  const filters: FilterItem[] = [
    { type: 'all', label: 'All', count: counts.all, color: 'bg-foreground/10 text-foreground' },
    { type: 'new', label: newLabel, count: counts.new, color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' },
    { type: 'modified', label: 'Modified', count: counts.modified, color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300', hidden: counts.modified === 0 },
    { type: 'unchanged', label: 'Unchanged', count: counts.unchanged, color: 'bg-muted text-muted-foreground' },
    { type: 'warnings', label: 'Warnings', count: counts.warnings, color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300', hidden: counts.warnings === 0 },
    { type: 'errors', label: 'Errors', count: counts.errors, color: 'bg-destructive/10 text-destructive', hidden: counts.errors === 0 },
  ];

  return (
    <div className="flex gap-1.5 p-1 bg-muted/50 rounded-lg flex-wrap">
      {filters.filter(f => !f.hidden).map(f => (
        <button
          key={f.type}
          onClick={() => onChange(f.type)}
          className={cn(
            'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all',
            active === f.type
              ? 'bg-background shadow-sm text-foreground'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          {f.label}
          <span className={cn('inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-[11px] font-semibold', f.color)}>
            {f.count}
          </span>
        </button>
      ))}
    </div>
  );
}
