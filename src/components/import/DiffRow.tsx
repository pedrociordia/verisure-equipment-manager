import React from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import type { FieldChange, ImportPeopleRow } from '@/lib/import-parsers';
import { cn } from '@/lib/utils';
import { AlertTriangle, XCircle } from 'lucide-react';

interface DiffRowProps {
  row: ImportPeopleRow | any;
  type: 'new' | 'modified' | 'unchanged' | 'warning' | 'error';
  changes?: FieldChange[];
  reason?: string;
  selected: boolean;
  onToggle: () => void;
  disabled?: boolean;
}

const FIELD_LABELS: Record<string, string> = {
  sales_name: 'Name',
  sales_id: 'Sales ID',
  branch_id: 'Branch ID',
  branch_name: 'Branch',
  exit_date: 'Exit Date',
  sales_channel_start: 'Start Date',
  contract_type: 'Contract',
};

export const DiffRow = React.forwardRef<HTMLDivElement, DiffRowProps>(
  ({ row, type, changes, reason, selected, onToggle, disabled }, ref) => {
    const borderColor = type === 'new'
      ? 'border-l-emerald-500'
      : type === 'modified'
        ? 'border-l-amber-500'
        : type === 'warning'
          ? 'border-l-orange-500'
          : type === 'error'
            ? 'border-l-destructive'
            : 'border-l-muted';

    const persId = row.pers_id || row.person_pers_id || '';
    const name = row.sales_name || row.person_name || '';
    const branchName = row.branch_name || '';

    return (
      <div
        ref={ref}
        className={cn(
          'flex items-start gap-3 p-3 rounded-lg border border-l-[3px] transition-colors',
          borderColor,
          selected ? 'bg-accent/30' : 'bg-card',
          disabled && 'opacity-50'
        )}
      >
        {(type === 'new' || type === 'modified') && (
          <Checkbox
            checked={selected}
            onCheckedChange={onToggle}
            disabled={disabled}
            className="mt-0.5"
          />
        )}
        {type === 'warning' && <AlertTriangle className="h-4 w-4 text-orange-500 mt-0.5 shrink-0" />}
        {type === 'error' && <XCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-xs text-muted-foreground">{persId}</span>
            <span className="font-medium text-sm truncate">{name}</span>
            {branchName && (
              <span className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{branchName}</span>
            )}
            {type === 'new' && (
              <span className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
                New
              </span>
            )}
          </div>
          {type === 'modified' && changes && changes.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {changes.map((c, i) => (
                <span key={i} className="inline-flex items-center gap-1 text-xs">
                  <span className="text-muted-foreground">{FIELD_LABELS[c.field] || c.field}:</span>
                  <span className="line-through text-destructive/70">{displayValue(c.oldValue)}</span>
                  <span className="text-foreground">→</span>
                  <span className="font-medium text-emerald-600 dark:text-emerald-400">{displayValue(c.newValue)}</span>
                </span>
              ))}
            </div>
          )}
          {(type === 'warning' || type === 'error') && reason && (
            <p className={cn('mt-1 text-xs', type === 'error' ? 'text-destructive' : 'text-orange-600 dark:text-orange-400')}>
              {reason}
            </p>
          )}
        </div>
      </div>
    );
  }
);

DiffRow.displayName = 'DiffRow';

function displayValue(val: any): string {
  if (val === null || val === undefined || val === '') return '—';
  return String(val);
}
