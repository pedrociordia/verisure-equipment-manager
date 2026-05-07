/**
 * Workbook reader wrapper.
 *
 * Encapsulates the underlying spreadsheet libraries (exceljs for .xlsx,
 * papaparse for CSV) so the rest of the app talks to a single, stable API.
 * Replacing the providers later only requires changes inside this file.
 */
import ExcelJS from 'exceljs';
import Papa from 'papaparse';

export type SheetData =
  | { kind: 'xlsx'; ws: ExcelJS.Worksheet }
  | { kind: 'csv'; rows: Record<string, unknown>[] };

export type WorkbookHandle = {
  sheetNames: string[];
  getSheet(name: string): SheetData;
};

function toBuffer(input: ArrayBuffer | Uint8Array | string): Uint8Array | string {
  if (typeof input === 'string') return input;
  if (input instanceof Uint8Array) return input;
  return new Uint8Array(input);
}

export async function readWorkbook(
  input: ArrayBuffer | Uint8Array | string,
  opts: { format: 'xlsx' | 'csv' },
): Promise<WorkbookHandle> {
  if (opts.format === 'csv') {
    const text = typeof input === 'string'
      ? input
      : new TextDecoder().decode(input instanceof Uint8Array ? input : new Uint8Array(input));
    const parsed = Papa.parse<Record<string, unknown>>(text, {
      header: true,
      skipEmptyLines: true,
    });
    const rows = parsed.data ?? [];
    return {
      sheetNames: ['Sheet1'],
      getSheet: () => ({ kind: 'csv', rows }),
    };
  }

  const wb = new ExcelJS.Workbook();
  const buf = toBuffer(input);
  if (typeof buf === 'string') {
    throw new Error("readWorkbook: format 'xlsx' requires a binary input (ArrayBuffer/Uint8Array)");
  }
  // ExcelJS .load expects a Buffer-like; Uint8Array works in browser+node.
  await wb.xlsx.load(buf as unknown as ArrayBuffer);

  const names = wb.worksheets.map(w => w.name);
  return {
    sheetNames: names,
    getSheet(name: string) {
      const ws = wb.getWorksheet(name);
      if (!ws) throw new Error(`Sheet not found: ${name}`);
      return { kind: 'xlsx', ws };
    },
  };
}

function cellValue(v: unknown): unknown {
  if (v == null) return v;
  if (typeof v === 'object') {
    const obj = v as Record<string, unknown>;
    // ExcelJS hyperlinks: { text, hyperlink }
    if ('text' in obj && typeof obj.text === 'string') return obj.text;
    // Formula cells: { formula, result }
    if ('result' in obj) return obj.result;
    // Rich text: { richText: [{text}, ...] }
    if ('richText' in obj && Array.isArray(obj.richText)) {
      return obj.richText.map((r: { text?: unknown }) => r?.text ?? '').join('');
    }
  }
  return v;
}

export function sheetToJson<T = Record<string, unknown>>(
  sheet: SheetData,
  opts: { defval?: unknown } = {},
): T[] {
  const defval = 'defval' in opts ? opts.defval : '';

  if (sheet.kind === 'csv') {
    return sheet.rows.map(row => {
      const out: Record<string, unknown> = {};
      for (const k of Object.keys(row)) {
        const v = row[k];
        out[k] = v === undefined || v === null || v === '' ? defval : v;
      }
      return out as unknown as T;
    });
  }

  const ws = sheet.ws;
  const headerRow = ws.getRow(1);
  const headers: string[] = [];
  headerRow.eachCell({ includeEmpty: false }, (cell, col) => {
    const raw = cellValue(cell.value);
    if (raw != null && String(raw).length > 0) headers[col] = String(raw);
  });
  if (headers.length === 0) return [];

  const out: T[] = [];
  ws.eachRow({ includeEmpty: false }, (row, rowIdx) => {
    if (rowIdx === 1) return;
    const obj: Record<string, unknown> = {};
    let hasContent = false;
    for (let col = 1; col < headers.length; col++) {
      const header = headers[col];
      if (!header) continue;
      const raw = cellValue(row.getCell(col).value);
      const value = raw == null || raw === '' ? defval : raw;
      obj[header] = value;
      if (raw != null && raw !== '') hasContent = true;
    }
    if (hasContent) out.push(obj as unknown as T);
  });
  return out;
}
