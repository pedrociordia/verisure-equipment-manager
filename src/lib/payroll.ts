import { getDay, setDate, addMonths, subDays, format } from 'date-fns';

/**
 * Parse a 'YYYY-MM-DD' string as local-midnight Date.
 * Avoids the `new Date('YYYY-MM-DD')` UTC-midnight pitfall, which (in CET/CEST)
 * shifts dates forward by 1–2 hours and breaks boundary comparisons such as
 * `exit > lastSubmissionDate` when both nominally fall on the same calendar day.
 */
function parseLocalDate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function adjustForWeekend(date: Date): Date {
  const dow = getDay(date);
  if (dow === 0) return subDays(date, 2); // Sunday → Friday (but spec says Sun→-2, Sat→-1)
  if (dow === 6) return subDays(date, 1); // Saturday → Friday
  return date;
}

function getPayrollDay24(year: number, month: number): Date {
  const base = new Date(year, month, 24);
  return adjustForWeekend(base);
}

function getPayrollDay6(year: number, month: number): Date {
  const base = new Date(year, month, 6);
  return adjustForWeekend(base);
}

/** Calculate 2 business days before the (already weekend-adjusted) payroll date */
export function getLastSubmissionDate(payrollDate: Date): Date {
  let count = 0;
  let d = new Date(payrollDate);
  while (count < 2) {
    d = subDays(d, 1);
    const dow = getDay(d);
    if (dow !== 0 && dow !== 6) count++;
  }
  return d;
}

export function calculatePayrollDay(exitDate: string, contractType: 'Fixed Term' | 'On Call'): Date {
  const exit = parseLocalDate(exitDate);
  const exitYear = exit.getFullYear();
  const exitMonth = exit.getMonth();

  const payroll24 = getPayrollDay24(exitYear, exitMonth);
  const payroll6Current = getPayrollDay6(exitYear, exitMonth);
  const payroll6Next = getPayrollDay6(exitYear, exitMonth + 1);
  const payroll24Next = getPayrollDay24(exitYear, exitMonth + 1);

  const lastSub24 = getLastSubmissionDate(payroll24);
  const lastSub6 = getLastSubmissionDate(payroll6Current);

  if (contractType === 'On Call') {
    if (exit > lastSub24) return payroll6Next;
    if (exit <= lastSub6) return payroll6Current;
    return payroll24;
  } else {
    // Fixed Term
    if (exit <= lastSub24) return payroll24;
    return payroll24Next;
  }
}

export function formatPayrollDay(date: Date): string {
  return format(date, 'yyyy-MM-dd');
}
