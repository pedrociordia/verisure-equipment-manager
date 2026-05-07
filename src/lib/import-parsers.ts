import { getContractType } from './contract';
import { sheetToJson, type WorkbookHandle } from './excel-reader';

// ── Date Helpers ──

/** Convert an Excel serial number (days since 1899-12-30) to YYYY-MM-DD */
function excelSerialToISO(serial: number): string {
  // Excel epoch: 1899-12-30, but has the Lotus 1-2-3 leap year bug for 1900
  const epoch = new Date(Date.UTC(1899, 11, 30));
  const ms = epoch.getTime() + Math.floor(serial) * 86400000;
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

function isExcelSerial(val: any): boolean {
  if (typeof val === 'number' && val > 25000 && val < 100000) return true;
  if (typeof val === 'string' && /^\d{4,5}(\.\d+)?$/.test(val.trim())) {
    const n = parseFloat(val);
    return n > 25000 && n < 100000;
  }
  return false;
}

export function parseEuropeanDate(val: any): string | null {
  if (!val) return null;
  // Excel serial number
  if (isExcelSerial(val)) {
    const serial = typeof val === 'number' ? val : parseFloat(String(val));
    return excelSerialToISO(serial);
  }
  if (val instanceof Date) {
    if (isNaN(val.getTime())) return null;
    return formatISO(val);
  }
  const s = String(val).trim();
  // dd-mm-yyyy or dd/mm/yyyy
  const eu = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (eu) {
    const [, d, mo, y] = eu;
    return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  // M/D/YY (US short)
  const us = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})$/);
  if (us) {
    const [, mo, d, y] = us;
    const year = parseInt(y) > 50 ? `19${y}` : `20${y}`;
    return `${year}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  // yyyy-mm-dd (possibly with time)
  const isoMatch = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (isoMatch) {
    const [, y, m, d] = isoMatch;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  const dt = new Date(s);
  if (!isNaN(dt.getTime())) return formatISO(dt);
  return null;
}

function formatISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function isSentinelDate(iso: string | null): boolean {
  if (!iso) return false;
  return iso === '1950-01-01';
}

// ── Column Mapping ──

const PEOPLE_COLUMN_MAP: Record<string, string> = {
  'pers id': 'pers_id', 'pers_id': 'pers_id', 'persid': 'pers_id',
  'sales id': 'sales_id', 'sales_id': 'sales_id', 'salesid': 'sales_id',
  'sales name': 'sales_name', 'sales_name': 'sales_name', 'salesname': 'sales_name',
  'branch no': 'branch_id', 'branch_no': 'branch_id', 'branchno': 'branch_id', 'branch_id': 'branch_id',
  'branch name': 'branch_name', 'branch_name': 'branch_name', 'branchname': 'branch_name',
  'exit date': 'exit_date', 'exit_date': 'exit_date', 'exitdate': 'exit_date',
  'sales channel start': 'sales_channel_start', 'sales_channel_start': 'sales_channel_start',
};

const EXITS_COLUMN_MAP: Record<string, string> = {
  'id': 'pers_id',
  'worker': 'sales_name',
  'organization': 'organization',
  'hire date': 'sales_channel_start',
  'termination date': 'exit_date',
  'job title': 'job_title',
  'manager': 'manager',
};

function mapColumns(headers: string[], columnMap: Record<string, string>): Record<string, string> {
  const mapping: Record<string, string> = {};
  headers.forEach(h => {
    const key = h.trim().toLowerCase().replace(/\s+/g, ' ');
    if (columnMap[key]) mapping[h] = columnMap[key];
  });
  return mapping;
}

// ── Types ──

export interface ImportPeopleRow {
  pers_id: string;
  sales_id: string;
  sales_name: string;
  branch_id: number | null;
  branch_name: string | null;
  exit_date: string | null;
  sales_channel_start: string | null;
  contract_type: string;
}

export interface ImportEquipmentRow {
  _key: string;
  _hash: string;
  person_pers_id: string;
  person_name: string;
  transaction_type: string;
  transaction_date: string;
  phone: boolean;
  phone_details: any;
  tablet: boolean;
  tablet_details: any;
  demobox: boolean;
  demobox_details: any;
  clothing: boolean;
  clothing_details: any;
  toolkit: boolean;
  toolkit_details: any;
  izettle: boolean;
  izettle_details: any;
  sales_binder: boolean;
  id_card: boolean;
  access_pass: boolean;
  sbc_name: string | null;
}

export interface FieldChange {
  field: string;
  oldValue: any;
  newValue: any;
}

export interface WarningRow<T> {
  row: T;
  reason: string;
}

export interface ErrorRow<T> {
  row: Partial<T>;
  reason: string;
}

export interface DiffResult<T> {
  newRows: T[];
  modifiedRows: { row: T; existing: T; changes: FieldChange[] }[];
  unchangedRows: T[];
  warningRows: WarningRow<T>[];
  errorRows: ErrorRow<T>[];
}

// ── Branch helper ──

interface BranchInfo {
  id: number;
  district_code: string;
  name: string;
}

function findBranch(branchId: number | null, branches: BranchInfo[]): BranchInfo | undefined {
  if (!branchId || branchId === 0) return undefined;
  return branches.find(b => b.id === branchId);
}

// ── Hash helper ──

async function computeHash(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export function computeHashSync(input: string): string {
  // Simple hash for synchronous use — djb2 variant
  let hash = 5381;
  for (let i = 0; i < input.length; i++) {
    hash = ((hash << 5) + hash) + input.charCodeAt(i);
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(16).padStart(8, '0');
}

// ── Parsers ──

export function parseDimPeopleAdjusted(
  rawRows: Record<string, any>[],
  headers: string[],
  branches: BranchInfo[]
): ImportPeopleRow[] {
  const colMap = mapColumns(headers, PEOPLE_COLUMN_MAP);
  return rawRows
    .map(raw => {
      const mapped: any = {};
      Object.keys(raw).forEach(h => { if (colMap[h]) mapped[colMap[h]] = raw[h]; });
      const persId = String(mapped.pers_id ?? '').trim();
      if (!persId) return null;

      const exitRaw = parseEuropeanDate(mapped.exit_date);
      const exitDate = exitRaw && !isSentinelDate(exitRaw) ? exitRaw : null;
      const startRaw = parseEuropeanDate(mapped.sales_channel_start);
      const branchId = mapped.branch_id ? parseInt(String(mapped.branch_id)) : null;
      const branch = findBranch(branchId, branches);

      // FK safety: if branch not found, set null to avoid FK violation
      const safeBranchId = branchId === 0 ? null : (branch ? branch.id : null);
      const safeBranchName = branchId === 0 ? 'Transferred' : (branch?.district_code ?? mapped.branch_name ?? null);

      return {
        pers_id: persId,
        sales_id: String(mapped.sales_id ?? '').trim(),
        sales_name: String(mapped.sales_name ?? '').trim(),
        branch_id: safeBranchId,
        branch_name: safeBranchName,
        exit_date: exitDate,
        sales_channel_start: startRaw,
        contract_type: getContractType(startRaw, exitDate),
      } as ImportPeopleRow;
    })
    .filter((r): r is ImportPeopleRow => r !== null && r.sales_name !== '');
}

export function parseExitsExcelMultiSheet(
  workbook: WorkbookHandle,
  branches: BranchInfo[]
): ImportPeopleRow[] {
  const allRows: Record<string, any>[] = [];

  for (const sheetName of workbook.sheetNames) {
    const sheet = workbook.getSheet(sheetName);
    const json = sheetToJson<Record<string, any>>(sheet, { defval: '' });
    allRows.push(...json);
  }

  if (allRows.length === 0) return [];
  const headers = Object.keys(allRows[0]);
  return parseExitsExcel(allRows, headers, branches);
}

export function parseExitsExcel(
  rawRows: Record<string, any>[],
  headers: string[],
  branches: BranchInfo[]
): ImportPeopleRow[] {
  const colMap = mapColumns(headers, EXITS_COLUMN_MAP);

  // Deduplicate by pers_id — keep latest termination date
  const byPersId = new Map<string, Record<string, any>>();
  rawRows.forEach(raw => {
    const mapped: any = {};
    Object.keys(raw).forEach(h => { if (colMap[h]) mapped[colMap[h]] = raw[h]; });
    const persId = String(mapped.pers_id ?? '').trim();
    if (!persId) return;
    mapped.pers_id = persId;

    const existing = byPersId.get(persId);
    if (!existing) {
      byPersId.set(persId, mapped);
    } else {
      const existingExit = parseEuropeanDate(existing.exit_date);
      const newExit = parseEuropeanDate(mapped.exit_date);
      if (newExit && (!existingExit || newExit > existingExit)) {
        byPersId.set(persId, mapped);
      }
    }
  });

  return Array.from(byPersId.values())
    .map(mapped => {
      const persId = mapped.pers_id;
      const salesName = String(mapped.sales_name ?? '').replace(/\s*\(On Leave\)\s*/gi, '').trim();
      const org = String(mapped.organization ?? '');
      const orgMatch = org.match(/^(D\d+)/);
      const districtCode = orgMatch?.[1] || null;
      const branch = districtCode ? branches.find(b => b.district_code === districtCode) : null;

      const exitRaw = parseEuropeanDate(mapped.exit_date);
      const exitDate = exitRaw && !isSentinelDate(exitRaw) ? exitRaw : null;
      const startRaw = parseEuropeanDate(mapped.sales_channel_start);

      return {
        pers_id: persId,
        sales_id: '',
        sales_name: salesName,
        branch_id: branch?.id ?? null,
        branch_name: branch?.district_code ?? districtCode,
        exit_date: exitDate,
        sales_channel_start: startRaw,
        contract_type: getContractType(startRaw, exitDate),
      } as ImportPeopleRow;
    })
    .filter(r => r.sales_name !== '');
}

function safeJsonParse(val: any): any {
  if (!val) return null;
  if (typeof val === 'object') return val;
  try { return JSON.parse(String(val)); } catch { return null; }
}

function yesNo(val: any): boolean {
  const s = String(val ?? '').trim().toLowerCase();
  return s === 'yes' || s === 'true' || s === '1';
}

/** Infer boolean from detail payload — returns true if payload has actual content */
function hasDetailContent(raw: any): boolean {
  if (!raw) return false;
  const s = typeof raw === 'string' ? raw.trim() : '';
  if (s === '' || s === '[]' || s === 'null') return false;
  if (typeof raw === 'object') {
    if (Array.isArray(raw)) return raw.length > 0;
    return Object.keys(raw).length > 0;
  }
  return true;
}

// ── Damage value normalization (English MoreApp → Dutch engine) ──

const DAMAGE_EN_TO_NL: Record<string, string> = {
  'no damage': 'Geen Schade',
  'broken screen': 'Gebroken Scherm',
  'dents or scratches': 'Deuken of Krassen',
  'not functioning': 'Niet Functionerend',
  'lost or stolen': 'Verloren of Gestolen',
};

function normalizeDamage(val: string | undefined | null): string | undefined {
  if (!val) return undefined;
  const lower = val.trim().toLowerCase();
  return DAMAGE_EN_TO_NL[lower] || val.trim();
}

// ── Demobox normalization across all format generations ──

function normalizeDemoboxDetails(raw: any): any {
  if (!raw) return null;
  const d = typeof raw === 'string' ? safeJsonParse(raw) : raw;
  const arr = Array.isArray(d) ? d[0] : d;
  if (!arr) return null;

  const result: any = {};
  if (arr.demobox_number) result.demobox_number = arr.demobox_number;

  // Format 3 (new): demoboxItems array like ["Item Name [€XX]", ...]
  if (Array.isArray(arr.demoboxItems)) {
    result.items = arr.demoboxItems.map((s: string) =>
      String(s).replace(/\s*\[€\d+\]\s*$/, '').trim()
    );
    result.complete = false;
    result.source_format = 'items';
    return result;
  }

  // Format 1 (old): demobox_complete + demobox_missing_parts
  if (arr.demobox_complete !== undefined) {
    result.complete = String(arr.demobox_complete).toLowerCase() === 'yes';
    result.missing_parts = Array.isArray(arr.demobox_missing_parts) ? arr.demobox_missing_parts : [];
    result.source_format = 'legacy-missing-parts';
    return result;
  }

  // Format 2 (mid): demobox_backpack
  if (arr.demobox_backpack !== undefined) {
    result.backpack = String(arr.demobox_backpack).toLowerCase() === 'yes';
    result.source_format = 'backpack';
    return result;
  }

  return arr;
}

// ── Phone details normalization ──

function normalizePhoneDetails(raw: any): any {
  if (!raw) return null;
  const d = typeof raw === 'string' ? safeJsonParse(raw) : raw;
  const arr = Array.isArray(d) ? d[0] : d;
  if (!arr) return null;

  return {
    phone_number: arr.phone_number || arr.phoneNumber || '',
    phone_model: arr.phone_model || arr.phoneModel || '',
    imei_number: arr.imei_number || arr.imeiNumber || '',
    pin_code: arr.pin_code || arr.pinCode || '',
    charger: typeof arr.charger === 'boolean' ? arr.charger : String(arr.charger || '').toLowerCase() === 'yes',
    phone_damage: normalizeDamage(arr.phone_damage || arr.phoneDamage),
    brand: arr.phone_model || arr.phoneModel || '',
    verisure_number: arr.phone_number || arr.phoneNumber || '',
    damage: normalizeDamage(arr.phone_damage || arr.phoneDamage),
  };
}

// ── iZettle details normalization ──

function normalizeIzettleDetails(raw: any): any {
  if (!raw) return null;
  const d = typeof raw === 'string' ? safeJsonParse(raw) : raw;
  const arr = Array.isArray(d) ? d[0] : d;
  if (!arr) return null;

  return {
    damage: normalizeDamage(arr.izettle_damage || arr.izettleDamage || arr.damage),
    izettle_damage: normalizeDamage(arr.izettle_damage || arr.izettleDamage || arr.damage),
  };
}

// ── Clothing details normalization ──

function normalizeClothingDetails(raw: any): any {
  if (!raw) return null;
  const d = typeof raw === 'string' ? safeJsonParse(raw) : raw;
  const arr = Array.isArray(d) ? d[0] : d;
  if (!arr) return null;

  const parts = arr.clothing_parts || arr.clothingParts || [];
  return { items: Array.isArray(parts) ? parts : [] };
}

// ── Toolkit details normalization ──

function normalizeToolkitDetails(raw: any): any {
  if (!raw) return null;
  const d = typeof raw === 'string' ? safeJsonParse(raw) : raw;
  const arr = Array.isArray(d) ? d[0] : d;
  if (!arr) return null;

  const complete = String(arr.toolkit_complete || arr.toolkitComplete || '').toLowerCase() === 'yes';
  const missing = arr.toolkit_missing_parts || arr.toolkitMissingParts || [];
  return {
    complete,
    missing_parts: Array.isArray(missing) ? missing : [],
  };
}

// ── Tablet details normalization ──

function normalizeTabletDetails(raw: any): any {
  if (!raw) return null;
  const d = typeof raw === 'string' ? safeJsonParse(raw) : raw;
  const arr = Array.isArray(d) ? d[0] : d;
  if (!arr) return null;

  return {
    brand: arr.tablet_model || arr.tabletModel || arr.brand || '',
    laptop_number: arr.laptop_number || arr.laptopNumber || arr.tablet_imei_number || arr.tabletImeiNumber || '',
    charger: typeof arr.charger === 'boolean' ? arr.charger : String(arr.charger || arr.tablet_charger || '').toLowerCase() === 'yes',
    damage: normalizeDamage(arr.tablet_damage || arr.tabletDamage || arr.damage),
  };
}

export interface ParseStats {
  totalRawRows: number;
  parsedRows: number;
  skippedNoPersId: number;
  skippedNoDate: number;
  dateParseFailures: number;
  fieldCoverage: Record<string, number>;
}

export function parseEquipmentCsv(rawRows: Record<string, any>[]): { rows: ImportEquipmentRow[]; stats: ParseStats } {
  const stats: ParseStats = {
    totalRawRows: rawRows.length,
    parsedRows: 0,
    skippedNoPersId: 0,
    skippedNoDate: 0,
    dateParseFailures: 0,
    fieldCoverage: { phone: 0, tablet: 0, demobox: 0, clothing: 0, toolkit: 0, izettle: 0, sales_binder: 0, id_card: 0, access_pass: 0 },
  };

  const rows = rawRows
    .map(raw => {
      const empDetails = safeJsonParse(raw.employee_details || raw['employee_details']);
      const persId = empDetails?.persID || empDetails?.persId;
      if (!persId) { stats.skippedNoPersId++; return null; }

      const salesName = empDetails?.salesName || empDetails?.salesname || '';

      const transaction = String(raw.transaction ?? '').trim();
      const txLower = transaction.toLowerCase();
      const txType = 
        ['receiving', 'ingeleverd', 'return', 'inleveren'].includes(txLower) ? 'Ingeleverd' :
        ['giving', 'uitgifte', 'handout', 'uitgeven'].includes(txLower) ? 'Uitgifte' :
        transaction;
      
      const txDate = parseEuropeanDate(raw.date) || '';
      if (!txDate) { stats.skippedNoDate++; stats.dateParseFailures++; }

      const rawCoordinator = raw.coordinator_name || raw['coordinator_name'] || '';
      const coordinator = safeJsonParse(rawCoordinator);
      const sbcName = coordinator?.salesAssistantBranchManager ||
                      (typeof rawCoordinator === 'string' && rawCoordinator.trim() && !rawCoordinator.startsWith('{')
                        ? rawCoordinator.trim() : null);

      const phoneDetails = normalizePhoneDetails(raw.phone_details);
      const tabletDetails = normalizeTabletDetails(raw.tablet_details);
      const demoboxDetails = normalizeDemoboxDetails(raw.demobox_details);
      const clothingDetails = normalizeClothingDetails(raw.clothing_details);
      const toolkitDetails = normalizeToolkitDetails(raw.toolkit_details);
      const izettleDetails = normalizeIzettleDetails(raw.iZettle_details || raw['iZettle_details']);

      const phone = yesNo(raw.phone) || hasDetailContent(raw.phone_details);
      const tablet = yesNo(raw.tablet) || hasDetailContent(raw.tablet_details);
      const demobox = yesNo(raw.demobox) || hasDetailContent(raw.demobox_details);
      const clothing = yesNo(raw.clothing) || hasDetailContent(raw.clothing_details);
      const toolkit = yesNo(raw.toolkit) || hasDetailContent(raw.toolkit_details);
      const izettle = yesNo(raw.iZettle || raw['iZettle']) || hasDetailContent(raw.iZettle_details || raw['iZettle_details']);
      const salesBinder = yesNo(raw.sales_binder);
      const idCard = yesNo(raw.id_card);
      const accessPass = yesNo(raw.access_pass);

      // Track field coverage
      if (phone) stats.fieldCoverage.phone++;
      if (tablet) stats.fieldCoverage.tablet++;
      if (demobox) stats.fieldCoverage.demobox++;
      if (clothing) stats.fieldCoverage.clothing++;
      if (toolkit) stats.fieldCoverage.toolkit++;
      if (izettle) stats.fieldCoverage.izettle++;
      if (salesBinder) stats.fieldCoverage.sales_binder++;
      if (idCard) stats.fieldCoverage.id_card++;
      if (accessPass) stats.fieldCoverage.access_pass++;

      /**
       * Canonical row hash — used as the deduplication key in the DB
       * (unique partial index on equipment_transactions.source_row_hash).
       *
       * Fields included: persId, txDate, txType, all boolean equipment flags,
       * and JSON-stringified detail objects (phoneDetails, demoboxDetails).
       * All inputs are already normalized (trimmed, lowercased booleans, parsed dates).
       *
       * IMPORTANT: Adding, removing, or reordering fields here will invalidate
       * every existing hash stored in the database. Any such change requires a
       * coordinated migration to rehash all historical rows.
       *
       * If the hash contract changes, plan a backfill migration that recomputes
       * hashes for all existing rows before deploying the new parser version.
       */
      const hashInput = [
        persId, txDate, txType,
        phone, tablet, demobox, clothing, toolkit, izettle,
        salesBinder, idCard, accessPass,
        JSON.stringify(phoneDetails), JSON.stringify(demoboxDetails),
      ].join('|');
      const hash = computeHashSync(hashInput);

      return {
        _key: `${persId}_${txDate}_${txType}`,
        _hash: hash,
        person_pers_id: String(persId),
        person_name: salesName,
        transaction_type: txType,
        transaction_date: txDate,
        phone,
        phone_details: phoneDetails,
        tablet,
        tablet_details: tabletDetails,
        demobox,
        demobox_details: demoboxDetails,
        clothing,
        clothing_details: clothingDetails,
        toolkit,
        toolkit_details: toolkitDetails,
        izettle,
        izettle_details: izettleDetails,
        sales_binder: salesBinder,
        id_card: idCard,
        access_pass: accessPass,
        sbc_name: sbcName,
      } as ImportEquipmentRow;
    })
    .filter((r): r is ImportEquipmentRow => r !== null);

  stats.parsedRows = rows.length;
  return { rows, stats };
}

// ── Generic Diff Engine ──

export function diffPeopleRows(
  incoming: ImportPeopleRow[],
  existing: ImportPeopleRow[]
): DiffResult<ImportPeopleRow> {
  const existingMap = new Map(existing.map(r => [r.pers_id, r]));
  const compareFields: (keyof ImportPeopleRow)[] = ['sales_name', 'sales_id', 'branch_id', 'branch_name', 'exit_date', 'sales_channel_start', 'contract_type'];

  const newRows: ImportPeopleRow[] = [];
  const modifiedRows: { row: ImportPeopleRow; existing: ImportPeopleRow; changes: FieldChange[] }[] = [];
  const unchangedRows: ImportPeopleRow[] = [];
  const warningRows: WarningRow<ImportPeopleRow>[] = [];
  const errorRows: ErrorRow<ImportPeopleRow>[] = [];

  const seenIds = new Set<string>();

  for (const row of incoming) {
    // Error: missing pers_id
    if (!row.pers_id) {
      errorRows.push({ row, reason: 'Missing Pers ID' });
      continue;
    }
    // Error: duplicate within file
    if (seenIds.has(row.pers_id)) {
      warningRows.push({ row, reason: `Duplicate Pers ID in file: ${row.pers_id}` });
      continue;
    }
    seenIds.add(row.pers_id);

    const ex = existingMap.get(row.pers_id);
    if (!ex) {
      newRows.push(row);
      continue;
    }
    const changes: FieldChange[] = [];
    for (const field of compareFields) {
      const oldVal = normalize(ex[field]);
      const newVal = normalize(row[field]);
      if (oldVal !== newVal) {
        changes.push({ field, oldValue: ex[field], newValue: row[field] });
      }
    }
    if (changes.length > 0) {
      modifiedRows.push({ row, existing: ex, changes });
    } else {
      unchangedRows.push(row);
    }
  }

  return { newRows, modifiedRows, unchangedRows, warningRows, errorRows };
}

// ── Exits-specific diff (does NOT modify name/branch/sales_id; only manages exit_date) ──

export interface ExitsActiveToExit {
  row: ImportPeopleRow;
  existing: ImportPeopleRow;
  suggestedExitDate: string | null;
}

export interface ExitsMismatch {
  row: ImportPeopleRow;
  existing: ImportPeopleRow;
  currentExitDate: string;
  newExitDate: string;
}

export interface ExitsDiffResult {
  missingInSystem: ImportPeopleRow[];
  activeToExit: ExitsActiveToExit[];
  exitDateMismatch: ExitsMismatch[];
  alreadyExitedSameDate: ImportPeopleRow[];
  warningRows: WarningRow<ImportPeopleRow>[];
  errorRows: ErrorRow<ImportPeopleRow>[];
}

export function diffExitsRows(
  incoming: ImportPeopleRow[],
  existing: ImportPeopleRow[]
): ExitsDiffResult {
  const existingMap = new Map(existing.map(r => [r.pers_id, r]));

  const missingInSystem: ImportPeopleRow[] = [];
  const activeToExit: ExitsActiveToExit[] = [];
  const exitDateMismatch: ExitsMismatch[] = [];
  const alreadyExitedSameDate: ImportPeopleRow[] = [];
  const warningRows: WarningRow<ImportPeopleRow>[] = [];
  const errorRows: ErrorRow<ImportPeopleRow>[] = [];

  const seen = new Set<string>();

  for (const row of incoming) {
    if (!row.pers_id) {
      errorRows.push({ row, reason: 'Missing Pers ID' });
      continue;
    }
    if (seen.has(row.pers_id)) {
      warningRows.push({ row, reason: `Duplicate Pers ID in file: ${row.pers_id}` });
      continue;
    }
    seen.add(row.pers_id);

    const ex = existingMap.get(row.pers_id);
    if (!ex) {
      missingInSystem.push(row);
      continue;
    }

    const currentExit = normalize(ex.exit_date);
    const newExit = normalize(row.exit_date);

    if (!currentExit && newExit) {
      activeToExit.push({ row, existing: ex, suggestedExitDate: row.exit_date });
    } else if (currentExit && newExit && currentExit !== newExit) {
      exitDateMismatch.push({
        row, existing: ex,
        currentExitDate: ex.exit_date as string,
        newExitDate: row.exit_date as string,
      });
    } else {
      // already exited with same date OR file has no exit_date — nothing to do
      alreadyExitedSameDate.push(row);
    }
  }

  return { missingInSystem, activeToExit, exitDateMismatch, alreadyExitedSameDate, warningRows, errorRows };
}

export function diffEquipmentRows(
  incoming: ImportEquipmentRow[],
  existingHashes: Set<string>,
  persMap: Map<string, string>
): DiffResult<ImportEquipmentRow> {
  const newRows: ImportEquipmentRow[] = [];
  const unchangedRows: ImportEquipmentRow[] = [];
  const warningRows: WarningRow<ImportEquipmentRow>[] = [];
  const errorRows: ErrorRow<ImportEquipmentRow>[] = [];

  for (const row of incoming) {
    const trimmedId = String(row.person_pers_id ?? '').trim();
    if (!trimmedId) {
      errorRows.push({ row, reason: 'Missing Person ID' });
      continue;
    }
    if (row.transaction_type !== 'Uitgifte' && row.transaction_type !== 'Ingeleverd') {
      errorRows.push({ row, reason: `Unknown transaction type: "${row.transaction_type}"` });
      continue;
    }
    if (!row.transaction_date) {
      errorRows.push({ row, reason: 'Missing transaction date' });
      continue;
    }
    if (!persMap.has(trimmedId)) {
      warningRows.push({ row, reason: `Person ${trimmedId} (${row.person_name}) not found in database` });
      continue;
    }
    if (existingHashes.has(row._hash)) {
      unchangedRows.push(row);
    } else {
      newRows.push(row);
    }
  }

  return { newRows, modifiedRows: [], unchangedRows, warningRows, errorRows };
}

// ── Extract missing people from equipment rows ──

export interface ExtractedPerson {
  pers_id: string;
  sales_id: string;
  sales_name: string;
  branch_id: number | null;
  branch_name: string | null;
}

export function extractMissingPeopleFromEquipment(
  rawRows: Record<string, any>[],
  existingPersIds: Set<string>,
  branches: { id: number; district_code: string; name: string }[]
): ExtractedPerson[] {
  const seen = new Map<string, ExtractedPerson>();

  for (const raw of rawRows) {
    const empDetails = safeJsonParse(raw.employee_details || raw['employee_details']);
    if (!empDetails) continue;
    const persId = String(empDetails.persID || empDetails.persId || '').trim();
    if (!persId || existingPersIds.has(persId) || seen.has(persId)) continue;

    const salesId = String(empDetails.salesID || empDetails.salesId || '').trim();
    const salesName = String(empDetails.salesName || empDetails.salesname || '').trim();
    if (!salesName) continue;

    // Try to resolve branch from location field
    const loc = safeJsonParse(raw.location || raw['location']);
    const districtCode = loc?.districtcode || loc?.district_code || '';
    const branch = districtCode
      ? branches.find(b => b.district_code === districtCode)
      : null;

    seen.set(persId, {
      pers_id: persId,
      sales_id: salesId,
      sales_name: salesName,
      branch_id: branch?.id ?? null,
      branch_name: branch?.district_code ?? (loc?.name || null),
    });
  }

  return Array.from(seen.values());
}

function normalize(val: any): string {
  if (val === null || val === undefined || val === '') return '';
  let s = String(val).trim().toLowerCase();
  // Normalize dates: remove leading zeros inconsistency
  if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(s)) {
    const [y, m, d] = s.split('-');
    s = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  return s;
}
