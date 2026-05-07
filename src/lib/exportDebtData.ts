import ExcelJS from 'exceljs';
import { logger } from './logger';

/**
 * Pure helpers for the Debt Data .xlsx export. Extracted from the React
 * component so the row-builder is unit-testable without rendering.
 *
 * The file is byte-compatible with the legacy Power BI Consolidation Power
 * Query (sheet name "Export", 50 columns, filename "Debt Data DD.MM.YYYY.xlsx").
 */

export const COLUMN_HEADERS = [
  'Emp ID', 'Sales Name',
  // Equipment debt columns (3-21)
  'Arlo WF VD', 'Central Unit', 'Smartlock', 'Arlo Ess XL', 'Camera One (Orion)',
  'Arlo Ess Wir 1cam', 'Siren Voice KP', 'Keypad GW-KP', 'Smoke Detector',
  'Remote Keyfob', 'Magnet', 'Phone', 'iZettle', 'ID_Card', 'Binder', 'Acc.Pass',
  'Toolkit', 'Clothing', 'Laptop',
  'Total Eq.',
  // Inventory columns (23-44) — always zero, legacy
  'C.One (Orion)', 'Motion Detector', 'Central Unit CU2N', 'Arlo WFree VD',
  'Arlo Ess XL SL', 'SirenVoice Keypad', 'Smartlock Danalock', 'Smoke Dtor',
  'Chem MOD2', 'Arlo Ess Wir 1 cam', 'GW-FOG-GEN', 'Keypad MiniOutdoor',
  'Keypad Homepad', 'S.Cyl. 35x30 (5k)', 'Central Unit CU1', 'Arlo Pro3 Smart Hub',
  'S.Cyl. 30x30 (5k)', 'S.Cyl. 40x30 (5k)', 'S.Cyl. 55x30 (5k)',
  'S.Cyl. 45x30 (5k)', 'S.Cyl. 50x30 (5k)', 'Siren GW-SIv2',
  'Total Inv.',
  'Total Debt', 'Deduction', 'Refund', 'Current Debt Adjustment', 'Recovered by Incasso',
] as const;

export type ExportHeader = typeof COLUMN_HEADERS[number];
export type ExportRow = Record<string, number | string>;

/**
 * Demobox canonical item names → legacy Power BI export columns.
 * Each demobox component lands in its own column so the parallel run
 * does not show false discrepancies vs. the legacy file.
 */
export const DEMOBOX_TO_COLUMN: Record<string, ExportHeader> = {
  'ARLO Wire-Free VD White':                'Arlo WF VD',
  'Central Unit GW-CU2N':                   'Central Unit',
  'Smartlock Danalock GW-SL':               'Smartlock',
  'Arlo Ess. XL SL CAMERA 1-PACK':          'Arlo Ess XL',
  'Camera One GW-MD-C1 (Orion)':            'Camera One (Orion)',
  'Arlo Essential Wired 1 cam':             'Arlo Ess Wir 1cam',
  'Siren Voice Keypad GW-SVK':              'Siren Voice KP',
  'Keypad GW-KP-MOK1 Mini Outdoor':         'Keypad GW-KP',
  'Smoke Detector GW-SD3':                  'Smoke Detector',
  'Remote control Keyfob GW-KF white/grey': 'Remote Keyfob',
  'Magnet Contact GW-MC2-SHOCK':            'Magnet',
};

export interface BuildRowInput {
  persId: string;
  salesName: string;
  debt: {
    phonDebt: number;
    tabletDebt: number;
    toolkitDebt: number;
    clothingDebt: number;
    idCardDebt: number;
    binderDebt: number;
    izettleDebt: number;
    accessPassDebt: number;
    demoboxItemDebts: Record<string, number>;
  };
  derived: {
    payrollDeduction: number;
    refund: number;
    adjustment: number;
  };
}

/** Build one export row. Pure function, fully testable. */
export function buildExportRow(input: BuildRowInput): ExportRow {
  const { persId, salesName, debt, derived } = input;
  const row: ExportRow = { 'Emp ID': persId, 'Sales Name': salesName };
  for (const h of COLUMN_HEADERS.slice(2)) row[h] = 0;

  // Map each demobox item to its dedicated column.
  for (const [canonical, amount] of Object.entries(debt.demoboxItemDebts)) {
    if (!amount) continue;
    const col = DEMOBOX_TO_COLUMN[canonical];
    if (col) {
      row[col] = (row[col] as number) + amount;
    } else {
      // Unknown canonical name → log + fall back to Central Unit so the
      // total isn't silently lost. v1 telemetry only.
      logger.warn(`[exportDebtData] Unmapped demobox item "${canonical}" → falling back to Central Unit`);
      row['Central Unit'] = (row['Central Unit'] as number) + amount;
    }
  }

  row['Phone'] = debt.phonDebt;
  row['Toolkit'] = debt.toolkitDebt;
  row['Clothing'] = debt.clothingDebt;
  row['Laptop'] = debt.tabletDebt;
  row['ID_Card'] = debt.idCardDebt;
  row['Binder'] = debt.binderDebt;
  row['iZettle'] = debt.izettleDebt;
  row['Acc.Pass'] = debt.accessPassDebt;

  // Sum every equipment column (3..21) for Total Eq.
  const equipHeaders = COLUMN_HEADERS.slice(2, 21);
  const totalEq = equipHeaders.reduce((s, h) => s + (row[h] as number), 0);
  row['Total Eq.'] = totalEq;
  row['Total Debt'] = totalEq;
  row['Deduction'] = derived.payrollDeduction;
  row['Refund'] = derived.refund;
  row['Current Debt Adjustment'] = derived.adjustment;
  row['Recovered by Incasso'] = 0;
  return row;
}

/** Build an .xlsx workbook buffer using exceljs. */
export async function buildExportWorkbook(rows: ExportRow[]): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Export');
  ws.addRow(COLUMN_HEADERS as unknown as string[]);
  for (const r of rows) {
    ws.addRow(COLUMN_HEADERS.map((h) => r[h] ?? 0));
  }
  return wb.xlsx.writeBuffer() as Promise<ArrayBuffer>;
}

export function buildFilename(cycleDate: string): string {
  const [y, m, d] = cycleDate.split('-');
  return `Debt Data ${d}.${m}.${y}.xlsx`;
}

/** Trigger a browser download for the given buffer. */
export function downloadXlsx(buffer: ArrayBuffer, filename: string): void {
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
