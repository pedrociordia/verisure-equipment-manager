/**
 * Debt Follow-up calculation layer — single source of truth for the eight
 * derived columns Power BI exposes per debt case. Encoded literally from the
 * legacy DAX. Do NOT "improve" the formulas. Every max(0, ...) clamp is
 * mandatory; a person can never have negative debt.
 *
 * Replicated formulas:
 *   current_assets_debt = max(0, currentEngineDebt - sum(adjustments))
 *   recovered_assets    = max(0, initial_debt - current_assets_debt)
 *   total_recovered     = recovered_assets + sum(deductions) - sum(refunds)
 *   current_value_debt  = max(0, current_assets_debt - sum(deductions))
 *   to_be_refunded      = max(0, total_recovered - initial_debt)
 *   settled             = (CVD = 0 AND TBF = 0) OR manually_settled
 */

export type Money = number;

export type DebtMovementType = 'payroll_deduction' | 'refund' | 'adjustment';

export interface DebtMovementInput {
  movement_type: DebtMovementType;
  amount: Money;
}

export interface CaseDerivedInput {
  initialDebt: Money;
  currentEngineDebt: Money;
  movements: DebtMovementInput[];
  manuallySettled?: boolean;
}

export interface CaseDerived {
  payrollDeduction: Money;
  refund: Money;
  adjustment: Money;
  currentAssetsDebt: Money;
  recoveredAssets: Money;
  totalRecovered: Money;
  currentValueDebt: Money;
  toBeRefunded: Money;
  settled: boolean;
}

const round2 = (n: number): Money => Math.round(n * 100) / 100;
const max0 = (n: number): Money => (n > 0 ? round2(n) : 0);

export function sumByType(movements: DebtMovementInput[], type: DebtMovementType): Money {
  let s = 0;
  for (const m of movements) if (m.movement_type === type) s += m.amount;
  return round2(s);
}

export function computeCaseDerived(input: CaseDerivedInput): CaseDerived {
  const payrollDeduction = sumByType(input.movements, 'payroll_deduction');
  const refund = sumByType(input.movements, 'refund');
  const adjustment = sumByType(input.movements, 'adjustment');

  const currentAssetsDebt = max0(input.currentEngineDebt - adjustment);
  const recoveredAssets = max0(input.initialDebt - currentAssetsDebt);
  const totalRecovered = round2(recoveredAssets + payrollDeduction - refund);
  const currentValueDebt = max0(currentAssetsDebt - payrollDeduction);
  const toBeRefunded = max0(totalRecovered - input.initialDebt);

  const computedSettled = currentValueDebt === 0 && toBeRefunded === 0;
  const settled = Boolean(input.manuallySettled) || computedSettled;

  return {
    payrollDeduction, refund, adjustment,
    currentAssetsDebt, recoveredAssets, totalRecovered,
    currentValueDebt, toBeRefunded, settled,
  };
}
