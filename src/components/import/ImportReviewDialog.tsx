import { useState, useMemo, useCallback, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ImportFilters, type FilterType } from './ImportFilters';
import { DiffRow } from './DiffRow';
import type { DiffResult } from '@/lib/import-parsers';
import { logger } from '@/lib/logger';
import { Search, CheckSquare, Square, Upload, CheckCircle2, AlertTriangle, Download, Smartphone, Tablet, Box, Shirt, Wrench, CreditCard, ChevronDown } from 'lucide-react';

interface FailedRow<T> {
  row: T;
  reason: string;
}

interface ImportResult {
  success: number;
  errors: number;
  failedRows?: FailedRow<any>[];
}

interface ImportProgress {
  status: string;
  current: number;
  total: number;
  inserted: number;
  skipped: number;
  failed: number;
}

interface ImportReviewDialogProps<T> {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  diff: DiffResult<T>;
  onImport: (selectedRows: T[], isNew: boolean[], onProgress?: (p: Partial<ImportProgress>) => void) => Promise<ImportResult>;
  title?: string;
  getRowId: (row: T) => string;
  getRowName: (row: T) => string;
  getRowSearchText: (row: T) => string;
  quickMode?: boolean;
}

function downloadErrorsCsv<T>(failedRows: FailedRow<T>[], getRowName: (row: T) => string) {
  const lines = ['Row,Pers_ID,Sales_ID,Transaction_Date,Reason'];
  for (const f of failedRows) {
    const row = f.row as any;
    const name = getRowName(f.row as T).replace(/"/g, '""');
    const persId = (row.person_pers_id || row.pers_id || row.persId || '').toString().replace(/"/g, '""');
    const salesId = (row.person_name || row.sales_id || row.salesId || '').toString().replace(/"/g, '""');
    const txDate = (row.transaction_date || row.transactionDate || '').toString().replace(/"/g, '""');
    const reason = f.reason.replace(/"/g, '""');
    lines.push(`"${name}","${persId}","${salesId}","${txDate}","${reason}"`);
  }
  const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `import-errors-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function ImportReviewDialog<T>({
  open, onOpenChange, diff, onImport, title = 'Import Review',
  getRowId, getRowName, getRowSearchText, quickMode = false,
}: ImportReviewDialogProps<T>) {
  const [filter, setFilter] = useState<FilterType>('all');
  const [search, setSearch] = useState('');
  const [selectedNew, setSelectedNew] = useState<Set<string>>(() => new Set(diff.newRows.map(r => getRowId(r))));
  const [selectedMod, setSelectedMod] = useState<Set<string>>(() => new Set(diff.modifiedRows.map(m => getRowId(m.row))));
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState<ImportProgress>({ status: 'Preparing...', current: 0, total: 0, inserted: 0, skipped: 0, failed: 0 });
  const [result, setResult] = useState<ImportResult | null>(null);
  const [visibleCount, setVisibleCount] = useState(100);

  // Reset visible count when filter or search changes
  useEffect(() => {
    setVisibleCount(100);
  }, [filter, search]);

  const counts = useMemo(() => ({
    all: diff.newRows.length + diff.modifiedRows.length + diff.unchangedRows.length + diff.warningRows.length + diff.errorRows.length,
    new: diff.newRows.length,
    modified: diff.modifiedRows.length,
    unchanged: diff.unchangedRows.length,
    warnings: diff.warningRows.length,
    errors: diff.errorRows.length,
  }), [diff]);

  const totalSelected = selectedNew.size + selectedMod.size;

  const matchSearch = useCallback((row: T) => {
    if (!search) return true;
    return getRowSearchText(row).toLowerCase().includes(search.toLowerCase());
  }, [search, getRowSearchText]);

  const filteredNew = useMemo(() => {
    if (filter !== 'all' && filter !== 'new') return [];
    return diff.newRows.filter(matchSearch);
  }, [diff.newRows, filter, matchSearch]);

  const filteredMod = useMemo(() => {
    if (filter !== 'all' && filter !== 'modified') return [];
    return diff.modifiedRows.filter(m => matchSearch(m.row));
  }, [diff.modifiedRows, filter, matchSearch]);

  const filteredUnchanged = useMemo(() => {
    if (filter !== 'all' && filter !== 'unchanged') return [];
    if (search) return diff.unchangedRows.filter(matchSearch);
    return diff.unchangedRows;
  }, [diff.unchangedRows, filter, search, matchSearch]);

  const filteredWarnings = useMemo(() => {
    if (filter !== 'all' && filter !== 'warnings') return [];
    return diff.warningRows.filter(w => {
      if (!search) return true;
      const s = search.toLowerCase();
      return getRowSearchText(w.row).toLowerCase().includes(s) || w.reason.toLowerCase().includes(s);
    });
  }, [diff.warningRows, filter, search, getRowSearchText]);

  const filteredErrors = useMemo(() => {
    if (filter !== 'all' && filter !== 'errors') return [];
    return diff.errorRows.filter(e => {
      if (!search) return true;
      return e.reason.toLowerCase().includes(search.toLowerCase());
    });
  }, [diff.errorRows, filter, search]);

  const toggleNew = useCallback((id: string) => {
    setSelectedNew(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  const toggleMod = useCallback((id: string) => {
    setSelectedMod(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  const selectAllNew = () => setSelectedNew(new Set(diff.newRows.map(r => getRowId(r))));
  const selectAllMod = () => setSelectedMod(new Set(diff.modifiedRows.map(m => getRowId(m.row))));
  const deselectAll = () => { setSelectedNew(new Set()); setSelectedMod(new Set()); };

  const handleImport = async () => {
    setImporting(true);

    const newToImport = diff.newRows.filter(r => selectedNew.has(getRowId(r)));
    const modToImport = diff.modifiedRows.filter(m => selectedMod.has(getRowId(m.row))).map(m => m.row);
    const allRows = [...newToImport, ...modToImport];
    const isNew = [...newToImport.map(() => true), ...modToImport.map(() => false)];

    setImportProgress({ status: 'Starting import...', current: 0, total: allRows.length, inserted: 0, skipped: 0, failed: 0 });

    const handleProgress = (p: Partial<ImportProgress>) => {
      setImportProgress(prev => ({ ...prev, ...p }));
    };

    try {
      const res = await onImport(allRows, isNew, handleProgress);
      setImportProgress(prev => ({ ...prev, current: allRows.length, status: 'Complete' }));
      setResult(res);
    } catch (err: any) {
      logger.error('Import failed:', err);
      setResult({ success: 0, errors: allRows.length, failedRows: allRows.map(r => ({ row: r, reason: err?.message || 'Unknown error' })) });
    } finally {
      setImporting(false);
    }
  };

  // Compute field-level stats from the rows that were successfully imported
  const fieldBreakdown = useMemo(() => {
    if (!result || result.success === 0) return null;
    const selectedRows = [
      ...diff.newRows.filter(r => selectedNew.has(getRowId(r))),
      ...diff.modifiedRows.filter(m => selectedMod.has(getRowId(m.row))).map(m => m.row),
    ];
    const fields = [
      { key: 'phone', label: 'Phone', icon: <Smartphone className="h-3 w-3" /> },
      { key: 'tablet', label: 'Tablet', icon: <Tablet className="h-3 w-3" /> },
      { key: 'demobox', label: 'Demobox', icon: <Box className="h-3 w-3" /> },
      { key: 'clothing', label: 'Clothing', icon: <Shirt className="h-3 w-3" /> },
      { key: 'toolkit', label: 'Toolkit', icon: <Wrench className="h-3 w-3" /> },
      { key: 'izettle', label: 'iZettle', icon: <CreditCard className="h-3 w-3" /> },
    ];
    return fields.map(f => ({
      ...f,
      count: selectedRows.filter(r => (r as any)[f.key] === true).length,
      total: selectedRows.length,
    }));
  }, [result, diff, selectedNew, selectedMod, getRowId]);

  if (result) {
    const hasFailedRows = result.failedRows && result.failedRows.length > 0;

    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-lg max-h-[80vh] flex flex-col">
          <div className="flex flex-col items-center gap-4 py-6">
            {result.errors === 0 ? (
              <div className="h-16 w-16 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                <CheckCircle2 className="h-8 w-8 text-emerald-600" />
              </div>
            ) : (
              <div className="h-16 w-16 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                <AlertTriangle className="h-8 w-8 text-amber-600" />
              </div>
            )}

            {/* Result metrics */}
            <div className="flex gap-4">
              <div className="text-center">
                <p className="text-2xl font-bold text-emerald-600 tabular-nums">{result.success}</p>
                <p className="text-[11px] text-muted-foreground">Imported</p>
              </div>
              {result.errors > 0 && (
                <div className="text-center">
                  <p className="text-2xl font-bold text-destructive tabular-nums">{result.errors}</p>
                  <p className="text-[11px] text-muted-foreground">Failed</p>
                </div>
              )}
            </div>
          </div>

          {/* Field breakdown */}
          {fieldBreakdown && fieldBreakdown.some(f => f.count > 0) && (
            <div className="px-4 pb-3 space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Equipment Breakdown</p>
              <div className="grid grid-cols-3 gap-2">
                {fieldBreakdown.filter(f => f.count > 0).map(f => (
                  <div key={f.key} className="flex items-center gap-1.5 px-2 py-1.5 rounded-md bg-muted/50 text-xs">
                    <span className="text-muted-foreground">{f.icon}</span>
                    <span className="font-medium tabular-nums">{f.count}</span>
                    <span className="text-muted-foreground">{f.label}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Failed rows detail table */}
          {hasFailedRows && (
            <div className="space-y-2 px-2">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-destructive">Failed Records</p>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs h-7 gap-1"
                  onClick={() => downloadErrorsCsv(result.failedRows!, getRowName)}
                >
                  <Download className="h-3 w-3" /> Export Errors CSV
                </Button>
              </div>
              <ScrollArea className="max-h-48 border rounded-md">
                <div className="divide-y">
                  {result.failedRows!.slice(0, 50).map((f, i) => (
                    <div key={i} className="px-3 py-2 text-xs">
                      <span className="font-medium">{getRowName(f.row as T)}</span>
                      <span className="text-destructive ml-2">— {f.reason}</span>
                    </div>
                  ))}
                  {result.failedRows!.length > 50 && (
                    <div className="px-3 py-2 text-xs text-muted-foreground text-center">
                      ... and {result.failedRows!.length - 50} more (download CSV for full list)
                    </div>
                  )}
                </div>
              </ScrollArea>
            </div>
          )}

          <div className="flex justify-center pt-2 pb-2">
            <Button onClick={() => onOpenChange(false)}>Done</Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  

  return (
    <Dialog open={open} onOpenChange={importing ? undefined : onOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] flex flex-col p-0">
        <DialogHeader className="px-6 pt-6 pb-0">
          <DialogTitle>{title}</DialogTitle>
          {quickMode && (
            <p className="text-xs text-muted-foreground">Duplicates will be skipped automatically during import</p>
          )}
        </DialogHeader>

        <div className="px-6 py-3 space-y-3 border-b">
          <ImportFilters active={filter} onChange={setFilter} counts={counts} newLabel={quickMode ? 'Rows to Import' : 'New'} />

          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Search by name or ID..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-8 h-8 text-sm"
              />
            </div>
            <div className="flex gap-1">
              {diff.newRows.length > 0 && (
                <Button variant="ghost" size="sm" className="text-xs h-8" onClick={selectAllNew}>
                  <CheckSquare className="h-3 w-3 mr-1" /> All New
                </Button>
              )}
              {diff.modifiedRows.length > 0 && (
                <Button variant="ghost" size="sm" className="text-xs h-8" onClick={selectAllMod}>
                  <CheckSquare className="h-3 w-3 mr-1" /> All Modified
                </Button>
              )}
              <Button variant="ghost" size="sm" className="text-xs h-8" onClick={deselectAll}>
                <Square className="h-3 w-3 mr-1" /> None
              </Button>
            </div>
          </div>
        </div>

        {importing && (
          <div className="px-6 py-4 space-y-3">
            <Progress value={importProgress.total > 0 ? (importProgress.current / importProgress.total) * 100 : 0} className="h-2" />
            <p className="text-sm text-center animate-pulse">{importProgress.status}</p>
            <div className="flex justify-center gap-3">
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-500/10 text-emerald-600 text-xs font-medium">
                <CheckCircle2 className="h-3 w-3" /> {importProgress.inserted} inserted
              </div>
              {importProgress.skipped > 0 && (
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-500/10 text-amber-600 text-xs font-medium">
                  {importProgress.skipped} skipped
                </div>
              )}
              {importProgress.failed > 0 && (
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-destructive/10 text-destructive text-xs font-medium">
                  <AlertTriangle className="h-3 w-3" /> {importProgress.failed} failed
                </div>
              )}
            </div>
            <p className="text-xs text-muted-foreground text-center">
              {importProgress.current} of {importProgress.total} processed
            </p>
          </div>
        )}

        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-2">
          {(() => {
            // Combine all visible rows into a single list for progressive loading
            const allItems: React.ReactNode[] = [];
            filteredErrors.forEach((e, i) => allItems.push(
              <DiffRow key={`err-${i}`} row={e.row} type="error" reason={e.reason} selected={false} onToggle={() => {}} disabled />
            ));
            filteredWarnings.forEach((w, i) => allItems.push(
              <DiffRow key={`warn-${i}`} row={w.row} type="warning" reason={w.reason} selected={false} onToggle={() => {}} disabled />
            ));
            filteredNew.forEach(row => allItems.push(
              <DiffRow key={getRowId(row)} row={row} type="new" selected={selectedNew.has(getRowId(row))} onToggle={() => toggleNew(getRowId(row))} disabled={importing} />
            ));
            filteredMod.forEach(m => allItems.push(
              <DiffRow key={getRowId(m.row)} row={m.row} type="modified" changes={m.changes} selected={selectedMod.has(getRowId(m.row))} onToggle={() => toggleMod(getRowId(m.row))} disabled={importing} />
            ));

            if (filter === 'all' && filteredUnchanged.length > 0 && !search) {
              allItems.push(
                <div key="unchanged-summary" className="p-3 rounded-lg border border-l-[3px] border-l-muted bg-muted/20 text-center">
                  <p className="text-sm text-muted-foreground">{filteredUnchanged.length} unchanged records — no action needed</p>
                </div>
              );
            }
            if (filter === 'unchanged') {
              filteredUnchanged.forEach(row => allItems.push(
                <DiffRow key={getRowId(row)} row={row} type="unchanged" selected={false} onToggle={() => {}} disabled />
              ));
            }

            const visibleItems = allItems.slice(0, visibleCount);
            const remaining = allItems.length - visibleCount;

            return (
              <div className="space-y-2 pb-2">
                {allItems.length > 0 && (
                  <p className="text-xs text-muted-foreground px-1">
                    Showing {Math.min(visibleCount, allItems.length).toLocaleString()} of {allItems.length.toLocaleString()} records
                  </p>
                )}
                {visibleItems}
                {remaining > 0 && (
                  <Button
                    variant="ghost"
                    className="w-full text-sm gap-1.5 text-muted-foreground"
                    onClick={() => setVisibleCount(prev => prev + 100)}
                  >
                    <ChevronDown className="h-3.5 w-3.5" />
                    Show more ({Math.min(remaining, 100)} of {remaining.toLocaleString()} remaining)
                  </Button>
                )}
                {allItems.length === 0 && (
                  <div className="text-center py-8 text-muted-foreground text-sm">No records match your search</div>
                )}
              </div>
            );
          })()}
        </div>

        <div className="px-6 py-4 border-t bg-muted/30">
          <Button onClick={handleImport} disabled={totalSelected === 0 || importing} className="w-full gap-2">
            <Upload className="h-4 w-4" />
            Import {totalSelected} selected record{totalSelected !== 1 ? 's' : ''}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
