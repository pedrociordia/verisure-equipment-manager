/**
 * Regression test — Payroll boundary cases (timezone-sensitive).
 *
 * Bug fixed 2026-04-29: when the OS/runtime is in a UTC+offset timezone (CET/CEST),
 * `new Date('2026-04-22')` resolves to local 02:00, while `getPayrollDay24` and
 * `getLastSubmissionDate` build dates via `new Date(y, m, d)` (local 00:00).
 * The mixed-zone comparison `exit > lastSub24` evaluated TRUE on the boundary day,
 * pushing 16 On-Call SE (exit_date = 2026-04-22) into payroll 2026-05-06 instead
 * of 2026-04-24. Fixed by parsing exitDate via `parseLocalDate`.
 */
import { describe, it, expect } from 'vitest';
import { calculatePayrollDay, formatPayrollDay } from '../payroll';

describe('calculatePayrollDay — boundary / timezone safety', () => {
  it('On Call, exit == lastSubmissionDate(24) → assigns to current payroll 24, not next 6', () => {
    // April 2026: payroll24 = Fri 24-04, lastSub24 = Wed 22-04
    // Real production case: Abdel Ali, 16 SE total with this exit_date
    const r = calculatePayrollDay('2026-04-22', 'On Call');
    expect(formatPayrollDay(r)).toBe('2026-04-24');
  });

  it('On Call, exit one day after lastSub24 → next month payroll 6', () => {
    // 23-04-2026 is Thu, after lastSub24 (Wed 22-04) → payroll6 of May = 06-05
    const r = calculatePayrollDay('2026-04-23', 'On Call');
    expect(formatPayrollDay(r)).toBe('2026-05-06');
  });

  it('Fixed Term, exit == lastSubmissionDate(24) → assigns to current payroll 24', () => {
    const r = calculatePayrollDay('2026-04-22', 'Fixed Term');
    expect(formatPayrollDay(r)).toBe('2026-04-24');
  });

  it('Fixed Term, exit one day after lastSub24 → next month payroll 24', () => {
    const r = calculatePayrollDay('2026-04-23', 'Fixed Term');
    expect(formatPayrollDay(r)).toBe('2026-05-22'); // 24-05 is Sun → Fri 22-05
  });

  it('Fixed Term, exit 2026-03-31 → payroll 2026-04-24 (Olaf/Tom/Brenda baseline)', () => {
    const r = calculatePayrollDay('2026-03-31', 'Fixed Term');
    expect(formatPayrollDay(r)).toBe('2026-04-24');
  });

  it('On Call, exit on lastSub6 boundary → current payroll 6', () => {
    // April 2026: payroll6 = Mon 06-04, lastSub6 = Thu 02-04
    const r = calculatePayrollDay('2026-04-02', 'On Call');
    expect(formatPayrollDay(r)).toBe('2026-04-06');
  });
});
