import { useEffect, useState, useMemo, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { usePagination } from '@/hooks/use-pagination';
import { TablePagination } from '@/components/shared/TablePagination';
import { supabase } from '@/lib/backend';
import { AppLayout } from '@/components/layout/AppLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { KPICard } from '@/components/shared/KPICard';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Search, Download, DollarSign, Users, AlertTriangle, Package, Clock, CalendarClock, UserCheck, CheckCircle2, Loader2, Filter, Columns3, AlertCircle } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { calculatePayrollDay, getLastSubmissionDate } from '@/lib/payroll';
import { calculatePersonDebt, DEMOBOX_ITEMS, DEMOBOX_SHORT_LABELS, type PersonDebt, type HandoutFlags } from '@/lib/debt';
import { getContractType } from '@/lib/contract';
import { buildCsv, downloadCsv } from '@/lib/csv-utils';
import { logAudit } from '@/lib/audit';
import { format } from 'date-fns';
import type { Person, EquipmentTransaction, EquipmentPrice, PhoneModel, TabletModel } from '@/types';
import { motion, AnimatePresence } from 'framer-motion';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';

// ─── Helpers ───

// admin reads the base table directly (full access incl. signatures);
// data_manager reads via equipment_transactions_for_reports view
// (JSONB device details, no signatures). Both roles work via their
// own policy + RLS on the underlying objects.

async function fetchAllFromTable(table: 'people' | 'equipment_transactions', orderCol?: string) {
  const PAGE = 1000;
  let all: any[] = [];
  let from = 0;
  while (true) {
    // Map to view that excludes signatures (admin/DM only); base
    // table is admin-only after security_hardening_v1 migration.
    const sourceTable =
      table === 'equipment_transactions'
        ? 'equipment_transactions_for_reports'
        : table;
    let q = supabase.from(sourceTable).select('*').range(from, from + PAGE - 1) as any;
    if (orderCol) q = q.order(orderCol);
    const { data, error } = await q;
    if (error || !data || data.length === 0) break;
    all = all.concat(data);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return all;
}

function formatEurDate(d: Date): string {
  return `${d.getDate()}-${d.getMonth() + 1}-${d.getFullYear()}`;
}

// ─── DebtCell ───

import type { PhoneAnomaly, DataQualityIssue } from '@/types';

const ANOMALY_LABELS: Record<PhoneAnomaly['type'], string> = {
  invalid_imei: 'Invalid IMEI (placeholder/false)',
  missing_price: 'Phone model has no configured price',
  model_mismatch: 'Giving and Return models differ for the same IMEI',
  orphan_return: 'Return without a matching prior Giving',
  duplicate_return: 'Multiple Returns recorded for the same IMEI on the same date',
};

const DQ_LABELS: Record<DataQualityIssue['type'], string> = {
  cap_applied: 'Cap applied — raw total exceeded the configured cap',
  missing_price: 'No active DB price found for this item',
  invalid_complete: 'Toolkit "complete" field was not a strict boolean',
  unknown_tx_type: 'Transaction has an unknown type',
  null_details: 'Category was flagged but details JSON was missing',
  negative_balance: 'More items returned than given',
};

function formatDqIssue(i: DataQualityIssue): string {
  let s = DQ_LABELS[i.type];
  if (i.type === 'cap_applied' && i.raw != null && i.capped != null) {
    s += ` (€${i.raw} → €${i.capped})`;
  }
  if (i.item) s += ` — ${i.item}`;
  if (i.detail) s += ` — ${i.detail}`;
  return s;
}

function DebtCell({
  value, hadHandout, bg = '', anomalies, dqIssues,
}: {
  value: number;
  hadHandout: boolean;
  bg?: string;
  anomalies?: PhoneAnomaly[];
  dqIssues?: DataQualityIssue[];
}) {
  const hasAnomalies = !!anomalies && anomalies.length > 0;
  const hasDq = !!dqIssues && dqIssues.length > 0;
  const hasWarnings = hasAnomalies || hasDq;
  if (!hadHandout && !hasWarnings) {
    return <td className={`px-2 py-2 text-right text-xs tabular-nums ${bg} text-muted-foreground/40`}>—</td>;
  }
  return (
    <td className={`px-2 py-2 text-right text-xs tabular-nums ${bg} ${value > 0 ? 'text-destructive font-medium' : 'text-muted-foreground'}`}>
      <span className="inline-flex items-center justify-end gap-1">
        {hasWarnings && (
          <TooltipProvider delayDuration={150}>
            <Tooltip>
              <TooltipTrigger asChild>
                <AlertCircle className="h-3.5 w-3.5 text-amber-500 shrink-0" />
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-xs text-xs">
                {hasAnomalies && (
                  <>
                    <div className="font-medium mb-1">Phone data warnings</div>
                    <ul className="space-y-0.5 mb-2">
                      {anomalies!.map((a, i) => (
                        <li key={`a-${i}`}>• {ANOMALY_LABELS[a.type]}{a.detail ? ` — ${a.detail}` : ''}</li>
                      ))}
                    </ul>
                  </>
                )}
                {hasDq && (
                  <>
                    <div className="font-medium mb-1">Data quality</div>
                    <ul className="space-y-0.5">
                      {dqIssues!.map((i, idx) => (
                        <li key={`dq-${idx}`}>• {formatDqIssue(i)}</li>
                      ))}
                    </ul>
                  </>
                )}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
        <span>{hadHandout ? (value > 0 ? `€ ${value.toFixed(0)}` : '€ 0') : '—'}</span>
      </span>
    </td>
  );
}

// ─── Main Component ───

export default function Reports() {
  const { role } = useAuth();
  const canExport = role === 'admin' || role === 'data_manager';
  const [people, setPeople] = useState<Person[]>([]);
  const [transactions, setTransactions] = useState<EquipmentTransaction[]>([]);
  const [prices, setPrices] = useState<EquipmentPrice[]>([]);
  const [phoneModels, setPhoneModels] = useState<PhoneModel[]>([]);
  const [tabletModels, setTabletModels] = useState<TabletModel[]>([]);
  const [branches, setBranches] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingStep, setLoadingStep] = useState(0);
  const [hideZeroDebt, setHideZeroDebt] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [exportConfirmOpen, setExportConfirmOpen] = useState(false);
  const [pendingExport, setPendingExport] = useState<{ fn: () => void; count: number } | null>(null);

  // Pagination state (can't use hook with static 0, manage manually)
  const [debtPage, setDebtPage] = useState(1);
  const [debtPageSize, setDebtPageSize] = useState(25);
  const [ovPage, setOvPage] = useState(1);
  const [ovPageSize, setOvPageSize] = useState(25);
  const [nf1Page, setNf1Page] = useState(1);
  const [nf2Page, setNf2Page] = useState(1);
  const [nf3Page, setNf3Page] = useState(1);
  const [nfPageSize, setNfPageSize] = useState(25);

  // Filters
  const [search, setSearch] = useState('');
  const [filterBranch, setFilterBranch] = useState('all');
  const [filterSalesName, setFilterSalesName] = useState('all');
  const [filterPersId, setFilterPersId] = useState('all');
  const [filterSalesId, setFilterSalesId] = useState('all');
  const [selectedPayroll, setSelectedPayroll] = useState<string>('');

  useEffect(() => {
    async function load() {
      setLoadingStep(1);
      const [ppl, brs] = await Promise.all([
        fetchAllFromTable('people', 'sales_name'),
        supabase.from('branches').select('*').order('district_code').then(r => r.data || []),
      ]);
      setPeople(ppl as Person[]);
      setBranches(brs);

      setLoadingStep(2);
      // Reports uses the base equipment_transactions table intentionally:
      // admin/data_manager need full device details (*_details JSONB) for debt calculation.
      // Access is RLS-gated to admin and data_manager roles only.
      const [txs, prs, pms, tms] = await Promise.all([
        fetchAllFromTable('equipment_transactions'),
        supabase.from('equipment_prices').select('*').eq('active', true).then(r => (r.data ?? []) as EquipmentPrice[]),
        supabase.from('phone_models').select('*').eq('active', true).then(r => (r.data ?? []) as PhoneModel[]),
        supabase.from('tablet_models').select('*').eq('active', true).then(r => (r.data ?? []) as TabletModel[]),
      ]);
      setTransactions(txs as EquipmentTransaction[]);
      setPrices(prs);
      setPhoneModels(pms);
      setTabletModels(tms);

      setLoadingStep(3);
      // Small delay so the user sees "Calculating..." step
      await new Promise(r => setTimeout(r, 300));
      setLoading(false);
    }
    load();
  }, []);

  // ─── Payroll computation for every exited person ───
  const exitedWithPayroll = useMemo(() => {
    return people
      .filter(p => p.exit_date)
      .map(p => {
        const contractType = getContractType(p.sales_channel_start, p.exit_date);
        const payrollDate = calculatePayrollDay(p.exit_date!, contractType);
        const payrollKey = formatEurDate(payrollDate);
        return { person: p, contractType, payrollDate, payrollKey };
      });
  }, [people]);

  // Unique payroll dates sorted descending
  const allPayrollDates = useMemo(() => {
    const map = new Map<string, Date>();
    exitedWithPayroll.forEach(e => map.set(e.payrollKey, e.payrollDate));
    return [...map.entries()]
      .sort((a, b) => b[1].getTime() - a[1].getTime())
      .map(([key, date]) => ({ key, date }));
  }, [exitedWithPayroll]);

  // Default: next upcoming payroll (single-select)
  useEffect(() => {
    if (allPayrollDates.length > 0 && !selectedPayroll) {
      const now = new Date();
      const upcoming = allPayrollDates.find(p => p.date >= now);
      setSelectedPayroll(upcoming ? upcoming.key : allPayrollDates[0].key);
    }
  }, [allPayrollDates, selectedPayroll]);

  // Filter exited people by selected payroll
  const payrollFiltered = useMemo(() => {
    if (!selectedPayroll) return [];
    return exitedWithPayroll.filter(e => e.payrollKey === selectedPayroll);
  }, [exitedWithPayroll, selectedPayroll]);

  // Compute debt ONLY for the payroll-filtered subset
  const debtData = useMemo(() => {
    return payrollFiltered.map(e => {
      const debt = calculatePersonDebt(e.person.id, transactions, prices, phoneModels, tabletModels);
      return { ...e.person, contractType: e.contractType, payrollKey: e.payrollKey, payrollDate: e.payrollDate, ...debt };
    });
  }, [payrollFiltered, transactions, prices, phoneModels, tabletModels]);

  // Secondary filters (scoped to payroll subset)
  const filteredDebtData = useMemo(() => {
    return debtData.filter(d => {
      if (hideZeroDebt && d.totalDebt <= 0) return false;
      const matchBranch = filterBranch === 'all' || String(d.branch_id) === filterBranch;
      const matchName = filterSalesName === 'all' || d.sales_name === filterSalesName;
      const matchPersId = filterPersId === 'all' || String(d.pers_id) === filterPersId;
      const matchSalesId = filterSalesId === 'all' || d.sales_id === filterSalesId;
      return matchBranch && matchName && matchPersId && matchSalesId;
    });
  }, [debtData, filterBranch, filterSalesName, filterPersId, filterSalesId, hideZeroDebt]);

  // Reset pages on filter changes
  useEffect(() => { setDebtPage(1); }, [selectedPayroll, filterBranch, filterSalesName, filterPersId, filterSalesId, hideZeroDebt]);
  useEffect(() => { setOvPage(1); }, [search, filterBranch]);
  useEffect(() => { setNf1Page(1); setNf2Page(1); setNf3Page(1); }, [search, filterBranch]);

  // Paginate helper
  const paginate = <T,>(arr: T[], page: number, size: number) => {
    const start = (page - 1) * size;
    return { items: arr.slice(start, start + size), start, end: Math.min(start + size, arr.length), total: arr.length, totalPages: Math.max(1, Math.ceil(arr.length / size)) };
  };

  // Last day to submit
  const lastSubmitDate = useMemo(() => {
    const entry = allPayrollDates.find(p => p.key === selectedPayroll);
    if (!entry) return null;
    return getLastSubmissionDate(entry.date);
  }, [allPayrollDates, selectedPayroll]);

  // KPIs
  const seInPayroll = debtData.length;
  const seWithDebt = filteredDebtData.filter(d => d.totalDebt > 0).length;
  const totalDebtAmount = filteredDebtData.reduce((sum, d) => sum + d.totalDebt, 0);

  // Dropdown options scoped to payroll-filtered data
  const uniqueNames = useMemo(() => [...new Set(debtData.map(d => d.sales_name))].sort(), [debtData]);
  const uniquePersIds = useMemo(() => [...new Set(debtData.map(d => String(d.pers_id)))].sort(), [debtData]);
  const uniqueSalesIds = useMemo(() => [...new Set(debtData.map(d => d.sales_id))].sort(), [debtData]);

  // ─── Equipment overview (unchanged logic) ───
  const filteredPeople = useMemo(() => {
    return people.filter(p => {
      const matchSearch = search === '' || p.sales_name.toLowerCase().includes(search.toLowerCase()) || String(p.pers_id).includes(search);
      const matchBranch = filterBranch === 'all' || String(p.branch_id) === filterBranch;
      return matchSearch && matchBranch;
    });
  }, [people, search, filterBranch]);

  const equipmentOverview = useMemo(() => {
    return filteredPeople.map(p => {
      const handouts = transactions.filter(t => t.person_id === p.id && t.transaction_type === 'Uitgifte')
        .sort((a, b) => new Date(b.transaction_date).getTime() - new Date(a.transaction_date).getTime());
      const returns = transactions.filter(t => t.person_id === p.id && t.transaction_type === 'Ingeleverd')
        .sort((a, b) => new Date(b.transaction_date).getTime() - new Date(a.transaction_date).getTime());
      const latest = handouts[0];
      const latestReturn = returns[0];
      const has = (key: keyof EquipmentTransaction) => !!latest?.[key] && (!latestReturn || !latestReturn[key]);
      return {
        ...p,
        phone: has('phone'), tablet: has('tablet'), demobox: has('demobox'),
        clothing: has('clothing'), toolkit: has('toolkit'), izettle: has('izettle'),
        sales_binder: has('sales_binder'), id_card: has('id_card'), access_pass: has('access_pass'),
      };
    });
  }, [filteredPeople, transactions]);

  // Not filled forms
  const notFilledForms = useMemo(() => {
    const activeNoHandout = filteredPeople.filter(p => !p.exit_date && !transactions.some(t => t.person_id === p.id && t.transaction_type === 'Uitgifte'));
    const exitedNoHandout = filteredPeople.filter(p => p.exit_date && !transactions.some(t => t.person_id === p.id && t.transaction_type === 'Uitgifte'));
    const exitedNoReturn = filteredPeople.filter(p => p.exit_date && !transactions.some(t => t.person_id === p.id && t.transaction_type === 'Ingeleverd'));
    return { activeNoHandout, exitedNoHandout, exitedNoReturn };
  }, [filteredPeople, transactions]);

  // ─── Export CSV with large-export confirmation ───

  const confirmExport = (count: number, fn: () => void) => {
    if (count > 500) {
      setPendingExport({ fn, count });
      setExportConfirmOpen(true);
    } else {
      fn();
    }
  };

  const doExportDebtCsv = () => {
    const headers = ['Payroll Date', 'Last Day to Submit', 'Pers ID', 'Sales ID', 'Contract Type', 'Exit Date', 'Sales Name', 'Phone debt',
      ...DEMOBOX_ITEMS.map(i => DEMOBOX_SHORT_LABELS[i] || i),
      'Toolkit debt', 'iZettle debt', 'Clothing debt', 'ID Card', 'Access Pass', 'Binder', 'Laptop debt', 'Total debt'];
    const lastSubmitStr = lastSubmitDate ? formatEurDate(lastSubmitDate) : '';
    const rows = filteredDebtData.map(d => [
      d.payrollKey, lastSubmitStr, String(d.pers_id), d.sales_id, d.contractType, d.exit_date || '', d.sales_name,
      d.phonDebt.toFixed(2),
      ...DEMOBOX_ITEMS.map(i => (d.demoboxItemDebts[i] || 0).toFixed(2)),
      d.toolkitDebt.toFixed(2), d.izettleDebt.toFixed(2), d.clothingDebt.toFixed(2),
      d.idCardDebt.toFixed(2), d.accessPassDebt.toFixed(2), d.binderDebt.toFixed(2),
      d.tabletDebt.toFixed(2), d.totalDebt.toFixed(2),
    ]);
    const csv = buildCsv(headers, rows);
    downloadCsv(csv, `debt_report_${selectedPayroll}.csv`);
    logAudit('export', 'debt_report', selectedPayroll, { row_count: filteredDebtData.length, total_debt: totalDebtAmount });
  };

  const exportDebtCsv = () => confirmExport(filteredDebtData.length, doExportDebtCsv);

  const exportTable = (headers: string[], rows: string[][], filename = 'report.csv') => {
    const doIt = () => {
      const csv = buildCsv(headers, rows);
      downloadCsv(csv, filename);
      logAudit('export', 'equipment_overview', 'all', { row_count: rows.length });
    };
    confirmExport(rows.length, doIt);
  };

  const loadingSteps = [
    { label: 'Loading people database', done: loadingStep > 1 },
    { label: 'Loading equipment transactions', done: loadingStep > 2 },
    { label: 'Calculating debt & reports', done: !loading },
  ];

  if (loading) return (
    <AppLayout allowedRoles={['admin', 'data_manager']}>
      <div className="space-y-6">
        <PageHeader title="Reports" description="Equipment analytics and insights" />
        <div className="flex items-center justify-center py-24">
          <div className="w-full max-w-xs space-y-4">
            {loadingSteps.map((step, i) => (
              <motion.div
                key={step.label}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.1, duration: 0.3 }}
                className="flex items-center gap-3"
              >
                {step.done ? (
                  <CheckCircle2 className="h-4.5 w-4.5 text-emerald-500 shrink-0" />
                ) : loadingStep === i + 1 ? (
                  <Loader2 className="h-4.5 w-4.5 text-primary animate-spin shrink-0" />
                ) : (
                  <div className="h-4.5 w-4.5 rounded-full border-2 border-muted shrink-0" />
                )}
                <span className={`text-sm ${step.done ? 'text-muted-foreground' : loadingStep === i + 1 ? 'text-foreground font-medium' : 'text-muted-foreground/50'}`}>
                  {step.label}
                </span>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </AppLayout>
  );

  return (
    <AppLayout allowedRoles={['admin', 'data_manager']}>
      <div className="space-y-6">
        <PageHeader title="Reports" description="Equipment analytics and insights" />

        <Tabs defaultValue="debt" className="space-y-4">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="overview">Equipment Overview</TabsTrigger>
            <TabsTrigger value="debt">Debt of Exited SE</TabsTrigger>
            <TabsTrigger value="notfilled">Not Filled Forms</TabsTrigger>
            <TabsTrigger value="outofdate">Out of Date</TabsTrigger>
          </TabsList>

          {/* Tab 1: Equipment Overview */}
          <TabsContent value="overview">
            <div className="flex flex-wrap gap-3 mb-4">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Search by name or Pers ID..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
              </div>
              <Select value={filterBranch} onValueChange={setFilterBranch}>
                <SelectTrigger className="w-[200px]"><SelectValue placeholder="All Branches" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Branches</SelectItem>
                  {branches.map((b: any) => <SelectItem key={b.id} value={String(b.id)}>{b.district_code}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-lg">Equipment per Employee</CardTitle>
                {canExport && <Button variant="outline" size="sm" onClick={() => exportTable(
                  ['Pers ID', 'Sales ID', 'Name', 'Phone', 'Tablet', 'Demobox', 'Clothing', 'Toolkit', 'iZettle', 'Sales Binder', 'ID Card', 'Access Pass'],
                  equipmentOverview.map(p => [String(p.pers_id), p.sales_id, p.sales_name, ...[p.phone, p.tablet, p.demobox, p.clothing, p.toolkit, p.izettle, p.sales_binder, p.id_card, p.access_pass].map(v => v ? '1' : '0')])
                )}><Download className="h-4 w-4 mr-1" /> Export</Button>}
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Status</TableHead>
                        <TableHead>Pers ID</TableHead>
                        <TableHead>Name</TableHead>
                        <TableHead className="text-center">📱</TableHead>
                        <TableHead className="text-center">💻</TableHead>
                        <TableHead className="text-center">📦</TableHead>
                        <TableHead className="text-center">👕</TableHead>
                        <TableHead className="text-center">🔧</TableHead>
                        <TableHead className="text-center">💳</TableHead>
                        <TableHead className="text-center">📋</TableHead>
                        <TableHead className="text-center">🪪</TableHead>
                        <TableHead className="text-center">🔑</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(() => {
                        const ov = paginate(equipmentOverview, ovPage, ovPageSize);
                        return equipmentOverview.length === 0 ? (
                        <TableRow><TableCell colSpan={12} className="text-center py-12 text-muted-foreground">
                          <Package className="h-8 w-8 mx-auto mb-2 opacity-40" />
                          <p>No employees match your filters</p>
                        </TableCell></TableRow>
                      ) : ov.items.map(p => (
                        <TableRow key={p.id} className="hover:bg-muted/30">
                          <TableCell><StatusBadge status={p.exit_date ? 'exited' : 'active'} /></TableCell>
                          <TableCell className="font-mono text-sm">{p.pers_id}</TableCell>
                          <TableCell className="font-medium">{p.sales_name}</TableCell>
                          {[p.phone, p.tablet, p.demobox, p.clothing, p.toolkit, p.izettle, p.sales_binder, p.id_card, p.access_pass].map((v, i) => (
                            <TableCell key={i} className="text-center">
                              {v ? <span className="inline-block h-2.5 w-2.5 rounded-full bg-green-500" /> : <span className="inline-block h-2.5 w-2.5 rounded-full bg-muted" />}
                            </TableCell>
                          ))}
                        </TableRow>
                      ));
                      })()}
                    </TableBody>
                  </Table>
                </div>
                {(() => {
                  const ov = paginate(equipmentOverview, ovPage, ovPageSize);
                  return (
                    <TablePagination
                      currentPage={ovPage}
                      totalPages={ov.totalPages}
                      pageSize={ovPageSize}
                      totalItems={ov.total}
                      startIndex={ov.start}
                      endIndex={ov.end}
                      hasNext={ovPage < ov.totalPages}
                      hasPrev={ovPage > 1}
                      onPageChange={setOvPage}
                      onPageSizeChange={(s) => { setOvPageSize(s); setOvPage(1); }}
                    />
                  );
                })()}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Tab 2: Debt of Exited SE — Payroll-Driven (Single Select) */}
          <TabsContent value="debt">
            <div className="space-y-5">

              {/* Payroll filter — PRIMARY (single-select) */}
              <div className="flex flex-col sm:flex-row sm:items-end gap-4">
                <div className="flex-1 max-w-xs">
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5 block">
                    Payroll Period
                  </label>
                  <Select value={selectedPayroll} onValueChange={v => { setSelectedPayroll(v); setFilterSalesName('all'); setFilterPersId('all'); setFilterSalesId('all'); }}>
                    <SelectTrigger className="h-11 text-base font-medium">
                      <SelectValue placeholder="Select payroll date…" />
                    </SelectTrigger>
                    <SelectContent className="max-h-[300px]">
                      {allPayrollDates.map(p => (
                        <SelectItem key={p.key} value={p.key}>{p.key}</SelectItem>
                      ))}
                      {allPayrollDates.length === 0 && (
                        <div className="px-3 py-2 text-sm text-muted-foreground">No exited employees</div>
                      )}
                    </SelectContent>
                  </Select>
                </div>

                {/* Last Day to Submit */}
                <AnimatePresence>
                  {lastSubmitDate && (
                    <motion.div
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0 }}
                      className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-destructive/10 border border-destructive/20"
                    >
                      <CalendarClock className="h-4.5 w-4.5 text-destructive shrink-0" />
                      <span className="text-sm font-semibold text-destructive">
                        Last Day to Submit: {formatEurDate(lastSubmitDate)}
                      </span>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Secondary filters */}
              <div className="flex flex-wrap gap-2.5">
                <Select value={filterBranch} onValueChange={setFilterBranch}>
                  <SelectTrigger className="w-[160px] h-9 text-sm"><SelectValue placeholder="Branch" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Branches</SelectItem>
                    {branches.map((b: any) => <SelectItem key={b.id} value={String(b.id)}>{b.district_code}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={filterSalesName} onValueChange={setFilterSalesName}>
                  <SelectTrigger className="w-[170px] h-9 text-sm"><SelectValue placeholder="Sales Name" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Names</SelectItem>
                    {uniqueNames.map(n => <SelectItem key={n} value={n}>{n}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={filterPersId} onValueChange={setFilterPersId}>
                  <SelectTrigger className="w-[130px] h-9 text-sm"><SelectValue placeholder="Pers ID" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All IDs</SelectItem>
                    {uniquePersIds.map(id => <SelectItem key={id} value={id}>{id}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={filterSalesId} onValueChange={setFilterSalesId}>
                  <SelectTrigger className="w-[130px] h-9 text-sm"><SelectValue placeholder="Sales ID" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Sales IDs</SelectItem>
                    {uniqueSalesIds.map(id => <SelectItem key={id} value={id}>{id}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              {/* KPIs — 3 cards */}
              <div className="grid gap-4 sm:grid-cols-3">
                <KPICard
                  title="SE in Payroll"
                  value={seInPayroll}
                  icon={UserCheck}
                  subtitle={`Payroll ${selectedPayroll}`}
                />
                <KPICard
                  title="SE with Debt"
                  value={seWithDebt}
                  icon={Users}
                  subtitle={`${seInPayroll} total in payroll`}
                  trend={seWithDebt > 0 ? 'down' : 'neutral'}
                />
                <KPICard
                  title="Total Debt of SE"
                  value={`€ ${totalDebtAmount.toLocaleString('nl-NL', { minimumFractionDigits: 0 })}`}
                  icon={DollarSign}
                  trend={totalDebtAmount > 0 ? 'down' : 'neutral'}
                  subtitle="Outstanding amount"
                />
              </div>

              {/* Header + Export + Debt Toggle */}
              <div className="flex items-center justify-between flex-wrap gap-3">
                <h2 className="text-lg font-bold tracking-tight">Debt of Exited SE</h2>
                <div className="flex items-center gap-4">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowDetails(v => !v)}
                    className="gap-1.5 text-xs text-muted-foreground"
                  >
                    <Columns3 className="h-3.5 w-3.5" />
                    {showDetails ? 'Hide details' : 'Show details'}
                  </Button>
                  <div className="flex items-center gap-2">
                    <Switch id="hide-zero-debt" checked={hideZeroDebt} onCheckedChange={setHideZeroDebt} />
                    <Label htmlFor="hide-zero-debt" className="text-sm cursor-pointer">Show only SE with debt</Label>
                  </div>
                  {canExport && <Button variant="outline" size="sm" onClick={exportDebtCsv} disabled={filteredDebtData.length === 0}>
                    <Download className="h-4 w-4 mr-1" /> Export CSV
                  </Button>}
                </div>
              </div>

              {/* Debt Table with sticky left + right + horizontal scroll */}
              <Card className="overflow-hidden">
                <CardContent className="p-0">
                  <div className="overflow-x-auto relative">
                    <table className="w-full text-sm border-collapse min-w-[900px]">
                      <thead>
                        <tr className="border-b bg-muted/30">
                          {/* Sticky left: Pers ID */}
                          <th className="sticky left-0 z-20 bg-background px-3 py-2.5 text-left font-medium text-muted-foreground min-w-[80px] border-r text-xs">Pers. ID</th>
                          {/* Collapsible columns */}
                          {showDetails && (
                            <>
                              <th className="sticky left-[80px] z-20 bg-background px-3 py-2.5 text-left font-medium text-muted-foreground min-w-[80px] border-r text-xs">Sales ID</th>
                              <th className="sticky left-[160px] z-20 bg-background px-3 py-2.5 text-left font-medium text-muted-foreground min-w-[90px] border-r text-xs">Contract</th>
                              <th className="sticky left-[250px] z-20 bg-background px-3 py-2.5 text-left font-medium text-muted-foreground min-w-[95px] border-r text-xs">Exit Date</th>
                            </>
                          )}
                          {/* Sticky left: Sales Name */}
                          <th className={`sticky ${showDetails ? 'left-[345px]' : 'left-[80px]'} z-20 bg-background px-3 py-2.5 text-left font-medium text-muted-foreground min-w-[140px] border-r shadow-[2px_0_4px_-2px_rgba(0,0,0,0.08)] text-xs`}>Sales Name</th>
                          {/* Debt columns */}
                          <th className="px-2 py-2.5 text-right font-medium text-muted-foreground min-w-[70px] bg-orange-50/80 dark:bg-orange-950/20 whitespace-pre-line text-[11px] leading-tight">Phone</th>
                          {DEMOBOX_ITEMS.map(item => (
                            <th key={item} className="px-2 py-2.5 text-right font-medium text-muted-foreground min-w-[72px] bg-orange-50/80 dark:bg-orange-950/20 whitespace-pre-line text-[11px] leading-tight">
                              {(DEMOBOX_SHORT_LABELS[item] || item).replace(/ /g, '\n')}
                            </th>
                          ))}
                          <th className="px-2 py-2.5 text-right font-medium text-muted-foreground min-w-[65px] bg-amber-50/80 dark:bg-amber-950/20 text-[11px]">Toolkit</th>
                          <th className="px-2 py-2.5 text-right font-medium text-muted-foreground min-w-[65px] bg-amber-50/80 dark:bg-amber-950/20 text-[11px]">iZettle</th>
                          <th className="px-2 py-2.5 text-right font-medium text-muted-foreground min-w-[70px] bg-pink-50/80 dark:bg-pink-950/20 text-[11px]">Clothing</th>
                          <th className="px-2 py-2.5 text-right font-medium text-muted-foreground min-w-[65px] bg-amber-50/80 dark:bg-amber-950/20 text-[11px]">ID Card</th>
                          <th className="px-2 py-2.5 text-right font-medium text-muted-foreground min-w-[70px] bg-muted/50 text-[11px] whitespace-pre-line leading-tight">Access{'\n'}Pass</th>
                          <th className="px-2 py-2.5 text-right font-medium text-muted-foreground min-w-[55px] bg-muted/50 text-[11px]">Binder</th>
                          <th className="px-2 py-2.5 text-right font-medium text-muted-foreground min-w-[65px] text-[11px]">Laptop</th>
                          {/* Sticky right: Total Debt */}
                          <th className="sticky right-0 z-20 bg-background px-3 py-2.5 text-right font-bold text-foreground min-w-[90px] text-xs border-l shadow-[-2px_0_4px_-2px_rgba(0,0,0,0.08)]">Total debt</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredDebtData.length === 0 ? (
                          <tr>
                            <td colSpan={99} className="text-center py-16 text-muted-foreground">
                              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
                                {!selectedPayroll ? (
                                  <>
                                    <CalendarClock className="h-10 w-10 mx-auto mb-3 text-muted-foreground/30" />
                                    <p className="font-medium mb-1">Select a Payroll Period</p>
                                    <p className="text-sm text-muted-foreground/60">Choose a payroll date above to view exited SE debt</p>
                                  </>
                                ) : debtData.length === 0 ? (
                                  <>
                                    <Users className="h-10 w-10 mx-auto mb-3 text-muted-foreground/30" />
                                    <p className="font-medium mb-1">No exited SE in this payroll period</p>
                                    <p className="text-sm text-muted-foreground/60">Try selecting a different payroll date</p>
                                  </>
                                ) : (
                                  <>
                                    <Search className="h-10 w-10 mx-auto mb-3 text-muted-foreground/30" />
                                    <p className="font-medium mb-1">No results match your filters</p>
                                    <p className="text-sm text-muted-foreground/60">Adjust branch, name, or ID filters</p>
                                  </>
                                )}
                              </motion.div>
                            </td>
                          </tr>
                        ) : (() => {
                          const dp = paginate(filteredDebtData, debtPage, debtPageSize);
                          return dp.items.map(d => (
                          <tr key={d.id} className="border-b hover:bg-muted/20 transition-colors">
                            {/* Sticky left: Pers ID */}
                            <td className="sticky left-0 z-10 bg-background px-3 py-2 font-mono text-xs border-r">{d.pers_id}</td>
                            {/* Collapsible columns */}
                            {showDetails && (
                              <>
                                <td className="sticky left-[80px] z-10 bg-background px-3 py-2 font-mono text-xs border-r">{d.sales_id}</td>
                                <td className="sticky left-[160px] z-10 bg-background px-3 py-2 border-r">
                                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${
                                    d.contractType === 'On Call'
                                      ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
                                      : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300'
                                  }`}>
                                    {d.contractType}
                                  </span>
                                </td>
                                <td className="sticky left-[250px] z-10 bg-background px-3 py-2 text-xs border-r">
                                  {d.exit_date ? format(new Date(d.exit_date), 'dd-MM-yyyy') : ''}
                                </td>
                              </>
                            )}
                            {/* Sticky left: Sales Name */}
                            <td className={`sticky ${showDetails ? 'left-[345px]' : 'left-[80px]'} z-10 bg-background px-3 py-2 font-medium text-xs border-r shadow-[2px_0_4px_-2px_rgba(0,0,0,0.08)]`}>{d.sales_name}</td>

                            {/* Debt cells */}
                            <DebtCell value={d.phonDebt} hadHandout={d.handoutFlags.phone} anomalies={d.phoneAnomalies} dqIssues={d.dataQualityIssues?.filter(i => i.category === 'phone')} bg="bg-orange-50/40 dark:bg-orange-950/10" />
                            {DEMOBOX_ITEMS.map((item, idx) => (
                              <DebtCell
                                key={item}
                                value={d.demoboxItemDebts[item] || 0}
                                hadHandout={!!d.handoutFlags.demobox[item]}
                                dqIssues={idx === 0 ? d.dataQualityIssues?.filter(i => i.category === 'demobox') : undefined}
                                bg="bg-orange-50/40 dark:bg-orange-950/10"
                              />
                            ))}
                            <DebtCell value={d.toolkitDebt} hadHandout={d.handoutFlags.toolkit} dqIssues={d.dataQualityIssues?.filter(i => i.category === 'toolkit')} bg="bg-amber-50/40 dark:bg-amber-950/10" />
                            <DebtCell value={d.izettleDebt} hadHandout={d.handoutFlags.izettle} dqIssues={d.dataQualityIssues?.filter(i => i.category === 'izettle')} bg="bg-amber-50/40 dark:bg-amber-950/10" />
                            <DebtCell value={d.clothingDebt} hadHandout={d.handoutFlags.clothing} dqIssues={d.dataQualityIssues?.filter(i => i.category === 'clothing')} bg="bg-pink-50/40 dark:bg-pink-950/10" />
                            <DebtCell value={d.idCardDebt} hadHandout={d.handoutFlags.id_card} bg="bg-amber-50/40 dark:bg-amber-950/10" />
                            <DebtCell value={d.accessPassDebt} hadHandout={d.handoutFlags.access_pass} bg="bg-muted/30" />
                            <DebtCell value={d.binderDebt} hadHandout={d.handoutFlags.sales_binder} bg="bg-muted/30" />
                            <DebtCell value={d.tabletDebt} hadHandout={d.handoutFlags.tablet} dqIssues={d.dataQualityIssues?.filter(i => i.category === 'tablet')} />
                            {/* Sticky right: Total */}
                            <td className={`sticky right-0 z-10 bg-background px-3 py-2 text-right font-bold text-sm tabular-nums border-l shadow-[-2px_0_4px_-2px_rgba(0,0,0,0.08)] ${d.totalDebt > 0 ? 'text-destructive' : 'text-emerald-600'}`}>
                              {d.totalDebt > 0 ? `€ ${d.totalDebt.toFixed(0)}` : '€ 0'}
                            </td>
                          </tr>
                        ));
                        })()}
                      </tbody>
                    </table>
                  </div>
                  {(() => {
                    const dp = paginate(filteredDebtData, debtPage, debtPageSize);
                    return (
                      <TablePagination
                        currentPage={debtPage}
                        totalPages={dp.totalPages}
                        pageSize={debtPageSize}
                        totalItems={dp.total}
                        startIndex={dp.start}
                        endIndex={dp.end}
                        hasNext={debtPage < dp.totalPages}
                        hasPrev={debtPage > 1}
                        onPageChange={setDebtPage}
                        onPageSizeChange={(s) => { setDebtPageSize(s); setDebtPage(1); }}
                      />
                    );
                  })()}
                </CardContent>
              </Card>

              {/* Footer summary */}
              {filteredDebtData.length > 0 && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex items-center justify-between px-4 py-3 rounded-lg bg-muted/50 text-sm"
                >
                  <span className="font-medium">SE with Debt: <span className="text-foreground font-bold">{seWithDebt}</span></span>
                  <span className="font-medium">Total Debt: <span className="text-destructive font-bold">€ {totalDebtAmount.toLocaleString('nl-NL', { minimumFractionDigits: 0 })}</span></span>
                </motion.div>
              )}
            </div>
          </TabsContent>

          {/* Tab 3: Not Filled Forms */}
          <TabsContent value="notfilled">
            <div className="flex flex-wrap gap-3 mb-4">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Search by name or Pers ID..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
              </div>
              <Select value={filterBranch} onValueChange={setFilterBranch}>
                <SelectTrigger className="w-[200px]"><SelectValue placeholder="All Branches" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Branches</SelectItem>
                  {branches.map((b: any) => <SelectItem key={b.id} value={String(b.id)}>{b.district_code}</SelectItem>)}
                </SelectContent>
              </Select>
              {canExport && <Button variant="outline" size="sm" onClick={() => {
                const allRows: string[][] = [];
                const headers = ['Status', 'Pers ID', 'Name', 'Branch', 'Missing Form'];
                notFilledForms.activeNoHandout.forEach(p => allRows.push(['Active', String(p.pers_id), p.sales_name, p.branch_name || '', 'Handout']));
                notFilledForms.exitedNoHandout.forEach(p => allRows.push(['Exited', String(p.pers_id), p.sales_name, p.branch_name || '', 'Handout']));
                notFilledForms.exitedNoReturn.forEach(p => allRows.push(['Exited', String(p.pers_id), p.sales_name, p.branch_name || '', 'Return']));
                exportTable(headers, allRows);
              }}>
                <Download className="h-4 w-4 mr-1" /> Export
              </Button>}
            </div>
            <div className="grid gap-4 sm:grid-cols-3 mb-4">
              <KPICard title="Active without Handout" value={notFilledForms.activeNoHandout.length} icon={AlertTriangle} trend={notFilledForms.activeNoHandout.length > 0 ? 'down' : 'neutral'} />
              <KPICard title="Exited without Handout" value={notFilledForms.exitedNoHandout.length} icon={AlertTriangle} trend={notFilledForms.exitedNoHandout.length > 0 ? 'down' : 'neutral'} />
              <KPICard title="Exited without Return" value={notFilledForms.exitedNoReturn.length} icon={AlertTriangle} trend={notFilledForms.exitedNoReturn.length > 0 ? 'down' : 'neutral'} />
            </div>
            <div className="space-y-4">
              {[
                { title: 'Active SE without Handout Form', data: notFilledForms.activeNoHandout, status: 'active' as const, page: nf1Page, setPage: setNf1Page },
                { title: 'Exited SE without Handout Form', data: notFilledForms.exitedNoHandout, status: 'exited' as const, page: nf2Page, setPage: setNf2Page },
                { title: 'Exited SE without Return Form', data: notFilledForms.exitedNoReturn, status: 'exited' as const, page: nf3Page, setPage: setNf3Page },
              ].map(section => {
                const nfp = paginate(section.data, section.page, nfPageSize);
                return (
                <Card key={section.title}>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 text-amber-500" />
                      {section.title} ({section.data.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    {section.data.length === 0 ? (
                      <p className="text-center py-8 text-muted-foreground text-sm">All forms are filled ✓</p>
                    ) : (
                      <>
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Status</TableHead>
                              <TableHead>Pers ID</TableHead>
                              <TableHead>Name</TableHead>
                              <TableHead>Branch</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {nfp.items.map(p => (
                              <TableRow key={p.id}>
                                <TableCell><StatusBadge status={section.status} /></TableCell>
                                <TableCell className="font-mono text-sm">{p.pers_id}</TableCell>
                                <TableCell className="font-medium">{p.sales_name}</TableCell>
                                <TableCell className="text-sm">{p.branch_name}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                        <TablePagination
                          currentPage={section.page}
                          totalPages={nfp.totalPages}
                          pageSize={nfPageSize}
                          totalItems={nfp.total}
                          startIndex={nfp.start}
                          endIndex={nfp.end}
                          hasNext={section.page < nfp.totalPages}
                          hasPrev={section.page > 1}
                          onPageChange={section.setPage}
                          onPageSizeChange={(s) => { setNfPageSize(s); setNf1Page(1); setNf2Page(1); setNf3Page(1); }}
                        />
                      </>
                    )}
                  </CardContent>
                </Card>
              );
              })}
            </div>
          </TabsContent>

          {/* Tab 4: Coming Soon */}
          <TabsContent value="outofdate">
            <Card>
              <CardContent className="py-16 text-center">
                <Clock className="h-12 w-12 mx-auto mb-4 text-muted-foreground/40" />
                <h3 className="text-lg font-semibold mb-2">Coming Soon</h3>
                <p className="text-muted-foreground text-sm max-w-md mx-auto">
                  Returned Out of Date tracking will be available when the Finance process is defined.
                </p>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Large export confirmation dialog */}
        <Dialog open={exportConfirmOpen} onOpenChange={setExportConfirmOpen}>
          <DialogContent>
            <DialogHeader><DialogTitle>Confirm Export</DialogTitle></DialogHeader>
            <p className="text-sm text-muted-foreground">
              You are about to export <strong>{pendingExport?.count ?? 0}</strong> rows. This action will be logged.
            </p>
            <DialogFooter>
              <Button variant="outline" onClick={() => setExportConfirmOpen(false)}>Cancel</Button>
              <Button onClick={() => { pendingExport?.fn(); setExportConfirmOpen(false); setPendingExport(null); }}>Export</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}
