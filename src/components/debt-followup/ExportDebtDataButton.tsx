import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Download, Loader2 } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/lib/backend';
import { calculatePersonDebt } from '@/lib/debt';
import { computeCaseDerived } from '@/lib/debtFollowup';
import {
  buildExportRow,
  buildExportWorkbook,
  buildFilename,
  downloadXlsx,
} from '@/lib/exportDebtData';
import { logAudit } from '@/lib/audit';

interface Props {
  payrollDate: string | null; // YYYY-MM-DD; null = nothing selected
  disabled?: boolean;
  disabledReason?: string;
}

export function ExportDebtDataButton({ payrollDate, disabled, disabledReason }: Props) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const isDisabled = disabled || !payrollDate || busy;

  const handleExport = async () => {
    if (!payrollDate) return;
    setBusy(true);
    try {
      const { data: cases, error: e1 } = await supabase
        .from('debt_cases')
        .select('*, people!inner(id, pers_id, sales_name), debt_movements(movement_type, amount)')
        .eq('payroll_date_origin', payrollDate);
      if (e1) throw e1;
      if (!cases || cases.length === 0) {
        toast({ title: 'No cases for that payroll date', description: 'Nothing to export.' });
        return;
      }

      const personIds = cases.map((c: any) => c.person_id);
      const { data: txs } = await supabase
        .from('equipment_transactions')
        .select('*')
        .in('person_id', personIds);
      const [pricesRes, phRes, tabRes] = await Promise.all([
        supabase.from('equipment_prices').select('*').eq('active', true),
        supabase.from('phone_models').select('*').eq('active', true),
        supabase.from('tablet_models').select('*').eq('active', true),
      ]);

      const rows = cases.map((c: any) => {
        const exitDate = c.exit_date ? new Date(c.exit_date) : undefined;
        const currentEngineDebt = c.frozen_engine_debt != null
          ? Number(c.frozen_engine_debt)
          : calculatePersonDebt(
              c.person_id,
              (txs ?? []) as any,
              (pricesRes.data ?? []) as any,
              (phRes.data ?? []) as any,
              (tabRes.data ?? []) as any,
              exitDate,
            ).totalDebt;
        const debt = calculatePersonDebt(
          c.person_id,
          (txs ?? []) as any,
          (pricesRes.data ?? []) as any,
          (phRes.data ?? []) as any,
          (tabRes.data ?? []) as any,
          exitDate,
        );
        const derived = computeCaseDerived({
          initialDebt: Number(c.initial_debt),
          currentEngineDebt,
          movements: (c.debt_movements ?? []).map((m: any) => ({
            movement_type: m.movement_type,
            amount: Number(m.amount),
          })),
        });
        return buildExportRow({
          persId: c.people.pers_id,
          salesName: c.people.sales_name,
          debt,
          derived: {
            payrollDeduction: derived.payrollDeduction,
            refund: derived.refund,
            adjustment: derived.adjustment,
          },
        });
      });

      const buffer = await buildExportWorkbook(rows);
      const filename = buildFilename(payrollDate);
      downloadXlsx(buffer, filename);
      await logAudit('debt_export', 'debt_export', payrollDate, { filename, rows: rows.length });
      toast({ title: 'Export ready', description: `${filename} (${rows.length} rows)` });
    } catch (err) {
      toast({ title: 'Export failed', description: (err as Error).message, variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  const button = (
    <Button onClick={handleExport} disabled={isDisabled} variant="outline" size="sm">
      {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
      Export Debt Data (.xlsx)
    </Button>
  );

  if (isDisabled && disabledReason) {
    return (
      <Tooltip>
        <TooltipTrigger asChild><span>{button}</span></TooltipTrigger>
        <TooltipContent>{disabledReason}</TooltipContent>
      </Tooltip>
    );
  }
  return button;
}
