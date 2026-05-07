import { useEffect, useState, useRef } from 'react';
import { supabase } from '@/lib/backend';
import { AppLayout } from '@/components/layout/AppLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { UserPlus, Pencil, AlertTriangle, FileUp, CheckCircle2, Users, Zap, SearchCheck } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { parseEquipmentCsv, diffEquipmentRows, extractMissingPeopleFromEquipment, type ImportEquipmentRow, type DiffResult, type ExtractedPerson, type ParseStats } from '@/lib/import-parsers';
import { ImportSummaryCard } from '@/components/import/ImportSummaryCard';
import { ImportReviewDialog } from '@/components/import/ImportReviewDialog';
import { validateForm, priceSchema, phoneModelSchema, tabletModelSchema, createUserSchema } from '@/lib/validation';
import { logAudit } from '@/lib/audit';
import { logger } from '@/lib/logger';
import type { Branch, EquipmentPrice, PhoneModel, TabletModel } from '@/types';
import { readWorkbook, sheetToJson } from '@/lib/excel-reader';
import { DebtFollowupImportTab } from '@/components/import/DebtFollowupImportTab';

export default function Settings() {
  const { toast } = useToast();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [prices, setPrices] = useState<EquipmentPrice[]>([]);
  const [phoneModels, setPhoneModels] = useState<PhoneModel[]>([]);
  const [tabletModels, setTabletModels] = useState<TabletModel[]>([]);
  const [users, setUsers] = useState<any[]>([]);

  // Price form
  const [priceDialog, setPriceDialog] = useState(false);
  const [priceForm, setPriceForm] = useState({ id: '', category: 'demobox', item_name: '', price: '' });

  // Phone model form
  const [phoneDialog, setPhoneDialog] = useState(false);
  const [phoneForm, setPhoneForm] = useState({ id: '', name: '', price: '', price_confirmed: true });

  // Tablet model form
  const [tabletDialog, setTabletDialog] = useState(false);
  const [tabletForm, setTabletForm] = useState({ id: '', name: '', price: '', price_confirmed: true });

  // User form
  const [userDialog, setUserDialog] = useState(false);
  const [userForm, setUserForm] = useState({ email: '', password: '', full_name: '', role: 'sbc', branch_id: '' });

  // Equipment import — diff-driven
  const [eqDiffResult, setEqDiffResult] = useState<DiffResult<ImportEquipmentRow> | null>(null);
  const [eqReviewOpen, setEqReviewOpen] = useState(false);
  const [eqParsing, setEqParsing] = useState(false);
  const [eqPersMap, setEqPersMap] = useState<Map<string, string>>(new Map());
  const eqFileRef = useRef<HTMLInputElement>(null);
  const [eqImportMode, setEqImportMode] = useState<'quick' | 'full' | null>(null);

  // Two-phase: missing people resolution
  const [missingPeople, setMissingPeople] = useState<ExtractedPerson[]>([]);
  const [missingPeopleOpen, setMissingPeopleOpen] = useState(false);
  const [missingPeopleCreating, setMissingPeopleCreating] = useState(false);
  const [creatingProgress, setCreatingProgress] = useState({ current: 0, total: 0, created: 0, failed: 0, status: '' });
  const [pendingParsedRows, setPendingParsedRows] = useState<ImportEquipmentRow[]>([]);
  const [pendingRawRows, setPendingRawRows] = useState<Record<string, any>[]>([]);
  const [eqParseStats, setEqParseStats] = useState<ParseStats | null>(null);
  const [eqFileName, setEqFileName] = useState('');
  const [missingPeopleResolved, setMissingPeopleResolved] = useState(false);

  const fetchAll = async () => {
    const [bRes, pRes, pmRes, tmRes, uRes] = await Promise.all([
      supabase.from('branches').select('*').order('district_code'),
      supabase.from('equipment_prices').select('*').order('category, item_name'),
      supabase.from('phone_models').select('*').order('name'),
      supabase.from('tablet_models').select('*').order('name'),
      supabase.from('profiles').select('*, user_roles(role)'),
    ]);
    setBranches((bRes.data ?? []) as Branch[]);
    setPrices((pRes.data ?? []) as EquipmentPrice[]);
    setPhoneModels((pmRes.data ?? []) as PhoneModel[]);
    setTabletModels((tmRes.data ?? []) as TabletModel[]);
    setUsers(uRes.data || []);
  };

  useEffect(() => { fetchAll(); }, []);

  const handleSavePrice = async () => {
    const priceNum = parseFloat(priceForm.price);
    const validation = validateForm(priceSchema, { category: priceForm.category, item_name: priceForm.item_name, price: isNaN(priceNum) ? priceForm.price : priceNum });
    if (!validation.success) { toast({ title: 'Validation Error', description: (validation as any).error, variant: 'destructive' }); return; }
    const data = { category: priceForm.category, item_name: priceForm.item_name, price: priceNum, active: true };
    const isEdit = !!priceForm.id;
    const { error } = isEdit
      ? await supabase.from('equipment_prices').update(data).eq('id', priceForm.id)
      : await supabase.from('equipment_prices').insert(data);
    if (error) toast({ title: 'Error', description: error.message, variant: 'destructive' });
    else {
      toast({ title: 'Saved' }); setPriceDialog(false); fetchAll();
      logAudit(isEdit ? 'update' : 'create', 'equipment_price', priceForm.id || 'new', { item_name: priceForm.item_name, price: priceNum, category: priceForm.category });
    }
  };

  const handleSavePhone = async () => {
    const priceNum = parseFloat(phoneForm.price);
    const validation = validateForm(phoneModelSchema, { name: phoneForm.name, price: isNaN(priceNum) ? phoneForm.price : priceNum, price_confirmed: phoneForm.price_confirmed });
    if (!validation.success) { toast({ title: 'Validation Error', description: (validation as any).error, variant: 'destructive' }); return; }
    const data = { name: phoneForm.name, price: priceNum, active: true, price_confirmed: phoneForm.price_confirmed };
    const isEdit = !!phoneForm.id;
    const { error } = isEdit
      ? await supabase.from('phone_models').update(data).eq('id', phoneForm.id)
      : await supabase.from('phone_models').insert(data);
    if (error) toast({ title: 'Error', description: error.message, variant: 'destructive' });
    else {
      toast({ title: 'Saved' }); setPhoneDialog(false); fetchAll();
      logAudit(isEdit ? 'update' : 'create', 'phone_model', phoneForm.id || 'new', { name: phoneForm.name, price: priceNum });
    }
  };

  const handleSaveTablet = async () => {
    const priceNum = parseFloat(tabletForm.price);
    const validation = validateForm(tabletModelSchema, { name: tabletForm.name, price: isNaN(priceNum) ? tabletForm.price : priceNum, price_confirmed: tabletForm.price_confirmed });
    if (!validation.success) { toast({ title: 'Validation Error', description: (validation as any).error, variant: 'destructive' }); return; }
    const data = { name: tabletForm.name, price: priceNum, active: true, price_confirmed: tabletForm.price_confirmed };
    const isEdit = !!tabletForm.id;
    const { error } = isEdit
      ? await supabase.from('tablet_models').update(data).eq('id', tabletForm.id)
      : await supabase.from('tablet_models').insert(data);
    if (error) toast({ title: 'Error', description: error.message, variant: 'destructive' });
    else {
      toast({ title: 'Saved' }); setTabletDialog(false); fetchAll();
      logAudit(isEdit ? 'update' : 'create', 'tablet_model', tabletForm.id || 'new', { name: tabletForm.name, price: priceNum });
    }
  };

  const handleCreateUser = async () => {
    const validation = validateForm(createUserSchema, userForm);
    if (!validation.success) { toast({ title: 'Validation Error', description: (validation as any).error, variant: 'destructive' }); return; }

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { toast({ title: 'Error', description: 'Not authenticated', variant: 'destructive' }); return; }

      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const response = await fetch(`${supabaseUrl}/functions/v1/create-user`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          ...userForm,
          ...(userForm.role === 'admin' ? { confirm_admin: true } : {}),
        }),
      });

      const result = await response.json();
      if (!response.ok) {
        toast({ title: 'Error', description: result.error || 'Failed to create user', variant: 'destructive' });
        return;
      }

      toast({ title: 'User created', description: `${userForm.email} created with role ${userForm.role}` });
      logAudit('create', 'user', result.user_id || 'new', { email: userForm.email, role: userForm.role });
      setUserDialog(false);
      setUserForm({ email: '', password: '', full_name: '', role: 'sbc', branch_id: '' });
      fetchAll();
    } catch (err) {
      logger.error('User creation error:', err);
      toast({ title: 'Error', description: 'Failed to create user', variant: 'destructive' });
    }
  };

  // Paginated fetch to avoid 1000-row Supabase limit
  const fetchAllPeople = async (): Promise<{ id: string; pers_id: string }[]> => {
    const all: { id: string; pers_id: string }[] = [];
    const PAGE = 1000;
    let from = 0;
    while (true) {
      const { data } = await supabase.from('people').select('id, pers_id').range(from, from + PAGE - 1);
      if (!data || data.length === 0) break;
      all.push(...data);
      if (data.length < PAGE) break;
      from += PAGE;
    }
    return all;
  };

  const fetchAllHashes = async (): Promise<string[]> => {
    const all: string[] = [];
    const PAGE = 1000;
    let from = 0;
    while (true) {
      const { data } = await supabase.from('equipment_transactions').select('source_row_hash').not('source_row_hash', 'is', null).range(from, from + PAGE - 1);
      if (!data || data.length === 0) break;
      all.push(...data.map(r => r.source_row_hash as string));
      if (data.length < PAGE) break;
      from += PAGE;
    }
    return all;
  };

  const ALLOWED_MIME_TYPES = [
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/csv',
    'application/vnd.ms-excel',
  ];

  const handleEquipmentImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // MIME/extension validation
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (!ALLOWED_MIME_TYPES.includes(file.type) && !['xlsx', 'csv', 'xls'].includes(ext || '')) {
      toast({ title: 'Invalid file type', description: 'Only .xlsx, .csv, and .xls files are accepted', variant: 'destructive' });
      logAudit('import_failed', 'equipment_transactions', 'rejected', { filename: file.name, reason: 'invalid_mime', mime: file.type });
      e.target.value = '';
      return;
    }

    // File size limit: 10MB
    if (file.size > 10 * 1024 * 1024) {
      toast({ title: 'File too large', description: 'Maximum file size is 10MB', variant: 'destructive' });
      logAudit('import_failed', 'equipment_transactions', 'rejected', { filename: file.name, reason: 'file_too_large', size: file.size });
      e.target.value = '';
      return;
    }

    setEqParsing(true);
    setEqImportMode(null);

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        let rawRows: Record<string, any>[];
        const data = new Uint8Array(evt.target?.result as ArrayBuffer);
        if (file.name.endsWith('.csv')) {
          const text = new TextDecoder().decode(data);
          const wb = await readWorkbook(text, { format: 'csv' });
          rawRows = sheetToJson<Record<string, any>>(wb.getSheet(wb.sheetNames[0]), { defval: '' });
        } else {
          const wb = await readWorkbook(data, { format: 'xlsx' });
          rawRows = sheetToJson<Record<string, any>>(wb.getSheet(wb.sheetNames[0]), { defval: '' });
        }

        const { rows: parsed, stats } = parseEquipmentCsv(rawRows);
        setEqParseStats(stats);
        setEqFileName(file.name);

        if (parsed.length === 0) {
          toast({ title: 'No valid equipment rows found', variant: 'destructive' });
          setEqParsing(false);
          return;
        }
        if (parsed.length > 50000) {
          toast({ title: 'File too large', description: `${parsed.length.toLocaleString()} rows exceeds the 50,000-row limit per import. Please split the file and import in parts.`, variant: 'destructive' });
          logAudit('import_failed', 'equipment_transactions', 'rejected', { filename: file.name, reason: 'too_many_rows', row_count: parsed.length });
          setEqParsing(false);
          return;
        }

        // Error threshold: if >20% of raw rows were unparseable, abort
        const errorRate = (stats.skippedNoPersId + stats.skippedNoDate) / stats.totalRawRows;
        if (errorRate > 0.2 && stats.totalRawRows > 10) {
          toast({ title: 'Too many errors', description: `${Math.round(errorRate * 100)}% of rows failed validation. Please check the file format.`, variant: 'destructive' });
          logAudit('import_failed', 'equipment_transactions', 'rejected', { filename: file.name, reason: 'error_threshold', error_rate: errorRate, total: stats.totalRawRows });
          setEqParsing(false);
          return;
        }

        // Fetch people and check for missing ones
        const allPeople = await fetchAllPeople();
        const existingPersIds = new Set(allPeople.map(p => String(p.pers_id).trim()));
        const missing = extractMissingPeopleFromEquipment(rawRows, existingPersIds, branches);

        if (missing.length > 0) {
          setMissingPeople(missing);
          setPendingParsedRows(parsed);
          setPendingRawRows(rawRows);
          setMissingPeopleOpen(true);
          setMissingPeopleResolved(false);
          setEqParsing(false);
        } else {
          setMissingPeopleResolved(true);
          // Store parsed rows and show mode selector
          setPendingParsedRows(parsed);
          setEqParsing(false);
        }
      } catch (err) {
        logger.error('Equipment import error:', err);
        toast({ title: 'Error reading equipment file', variant: 'destructive' });
        setEqParsing(false);
      }
    };
    reader.readAsArrayBuffer(file);
    e.target.value = '';
  };

  const handleSelectImportMode = async (mode: 'quick' | 'full') => {
    setEqImportMode(mode);
    setEqParsing(true);
    const parsed = pendingParsedRows.length > 0 ? pendingParsedRows : [];
    if (parsed.length === 0) { setEqParsing(false); return; }
    await runEquipmentDiff(parsed, undefined, mode);
    setEqParsing(false);
  };

  const runEquipmentDiff = async (parsed: ImportEquipmentRow[], allPeople?: { id: string; pers_id: string }[], mode: 'quick' | 'full' = 'full') => {
    if (!allPeople) allPeople = await fetchAllPeople();
    const persMap = new Map(allPeople.map(p => [String(p.pers_id).trim(), p.id]));
    setEqPersMap(persMap);

    if (mode === 'quick') {
      // Quick mode: skip fetchAllHashes entirely — rely on DB upsert for dedup
      // All parsed rows treated as "new"; duplicates silently skipped by upsert+ignoreDuplicates
      const diff: DiffResult<ImportEquipmentRow> = {
        newRows: parsed,
        modifiedRows: [],
        unchangedRows: [],
        warningRows: [],
        errorRows: [],
      };
      setEqDiffResult(diff);
      setEqReviewOpen(true);
    } else {
      // Full mode: complete diff with unchanged/modified detection
      const allHashes = await fetchAllHashes();
      const existingHashes = new Set(allHashes);
      const diff = diffEquipmentRows(parsed, existingHashes, persMap);
      setEqDiffResult(diff);
      setEqReviewOpen(true);
    }
  };

  const handleCreateMissingPeople = async () => {
    setMissingPeopleCreating(true);
    let created = 0;
    let failed = 0;
    const BATCH = 50;
    const total = missingPeople.length;
    setCreatingProgress({ current: 0, total, created: 0, failed: 0, status: 'Preparing records...' });

    try {
      for (let i = 0; i < missingPeople.length; i += BATCH) {
        const batchSlice = missingPeople.slice(i, i + BATCH);
        const batchNum = Math.floor(i / BATCH) + 1;
        const totalBatches = Math.ceil(total / BATCH);
        setCreatingProgress(p => ({ ...p, current: i, status: `Inserting batch ${batchNum} of ${totalBatches}...` }));

        const batch = batchSlice.map(p => ({
          pers_id: p.pers_id,
          sales_id: p.sales_id,
          sales_name: p.sales_name,
          branch_id: p.branch_id,
          branch_name: p.branch_name,
          contract_type: 'Unknown',
          source: 'equipment_historical_import',
        }));
        const { error } = await supabase.from('people').insert(batch);
        if (error) {
          logger.error('Batch people insert error:', error);
          setCreatingProgress(p => ({ ...p, status: `Retrying batch ${batchNum} individually...` }));
          for (const person of batch) {
            const { error: rowErr } = await supabase.from('people').insert(person);
            if (rowErr) {
              failed++;
              logger.error(`Person insert error (${person.pers_id}):`, rowErr);
            } else {
              created++;
            }
            setCreatingProgress(p => ({ ...p, current: p.current + 1, created, failed }));
          }
        } else {
          created += batchSlice.length;
          setCreatingProgress(p => ({ ...p, current: i + batchSlice.length, created, failed }));
        }
      }

      setCreatingProgress(p => ({ ...p, current: total, status: failed > 0 ? `Done — ${failed} failed` : 'All created successfully!' }));

      // Brief pause to show final state
      await new Promise(r => setTimeout(r, 1200));

      toast({
        title: `Created ${created} people`,
        description: failed > 0 ? `${failed} failed` : 'All people created successfully',
        variant: failed > 0 ? 'destructive' : 'default',
      });

      setMissingPeopleOpen(false);
      setMissingPeople([]);
      setMissingPeopleResolved(true);
    } catch (err: any) {
      logger.error('Unexpected error creating people:', err);
      setCreatingProgress(p => ({ ...p, status: `Error: ${err?.message || 'Unexpected failure'}` }));
    } finally {
      setMissingPeopleCreating(false);
      // Don't auto-run diff — let the mode selector handle it
    }
  };

  const handleSkipMissingPeople = async () => {
    setMissingPeopleOpen(false);
    setMissingPeople([]);
    // Don't auto-run diff — let the mode selector handle it
  };

  // Sub-batch bisection: when a batch upsert fails, split in half and retry
  // to isolate bad rows in O(log n) steps instead of retrying each row individually.
  const bisectFailedBatch = async (
    batch: ImportEquipmentRow[],
    persMap: Map<string, string>,
    batchId: string,
    depth: number,
  ): Promise<{ inserted: number; failed: number; failedRows: { row: ImportEquipmentRow; reason: string }[] }> => {
    const MAX_DEPTH = 4; // min granularity ~31 rows from 500

    if (batch.length === 0) return { inserted: 0, failed: 0, failedRows: [] };

    // At max depth, attempt one final upsert to capture the real DB error
    if (depth >= MAX_DEPTH || batch.length === 1) {
      const toInsert = batch.map(row => ({
        person_id: persMap.get(row.person_pers_id)!,
        transaction_type: row.transaction_type,
        transaction_date: row.transaction_date,
        phone: row.phone, phone_details: row.phone_details,
        tablet: row.tablet, tablet_details: row.tablet_details,
        demobox: row.demobox, demobox_details: row.demobox_details,
        clothing: row.clothing, clothing_details: row.clothing_details,
        toolkit: row.toolkit, toolkit_details: row.toolkit_details,
        izettle: row.izettle, izettle_details: row.izettle_details,
        sales_binder: row.sales_binder, id_card: row.id_card, access_pass: row.access_pass,
        sbc_name: row.sbc_name,
        source_system: 'moreapp',
        source_row_hash: row._hash,
        import_batch_id: batchId,
        imported_at: new Date().toISOString(),
      }));
      const { error } = await supabase.from('equipment_transactions')
        .upsert(toInsert, { onConflict: 'source_row_hash', ignoreDuplicates: true });
      const reason = error?.message || 'Failed to insert (isolated via batch bisection)';
      return {
        inserted: error ? 0 : batch.length,
        failed: error ? batch.length : 0,
        failedRows: error ? batch.map(r => ({ row: r, reason })) : [],
      };
    }

    const mid = Math.ceil(batch.length / 2);
    const left = batch.slice(0, mid);
    const right = batch.slice(mid);

    const tryHalf = async (half: ImportEquipmentRow[]) => {
      const toInsert = half.map(row => ({
        person_id: persMap.get(row.person_pers_id)!,
        transaction_type: row.transaction_type,
        transaction_date: row.transaction_date,
        phone: row.phone, phone_details: row.phone_details,
        tablet: row.tablet, tablet_details: row.tablet_details,
        demobox: row.demobox, demobox_details: row.demobox_details,
        clothing: row.clothing, clothing_details: row.clothing_details,
        toolkit: row.toolkit, toolkit_details: row.toolkit_details,
        izettle: row.izettle, izettle_details: row.izettle_details,
        sales_binder: row.sales_binder, id_card: row.id_card, access_pass: row.access_pass,
        sbc_name: row.sbc_name,
        source_system: 'moreapp',
        source_row_hash: row._hash,
        import_batch_id: batchId,
        imported_at: new Date().toISOString(),
      }));
      const { error } = await supabase.from('equipment_transactions')
        .upsert(toInsert, { onConflict: 'source_row_hash', ignoreDuplicates: true });
      if (error) {
        // Recurse deeper
        return bisectFailedBatch(half, persMap, batchId, depth + 1);
      }
      return { inserted: half.length, failed: 0, failedRows: [] as { row: ImportEquipmentRow; reason: string }[] };
    };

    const [leftResult, rightResult] = await Promise.all([tryHalf(left), tryHalf(right)]);
    return {
      inserted: leftResult.inserted + rightResult.inserted,
      failed: leftResult.failed + rightResult.failed,
      failedRows: [...leftResult.failedRows, ...rightResult.failedRows],
    };
  };

  const handleEquipmentApprovedImport = async (
    rows: ImportEquipmentRow[],
    _isNew: boolean[],
    onProgress?: (p: Partial<{ status: string; current: number; total: number; inserted: number; skipped: number; failed: number }>) => void,
  ): Promise<{ success: number; errors: number; failedRows?: { row: ImportEquipmentRow; reason: string }[] }> => {
    let success = 0;
    let errors = 0;
    const failedRows: { row: ImportEquipmentRow; reason: string }[] = [];
    const BATCH = 500;
    const batchId = crypto.randomUUID();

    // Deduplicate within file by hash
    const seen = new Set<string>();
    const deduped = rows.filter(r => {
      if (seen.has(r._hash)) return false;
      seen.add(r._hash);
      return true;
    });

    // Validate person_id before batching — rows with unmapped pers_id fail immediately
    const validRows = deduped.filter(r => eqPersMap.has(r.person_pers_id));
    const invalidRows = deduped.filter(r => !eqPersMap.has(r.person_pers_id));
    invalidRows.forEach(r => {
      failedRows.push({ row: r, reason: `Person not found in database: pers_id "${r.person_pers_id}"` });
    });
    errors += invalidRows.length;

    const totalBatches = Math.ceil(validRows.length / BATCH);
    onProgress?.({ total: deduped.length, current: 0, inserted: 0, failed: errors, skipped: 0, status: invalidRows.length > 0 ? `${invalidRows.length} rows skipped (unknown pers_id)...` : 'Starting import...' });

    try {
      for (let i = 0; i < validRows.length; i += BATCH) {
        const batchNum = Math.floor(i / BATCH) + 1;
        onProgress?.({ status: `Processing batch ${batchNum} of ${totalBatches}...`, current: invalidRows.length + i });

        const batch = validRows.slice(i, i + BATCH);
        const toInsert = batch.map(row => ({
          person_id: eqPersMap.get(row.person_pers_id)!,
          transaction_type: row.transaction_type,
          transaction_date: row.transaction_date,
          phone: row.phone,
          phone_details: row.phone_details,
          tablet: row.tablet,
          tablet_details: row.tablet_details,
          demobox: row.demobox,
          demobox_details: row.demobox_details,
          clothing: row.clothing,
          clothing_details: row.clothing_details,
          toolkit: row.toolkit,
          toolkit_details: row.toolkit_details,
          izettle: row.izettle,
          izettle_details: row.izettle_details,
          sales_binder: row.sales_binder,
          id_card: row.id_card,
          access_pass: row.access_pass,
          sbc_name: row.sbc_name,
          source_system: 'moreapp',
          source_row_hash: row._hash,
          import_batch_id: batchId,
          imported_at: new Date().toISOString(),
        }));

        // Use upsert with ignoreDuplicates — duplicates silently skipped by DB
        const { error } = await supabase
          .from('equipment_transactions')
          .upsert(toInsert, { onConflict: 'source_row_hash', ignoreDuplicates: true });

        if (error) {
          logger.error(`Eq batch ${batchNum} upsert error:`, error);
          // Bisect to isolate bad rows — O(log n) instead of O(n) row-by-row
          const bisectResults = await bisectFailedBatch(batch, eqPersMap, batchId, 0);
          success += bisectResults.inserted;
          errors += bisectResults.failed;
          failedRows.push(...bisectResults.failedRows);
        } else {
          success += batch.length;
        }
        onProgress?.({ current: invalidRows.length + i + batch.length, inserted: success, failed: errors, skipped: rows.length - deduped.length });
      }
    } catch (err: any) {
      logger.error('Equipment import unexpected error:', err);
      const processed = success + errors - invalidRows.length;
      for (let k = processed; k < validRows.length; k++) {
        errors++;
        failedRows.push({ row: deduped[k], reason: err?.message || 'Unexpected error' });
      }
    }

    // For quick mode, get actual insert count using import_batch_id (concurrency-safe)
    if (eqImportMode === 'quick') {
      const { count: actualInserted } = await supabase
        .from('equipment_transactions')
        .select('*', { count: 'exact', head: true })
        .eq('import_batch_id', batchId);
      const realInserted = actualInserted ?? success;
      const skippedByDb = deduped.length - realInserted - errors;
      onProgress?.({ current: deduped.length, inserted: realInserted, failed: errors, skipped: Math.max(0, skippedByDb), status: 'Complete' });
      logAudit('import', 'equipment_transactions', batchId, { filename: eqFileName, total_rows: rows.length, inserted: realInserted, failed: errors, mode: 'quick' });
      return { success: realInserted, errors, failedRows: failedRows.length > 0 ? failedRows : undefined };
    }

    onProgress?.({ current: deduped.length, inserted: success, failed: errors, skipped: rows.length - deduped.length, status: 'Complete' });
    logAudit('import', 'equipment_transactions', batchId, { filename: eqFileName, total_rows: rows.length, inserted: success, failed: errors, mode: 'full' });
    return { success, errors, failedRows: failedRows.length > 0 ? failedRows : undefined };
  };

  return (
    <AppLayout allowedRoles={['admin']}>
      <div className="space-y-6">
        <PageHeader title="Settings" description="Configure the system" />

        <Tabs defaultValue="prices" className="space-y-4">
          <TabsList className="flex-wrap">
            <TabsTrigger value="prices">Equipment Prices</TabsTrigger>
            <TabsTrigger value="phones">Phone Models</TabsTrigger>
            <TabsTrigger value="tablets">Tablet Models</TabsTrigger>
            <TabsTrigger value="branches">Branches</TabsTrigger>
            <TabsTrigger value="users">Users</TabsTrigger>
            <TabsTrigger value="equipment-import">Historical Data Import</TabsTrigger>
            <TabsTrigger value="debt-import">Debt Follow-up Import</TabsTrigger>
          </TabsList>

          {/* Equipment Prices */}
          <TabsContent value="prices">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-lg">Equipment Prices</CardTitle>
                <Dialog open={priceDialog} onOpenChange={v => { setPriceDialog(v); if (!v) setPriceForm({ id: '', category: 'demobox', item_name: '', price: '' }); }}>
                  <DialogTrigger asChild><Button size="sm">Add Price</Button></DialogTrigger>
                  <DialogContent>
                    <DialogHeader><DialogTitle>{priceForm.id ? 'Edit' : 'Add'} Price</DialogTitle></DialogHeader>
                    <div className="space-y-3">
                      <div>
                        <Label>Category</Label>
                        <Select value={priceForm.category} onValueChange={v => setPriceForm(f => ({ ...f, category: v }))}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="demobox">Demobox</SelectItem>
                            <SelectItem value="clothing">Clothing</SelectItem>
                            <SelectItem value="toolkit">Toolkit</SelectItem>
                            <SelectItem value="other">Other</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div><Label>Item Name</Label><Input value={priceForm.item_name} onChange={e => setPriceForm(f => ({ ...f, item_name: e.target.value }))} /></div>
                      <div><Label>Price (€)</Label><Input type="number" step="0.01" value={priceForm.price} onChange={e => setPriceForm(f => ({ ...f, price: e.target.value }))} /></div>
                      <Button onClick={handleSavePrice} className="w-full">Save</Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Category</TableHead>
                      <TableHead>Item</TableHead>
                      <TableHead className="text-right">Price</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {prices.map(p => (
                      <TableRow key={p.id}>
                        <TableCell className="capitalize text-sm">{p.category}</TableCell>
                        <TableCell className="text-sm">{p.item_name}</TableCell>
                        <TableCell className="text-right font-mono">€{Number(p.price).toFixed(2)}</TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="sm" onClick={() => { setPriceForm({ id: p.id, category: p.category, item_name: p.item_name, price: String(p.price) }); setPriceDialog(true); }}>
                            <Pencil className="h-3 w-3" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Phone Models */}
          <TabsContent value="phones">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-lg">Phone Models</CardTitle>
                <Dialog open={phoneDialog} onOpenChange={v => { setPhoneDialog(v); if (!v) setPhoneForm({ id: '', name: '', price: '', price_confirmed: true }); }}>
                  <DialogTrigger asChild><Button size="sm">Add Model</Button></DialogTrigger>
                  <DialogContent>
                    <DialogHeader><DialogTitle>{phoneForm.id ? 'Edit' : 'Add'} Phone Model</DialogTitle></DialogHeader>
                    <div className="space-y-3">
                      <div><Label>Model Name</Label><Input value={phoneForm.name} onChange={e => setPhoneForm(f => ({ ...f, name: e.target.value }))} /></div>
                      <div><Label>Debt Price (€)</Label><Input type="number" step="0.01" value={phoneForm.price} onChange={e => setPhoneForm(f => ({ ...f, price: e.target.value }))} /></div>
                      <div className="flex items-center gap-2">
                        <Checkbox id="phone-confirmed" checked={phoneForm.price_confirmed} onCheckedChange={v => setPhoneForm(f => ({ ...f, price_confirmed: !!v }))} />
                        <Label htmlFor="phone-confirmed">Price confirmed</Label>
                      </div>
                      <Button onClick={handleSavePhone} className="w-full">Save</Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Model</TableHead>
                      <TableHead className="text-right">Debt Price</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {phoneModels.map(m => {
                      const pending = !m.price_confirmed;
                      return (
                      <TableRow key={m.id}>
                        <TableCell className="text-sm">
                          <div className="flex items-center gap-1.5">
                            {m.name}
                           {pending && <span title="Price pending confirmation"><AlertTriangle className="h-3.5 w-3.5 text-amber-500" /></span>}
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-mono">€{Number(m.price).toFixed(2)}</TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="sm" onClick={() => { setPhoneForm({ id: m.id, name: m.name, price: String(m.price), price_confirmed: m.price_confirmed }); setPhoneDialog(true); }}>
                            <Pencil className="h-3 w-3" />
                          </Button>
                        </TableCell>
                      </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Tablet Models */}
          <TabsContent value="tablets">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-lg">Tablet Models</CardTitle>
                <Dialog open={tabletDialog} onOpenChange={v => { setTabletDialog(v); if (!v) setTabletForm({ id: '', name: '', price: '', price_confirmed: true }); }}>
                  <DialogTrigger asChild><Button size="sm">Add Model</Button></DialogTrigger>
                  <DialogContent>
                    <DialogHeader><DialogTitle>{tabletForm.id ? 'Edit' : 'Add'} Tablet Model</DialogTitle></DialogHeader>
                    <div className="space-y-3">
                      <div><Label>Model Name</Label><Input value={tabletForm.name} onChange={e => setTabletForm(f => ({ ...f, name: e.target.value }))} /></div>
                      <div><Label>Debt Price (€)</Label><Input type="number" step="0.01" value={tabletForm.price} onChange={e => setTabletForm(f => ({ ...f, price: e.target.value }))} /></div>
                      <div className="flex items-center gap-2">
                        <Checkbox id="tablet-confirmed" checked={tabletForm.price_confirmed} onCheckedChange={v => setTabletForm(f => ({ ...f, price_confirmed: !!v }))} />
                        <Label htmlFor="tablet-confirmed">Price confirmed</Label>
                      </div>
                      <Button onClick={handleSaveTablet} className="w-full">Save</Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Model</TableHead>
                      <TableHead className="text-right">Debt Price</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {tabletModels.map(m => {
                      const pending = !m.price_confirmed;
                      return (
                      <TableRow key={m.id}>
                        <TableCell className="text-sm">
                          <div className="flex items-center gap-1.5">
                            {m.name}
                            {pending && <span title="Price pending confirmation"><AlertTriangle className="h-3.5 w-3.5 text-amber-500" /></span>}
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-mono">€{Number(m.price).toFixed(2)}</TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="sm" onClick={() => { setTabletForm({ id: m.id, name: m.name, price: String(m.price), price_confirmed: m.price_confirmed }); setTabletDialog(true); }}>
                            <Pencil className="h-3 w-3" />
                          </Button>
                        </TableCell>
                      </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Branches */}
          <TabsContent value="branches">
            <Card>
              <CardHeader><CardTitle className="text-lg">Branches</CardTitle></CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>ID</TableHead>
                      <TableHead>District Code</TableHead>
                      <TableHead>Name</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {branches.map(b => (
                      <TableRow key={b.id}>
                        <TableCell className="font-mono text-sm">{b.id}</TableCell>
                        <TableCell className="text-sm">{b.district_code}</TableCell>
                        <TableCell className="text-sm">{b.name}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Users */}
          <TabsContent value="users">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-lg">Users</CardTitle>
                <Dialog open={userDialog} onOpenChange={setUserDialog}>
                  <DialogTrigger asChild><Button size="sm"><UserPlus className="h-4 w-4 mr-1" /> Create User</Button></DialogTrigger>
                  <DialogContent>
                    <DialogHeader><DialogTitle>Create User</DialogTitle></DialogHeader>
                    <div className="space-y-3">
                      <div><Label>Email</Label><Input type="email" value={userForm.email} onChange={e => setUserForm(f => ({ ...f, email: e.target.value }))} /></div>
                      <div><Label>Password</Label><Input type="password" value={userForm.password} onChange={e => setUserForm(f => ({ ...f, password: e.target.value }))} /></div>
                      <div><Label>Full Name</Label><Input value={userForm.full_name} onChange={e => setUserForm(f => ({ ...f, full_name: e.target.value }))} /></div>
                      <div>
                        <Label>Role</Label>
                        <Select value={userForm.role} onValueChange={v => setUserForm(f => ({ ...f, role: v }))}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="admin">Admin</SelectItem>
                            <SelectItem value="data_manager">Data Manager</SelectItem>
                            <SelectItem value="sbc">SBC</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <Button onClick={handleCreateUser} className="w-full">Create User</Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {users.map(u => (
                      <TableRow key={u.id}>
                        <TableCell className="font-medium">{u.full_name}</TableCell>
                        <TableCell className="text-sm">{u.email}</TableCell>
                        <TableCell className="text-sm capitalize">{u.user_roles?.[0]?.role?.replace('_', ' ') || 'No role'}</TableCell>
                        <TableCell>{u.active ? <span className="text-green-600 text-sm">Active</span> : <span className="text-muted-foreground text-sm">Inactive</span>}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="equipment-import">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Historical Data Import</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Upload MoreApp equipment CSV or Excel export for diff-driven review before importing
                </p>
              </CardHeader>
              <CardContent>
                <input ref={eqFileRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={handleEquipmentImport} />
                <Button
                  variant="outline"
                  className="w-full h-28 border-dashed"
                  onClick={() => eqFileRef.current?.click()}
                  disabled={eqParsing}
                >
                  <div className="flex flex-col items-center gap-2">
                    <FileUp className="h-8 w-8 text-muted-foreground" />
                    <span className="text-sm font-medium">
                      {eqParsing ? 'Analyzing file...' : 'Upload Equipment CSV or Excel'}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      Smart diff — duplicates are detected and skipped automatically
                    </span>
                  </div>
                </Button>
              </CardContent>
            </Card>

            {/* Import Mode Selector — shown after file parse when no missing people or after resolution */}
            {eqParseStats && pendingParsedRows.length > 0 && !eqDiffResult && !eqParsing && (missingPeopleResolved || missingPeople.length === 0) && (
              <Card className="mt-4">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Choose Import Mode</CardTitle>
                  <p className="text-sm text-muted-foreground">
                    How should we process the {pendingParsedRows.length.toLocaleString()} parsed rows?
                  </p>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Button
                      variant="outline"
                      className="h-auto py-4 px-4 flex flex-col items-start gap-1.5 text-left"
                      onClick={() => handleSelectImportMode('quick')}
                    >
                      <div className="flex items-center gap-2">
                        <Zap className="h-4 w-4 text-amber-500" />
                        <span className="font-medium">Quick Import — New Rows Only</span>
                      </div>
                      <span className="text-xs text-muted-foreground font-normal">
                        Import directly — duplicates are skipped automatically by the database. Fastest option.
                      </span>
                    </Button>
                    <Button
                      variant="outline"
                      className="h-auto py-4 px-4 flex flex-col items-start gap-1.5 text-left"
                      onClick={() => handleSelectImportMode('full')}
                    >
                      <div className="flex items-center gap-2">
                        <SearchCheck className="h-4 w-4 text-blue-500" />
                        <span className="font-medium">Full Review — Verify Everything</span>
                      </div>
                      <span className="text-xs text-muted-foreground font-normal">
                        Scan every row for changes and modifications. Thorough but slower.
                      </span>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Summary Card */}
            {eqParseStats && (
              <ImportSummaryCard<ImportEquipmentRow>
                stats={eqParseStats}
                diff={eqDiffResult}
                fileName={eqFileName}
                missingPeopleCount={missingPeople.length + creatingProgress.created}
                missingPeopleCreated={creatingProgress.created}
                missingPeopleSkipped={missingPeopleResolved ? 0 : 0}
                onReviewImport={() => setEqReviewOpen(true)}
                onResolveMissingPeople={missingPeople.length > 0 && !missingPeopleResolved ? () => setMissingPeopleOpen(true) : undefined}
                loading={eqParsing}
              />
            )}

            {/* Phase 1: Missing People Resolution Dialog */}
            <Dialog open={missingPeopleOpen} onOpenChange={(o) => { if (!o && !missingPeopleCreating) handleSkipMissingPeople(); }}>
              <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <Users className="h-5 w-5 text-amber-500" />
                    {missingPeople.length} People Not in Database
                  </DialogTitle>
                  <p className="text-sm text-muted-foreground">
                    These people are referenced in the equipment file but don't exist in your database yet. 
                    Create them now so their equipment records can be imported.
                  </p>
                </DialogHeader>
                {missingPeopleCreating ? (
                  <div className="space-y-4 py-4">
                    <Progress value={creatingProgress.total > 0 ? (creatingProgress.current / creatingProgress.total) * 100 : 0} className="h-2" />
                    <p className="text-sm text-center animate-pulse">{creatingProgress.status}</p>
                    <div className="flex justify-center gap-4">
                      <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-500/10 text-emerald-600 text-xs font-medium">
                        <CheckCircle2 className="h-3 w-3" /> {creatingProgress.created} created
                      </div>
                      {creatingProgress.failed > 0 && (
                        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-destructive/10 text-destructive text-xs font-medium">
                          <AlertTriangle className="h-3 w-3" /> {creatingProgress.failed} failed
                        </div>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground text-center">
                      {creatingProgress.current} of {creatingProgress.total} processed
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="flex-1 overflow-auto border rounded-md">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Pers ID</TableHead>
                            <TableHead>Name</TableHead>
                            <TableHead>Sales ID</TableHead>
                            <TableHead>Branch</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {missingPeople.slice(0, 100).map(p => (
                            <TableRow key={p.pers_id}>
                              <TableCell className="font-mono text-sm">{p.pers_id}</TableCell>
                              <TableCell className="text-sm">{p.sales_name}</TableCell>
                              <TableCell className="font-mono text-sm">{p.sales_id}</TableCell>
                              <TableCell className="text-sm">{p.branch_name || '—'}</TableCell>
                            </TableRow>
                          ))}
                          {missingPeople.length > 100 && (
                            <TableRow>
                              <TableCell colSpan={4} className="text-center text-sm text-muted-foreground">
                                ... and {missingPeople.length - 100} more
                              </TableCell>
                            </TableRow>
                          )}
                        </TableBody>
                      </Table>
                    </div>
                    <div className="flex gap-3 pt-2">
                      <Button variant="outline" className="flex-1" onClick={handleSkipMissingPeople}>
                        Skip — Import Without Them
                      </Button>
                      <Button className="flex-1" onClick={handleCreateMissingPeople}>
                        Create All {missingPeople.length} People
                      </Button>
                    </div>
                  </>
                )}
              </DialogContent>
            </Dialog>

            {eqDiffResult && (
              <ImportReviewDialog<ImportEquipmentRow>
                open={eqReviewOpen}
                onOpenChange={(o) => { setEqReviewOpen(o); if (!o) setEqDiffResult(null); }}
                diff={eqDiffResult}
                onImport={handleEquipmentApprovedImport}
                title="Equipment Import Review"
                getRowId={(r) => r._hash}
                getRowName={(r) => `${r.person_name} — ${r.transaction_type}`}
                getRowSearchText={(r) => `${r.person_pers_id} ${r.person_name} ${r.transaction_type}`}
                quickMode={eqImportMode === 'quick'}
              />
            )}
          </TabsContent>

          <TabsContent value="debt-import">
            <DebtFollowupImportTab />
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
