/**
 * Parser for the legacy Power BI "Debt Follow-up" CSV export.
 *
 * Headers (in this exact order):
 *   Payroll, Emp ID, Sales Name, Initial Debt, Payroll Deduction, Recovered Assets,
 *   Current Assets Debt, Adjustment, Total Recovered, Refund, Current Value Debt,
 *   To be refunded
 *
 * Money cells may appear as `€ 495.00`, `495`, `495.00`, or PowerBI float
 * artifacts like `1551.4700000000003`. Strip currency, parse Number, round to
 * 2 decimals.
 */

export interface DebtFollowupRow {
  payrollDate: string;       // ISO date (YYYY-MM-DD)
  empId: string;             // pers_id, leading zeros preserved
  salesName: string;
  initialDebt: number;
  payrollDeduction: number;
  recoveredAssets: number;
  currentAssetsDebt: number;
  adjustment: number;
  totalRecovered: number;
  refund: number;
  currentValueDebt: number;
  toBeRefunded: number;
  /** md5-style stable hash for idempotent re-imports. */
  rowHash: string;
  /** Original 1-indexed CSV row (excluding header) for error reporting. */
  sourceRowIndex: number;
}

export interface ParseResult {
  rows: DebtFollowupRow[];
  skippedAllZero: number;
  errors: { row: number; reason: string }[];
}

const MONEY_CLEAN = /[€$£\s,]/g;

export function parseMoney(value: string | undefined | null): number {
  if (value == null) return 0;
  const s = String(value).trim();
  if (!s || s === '-' || s.toLowerCase() === 'null') return 0;
  // Replace EU "1.234,56" → "1234.56" only if it looks like that pattern.
  let cleaned = s.replace('€', '').trim();
  if (/^-?\d{1,3}(\.\d{3})+,\d+$/.test(cleaned)) {
    cleaned = cleaned.replace(/\./g, '').replace(',', '.');
  } else {
    cleaned = cleaned.replace(MONEY_CLEAN, '');
  }
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return NaN;
  return Math.round(n * 100) / 100;
}

export function parsePayrollDate(value: string): string {
  // "2026-04-06 00:00:00" or "2026-04-06"
  const trimmed = String(value).trim();
  const datePart = trimmed.split(/\s+/)[0];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(datePart)) {
    throw new Error(`Unparseable payroll date: ${value}`);
  }
  return datePart;
}

/** Tiny CSV splitter handling double-quoted fields with embedded commas. */
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQ) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') inQ = false;
      else cur += c;
    } else {
      if (c === ',') { out.push(cur); cur = ''; }
      else if (c === '"') inQ = true;
      else cur += c;
    }
  }
  out.push(cur);
  return out.map(s => s.trim());
}

/** Stable hash without crypto deps — DJB2 over canonical row string. */
export function hashRow(parts: (string | number)[]): string {
  const s = parts.join('|');
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return 'h_' + (h >>> 0).toString(36);
}

const EXPECTED_HEADERS = [
  'Payroll', 'Emp ID', 'Sales Name', 'Initial Debt', 'Payroll Deduction',
  'Recovered Assets', 'Current Assets Debt', 'Adjustment', 'Total Recovered',
  'Refund', 'Current Value Debt', 'To be refunded',
];

export function parseDebtFollowupCsv(text: string): ParseResult {
  const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
  if (lines.length === 0) return { rows: [], skippedAllZero: 0, errors: [{ row: 0, reason: 'Empty CSV' }] };

  const headers = splitCsvLine(lines[0]);
  for (let i = 0; i < EXPECTED_HEADERS.length; i++) {
    if (headers[i]?.toLowerCase() !== EXPECTED_HEADERS[i].toLowerCase()) {
      return { rows: [], skippedAllZero: 0, errors: [{ row: 0, reason: `Header[${i}] expected '${EXPECTED_HEADERS[i]}', got '${headers[i] ?? ''}'` }] };
    }
  }

  const rows: DebtFollowupRow[] = [];
  const errors: ParseResult['errors'] = [];
  let skippedAllZero = 0;

  for (let i = 1; i < lines.length; i++) {
    const cells = splitCsvLine(lines[i]);
    try {
      const payrollDate = parsePayrollDate(cells[0]);
      const empId = String(cells[1] ?? '').trim();
      if (!empId) throw new Error('Empty Emp ID');
      const salesName = String(cells[2] ?? '').trim();
      const nums = cells.slice(3, 12).map(parseMoney);
      if (nums.some(n => Number.isNaN(n))) throw new Error('Unparseable money cell');
      const [initialDebt, payrollDeduction, recoveredAssets, currentAssetsDebt,
             adjustment, totalRecovered, refund, currentValueDebt, toBeRefunded] = nums;
      if (nums.every(n => n === 0)) { skippedAllZero++; continue; }

      const rowHash = hashRow([payrollDate, empId, initialDebt, payrollDeduction, refund, adjustment, totalRecovered]);
      rows.push({
        payrollDate, empId, salesName,
        initialDebt, payrollDeduction, recoveredAssets, currentAssetsDebt,
        adjustment, totalRecovered, refund, currentValueDebt, toBeRefunded,
        rowHash, sourceRowIndex: i,
      });
    } catch (e: unknown) {
      errors.push({ row: i, reason: (e as Error).message });
    }
  }
  return { rows, skippedAllZero, errors };
}
