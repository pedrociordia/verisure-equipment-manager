import { useState, useMemo, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarIcon, UserPlus, LogOut, AlertTriangle, CheckCircle2, Search, Upload, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format, parseISO } from 'date-fns';
import type { ExitsDiffResult } from '@/lib/import-parsers';
import { logger } from '@/lib/logger';

interface Branch { id: number; district_code: string; name: string }

export interface ExitsImportPayload {
  toCreate: Array<{
    pers_id: string;
    sales_name: string;
    sales_id: string;
    branch_id: number | null;
    branch_name: string | null;
    sales_channel_start: string | null;
    exit_date: string | null;
  }>;
  toMarkAsExit: Array<{ pers_id: string; exit_date: string; sales_channel_start: string | null }>;
  toUpdateExitDate: Array<{ pers_id: string; exit_date: string; sales_channel_start: string | null }>;
}

interface ImportProgress {
  status: string;
  current: number;
  total: number;
  inserted: number;
  updated: number;
  failed: number;
}

interface ImportResult {
  created: number;
  marked: number;
  updated: number;
  errors: number;
  failedReasons?: string[];
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  diff: ExitsDiffResult;
  branches: Branch[];
  onImport: (payload: ExitsImportPayload, onProgress?: (p: Partial<ImportProgress>) => void) => Promise<ImportResult>;
}

function parseDate(iso: string | null): Date | undefined {
  if (!iso) return undefined;
  try { return parseISO(iso); } catch { return undefined; }
}

