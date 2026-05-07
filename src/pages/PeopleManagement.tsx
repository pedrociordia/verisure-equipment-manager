import { useEffect, useState, useMemo, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { usePagination } from '@/hooks/use-pagination';
import { TablePagination } from '@/components/shared/TablePagination';
import { supabase } from '@/lib/backend';
import { AppLayout } from '@/components/layout/AppLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { UserPlus, Search, Download, Upload, Calendar, FileUp } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { getContractType } from '@/lib/contract';
import { parseDimPeopleAdjusted, parseExitsExcel, diffPeopleRows, diffExitsRows, type ImportPeopleRow, type DiffResult, type ExitsDiffResult, parseEuropeanDate } from '@/lib/import-parsers';
import { ImportReviewDialog } from '@/components/import/ImportReviewDialog';
import { ExitsImportReviewDialog, type ExitsImportPayload } from '@/components/import/ExitsImportReviewDialog';
import { validateForm, personSchema } from '@/lib/validation';
import { buildCsv, downloadCsv } from '@/lib/csv-utils';
import { logAudit } from '@/lib/audit';
import { ensureDebtCaseForExit } from '@/lib/debtCaseLifecycle';
import { logger } from '@/lib/logger';
import type { Person, Branch } from '@/types';
import { format } from 'date-fns';
import { readWorkbook, sheetToJson } from '@/lib/excel-reader';

export default function PeopleManagement() {
  const { role } = useAuth();
  const { toast } = useToast();
  const [people, setPeople] = useState<Person[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'exited' | 'historical'>('all');
  const [filterBranch, setFilterBranch] = useState<string>('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingPerson, setEditingPerson] = useState<Person | null>(null);
  const [exitDialogOpen, setExitDialogOpen] = useState(false);
  const [exitPerson, setExitPerson] = useState<Person | null>(null);
  const [exitDate, setExitDate] = useState('');
  const [bulkDialogOpen, setBulkDialogOpen] = useState(false);
  const [importType, setImportType] = useState<'people' | 'exits'>('people');

  // Smart diff review state
  const [diffResult, setDiffResult] = useState<DiffResult<ImportPeopleRow> | null>(null);
  const [exitsDiff, setExitsDiff] = useState<ExitsDiffResult | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [exitsReviewOpen, setExitsReviewOpen] = useState(false);
  const [parsing, setParsing] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState({ pers_id: '', sales_id: '', sales_name: '', branch_id: '', sales_channel_start: '' });

  const fetchAllPeople = async (): Promise<Person[]> => {
    const all: Person[] = [];
    const PAGE = 1000;
    let from = 0;
    while (true) {
      const { data } = await supabase.from('people').select('*').order('sales_name').range(from, from + PAGE - 1);
      if (!data || data.length === 0) break;
      all.push(...(data as Person[]));
      if (data.length < PAGE) break;
      from += PAGE;
    }
    return all;
  };

  const fetchData = async () => {
    const [allPeople, bRes] = await Promise.all([
      fetchAllPeople(),
      supabase.from('branches').select('*').order('district_code'),
    ]);
    setPeople(allPeople);
    setBranches((bRes.data ?? []) as Branch[]);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const filtered = useMemo(() => {
    return people.filter(p => {
      const matchSearch = search === '' ||
        p.sales_name.toLowerCase().includes(search.toLowerCase()) ||
        String(p.pers_id).includes(search) ||
        p.sales_id.toLowerCase().includes(search.toLowerCase());
      const isHistorical = (p as any).source === 'equipment_historical_import';
      const matchStatus = filterStatus === 'all' ||
        (filterStatus === 'active' && !p.exit_date && !isHistorical) ||
        (filterStatus === 'exited' && p.exit_date) ||
        (filterStatus === 'historical' && isHistorical);
      const matchBranch = filterBranch === 'all' || String(p.branch_id) === filterBranch;
      return matchSearch && matchStatus && matchBranch;
    });
  }, [people, search, filterStatus, filterBranch]);

  const peoplePagination = usePagination({ totalItems: filtered.length });

  // Reset page on filter change
  useEffect(() => { peoplePagination.resetPage(); }, [search, filterStatus, filterBranch]);

  const paginatedPeople = useMemo(() => filtered.slice(peoplePagination.startIndex, peoplePagination.endIndex), [filtered, peoplePagination.startIndex, peoplePagination.endIndex]);

  const handleSave = async () => {
    const validation = validateForm(personSchema, form);
    if (!validation.success) { toast({ title: 'Validation Error', description: (validation as any).error, variant: 'destructive' }); return; }

    const branch = branches.find(b => String(b.id) === form.branch_id);
    const computedContractType = getContractType(form.sales_channel_start || null, editingPerson?.exit_date || null);
    const data = {
      pers_id: form.pers_id,
      sales_id: form.sales_id,
      sales_name: form.sales_name,
      branch_id: branch?.id || null,
      branch_name: branch ? branch.district_code : null,
      sales_channel_start: form.sales_channel_start || null,
      contract_type: computedContractType,
    };

    let error;
    if (editingPerson) {
      ({ error } = await supabase.from('people').update(data).eq('id', editingPerson.id));
    } else {
      ({ error } = await supabase.from('people').insert(data));
    }

    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: editingPerson ? 'Person updated' : 'Person added' });
      logAudit(editingPerson ? 'update' : 'create', 'person', editingPerson?.id || form.pers_id, { pers_id: form.pers_id, sales_name: form.sales_name });
      setDialogOpen(false);
      setEditingPerson(null);
      setForm({ pers_id: '', sales_id: '', sales_name: '', branch_id: '', sales_channel_start: '' });
      fetchData();
    }
  };

  const handleSetExit = async () => {
    if (!exitPerson || !exitDate) return;
    const computedContractType = getContractType(exitPerson.sales_channel_start, exitDate);
    const { error } = await supabase.from('people').update({ exit_date: exitDate, contract_type: computedContractType }).eq('id', exitPerson.id);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Exit date set' });
      logAudit('update', 'person', exitPerson.id, { action: 'set_exit_date', exit_date: exitDate });
      const r = await ensureDebtCaseForExit(exitPerson.id, exitDate, computedContractType, null);
      if (r.created) toast({ title: 'Debt case created', description: 'A debt follow-up case is now tracking this exit.' });
      setExitDialogOpen(false);
      setExitPerson(null);
      setExitDate('');
      fetchData();
    }
  };

  // --- Handle file upload with smart diff ---
  const ALLOWED_MIME_TYPES = [
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/csv',
    'application/vnd.ms-excel',
  ];

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // MIME/extension validation
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (!ALLOWED_MIME_TYPES.includes(file.type) && !['xlsx', 'csv', 'xls'].includes(ext || '')) {
      toast({ title: 'Invalid file type', description: 'Only .xlsx, .csv, and .xls files are accepted', variant: 'destructive' });
      logAudit('import_failed', 'people', 'rejected', { filename: file.name, reason: 'invalid_mime', mime: file.type });
      e.target.value = '';
      return;
    }

    // File size limit: 10MB
    if (file.size > 10 * 1024 * 1024) {
      toast({ title: 'File too large', description: 'Maximum file size is 10MB', variant: 'destructive' });
      logAudit('import_failed', 'people', 'rejected', { filename: file.name, reason: 'file_too_large', size: file.size });
      e.target.value = '';
      return;
    }

    setParsing(true);

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const data = new Uint8Array(evt.target?.result as ArrayBuffer);
        const wb = await readWorkbook(data, { format: 'xlsx' });
        // For exits, read ALL sheets
        let json: Record<string, any>[] = [];
        if (importType === 'exits') {
          for (const sn of wb.sheetNames) {
            const rows = sheetToJson<Record<string, any>>(wb.getSheet(sn), { defval: '' });
            json.push(...rows);
          }
        } else {
          json = sheetToJson<Record<string, any>>(wb.getSheet(wb.sheetNames[0]), { defval: '' });
        }
        if (json.length === 0) { toast({ title: 'Empty file', variant: 'destructive' }); setParsing(false); return; }
        if (json.length > 50000) {
          toast({ title: 'File too large', description: `${json.length.toLocaleString()} rows exceeds the 50,000-row limit per import. Please split the file and import in parts.`, variant: 'destructive' });
          logAudit('import_failed', 'people', 'rejected', { filename: file.name, reason: 'too_many_rows', row_count: json.length });
          setParsing(false);
          return;
        }
        const headers = Object.keys(json[0]);

        // Parse based on import type
        let incoming: ImportPeopleRow[];
        if (importType === 'exits') {
          incoming = parseExitsExcel(json, headers, branches);
        } else {
          incoming = parseDimPeopleAdjusted(json, headers, branches);
        }

        if (incoming.length === 0) {
          toast({ title: 'No valid rows found', variant: 'destructive' });
          setParsing(false);
          return;
        }

        // Map existing people to ImportPeopleRow format for diff
        const existingRows: ImportPeopleRow[] = people.map(p => ({
          pers_id: String(p.pers_id),
          sales_id: p.sales_id,
          sales_name: p.sales_name,
          branch_id: p.branch_id,
          branch_name: p.branch_name,
          exit_date: p.exit_date,
          sales_channel_start: p.sales_channel_start,
          contract_type: p.contract_type,
        }));

        if (importType === 'exits') {
          const eDiff = diffExitsRows(incoming, existingRows);
          setExitsDiff(eDiff);
          setBulkDialogOpen(false);
          setExitsReviewOpen(true);
        } else {
          const diff = diffPeopleRows(incoming, existingRows);
          setDiffResult(diff);
          setBulkDialogOpen(false);
          setReviewOpen(true);
        }
        setParsing(false);
      } catch (err) {
        logger.error('File parse error:', err);
        toast({ title: 'Error reading file', variant: 'destructive' });
        setParsing(false);
      }
    };
    reader.readAsArrayBuffer(file);
    e.target.value = '';
  };

  // --- Execute import for approved rows ---
  const handleApprovedImport = async (rows: ImportPeopleRow[]): Promise<{ success: number; errors: number }> => {
    let success = 0;
    let errors = 0;
    const BATCH = 500;

    for (let i = 0; i < rows.length; i += BATCH) {
      const batch = rows.slice(i, i + BATCH);
      const { error } = await supabase.from('people').upsert(
        batch.map(r => ({
          pers_id: r.pers_id,
          sales_id: r.sales_id,
          sales_name: r.sales_name,
          branch_id: r.branch_id,
          branch_name: r.branch_name,
          exit_date: r.exit_date,
          sales_channel_start: r.sales_channel_start,
          contract_type: r.contract_type,
        })),
        { onConflict: 'pers_id', ignoreDuplicates: false }
      );
      if (error) {
        logger.error('Batch error, retrying individually:', error);
        // Retry each row individually to isolate failures
        for (const row of batch) {
          const { error: rowErr } = await supabase.from('people').upsert(
            {
              pers_id: row.pers_id,
              sales_id: row.sales_id,
              sales_name: row.sales_name,
              branch_id: row.branch_id,
              branch_name: row.branch_name,
              exit_date: row.exit_date,
              sales_channel_start: row.sales_channel_start,
              contract_type: row.contract_type,
            },
            { onConflict: 'pers_id', ignoreDuplicates: false }
          );
          if (rowErr) {
            errors++;
            logger.error(`Row error (pers_id=${row.pers_id}):`, rowErr);
          } else {
            success++;
          }
        }
      } else {
        success += batch.length;
      }
    }

    if (success > 0) {
      fetchData();
      logAudit('import', 'people', crypto.randomUUID(), {
        import_type: importType,
        total_rows: rows.length,
        inserted: success,
        failed: errors,
      });
    }
    return { success, errors };
  };

  // --- Execute exits-specific import (only manages exit_date / creates missing people) ---
  const handleExitsImport = async (
    payload: ExitsImportPayload,
    onProgress?: (p: any) => void,
  ): Promise<{ created: number; marked: number; updated: number; errors: number; failedReasons?: string[] }> => {
    let created = 0, marked = 0, updated = 0, errors = 0;
    const failedReasons: string[] = [];
    const total = payload.toCreate.length + payload.toMarkAsExit.length + payload.toUpdateExitDate.length;
    let current = 0;

    // 1) Create missing people
    if (payload.toCreate.length > 0) {
      onProgress?.({ status: 'Creating missing people...' });
      for (const r of payload.toCreate) {
        const ct = getContractType(r.sales_channel_start, r.exit_date);
        const { data: inserted, error } = await supabase.from('people').insert({
          pers_id: r.pers_id,
          sales_id: r.sales_id,
          sales_name: r.sales_name,
          branch_id: r.branch_id,
          branch_name: r.branch_name,
          sales_channel_start: r.sales_channel_start,
          exit_date: r.exit_date,
          contract_type: ct,
          source: 'exits_import',
        }).select('id').single();
        current++;
        if (error) {
          errors++;
          failedReasons.push(`${r.pers_id}: ${error.message}`);
          logger.error('Create failed', error);
        } else {
          created++;
          if (inserted?.id && r.exit_date) {
            ensureDebtCaseForExit(inserted.id, r.exit_date, ct as 'Fixed Term' | 'On Call', null)
              .catch(e => logger.error('ensureDebtCaseForExit failed', e));
          }
        }
        onProgress?.({ current, inserted: created, failed: errors });
      }
    }

    // 2) Mark active people as exited
    if (payload.toMarkAsExit.length > 0) {
      onProgress?.({ status: 'Marking people as exited...' });
      for (const r of payload.toMarkAsExit) {
        const ct = getContractType(r.sales_channel_start, r.exit_date);
        const { data: updatedRow, error } = await supabase.from('people').update({
          exit_date: r.exit_date,
          contract_type: ct,
        }).eq('pers_id', r.pers_id).select('id').single();
        current++;
        if (error) {
          errors++;
          failedReasons.push(`${r.pers_id}: ${error.message}`);
        } else {
          marked++;
          if (updatedRow?.id && r.exit_date) {
            ensureDebtCaseForExit(updatedRow.id, r.exit_date, ct as 'Fixed Term' | 'On Call', null)
              .catch(e => logger.error('ensureDebtCaseForExit failed', e));
          }
        }
        onProgress?.({ current, updated: marked + updated, failed: errors });
      }
    }

    // 3) Override existing exit dates
    if (payload.toUpdateExitDate.length > 0) {
      onProgress?.({ status: 'Updating exit dates...' });
      for (const r of payload.toUpdateExitDate) {
        const ct = getContractType(r.sales_channel_start, r.exit_date);
        const { data: updRow, error } = await supabase.from('people').update({
          exit_date: r.exit_date,
          contract_type: ct,
        }).eq('pers_id', r.pers_id).select('id').single();
        current++;
        if (error) {
          errors++;
          failedReasons.push(`${r.pers_id}: ${error.message}`);
        } else {
          updated++;
          if (updRow?.id && r.exit_date) {
            ensureDebtCaseForExit(updRow.id, r.exit_date, ct as 'Fixed Term' | 'On Call', null)
              .catch(e => logger.error('ensureDebtCaseForExit failed', e));
          }
        }
        onProgress?.({ current, updated: marked + updated, failed: errors });
      }
    }

    if (created + marked + updated > 0) {
      fetchData();
      logAudit('import', 'people', crypto.randomUUID(), {
        import_type: 'exits',
        created, marked, updated, errors,
      });
    }

    return { created, marked, updated, errors, failedReasons };
  };

  const exportCsv = () => {
    const headers = ['pers_id', 'sales_id', 'sales_name', 'branch_name', 'contract_type', 'sales_channel_start', 'exit_date'];
    const rows = filtered.map(p => headers.map(h => (p as any)[h] ?? ''));
    const csv = buildCsv(headers, rows);
    downloadCsv(csv, 'people.csv');
    logAudit('export', 'people', 'all', { row_count: filtered.length });
  };

  const openEdit = (p: Person) => {
    setEditingPerson(p);
    setForm({
      pers_id: String(p.pers_id),
      sales_id: p.sales_id,
      sales_name: p.sales_name,
      branch_id: String(p.branch_id || ''),
      sales_channel_start: p.sales_channel_start || '',
    });
    setDialogOpen(true);
  };

  return (
    <AppLayout allowedRoles={['admin', 'data_manager']}>
      <div className="space-y-6">
        <PageHeader title="People Management" description="Manage employees and their status">
          {(role === 'admin' || role === 'data_manager') && (
            <Button variant="outline" size="sm" onClick={exportCsv}>
              <Download className="h-4 w-4 mr-1" /> Export
            </Button>
          )}
          <Dialog open={bulkDialogOpen} onOpenChange={setBulkDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm"><Upload className="h-4 w-4 mr-1" /> Bulk Import</Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg">
              <DialogHeader><DialogTitle>Bulk Import</DialogTitle></DialogHeader>
              <div className="space-y-4">
                {/* Import type selector */}
                <div>
                  <Label className="text-sm">Import Type</Label>
                  <div className="flex gap-2 mt-1.5">
                    <button
                      onClick={() => setImportType('people')}
                      className={`flex-1 p-3 rounded-lg border-2 text-left transition-all ${
                        importType === 'people'
                          ? 'border-primary bg-primary/5'
                          : 'border-border hover:border-primary/30'
                      }`}
                    >
                      <p className="text-sm font-medium">People Master Data</p>
                      <p className="text-xs text-muted-foreground mt-0.5">Dim_People_Adjusted (.xlsx)</p>
                    </button>
                    <button
                      onClick={() => setImportType('exits')}
                      className={`flex-1 p-3 rounded-lg border-2 text-left transition-all ${
                        importType === 'exits'
                          ? 'border-primary bg-primary/5'
                          : 'border-border hover:border-primary/30'
                      }`}
                    >
                      <p className="text-sm font-medium">Exits Report</p>
                      <p className="text-xs text-muted-foreground mt-0.5">HR Exits (.xlsx)</p>
                    </button>
                  </div>
                </div>

                {/* File upload */}
                <div>
                  <input ref={fileInputRef} type="file" accept=".xlsx,.csv,.xls" className="hidden" onChange={handleFileUpload} />
                  <Button
                    variant="outline"
                    className="w-full h-24 border-dashed"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={parsing}
                  >
                    <div className="flex flex-col items-center gap-2">
                      <FileUp className="h-7 w-7 text-muted-foreground" />
                      <span className="text-sm">
                        {parsing ? 'Analyzing file...' : 'Upload .xlsx or .csv file'}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        Smart diff — only new and changed records will be shown
                      </span>
                    </div>
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
          <Dialog open={dialogOpen} onOpenChange={(o) => { setDialogOpen(o); if (!o) { setEditingPerson(null); setForm({ pers_id: '', sales_id: '', sales_name: '', branch_id: '', sales_channel_start: '' }); } }}>
            <DialogTrigger asChild>
              <Button size="sm"><UserPlus className="h-4 w-4 mr-1" /> Add Person</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>{editingPerson ? 'Edit Person' : 'Add Person'}</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Pers ID</Label><Input type="text" value={form.pers_id} onChange={e => setForm(f => ({ ...f, pers_id: e.target.value }))} /></div>
                  <div><Label>Sales ID</Label><Input value={form.sales_id} onChange={e => setForm(f => ({ ...f, sales_id: e.target.value }))} /></div>
                </div>
                <div><Label>Sales Name</Label><Input value={form.sales_name} onChange={e => setForm(f => ({ ...f, sales_name: e.target.value }))} /></div>
                <div>
                  <Label>Branch</Label>
                  <Select value={form.branch_id} onValueChange={v => setForm(f => ({ ...f, branch_id: v }))}>
                    <SelectTrigger><SelectValue placeholder="Select branch" /></SelectTrigger>
                    <SelectContent>
                      {branches.map(b => <SelectItem key={b.id} value={String(b.id)}>{b.district_code} — {b.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Start Date</Label>
                  <Input type="date" value={form.sales_channel_start} onChange={e => setForm(f => ({ ...f, sales_channel_start: e.target.value }))} />
                </div>
                {form.sales_channel_start && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <span>Contract Type (auto):</span>
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                      getContractType(form.sales_channel_start, editingPerson?.exit_date || null) === 'On Call'
                        ? 'bg-blue-100 text-blue-700' : 'bg-emerald-100 text-emerald-700'
                    }`}>
                      {getContractType(form.sales_channel_start, editingPerson?.exit_date || null)}
                    </span>
                  </div>
                )}
                <Button onClick={handleSave} className="w-full">{editingPerson ? 'Update' : 'Add Person'}</Button>
              </div>
            </DialogContent>
          </Dialog>
        </PageHeader>

        {/* Filters */}
        <div className="flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search by name, Pers ID, Sales ID..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
          </div>
          <Select value={filterStatus} onValueChange={(v: any) => setFilterStatus(v)}>
            <SelectTrigger className="w-[130px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="exited">Exited</SelectItem>
              <SelectItem value="historical">Historical Import</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filterBranch} onValueChange={setFilterBranch}>
            <SelectTrigger className="w-[200px]"><SelectValue placeholder="All Branches" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Branches</SelectItem>
              {branches.map(b => <SelectItem key={b.id} value={String(b.id)}>{b.district_code}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {/* Table */}
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Status</TableHead>
                    <TableHead>Pers ID</TableHead>
                    <TableHead>Sales ID</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Branch</TableHead>
                    <TableHead>Contract</TableHead>
                    <TableHead>Start Date</TableHead>
                    <TableHead>Exit Date</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    [1,2,3,4,5].map(i => (
                      <TableRow key={i}>
                        {[1,2,3,4,5,6,7,8,9].map(j => <TableCell key={j}><div className="h-4 bg-muted animate-pulse rounded" /></TableCell>)}
                      </TableRow>
                    ))
                  ) : filtered.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">No people found</TableCell>
                    </TableRow>
                  ) : (
                    paginatedPeople.map(p => {
                      const ct = getContractType(p.sales_channel_start, p.exit_date);
                      const isProvisional = !p.exit_date;
                      const isHistorical = (p as any).source === 'equipment_historical_import';
                      return (
                        <TableRow key={p.id} className={`hover:bg-muted/30 ${isHistorical ? 'opacity-70' : ''}`}>
                          <TableCell>
                            <div className="flex items-center gap-1.5">
                              <StatusBadge status={p.exit_date ? 'exited' : 'active'} />
                              {isHistorical && (
                                <span className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
                                  Historical
                                </span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="font-mono text-sm">{p.pers_id}</TableCell>
                          <TableCell className="font-mono text-sm">{p.sales_id}</TableCell>
                          <TableCell className="font-medium">{p.sales_name}</TableCell>
                          <TableCell className="text-sm">{p.branch_name}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                                ct === 'On Call' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
                              }`}>
                                {ct}
                              </span>
                              {isProvisional && (
                                <span className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium bg-muted text-muted-foreground">
                                  Provisional
                                </span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-sm">{p.sales_channel_start ? format(new Date(p.sales_channel_start), 'dd MMM yyyy') : '—'}</TableCell>
                          <TableCell className="text-sm">{p.exit_date ? format(new Date(p.exit_date), 'dd MMM yyyy') : '—'}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button variant="ghost" size="sm" onClick={() => openEdit(p)}>Edit</Button>
                              {!p.exit_date && (
                                <Button variant="ghost" size="sm" className="text-destructive" onClick={() => { setExitPerson(p); setExitDialogOpen(true); }}>
                                  <Calendar className="h-3 w-3 mr-1" /> Exit
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
            <TablePagination
              currentPage={peoplePagination.currentPage}
              totalPages={peoplePagination.totalPages}
              pageSize={peoplePagination.pageSize}
              totalItems={filtered.length}
              startIndex={peoplePagination.startIndex}
              endIndex={peoplePagination.endIndex}
              hasNext={peoplePagination.hasNext}
              hasPrev={peoplePagination.hasPrev}
              onPageChange={peoplePagination.setPage}
              onPageSizeChange={peoplePagination.setPageSize}
            />
          </CardContent>
        </Card>

        {/* Exit Dialog */}
        <Dialog open={exitDialogOpen} onOpenChange={setExitDialogOpen}>
          <DialogContent>
            <DialogHeader><DialogTitle>Set Exit Date</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">Set exit date for <strong>{exitPerson?.sales_name}</strong></p>
              <Input type="date" value={exitDate} onChange={e => setExitDate(e.target.value)} />
              {exitDate && exitPerson && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span>Contract Type:</span>
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                    getContractType(exitPerson.sales_channel_start, exitDate) === 'On Call'
                      ? 'bg-blue-100 text-blue-700' : 'bg-emerald-100 text-emerald-700'
                  }`}>
                    {getContractType(exitPerson.sales_channel_start, exitDate)}
                  </span>
                </div>
              )}
              <Button onClick={handleSetExit} className="w-full" variant="destructive">Confirm Exit</Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Smart Import Review Dialog */}
        {diffResult && (
          <ImportReviewDialog<ImportPeopleRow>
            open={reviewOpen}
            onOpenChange={(o) => { setReviewOpen(o); if (!o) setDiffResult(null); }}
            diff={diffResult}
            onImport={handleApprovedImport}
            title="People Import Review"
            getRowId={(r) => r.pers_id}
            getRowName={(r) => r.sales_name}
            getRowSearchText={(r) => `${r.pers_id} ${r.sales_name} ${r.sales_id || ''}`}
          />
        )}

        {exitsDiff && (
          <ExitsImportReviewDialog
            open={exitsReviewOpen}
            onOpenChange={(o) => { setExitsReviewOpen(o); if (!o) setExitsDiff(null); }}
            diff={exitsDiff}
            branches={branches}
            onImport={handleExitsImport}
          />
        )}
      </div>
    </AppLayout>
  );
}
