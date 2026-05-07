import { useEffect, useMemo, useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/lib/backend';
import { useAuth } from '@/contexts/AuthContext';
import { calculatePersonDebt } from '@/lib/debt';
import { computeCaseDerived, type DebtMovementType, type CaseDerived } from '@/lib/debtFollowup';
import { recalculateDebtCase } from '@/lib/debtCaseLifecycle';
import { logAudit } from '@/lib/audit';
import { ExportDebtDataButton } from '@/components/debt-followup/ExportDebtDataButton';
import { Loader2, Search, RefreshCw, ChevronDown, ArrowUpDown } from 'lucide-react';

interface MovementRow {
  id: string;
  movement_type: DebtMovementType;
  amount: number;
  occurred_on: string;
  reason: string | null;
  note: string | null;
  source: 'app' | 'historical_import';
  created_at: string;
  created_by: string | null;
}

interface CaseRow {
  id: string;
  payroll_date_origin: string;
  person_id: string;
  pers_id: string;
  sales_name: string;
  branch_name: string | null;
  contract_type: 'Fixed Term' | 'On Call';
  initial_debt: number;
  manually_settled: boolean;
  settled_reason: string | null;
  movements: MovementRow[];
  derived: CaseDerived;
  currentEngineDebt: number;
  frozen_engine_debt: number | null;
}

type SortKey = 'toBeRefunded' | 'currentValueDebt' | 'initial' | 'payroll';
const fmt = (n: number) => `€${n.toFixed(2)}`;

export default function DebtFollowup() {
  const { toast } = useToast();
  const { role } = useAuth();
  const isAdmin = role === 'admin';

  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<CaseRow[]>([]);
  const [search, setSearch] = useState('');
  const [showSettled, setShowSettled] = useState(false);
  const [payrollFilter, setPayrollFilter] = useState<Set<string>>(new Set());
  const [sortKey, setSortKey] = useState<SortKey>('toBeRefunded');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const [openCase, setOpenCase] = useState<CaseRow | null>(null);
  const [movementDialog, setMovementDialog] = useState<{ caseId: string; type: DebtMovementType } | null>(null);
  const [settleDialog, setSettleDialog] = useState<CaseRow | null>(null);
  const [recalcBusy, setRecalcBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const { data: cases, error } = await supabase
        .from('debt_cases')
        .select('*, people!inner(pers_id, sales_name, branch_name, contract_type), debt_movements(*)')
        .order('payroll_date_origin', { ascending: false });
      if (error) throw error;

      const personIds = (cases ?? []).map((c: any) => c.person_id);
      const [txRes, prRes, phRes, tabRes] = await Promise.all([
        personIds.length
          ? supabase.from('equipment_transactions').select('*').in('person_id', personIds)
          : Promise.resolve({ data: [] }),
        supabase.from('equipment_prices').select('*').eq('active', true),
        supabase.from('phone_models').select('*').eq('active', true),
        supabase.from('tablet_models').select('*').eq('active', true),
      ]);
      const txs: any[] = (txRes as any).data ?? [];
      const prices: any[] = prRes.data ?? [];
      const phones: any[] = phRes.data ?? [];
      const tablets: any[] = tabRes.data ?? [];

      const built: CaseRow[] = (cases ?? []).map((c: any) => {
        const movements: MovementRow[] = (c.debt_movements ?? []).map((m: any) => ({
          id: m.id, movement_type: m.movement_type, amount: Number(m.amount),
          occurred_on: m.occurred_on, reason: m.reason, note: m.note,
          source: m.source, created_at: m.created_at, created_by: m.created_by,
        }));
        const currentEngineDebt = c.frozen_engine_debt != null
          ? Number(c.frozen_engine_debt)
          : calculatePersonDebt(c.person_id, txs, prices, phones, tablets).totalDebt;
        const derived = computeCaseDerived({
          initialDebt: Number(c.initial_debt),
          currentEngineDebt,
          movements: movements.map(m => ({ movement_type: m.movement_type, amount: m.amount })),
          manuallySettled: c.manually_settled,
        });
        return {
          id: c.id,
          payroll_date_origin: c.payroll_date_origin,
          person_id: c.person_id,
          pers_id: c.people.pers_id,
          sales_name: c.people.sales_name,
          branch_name: c.people.branch_name,
          contract_type: (c.people.contract_type as 'Fixed Term' | 'On Call') ?? 'Fixed Term',
          initial_debt: Number(c.initial_debt),
          manually_settled: c.manually_settled,
          settled_reason: c.settled_reason,
          movements, derived, currentEngineDebt,
          frozen_engine_debt: c.frozen_engine_debt != null ? Number(c.frozen_engine_debt) : null,
        };
      });
      setRows(built);
    } catch (err) {
      toast({ title: 'Load failed', description: (err as Error).message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const payrollDates = useMemo(
    () => Array.from(new Set(rows.map(r => r.payroll_date_origin))).sort().reverse(),
    [rows],
  );

  const filtered = useMemo(() => {
    let xs = rows.filter(r => {
      if (!showSettled && r.derived.settled) return false;
      if (payrollFilter.size > 0 && !payrollFilter.has(r.payroll_date_origin)) return false;
      if (search) {
        const s = search.toLowerCase();
        if (!r.pers_id.toLowerCase().includes(s) && !r.sales_name.toLowerCase().includes(s)) return false;
      }
      return true;
    });
    xs = xs.sort((a, b) => {
      const dir = sortDir === 'desc' ? -1 : 1;
      const va = sortKey === 'toBeRefunded' ? a.derived.toBeRefunded
        : sortKey === 'currentValueDebt' ? a.derived.currentValueDebt
        : sortKey === 'initial' ? a.initial_debt
        : a.payroll_date_origin;
      const vb = sortKey === 'toBeRefunded' ? b.derived.toBeRefunded
        : sortKey === 'currentValueDebt' ? b.derived.currentValueDebt
        : sortKey === 'initial' ? b.initial_debt
        : b.payroll_date_origin;
      if (va < vb) return -1 * dir;
      if (va > vb) return 1 * dir;
      // tiebreaker: CVD desc
      return (b.derived.currentValueDebt - a.derived.currentValueDebt);
    });
    return xs;
  }, [rows, search, showSettled, payrollFilter, sortKey, sortDir]);

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) setSortDir(d => d === 'desc' ? 'asc' : 'desc');
    else { setSortKey(k); setSortDir('desc'); }
  };
  const togglePayroll = (d: string) => {
    setPayrollFilter(prev => {
      const next = new Set(prev);
      if (next.has(d)) next.delete(d); else next.add(d);
      return next;
    });
  };

  const exportPayrollDate = payrollFilter.size === 1 ? Array.from(payrollFilter)[0] : null;
  const exportDisabledReason = payrollFilter.size === 0
    ? 'Select exactly one payroll date to export'
    : payrollFilter.size > 1 ? 'Select exactly one payroll date to export' : undefined;

  const handleRecalculate = async () => {
    if (!openCase) return;
    setRecalcBusy(true);
    try {
      const r = await recalculateDebtCase(openCase.id, openCase.contract_type, null);
      toast({
        title: 'Recalculated',
        description: `Initial debt €${r.before.toFixed(2)} → €${r.after.toFixed(2)} (payroll ${r.payrollDate})`,
      });
      await load();
      setOpenCase(null);
    } catch (err) {
      toast({ title: 'Recalculation failed', description: (err as Error).message, variant: 'destructive' });
    } finally {
      setRecalcBusy(false);
    }
  };

  return (
    <AppLayout allowedRoles={['admin', 'data_manager']}>
      <div className="space-y-6">
        <PageHeader title="Debt Follow-up" description="Cases sorted by what needs attention. Initial Debt is frozen; movements are append-only.">
          <Badge variant="secondary">{filtered.length} case(s)</Badge>
        </PageHeader>

        <Card>
          <CardContent className="p-4 space-y-4">
            <div className="flex flex-wrap gap-3 items-end">
              <div className="flex-1 min-w-[220px]">
                <Label className="text-xs">Search</Label>
                <div className="relative">
                  <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input className="pl-8" placeholder="Emp ID or name…" value={search} onChange={e => setSearch(e.target.value)} />
                </div>
              </div>

              <div>
                <Label className="text-xs">Payroll date</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className="w-[200px] justify-between">
                      {payrollFilter.size === 0 ? 'All dates' : `${payrollFilter.size} selected`}
                      <ChevronDown className="h-4 w-4 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[240px] max-h-[320px] overflow-auto p-2">
                    {payrollDates.length === 0 && (
                      <p className="text-xs text-muted-foreground p-2">No cases yet.</p>
                    )}
                    {payrollDates.map(d => (
                      <label key={d} className="flex items-center gap-2 p-1.5 rounded hover:bg-accent cursor-pointer">
                        <Checkbox checked={payrollFilter.has(d)} onCheckedChange={() => togglePayroll(d)} />
                        <span className="text-sm font-mono">{d}</span>
                      </label>
                    ))}
                    {payrollFilter.size > 0 && (
                      <Button variant="ghost" size="sm" className="w-full mt-2" onClick={() => setPayrollFilter(new Set())}>Clear</Button>
                    )}
                  </PopoverContent>
                </Popover>
              </div>

              <div className="flex items-center gap-2 pb-2">
                <Switch id="settled" checked={showSettled} onCheckedChange={setShowSettled} />
                <Label htmlFor="settled" className="text-xs">Show settled</Label>
              </div>

              <div className="flex-1" />

              <ExportDebtDataButton
                payrollDate={exportPayrollDate}
                disabled={!exportPayrollDate}
                disabledReason={exportDisabledReason}
              />
            </div>

            {loading ? (
              <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <SortHeader label="Payroll" k="payroll" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
                      <TableHead>Emp ID</TableHead>
                      <TableHead>Sales Name</TableHead>
                      <TableHead>Branch</TableHead>
                      <SortHeader label="Initial" k="initial" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} align="right" />
                      <TableHead className="text-right">Deduction</TableHead>
                      <TableHead className="text-right">Refund</TableHead>
                      <TableHead className="text-right">Recovered</TableHead>
                      <SortHeader label="CVD" k="currentValueDebt" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} align="right" />
                      <SortHeader label="TBF" k="toBeRefunded" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} align="right" />
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map(r => (
                      <TableRow key={r.id} className="cursor-pointer hover:bg-accent/50" onClick={() => setOpenCase(r)}>
                        <TableCell className="font-mono text-xs">{r.payroll_date_origin}</TableCell>
                        <TableCell className="font-mono text-xs">{r.pers_id}</TableCell>
                        <TableCell>{r.sales_name}</TableCell>
                        <TableCell className="text-muted-foreground text-xs">{r.branch_name ?? '—'}</TableCell>
                        <TableCell className="text-right font-medium">{fmt(r.initial_debt)}</TableCell>
                        <TableCell className="text-right">{fmt(r.derived.payrollDeduction)}</TableCell>
                        <TableCell className="text-right">{fmt(r.derived.refund)}</TableCell>
                        <TableCell className="text-right">{fmt(r.derived.recoveredAssets)}</TableCell>
                        <TableCell className={`text-right ${r.derived.currentValueDebt > 0 ? 'text-destructive font-semibold' : ''}`}>{fmt(r.derived.currentValueDebt)}</TableCell>
                        <TableCell className="text-right">{fmt(r.derived.toBeRefunded)}</TableCell>
                        <TableCell>
                          {r.derived.settled
                            ? <Badge variant="secondary">{r.manually_settled ? 'manually settled' : 'settled'}</Badge>
                            : <Badge variant="default">open</Badge>}
                        </TableCell>
                      </TableRow>
                    ))}
                    {filtered.length === 0 && (
                      <TableRow><TableCell colSpan={11} className="text-center text-muted-foreground py-8">No matching cases.</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Sheet open={!!openCase} onOpenChange={v => { if (!v) setOpenCase(null); }}>
        <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
          <SheetHeader><SheetTitle>{openCase?.sales_name} — {openCase?.pers_id}</SheetTitle></SheetHeader>
          {openCase && (
            <div className="space-y-6 mt-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-muted-foreground">Payroll:</span> {openCase.payroll_date_origin}</div>
                <div><span className="text-muted-foreground">Branch:</span> {openCase.branch_name ?? '—'}</div>
                <div><span className="text-muted-foreground">Initial:</span> <strong>{fmt(openCase.initial_debt)}</strong></div>
                <div><span className="text-muted-foreground">Engine today:</span> {fmt(openCase.currentEngineDebt)}</div>
                <div><span className="text-muted-foreground">CVD:</span> <strong className={openCase.derived.currentValueDebt > 0 ? 'text-destructive' : ''}>{fmt(openCase.derived.currentValueDebt)}</strong></div>
                <div><span className="text-muted-foreground">TBF:</span> <strong>{fmt(openCase.derived.toBeRefunded)}</strong></div>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => setMovementDialog({ caseId: openCase.id, type: 'payroll_deduction' })}>+ Deduction</Button>
                <Button size="sm" variant="outline" onClick={() => setMovementDialog({ caseId: openCase.id, type: 'refund' })}>+ Refund</Button>
                {isAdmin && <Button size="sm" variant="outline" onClick={() => setMovementDialog({ caseId: openCase.id, type: 'adjustment' })}>+ Adjustment</Button>}
                {isAdmin && openCase.frozen_engine_debt == null && (
                  <Button size="sm" variant="outline" onClick={handleRecalculate} disabled={recalcBusy}>
                    {recalcBusy ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <RefreshCw className="h-3 w-3 mr-1" />}
                    Recalculate
                  </Button>
                )}
                {isAdmin && !openCase.manually_settled && (
                  <Button size="sm" variant="secondary" onClick={() => setSettleDialog(openCase)}>Mark settled</Button>
                )}
              </div>

              <div>
                <h4 className="text-sm font-semibold mb-2">Movements ({openCase.movements.length})</h4>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead><TableHead>Type</TableHead>
                      <TableHead className="text-right">Amount</TableHead><TableHead>Reason</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {openCase.movements.map(m => (
                      <TableRow key={m.id}>
                        <TableCell className="text-xs">{m.occurred_on}</TableCell>
                        <TableCell className="text-xs">{m.movement_type.replace('_', ' ')}</TableCell>
                        <TableCell className="text-right">{fmt(m.amount)}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{m.reason ?? '—'}</TableCell>
                      </TableRow>
                    ))}
                    {openCase.movements.length === 0 && (
                      <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground text-xs py-4">No movements yet.</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>

              {openCase.manually_settled && (
                <div className="p-3 rounded-md bg-muted text-sm">
                  <strong>Manually settled.</strong> {openCase.settled_reason}
                </div>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>

      <MovementDialog
        open={!!movementDialog}
        type={movementDialog?.type ?? 'payroll_deduction'}
        onClose={() => setMovementDialog(null)}
        onSubmit={async (amount, occurred_on, reason, note) => {
          if (!movementDialog) return;
          const { error } = await supabase.from('debt_movements').insert({
            debt_case_id: movementDialog.caseId,
            movement_type: movementDialog.type,
            amount, occurred_on, reason: reason || null, note: note || null,
            source: 'app',
          });
          if (error) { toast({ title: 'Insert failed', description: error.message, variant: 'destructive' }); return; }
          await logAudit('debt_movement.create', 'debt_case', movementDialog.caseId, { type: movementDialog.type, amount });
          setMovementDialog(null);
          load();
        }}
      />

      <Dialog open={!!settleDialog} onOpenChange={v => { if (!v) setSettleDialog(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Mark case as manually settled</DialogTitle></DialogHeader>
          <SettleForm onSubmit={async (reason) => {
            if (!settleDialog) return;
            const { error } = await supabase.from('debt_cases').update({
              manually_settled: true, settled_reason: reason, settled_at: new Date().toISOString(),
            }).eq('id', settleDialog.id);
            if (error) { toast({ title: 'Update failed', description: error.message, variant: 'destructive' }); return; }
            await logAudit('debt_case.manual_settle', 'debt_case', settleDialog.id, { reason });
            setSettleDialog(null); setOpenCase(null); load();
          }} onCancel={() => setSettleDialog(null)} />
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}

function SortHeader({ label, k, sortKey, sortDir, onClick, align }: {
  label: string; k: SortKey; sortKey: SortKey; sortDir: 'asc' | 'desc';
  onClick: (k: SortKey) => void; align?: 'left' | 'right';
}) {
  const active = sortKey === k;
  return (
    <TableHead className={align === 'right' ? 'text-right' : ''}>
      <button onClick={() => onClick(k)} className="inline-flex items-center gap-1 hover:text-foreground">
        {label}
        <ArrowUpDown className={`h-3 w-3 ${active ? 'opacity-100' : 'opacity-30'}`} />
        {active && <span className="text-[10px]">{sortDir === 'desc' ? '↓' : '↑'}</span>}
      </button>
    </TableHead>
  );
}

function MovementDialog({ open, type, onClose, onSubmit }: {
  open: boolean; type: DebtMovementType;
  onClose: () => void;
  onSubmit: (amount: number, occurred_on: string, reason: string, note: string) => Promise<void>;
}) {
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) { setAmount(''); setDate(new Date().toISOString().slice(0, 10)); setReason(''); setNote(''); } }, [open]);
  const adj = type === 'adjustment';
  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Add {type.replace('_', ' ')}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Amount (€)</Label><Input type="number" step="0.01" min="0.01" value={amount} onChange={e => setAmount(e.target.value)} /></div>
          <div><Label>Occurred on</Label><Input type="date" value={date} onChange={e => setDate(e.target.value)} /></div>
          <div><Label>Reason {adj && <span className="text-destructive">*</span>}</Label><Input value={reason} onChange={e => setReason(e.target.value)} placeholder={adj ? 'Mandatory for adjustments' : 'Optional'} /></div>
          <div><Label>Note</Label><Textarea rows={2} value={note} onChange={e => setNote(e.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            disabled={busy || !amount || Number(amount) <= 0 || (adj && !reason.trim())}
            onClick={async () => { setBusy(true); try { await onSubmit(Number(amount), date, reason, note); } finally { setBusy(false); } }}
          >
            {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SettleForm({ onSubmit, onCancel }: { onSubmit: (reason: string) => Promise<void>; onCancel: () => void }) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <>
      <div className="space-y-3">
        <Label>Reason <span className="text-destructive">*</span></Label>
        <Textarea rows={3} value={reason} onChange={e => setReason(e.target.value)} />
      </div>
      <DialogFooter>
        <Button variant="ghost" onClick={onCancel}>Cancel</Button>
        <Button disabled={busy || !reason.trim()} onClick={async () => { setBusy(true); try { await onSubmit(reason); } finally { setBusy(false); } }}>
          {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Confirm
        </Button>
      </DialogFooter>
    </>
  );
}