function toIso(d: Date | undefined): string | null {
  if (!d) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function fmt(iso: string | null | undefined): string {
  if (!iso) return '—';
  try { return format(parseISO(iso), 'dd MMM yyyy'); } catch { return iso; }
}

export function ExitsImportReviewDialog({ open, onOpenChange, diff, branches, onImport }: Props) {
  // ── State per bucket ──
  // Missing in System: selected + chosen branch + editable hire/exit dates
  type MissingState = { selected: boolean; branchId: number | null; hireDate: string | null; exitDate: string | null };
  const [missingState, setMissingState] = useState<Record<string, MissingState>>(() => {
    const o: Record<string, MissingState> = {};
    diff.missingInSystem.forEach(r => {
      o[r.pers_id] = {
        selected: false,
        branchId: r.branch_id ?? null,
        hireDate: r.sales_channel_start,
        exitDate: r.exit_date,
      };
    });
    return o;
  });

  // Active → Exit: selected (default true) + editable exit date
  const [activeState, setActiveState] = useState<Record<string, { selected: boolean; exitDate: string | null }>>(() => {
    const o: Record<string, { selected: boolean; exitDate: string | null }> = {};
    diff.activeToExit.forEach(r => {
      o[r.row.pers_id] = { selected: true, exitDate: r.suggestedExitDate };
    });
    return o;
  });

  // Mismatch: selected (default false → keep current) + chosen exit date
  const [mismatchState, setMismatchState] = useState<Record<string, { override: boolean; exitDate: string }>>(() => {
    const o: Record<string, { override: boolean; exitDate: string }> = {};
    diff.exitDateMismatch.forEach(m => {
      o[m.row.pers_id] = { override: false, exitDate: m.newExitDate };
    });
    return o;
  });

  const [search, setSearch] = useState('');
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState<ImportProgress>({ status: '', current: 0, total: 0, inserted: 0, updated: 0, failed: 0 });
  const [result, setResult] = useState<ImportResult | null>(null);

  const matchSearch = useCallback((id: string, name: string) => {
    if (!search) return true;
    const s = search.toLowerCase();
    return id.toLowerCase().includes(s) || name.toLowerCase().includes(s);
  }, [search]);

  const filteredMissing = useMemo(() =>
    diff.missingInSystem.filter(r => matchSearch(r.pers_id, r.sales_name)),
    [diff.missingInSystem, matchSearch]);

  const filteredActive = useMemo(() =>
    diff.activeToExit.filter(r => matchSearch(r.row.pers_id, r.row.sales_name)),
    [diff.activeToExit, matchSearch]);

  const filteredMismatch = useMemo(() =>
    diff.exitDateMismatch.filter(r => matchSearch(r.row.pers_id, r.row.sales_name)),
    [diff.exitDateMismatch, matchSearch]);

  const counts = useMemo(() => {
    const missing = Object.values(missingState).filter(s => s.selected).length;
    const marked = Object.values(activeState).filter(s => s.selected).length;
    const updated = Object.values(mismatchState).filter(s => s.override).length;
    return { missing, marked, updated, total: missing + marked + updated };
  }, [missingState, activeState, mismatchState]);

  const allMissingValid = useMemo(() =>
    diff.missingInSystem.every(r => {
      const s = missingState[r.pers_id];
      return !s?.selected || s.branchId !== null;
    }),
    [diff.missingInSystem, missingState]);

  const handleImport = async () => {
    if (!allMissingValid) return;
    setImporting(true);

    const toCreate = diff.missingInSystem
      .filter(r => missingState[r.pers_id]?.selected)
      .map(r => {
        const st = missingState[r.pers_id];
        const branch = branches.find(b => b.id === st.branchId);
        return {
          pers_id: r.pers_id,
          sales_name: r.sales_name,
          sales_id: '',
          branch_id: st.branchId,
          branch_name: branch?.district_code ?? null,
          sales_channel_start: st.hireDate,
          exit_date: st.exitDate,
        };
      });

    const toMarkAsExit = diff.activeToExit
      .filter(r => activeState[r.row.pers_id]?.selected && activeState[r.row.pers_id]?.exitDate)
      .map(r => ({
        pers_id: r.row.pers_id,
        exit_date: activeState[r.row.pers_id].exitDate as string,
        sales_channel_start: r.existing.sales_channel_start,
      }));

    const toUpdateExitDate = diff.exitDateMismatch
      .filter(r => mismatchState[r.row.pers_id]?.override)
      .map(r => ({
        pers_id: r.row.pers_id,
        exit_date: mismatchState[r.row.pers_id].exitDate,
        sales_channel_start: r.existing.sales_channel_start,
      }));

    const total = toCreate.length + toMarkAsExit.length + toUpdateExitDate.length;
    setProgress({ status: 'Starting...', current: 0, total, inserted: 0, updated: 0, failed: 0 });

    try {
      const res = await onImport(
        { toCreate, toMarkAsExit, toUpdateExitDate },
        (p) => setProgress(prev => ({ ...prev, ...p })),
      );
      setResult(res);
    } catch (err: any) {
      logger.error('Exits import failed:', err);
      setResult({ created: 0, marked: 0, updated: 0, errors: total, failedReasons: [err?.message || 'Unknown error'] });
    } finally {
      setImporting(false);
    }
  };

  // ── Result view ──
  if (result) {
    const ok = result.errors === 0;
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <div className="flex flex-col items-center gap-4 py-6">
            {ok ? (
              <div className="h-16 w-16 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                <CheckCircle2 className="h-8 w-8 text-emerald-600" />
              </div>
            ) : (
              <div className="h-16 w-16 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                <AlertTriangle className="h-8 w-8 text-amber-600" />
              </div>
            )}
            <div className="grid grid-cols-3 gap-6 text-center">
              <div>
                <p className="text-2xl font-bold text-emerald-600 tabular-nums">{result.created}</p>
                <p className="text-[11px] text-muted-foreground">Created</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-amber-600 tabular-nums">{result.marked}</p>
                <p className="text-[11px] text-muted-foreground">Marked Exit</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-orange-600 tabular-nums">{result.updated}</p>
                <p className="text-[11px] text-muted-foreground">Dates Updated</p>
              </div>
            </div>
            {result.errors > 0 && (
              <p className="text-sm text-destructive">{result.errors} failed</p>
            )}
          </div>
          <div className="flex justify-center pb-2">
            <Button onClick={() => onOpenChange(false)}>Done</Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={importing ? undefined : onOpenChange}>
      <DialogContent className="sm:max-w-4xl max-h-[92vh] flex flex-col p-0">
        <DialogHeader className="px-6 pt-6 pb-2">
          <DialogTitle>Exits Import Review</DialogTitle>
          <p className="text-xs text-muted-foreground">
            The Exits file only manages exit status. Names, branches, sales IDs and hire dates of existing people are never modified from this file.
          </p>
        </DialogHeader>

        {/* KPI bar */}
        <div className="px-6 grid grid-cols-3 gap-2">
          <KpiCard icon={<UserPlus className="h-3.5 w-3.5" />} label="Missing in System" total={diff.missingInSystem.length} selected={counts.missing} tone="emerald" />
          <KpiCard icon={<LogOut className="h-3.5 w-3.5" />} label="Mark as Exit" total={diff.activeToExit.length} selected={counts.marked} tone="amber" />
          <KpiCard icon={<AlertTriangle className="h-3.5 w-3.5" />} label="Exit Date Conflicts" total={diff.exitDateMismatch.length} selected={counts.updated} tone="orange" />
        </div>

        <div className="px-6 py-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input placeholder="Search by Pers ID or name..." value={search} onChange={e => setSearch(e.target.value)} className="pl-8 h-8 text-sm" />
          </div>
        </div>

        {importing && (
          <div className="px-6 py-3 space-y-2 border-y bg-muted/30">
            <Progress value={progress.total > 0 ? (progress.current / progress.total) * 100 : 0} className="h-2" />
            <p className="text-xs text-center animate-pulse">{progress.status}</p>
            <p className="text-[11px] text-muted-foreground text-center">
              {progress.current} of {progress.total} · {progress.inserted} created · {progress.updated} updated · {progress.failed} failed
            </p>
          </div>
        )}

        <div className="flex-1 min-h-0 overflow-y-auto">
          <div className="px-6 py-2 space-y-6 pb-6">
            {/* Missing in System */}
            {diff.missingInSystem.length > 0 && (
              <Section title="Missing in System" subtitle="People in the Exits file that don't exist yet. Pick a branch and confirm dates to create them." color="emerald" count={filteredMissing.length}>
                {filteredMissing.length === 0 ? (
                  <Empty />
                ) : filteredMissing.map(r => {
                  const st = missingState[r.pers_id];
                  return (
                    <div key={r.pers_id} className="flex items-start gap-3 p-3 rounded-lg border border-l-[3px] border-l-emerald-500 bg-card">
                      <Checkbox
                        checked={st.selected}
                        onCheckedChange={() => setMissingState(prev => ({ ...prev, [r.pers_id]: { ...prev[r.pers_id], selected: !prev[r.pers_id].selected } }))}
                        disabled={importing}
                        className="mt-1"
                      />
                      <div className="flex-1 min-w-0 space-y-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-xs text-muted-foreground">{r.pers_id}</span>
                          <span className="font-medium text-sm">{r.sales_name}</span>
                        </div>
                        <div className="grid grid-cols-3 gap-2">
                          <div>
                            <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Branch *</label>
                            <Select
                              value={st.branchId !== null ? String(st.branchId) : ''}
                              onValueChange={v => setMissingState(prev => ({ ...prev, [r.pers_id]: { ...prev[r.pers_id], branchId: parseInt(v) } }))}
                              disabled={importing}
                            >
                              <SelectTrigger className={cn('h-8 text-xs', st.selected && st.branchId === null && 'border-destructive')}>
                                <SelectValue placeholder="Select branch" />
                              </SelectTrigger>
                              <SelectContent>
                                {branches.map(b => (
                                  <SelectItem key={b.id} value={String(b.id)}>{b.district_code} — {b.name}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <DateField label="Hire Date" value={st.hireDate} onChange={v => setMissingState(prev => ({ ...prev, [r.pers_id]: { ...prev[r.pers_id], hireDate: v } }))} disabled={importing} />
                          <DateField label="Exit Date" value={st.exitDate} onChange={v => setMissingState(prev => ({ ...prev, [r.pers_id]: { ...prev[r.pers_id], exitDate: v } }))} disabled={importing} />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </Section>
            )}

            {/* Active → Exit */}
            {diff.activeToExit.length > 0 && (
              <Section title="Mark as Exit" subtitle="Active people in the system that appear in the Exits file. Their status will change to exited." color="amber" count={filteredActive.length}>
                {filteredActive.length === 0 ? (
                  <Empty />
                ) : filteredActive.map(r => {
                  const st = activeState[r.row.pers_id];
                  return (
                    <div key={r.row.pers_id} className="flex items-center gap-3 p-3 rounded-lg border border-l-[3px] border-l-amber-500 bg-card">
                      <Checkbox
                        checked={st.selected}
                        onCheckedChange={() => setActiveState(prev => ({ ...prev, [r.row.pers_id]: { ...prev[r.row.pers_id], selected: !prev[r.row.pers_id].selected } }))}
                        disabled={importing}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-xs text-muted-foreground">{r.row.pers_id}</span>
                          <span className="font-medium text-sm">{r.row.sales_name}</span>
                          {r.existing.branch_name && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{r.existing.branch_name}</span>
                          )}
                        </div>
                      </div>
                      <div className="w-44">
                        <DateField label="Exit Date" value={st.exitDate} onChange={v => setActiveState(prev => ({ ...prev, [r.row.pers_id]: { ...prev[r.row.pers_id], exitDate: v } }))} disabled={importing} />
                      </div>
                    </div>
                  );
                })}
              </Section>
            )}

            {/* Mismatch */}
            {diff.exitDateMismatch.length > 0 && (
              <Section title="Exit Date Conflicts" subtitle="People already marked as exited but with a different date in the file. Current date is kept by default." color="orange" count={filteredMismatch.length}>
                {filteredMismatch.length === 0 ? (
                  <Empty />
                ) : filteredMismatch.map(m => {
                  const st = mismatchState[m.row.pers_id];
                  return (
                    <div key={m.row.pers_id} className="flex items-center gap-3 p-3 rounded-lg border border-l-[3px] border-l-orange-500 bg-card">
                      <Checkbox
                        checked={st.override}
                        onCheckedChange={() => setMismatchState(prev => ({ ...prev, [m.row.pers_id]: { ...prev[m.row.pers_id], override: !prev[m.row.pers_id].override } }))}
                        disabled={importing}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-xs text-muted-foreground">{m.row.pers_id}</span>
                          <span className="font-medium text-sm">{m.row.sales_name}</span>
                        </div>
                        <div className="mt-1 flex items-center gap-2 text-xs">
                          <span className="text-muted-foreground">Current:</span>
                          <span className={cn('font-medium', !st.override && 'text-emerald-600')}>{fmt(m.currentExitDate)}</span>
                          <span className="text-muted-foreground">→ From file:</span>
                          <span className={cn('font-medium', st.override && 'text-orange-600')}>{fmt(m.newExitDate)}</span>
                        </div>
                      </div>
                      <div className="w-44">
                        <DateField label="Override With" value={st.exitDate} onChange={v => v && setMismatchState(prev => ({ ...prev, [m.row.pers_id]: { ...prev[m.row.pers_id], exitDate: v } }))} disabled={importing || !st.override} />
                      </div>
                    </div>
                  );
                })}
              </Section>
            )}

            {/* Errors */}
            {diff.errorRows.length > 0 && (
              <Section title="Errors" subtitle="Rows that cannot be processed." color="destructive" count={diff.errorRows.length}>
                {diff.errorRows.map((e, i) => (
                  <div key={i} className="flex items-start gap-2 p-3 rounded-lg border border-l-[3px] border-l-destructive bg-card">
                    <XCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
                    <div className="text-xs">
                      <span className="font-mono text-muted-foreground">{(e.row as any).pers_id || '—'}</span>
                      <span className="ml-2">{(e.row as any).sales_name}</span>
                      <p className="text-destructive mt-0.5">{e.reason}</p>
                    </div>
                  </div>
                ))}
              </Section>
            )}

            {/* Already exited / no-op */}
            {diff.alreadyExitedSameDate.length > 0 && (
              <div className="p-3 rounded-lg border border-l-[3px] border-l-muted bg-muted/20 text-center text-sm text-muted-foreground">
                {diff.alreadyExitedSameDate.length} record{diff.alreadyExitedSameDate.length !== 1 ? 's' : ''} already up to date — no action needed
              </div>
            )}

            {diff.missingInSystem.length === 0 && diff.activeToExit.length === 0 && diff.exitDateMismatch.length === 0 && diff.errorRows.length === 0 && (
              <div className="text-center py-12 text-sm text-muted-foreground">
                Everything is already in sync. Nothing to import.
              </div>
            )}
          </div>
        </div>

        <div className="px-6 py-4 border-t bg-muted/30 space-y-2">
          {!allMissingValid && (
            <p className="text-xs text-destructive text-center">Select a branch for every "Missing in System" row you want to create.</p>
          )}
          <Button onClick={handleImport} disabled={counts.total === 0 || importing || !allMissingValid} className="w-full gap-2">
            <Upload className="h-4 w-4" />
            Apply {counts.total} change{counts.total !== 1 ? 's' : ''}
            {counts.total > 0 && (
              <span className="text-xs opacity-80">
                · {counts.missing} create · {counts.marked} mark · {counts.updated} update
              </span>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Helpers ──

function KpiCard({ icon, label, total, selected, tone }: { icon: React.ReactNode; label: string; total: number; selected: number; tone: 'emerald' | 'amber' | 'orange' }) {
  const toneClass =
    tone === 'emerald' ? 'border-emerald-500/30 bg-emerald-500/5'
    : tone === 'amber' ? 'border-amber-500/30 bg-amber-500/5'
    : 'border-orange-500/30 bg-orange-500/5';
  const textTone =
    tone === 'emerald' ? 'text-emerald-600' : tone === 'amber' ? 'text-amber-600' : 'text-orange-600';
  return (
    <div className={cn('rounded-lg border p-2.5 flex items-center gap-2.5', toneClass)}>
      <span className={textTone}>{icon}</span>
      <div className="flex-1 min-w-0">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground truncate">{label}</p>
        <p className="text-sm font-semibold tabular-nums">
          <span className={textTone}>{selected}</span>
          <span className="text-muted-foreground"> / {total}</span>
        </p>
      </div>
    </div>
  );
}

function Section({ title, subtitle, color, count, children }: { title: string; subtitle: string; color: 'emerald' | 'amber' | 'orange' | 'destructive'; count: number; children: React.ReactNode }) {
  const dot =
    color === 'emerald' ? 'bg-emerald-500'
    : color === 'amber' ? 'bg-amber-500'
    : color === 'orange' ? 'bg-orange-500'
    : 'bg-destructive';
  return (
    <div className="space-y-2">
      <div className="flex items-baseline gap-2">
        <span className={cn('inline-block h-2 w-2 rounded-full', dot)} />
        <h3 className="text-sm font-semibold">{title}</h3>
        <span className="text-xs text-muted-foreground tabular-nums">({count})</span>
      </div>
      <p className="text-xs text-muted-foreground">{subtitle}</p>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function Empty() {
  return <div className="text-xs text-muted-foreground italic px-1">No matches in this section</div>;
}

function DateField({ label, value, onChange, disabled }: { label: string; value: string | null; onChange: (v: string | null) => void; disabled?: boolean }) {
  const date = parseDate(value);
  return (
    <div>
      <label className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</label>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled}
            className={cn('w-full justify-start font-normal h-8 text-xs', !value && 'text-muted-foreground')}
          >
            <CalendarIcon className="h-3 w-3 mr-1.5" />
            {date ? format(date, 'dd MMM yyyy') : 'Pick date'}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={date}
            onSelect={d => onChange(toIso(d))}
            initialFocus
            className={cn('p-3 pointer-events-auto')}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}
