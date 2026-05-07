/**
 * Debt case lifecycle: ensure-on-exit and recalculate.
 *
 * - Idempotency rule: at most one OPEN case per person. A new case is created
 *   only when the person has no open cases (all prior cases settled).
 * - Reuses calculatePayrollDay from src/lib/payroll.ts as the source of
 *   truth for payroll_date_origin (same logic the Reports payroll export uses).
 */

import { supabase } from '@/lib/backend';
import { calculatePersonDebt } from '@/lib/debt';
import { calculatePayrollDay, formatPayrollDay } from '@/lib/payroll';
import { logAudit } from '@/lib/audit';
import { logger } from '@/lib/logger';
import type { EquipmentTransaction, EquipmentPrice, PhoneModel, TabletModel } from '@/types';

async function loadEngineInputs(personId: string) {
  const [txRes, prRes, phRes, tabRes] = await Promise.all([
    supabase.from('equipment_transactions').select('*').eq('person_id', personId),
    supabase.from('equipment_prices').select('*').eq('active', true),
    supabase.from('phone_models').select('*').eq('active', true),
    supabase.from('tablet_models').select('*').eq('active', true),
  ]);
  return {
    txs: (txRes.data ?? []) as unknown as EquipmentTransaction[],
    prices: (prRes.data ?? []) as unknown as EquipmentPrice[],
    phones: (phRes.data ?? []) as unknown as PhoneModel[],
    tablets: (tabRes.data ?? []) as unknown as TabletModel[],
  };
}

/**
 * Create a debt_case for a person who just got an exit_date, unless they
 * already have an open case. Returns { created, caseId? }.
 */
export async function ensureDebtCaseForExit(
  personId: string,
  exitDate: string,
  contractType: 'Fixed Term' | 'On Call',
  userId: string | null,
): Promise<{ created: boolean; caseId?: string; reason?: string }> {
  try {
    // Open case check: any non-settled case (manually_settled = false AND no settled_at)
    const { data: existing, error: exErr } = await supabase
      .from('debt_cases')
      .select('id, manually_settled, settled_at')
      .eq('person_id', personId);
    if (exErr) throw exErr;
    const hasOpen = (existing ?? []).some(
      (c: any) => !c.manually_settled && !c.settled_at,
    );
    if (hasOpen) return { created: false, reason: 'open_case_exists' };

    const { txs, prices, phones, tablets } = await loadEngineInputs(personId);
    const debt = calculatePersonDebt(personId, txs, prices, phones, tablets, new Date(exitDate));
    const payrollDate = formatPayrollDay(calculatePayrollDay(exitDate, contractType));

    const { data, error } = await supabase
      .from('debt_cases')
      .insert({
        person_id: personId,
        initial_debt: debt.totalDebt,
        initial_debt_breakdown: debt as any,
        exit_date: exitDate,
        payroll_date_origin: payrollDate,
        source: 'app',
        created_by: userId,
      })
      .select('id')
      .single();
    if (error) throw error;

    await logAudit('debt_case.auto_create', 'debt_case', data.id, {
      person_id: personId, exit_date: exitDate, payroll_date_origin: payrollDate,
      initial_debt: debt.totalDebt,
    });
    return { created: true, caseId: data.id };
  } catch (err) {
    logger.error('[ensureDebtCaseForExit] failed', err);
    return { created: false, reason: (err as Error).message };
  }
}

/**
 * Re-fetch the person's exit_date, recompute initial_debt and payroll_date_origin,
 * and update the case. Writes an audit entry with before/after.
 */
export async function recalculateDebtCase(
  caseId: string,
  contractType: 'Fixed Term' | 'On Call',
  userId: string | null,
): Promise<{ before: number; after: number; payrollDate: string }> {
  const { data: caseRow, error: cErr } = await supabase
    .from('debt_cases').select('id, person_id, initial_debt, payroll_date_origin, frozen_engine_debt').eq('id', caseId).single();
  if (cErr || !caseRow) throw cErr ?? new Error('Case not found');
  if (caseRow.frozen_engine_debt != null) {
    throw new Error('Cannot recalculate a historical-import case. Use Adjustment movement instead.');
  }

  const { data: person, error: pErr } = await supabase
    .from('people').select('id, exit_date, contract_type').eq('id', caseRow.person_id).single();
  if (pErr || !person?.exit_date) throw pErr ?? new Error('Person has no exit_date');

  const ct = (person.contract_type as 'Fixed Term' | 'On Call') ?? contractType;
  const { txs, prices, phones, tablets } = await loadEngineInputs(caseRow.person_id);
  const debt = calculatePersonDebt(caseRow.person_id, txs, prices, phones, tablets, new Date(person.exit_date));
  const payrollDate = formatPayrollDay(calculatePayrollDay(person.exit_date, ct));

  const before = Number(caseRow.initial_debt);
  const { error: uErr } = await supabase
    .from('debt_cases')
    .update({
      initial_debt: debt.totalDebt,
      initial_debt_breakdown: debt as any,
      exit_date: person.exit_date,
      payroll_date_origin: payrollDate,
    })
    .eq('id', caseId);
  if (uErr) throw uErr;

  await logAudit('debt_case.recalculate', 'debt_case', caseId, {
    before_initial_debt: before,
    after_initial_debt: debt.totalDebt,
    before_payroll: caseRow.payroll_date_origin,
    after_payroll: payrollDate,
    exit_date: person.exit_date,
  });

  return { before, after: debt.totalDebt, payrollDate };
}
