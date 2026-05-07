import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Upload, AlertTriangle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/lib/backend';
import { useAuth } from '@/contexts/AuthContext';
import { parseDebtFollowupCsv, hashRow, type DebtFollowupRow } from '@/lib/parsers/debt-followup-csv';
import { logAudit } from '@/lib/audit';

interface PreviewSummary {
  filename: string;
  total: number;
  newCases: number;
  toBackfill: number;
  existingSkipped: number;
  newPlaceholderPeople: number;
  errorRows: { row: number; reason: string }[];
  rows: DebtFollowupRow[];
  personByEmpId: Map<string, { id?: string; needsCreate: boolean; sales_name: string }>;
  existingHashes: Set<string>;
  backfillHashes: Set<string>;
}

export function DebtFollowupImportTab() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [summary, setSummary] = useState<PreviewSummary | null>(null);
  const [validationFailures, setValidationFailures] = useState<string[]>([]);

  const handleFile = async (file: File) => {
    setBusy(true);
    setSummary(null);
    setValidationFailures([]);
    try {
      const text = await file.text();
      const parsed = parseDebtFollowupCsv(text);
      if (parsed.rows.length === 0 && parsed.errors.length > 0 && parsed.errors[0].row === 0) {
        toast({ title: 'CSV invalid', description: parsed.errors[0].reason, variant: 'destructive' });
        return;
      }

      const empIds = Array.from(new Set(parsed.rows.map(r => r.empId)));
      const hashes = parsed.rows.map(r => r.rowHash);

      const [peopleRes, dupRes] = await Promise.all([
        supabase.from('people').select('id, pers_id, sales_name').in('pers_id', empIds),
        supabase.from('debt_cases').select('source_row_hash, frozen_engine_debt').in('source_row_hash', hashes),
      ]);

      const personByEmpId = new Map<string, { id?: string; needsCreate: boolean; sales_name: string }>();
      for (const r of parsed.rows) personByEmpId.set(r.empId, { needsCreate: true, sales_name: r.salesName });
      for (const p of peopleRes.data ?? []) personByEmpId.set(p.pers_id as string, { id: p.id, needsCreate: false, sales_name: p.sales_name });

      const existingHashes = new Set<string>();
      const backfillHashes = new Set<string>();
      for (const r of (dupRes.data ?? []) as any[]) {
        const hash = r.source_row_hash as string;
        existingHashes.add(hash);
        if (r.frozen_engine_debt == null) backfillHashes.add(hash);
      }

      const newCases = parsed.rows.filter(r => !existingHashes.has(r.rowHash)).length;
      const toBackfill = parsed.rows.filter(r => backfillHashes.has(r.rowHash)).length;
      const existingSkipped = parsed.rows.length - newCases - toBackfill;
      const newPlaceholderPeople = Array.from(personByEmpId.values()).filter(v => v.needsCreate).length;

      setSummary({
        filename: file.name,
        total: parsed.rows.length,
        newCases,
        toBackfill,
        existingSkipped,
        newPlaceholderPeople,
        errorRows: parsed.errors,
        rows: parsed.rows,
        personByEmpId,
        existingHashes,
        backfillHashes,
      });
    } catch (err) {
      toast({ title: 'Import failed', description: (err as Error).message, variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  const commit = async () => {
    if (!summary) return;
    setCommitting(true);
    setValidationFailures([]);
    try {
      // 1. Create missing placeholder people
      const newPeople = Array.from(summary.personByEmpId.entries()).filter(([, v]) => v.needsCreate);
      if (newPeople.length > 0) {
        const insert = newPeople.map(([empId, v]) => {
          const sampleDate = summary.rows.find(r => r.empId === empId)?.payrollDate ?? new Date().toISOString().slice(0, 10);
          return {
            pers_id: empId, sales_id: empId, sales_name: v.sales_name,
            exit_date: sampleDate, contract_type: 'Fixed Term',
            source: 'equipment_historical_import',
          };
        });
        const { data, error } = await supabase.from('people').insert(insert).select('id, pers_id');
        if (error) throw error;
        for (const p of data ?? []) {
          const cur = summary.personByEmpId.get(p.pers_id as string);
          if (cur) summary.personByEmpId.set(p.pers_id as string, { ...cur, id: p.id, needsCreate: false });
        }
      }

      // 2. Insert new debt_cases (skip existing hashes)
      const toInsertCases = summary.rows
        .filter(r => !summary.existingHashes.has(r.rowHash))
        .map(r => {
          const personId = summary.personByEmpId.get(r.empId)?.id;
          if (!personId) return null;
          return {
            person_id: personId,
            payroll_date_origin: r.payrollDate,
            initial_debt: r.initialDebt,
            exit_date: r.payrollDate,
            source: 'historical_import' as const,
            source_file: summary.filename,
            source_row_hash: r.rowHash,
            frozen_engine_debt: Number((r.currentAssetsDebt + r.adjustment).toFixed(2)),
            created_by: user?.id ?? null,
          };
        })
        .filter((x): x is NonNullable<typeof x> => x !== null);

      let insertedCases: { id: string; source_row_hash: string }[] = [];
      if (toInsertCases.length > 0) {
        const { data, error } = await supabase.from('debt_cases').insert(toInsertCases).select('id, source_row_hash');
        if (error) throw error;
        insertedCases = (data ?? []) as any;
      }
      const caseIdByHash = new Map(insertedCases.map(c => [c.source_row_hash, c.id]));

      // 2b. Backfill frozen_engine_debt on existing rows that lack it
      const backfillRows = summary.rows.filter(r => summary.backfillHashes.has(r.rowHash));
      let backfilled = 0;
      for (let i = 0; i < backfillRows.length; i += 50) {
        const chunk = backfillRows.slice(i, i + 50);
        await Promise.all(chunk.map(async r => {
          const value = Number((r.currentAssetsDebt + r.adjustment).toFixed(2));
          const { error } = await supabase
            .from('debt_cases')
            .update({ frozen_engine_debt: value })
            .eq('source_row_hash', r.rowHash)
            .is('frozen_engine_debt', null);
          if (!error) backfilled++;
        }));
      }

      // 3. Insert movements
      const movementsToInsert: any[] = [];
      for (const r of summary.rows) {
        const caseId = caseIdByHash.get(r.rowHash);
        if (!caseId) continue;
        if (r.payrollDeduction > 0) movementsToInsert.push({
          debt_case_id: caseId, movement_type: 'payroll_deduction', amount: r.payrollDeduction,
          occurred_on: r.payrollDate, source: 'historical_import',
          source_row_hash: hashRow([r.rowHash, 'pd']), created_by: user?.id ?? null,
        });
        if (r.refund > 0) movementsToInsert.push({
          debt_case_id: caseId, movement_type: 'refund', amount: r.refund,
          occurred_on: r.payrollDate, source: 'historical_import',
          source_row_hash: hashRow([r.rowHash, 'rf']), created_by: user?.id ?? null,
        });
        if (r.adjustment > 0) movementsToInsert.push({
          debt_case_id: caseId, movement_type: 'adjustment', amount: r.adjustment,
          occurred_on: r.payrollDate, source: 'historical_import',
          reason: 'Historical migration from PowerBI; original Current Debt Adjustment value',
          source_row_hash: hashRow([r.rowHash, 'aj']), created_by: user?.id ?? null,
        });
      }
      if (movementsToInsert.length > 0) {
        const { error } = await supabase.from('debt_movements').insert(movementsToInsert);
        if (error) throw error;
      }

      // 4. Validate 10 random rows
      const sampled = summary.rows.filter(r => caseIdByHash.has(r.rowHash))
        .sort(() => Math.random() - 0.5).slice(0, 10);
      const failures: string[] = [];
      for (const r of sampled) {
        const reconstructedTR = r.recoveredAssets + r.payrollDeduction - r.refund;
        const reconstructedTBF = Math.max(0, reconstructedTR - r.initialDebt);
        if (Math.abs(reconstructedTR - r.totalRecovered) > 0.02)
          failures.push(`Row ${r.sourceRowIndex} (${r.empId}): TR ${r.totalRecovered} vs reconstructed ${reconstructedTR.toFixed(2)}`);
        if (Math.abs(reconstructedTBF - r.toBeRefunded) > 0.02)
          failures.push(`Row ${r.sourceRowIndex} (${r.empId}): TBF ${r.toBeRefunded} vs reconstructed ${reconstructedTBF.toFixed(2)}`);
      }
      if (failures.length > 0) {
        setValidationFailures(failures);
        toast({ title: 'Imported with discrepancies', description: `${failures.length} validation issue(s).`, variant: 'destructive' });
      } else {
        toast({ title: 'Import complete', description: `${insertedCases.length} new, ${backfilled} backfilled, ${movementsToInsert.length} movement(s).` });
      }
      await logAudit('debt_followup.import', 'csv', summary.filename, {
        new_cases: insertedCases.length, backfilled, movements: movementsToInsert.length, validation_failures: failures.length,
      });
      if (backfilled > 0) {
        await logAudit('debt_followup.backfill_frozen', 'csv', summary.filename, { count: backfilled });
      }
      setSummary(null);
    } catch (err) {
      toast({ title: 'Commit failed', description: (err as Error).message, variant: 'destructive' });
    } finally {
      setCommitting(false);
    }
  };

  return (
    <Card>
      <CardHeader><CardTitle className="text-lg">Debt Follow-up CSV (legacy Power BI)</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Input
            type="file" accept=".csv,text/csv" disabled={busy || committing}
            onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
          />
          <p className="text-xs text-muted-foreground mt-2">
            Re-importing the same file is a no-op (rows are deduplicated by content hash).
          </p>
        </div>

        {busy && <div className="flex items-center gap-2 text-sm"><Loader2 className="h-4 w-4 animate-spin" /> Parsing…</div>}

        {summary && (
          <div className="space-y-3 border rounded-md p-4 bg-muted/30">
            <h4 className="font-semibold text-sm">{summary.filename} — preview</h4>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-sm">
              <div><div className="text-xs text-muted-foreground">Active rows</div><div className="font-semibold">{summary.total}</div></div>
              <div><div className="text-xs text-muted-foreground">New cases</div><div className="font-semibold text-primary">{summary.newCases}</div></div>
              <div><div className="text-xs text-muted-foreground">Backfill frozen_engine_debt</div><div className="font-semibold text-primary">{summary.toBackfill}</div></div>
              <div><div className="text-xs text-muted-foreground">Idempotent skips</div><div className="font-semibold">{summary.existingSkipped}</div></div>
              <div><div className="text-xs text-muted-foreground">New placeholder people</div><div className="font-semibold">{summary.newPlaceholderPeople}</div></div>
            </div>
            {summary.errorRows.length > 0 && (
              <div className="text-xs text-destructive flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 mt-0.5" />
                <div>
                  <div className="font-semibold">{summary.errorRows.length} unparseable row(s):</div>
                  <ul className="list-disc ml-4 max-h-24 overflow-auto">
                    {summary.errorRows.slice(0, 10).map(e => <li key={e.row}>Row {e.row}: {e.reason}</li>)}
                  </ul>
                </div>
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setSummary(null)} disabled={committing}>Cancel</Button>
              <Button onClick={commit} disabled={committing || (summary.newCases === 0 && summary.toBackfill === 0)}>
                {committing && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                <Upload className="h-4 w-4 mr-2" /> Confirm import
              </Button>
            </div>
          </div>
        )}

        {validationFailures.length > 0 && (
          <div className="border border-destructive/50 rounded-md p-3 text-xs text-destructive space-y-1">
            <div className="flex items-center gap-2 font-semibold"><AlertTriangle className="h-4 w-4" /> Validation discrepancies</div>
            <ul className="list-disc ml-4 max-h-40 overflow-auto">
              {validationFailures.map((f, i) => <li key={i}>{f}</li>)}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
