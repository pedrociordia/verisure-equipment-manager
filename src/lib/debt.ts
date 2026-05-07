import type { EquipmentTransaction, EquipmentPrice, PhoneModel, TabletModel, PhoneAnomaly, DataQualityIssue } from '@/types';

// ═══════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════

export interface DebtBreakdown {
  category: string;
  item: string;
  amount: number;
}

export interface HandoutFlags {
  phone: boolean;
  phone_charger: boolean;
  tablet: boolean;
  tablet_charger: boolean;
  demobox: Record<string, boolean>; // keyed by canonical DEMOBOX_ITEMS name
  clothing: boolean;
  toolkit: boolean;
  izettle: boolean;
  sales_binder: boolean;
  id_card: boolean;
  access_pass: boolean;
}

export interface PersonDebt {
  totalDebt: number;
  breakdown: DebtBreakdown[];
  demoboxItemDebts: Record<string, number>;
  phonDebt: number;
  tabletDebt: number;
  toolkitDebt: number;
  izettleDebt: number;
  clothingDebt: number;
  idCardDebt: number;
  accessPassDebt: number;
  binderDebt: number;
  handoutFlags: HandoutFlags;
  phoneAnomalies: PhoneAnomaly[];
  dataQualityIssues: DataQualityIssue[];
}

/** Hard caps agreed with Operations (Charelle, 2026-05): components are
 *  used, not new, so the never-returned total is capped. */
export const DEMOBOX_CAP = 500;
export const TOOLKIT_CAP = 500;

// ═══════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════

export const DEMOBOX_ITEMS = [
  'ARLO Wire-Free Video Doorbell White',
  'Central Unit GW-CU2N',
  'Smartlock Danalock GW-SL',
  'ARLO Ess. XL ST CAMERA 1-PACK',
  'Camera One GW-MD-C1 (Orion)',
  'Arlo Essential Wired 1 cam',
  'Siren Voice Keypad GW-SVK',
  'Keypad GW-KP-MOK1 Mini Outdoor',
  'Smoke Detector GW-SD3',
  'Remote control Keyfob GW-KF white/grey',
  'Magnet Contact GW-MC2-SHOCK',
] as const;

export const DEMOBOX_SHORT_LABELS: Record<string, string> = {
  'ARLO Wire-Free Video Doorbell White': 'Arlo WFree VD',
  'Central Unit GW-CU2N': 'Central Unit',
  'Smartlock Danalock GW-SL': 'Smartlock',
  'ARLO Ess. XL ST CAMERA 1-PACK': 'Arlo Ess. XL SL CAM',
  'Camera One GW-MD-C1 (Orion)': 'Camera One (Orion)',
  'Arlo Essential Wired 1 cam': 'Arlo Ess Wir. 1 cam',
  'Siren Voice Keypad GW-SVK': 'Siren Voice KP',
  'Keypad GW-KP-MOK1 Mini Outdoor': 'Keypad GW-KP',
  'Smoke Detector GW-SD3': 'Smoke Detector',
  'Remote control Keyfob GW-KF white/grey': 'Remote Keyfob',
  'Magnet Contact GW-MC2-SHOCK': 'Magnet',
};

// Pricing source-of-truth is the DB (`equipment_prices`, `phone_models`, `tablet_models`).
// No fallback maps — a missing DB price is a config error and is surfaced as a
// `missing_price` data-quality issue (the item then contributes €0 to the total).

// ═══════════════════════════════════════════════
// Helpers — small, testable, reusable
// ═══════════════════════════════════════════════

const floor0 = (v: number) => Math.max(0, v);

/** Normalize string for reliable matching: trim, lowercase, collapse whitespace, normalize invisible chars and dashes */
export function normalizeItemName(s: string): string {
  return s
    .replace(/[\u00A0\u200B\u200C\u200D\uFEFF]/g, ' ')
    .replace(/[-–—]/g, '-')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

/** Normalize damage values — handles both English (MoreApp import) and Dutch (wizard).
 *  Treats null/undefined/""/"n/a"/"no damage"/"geen schade" (any casing) as the canonical
 *  no-damage sentinel `'Geen Schade'` so callers can do `damage !== 'Geen Schade'` safely. */
const DAMAGE_NORMALIZE_MAP: Record<string, string> = {
  '': 'Geen Schade',
  'n/a': 'Geen Schade',
  'na': 'Geen Schade',
  'none': 'Geen Schade',
  'no damage': 'Geen Schade',
  'geen schade': 'Geen Schade',
  'broken screen': 'Gebroken Scherm',
  'gebroken scherm': 'Gebroken Scherm',
  'dents or scratches': 'Deuken of Krassen',
  'deuken of krassen': 'Deuken of Krassen',
  'not functioning': 'Niet Functionerend',
  'niet functionerend': 'Niet Functionerend',
  'lost or stolen': 'Verloren of Gestolen',
  'verloren of gestolen': 'Verloren of Gestolen',
};

export function normalizeDamageValue(val: string | undefined | null): string | undefined {
  if (val == null) return 'Geen Schade';
  const trimmed = String(val).trim();
  const lower = trimmed.toLowerCase().replace(/\s+/g, ' ');
  if (lower in DAMAGE_NORMALIZE_MAP) return DAMAGE_NORMALIZE_MAP[lower];
  return trimmed; // unknown damage label → preserve as-is, treated as damaged
}

/** Normalize a free-text phone/tablet model name for reliable catalog lookup.
 *  Trims, collapses whitespace, lowercases. Returns '' for falsy input. */
export function normalizePhoneModel(raw: string | undefined | null): string {
  if (!raw) return '';
  return String(raw).trim().replace(/\s+/g, ' ').toLowerCase();
}

/** Robust phone_number / verisure_number validity check. Filters out the many ways
 *  a "missing" value sneaks in from Google Sheets imports. */
function isValidPhoneNumber(num: unknown): boolean {
  if (num == null) return false;
  const s = String(num).trim().toLowerCase();
  return s !== '' && s !== 'n/a' && s !== 'na' && s !== '0' && s !== 'null' && s !== 'undefined';
}

/**
 * Match a raw item name against a canonical name.
 * Priority: normalized exact match first, then includes-based fallback.
 */
function matchesCanonical(raw: string, canonical: string): boolean {
  const normRaw = normalizeItemName(raw);
  const normCanon = normalizeItemName(canonical);
  if (normRaw === normCanon) return true;
  // Controlled fallback: only if one fully contains the other
  return normRaw.includes(normCanon) || normCanon.includes(normRaw);
}

/**
 * Find the latest transaction of a given type where a boolean field is true.
 * Transactions must already be sorted by transaction_date descending.
 */
function findLatestHandout(
  sorted: EquipmentTransaction[],
  field: keyof EquipmentTransaction,
): EquipmentTransaction | undefined {
  return sorted.find(t => t.transaction_type === 'Uitgifte' && t[field] === true);
}

/**
 * Find the latest return for a category dated >= the handout date.
 */
function findReturnAfter(
  sorted: EquipmentTransaction[],
  field: keyof EquipmentTransaction,
  afterDate: string,
): EquipmentTransaction | undefined {
  return sorted.find(
    t => t.transaction_type === 'Ingeleverd' &&
         t[field] === true &&
         t.transaction_date > afterDate,
  );
}

/**
 * Boolean item debt: given but not returned = price.
 */
function computeBooleanDebt(
  sorted: EquipmentTransaction[],
  field: keyof EquipmentTransaction,
  price: number,
): { debt: number; hadHandout: boolean } {
  const handout = findLatestHandout(sorted, field);
  if (!handout) return { debt: 0, hadHandout: false };
  const ret = findReturnAfter(sorted, field, handout.transaction_date);
  return { debt: ret ? 0 : price, hadHandout: true };
}

/**
 * Validate IMEI: must be 15 numeric digits and not a placeholder.
 */
const IMEI_BLACKLIST = new Set([
  '123456789123456', '123456789012345', '000000000000000',
  '111111111111111', '222222222222222', '333333333333333',
  '444444444444444', '555555555555555', '666666666666666',
  '777777777777777', '888888888888888', '999999999999999',
  '012345678901234',
]);

export function isValidImei(imei: string | undefined | null): boolean {
  if (!imei) return false;
  const trimmed = String(imei).trim();
  if (!/^\d{15}$/.test(trimmed)) return false;
  if (IMEI_BLACKLIST.has(trimmed)) return false;
  if (/^(\d)\1{14}$/.test(trimmed)) return false;
  return true;
}

/**
 * Strip clothing ordinals like "Pullover (2de)" → "Pullover" so a single DB
 * row can price every variant. We try both the stripped form and the original.
 */
function stripClothingOrdinal(item: string): string {
  return item.replace(/\s*\((1ste|2de|3de|4de|5de)\)\s*$/i, '').trim();
}

// ═══════════════════════════════════════════════
// Main calculation function
// ═══════════════════════════════════════════════

export function calculatePersonDebt(
  personId: string,
  transactions: EquipmentTransaction[],
  prices: EquipmentPrice[],
  phoneModels: PhoneModel[],
  tabletModels: TabletModel[] = [],
  asOf?: Date,
): PersonDebt {
  // asOf snapshot: filter out transactions strictly after the cutoff (date-only).
  // When omitted, behavior is identical to pre-snapshot semantics.
  if (asOf) {
    const cutoff = asOf.toISOString().slice(0, 10);
    transactions = transactions.filter(t => t.transaction_date <= cutoff);
  }
  const breakdown: DebtBreakdown[] = [];
  const demoboxItemDebts: Record<string, number> = {};
  const phoneAnomalies: PhoneAnomaly[] = [];
  const dataQualityIssues: DataQualityIssue[] = [];
  const handoutFlags: HandoutFlags = {
    phone: false, phone_charger: false,
    tablet: false, tablet_charger: false,
    demobox: {},
    clothing: false, toolkit: false, izettle: false,
    sales_binder: false, id_card: false, access_pass: false,
  };

  // Filter & sort descending by date. Also flag unknown transaction_types so
  // they show up in `dataQualityIssues` instead of silently being ignored.
  const personTxsRaw = transactions.filter(t => t.person_id === personId);
  for (const t of personTxsRaw) {
    if (t.transaction_type !== 'Uitgifte' && t.transaction_type !== 'Ingeleverd') {
      dataQualityIssues.push({
        category: 'other',
        type: 'unknown_tx_type',
        detail: `tx ${t.id}: '${String(t.transaction_type)}'`,
      });
    }
  }
  const personTxs = personTxsRaw
    .filter(t => t.transaction_type === 'Uitgifte' || t.transaction_type === 'Ingeleverd')
    .sort((a, b) => new Date(b.transaction_date).getTime() - new Date(a.transaction_date).getTime());

  if (personTxs.length === 0) {
    const empty = emptyDebt();
    return { ...empty, dataQualityIssues };
  }

  /** DB-only price lookup. Returns 0 and logs a `missing_price` data-quality
   *  issue if the item has no active row in `equipment_prices`. */
  const getPrice = (itemName: string, category: DataQualityIssue['category']): number => {
    const p = prices.find(pr => pr.item_name === itemName && pr.active);
    if (p) return Number(p.price);
    dataQualityIssues.push({ category, type: 'missing_price', item: itemName });
    return 0;
  };

  /** Charger price (kept as a category-neutral helper since it spans phone+tablet).
   *  Fail-loud per agreed principle: missing DB row → log `missing_price` and return 0. */
  const chargerPrice = (category: DataQualityIssue['category'] = 'other'): number => {
    const p = prices.find(pr => pr.item_name === 'Phone Charger' && pr.active);
    if (p) return Number(p.price);
    dataQualityIssues.push({ category, type: 'missing_price', item: 'Phone Charger' });
    return 0;
  };

  /** Tablet charger: prefer dedicated row, fall back to Phone Charger row, else fail loud once. */
  const tabletChargerPrice = (): number => {
    const t = prices.find(pr => pr.item_name === 'Tablet Charger' && pr.active);
    if (t) return Number(t.price);
    const p = prices.find(pr => pr.item_name === 'Phone Charger' && pr.active);
    if (p) return Number(p.price);
    dataQualityIssues.push({ category: 'tablet', type: 'missing_price', item: 'Tablet Charger' });
    return 0;
  };

  // ─── PHONE (per-IMEI matching) ───
  let phonDebt = 0;
  const phoneTxs = personTxs.filter(t => {
    if (!t.phone) return false;
    const d = t.phone_details as any;
    return isValidPhoneNumber(d?.verisure_number);
  });

  if (phoneTxs.length > 0) {
    // Group by IMEI (fall back to verisure_number when IMEI is absent — happens with legacy / wizard tx)
    type PhoneTx = EquipmentTransaction & { _key: string; _imei: string };
    const groups = new Map<string, { givings: PhoneTx[]; returns: PhoneTx[] }>();
    const orphanReturns: PhoneTx[] = [];

    for (const t of phoneTxs) {
      const d = t.phone_details as any;
      const imei = String(d?.imei_number ?? d?.imei ?? '').trim();
      const fallbackKey = String(d?.verisure_number ?? '').trim();
      const key = imei || fallbackKey;
      if (!key) continue;
      const wrapped = { ...t, _key: key, _imei: imei } as PhoneTx;
      if (!groups.has(key)) groups.set(key, { givings: [], returns: [] });
      const g = groups.get(key)!;
      if (t.transaction_type === 'Uitgifte') g.givings.push(wrapped);
      else g.returns.push(wrapped);
    }

    for (const [key, { givings, returns }] of groups.entries()) {
      // Sort ascending
      givings.sort((a, b) => a.transaction_date.localeCompare(b.transaction_date));
      returns.sort((a, b) => a.transaction_date.localeCompare(b.transaction_date));

      if (givings.length === 0) {
        orphanReturns.push(...returns);
        continue;
      }

      handoutFlags.phone = true;

      const latestGiving = givings[givings.length - 1];
      const givingDetails = latestGiving.phone_details as any;
      const brand = givingDetails?.brand || givingDetails?.phone_model;
      const imeiForReport = latestGiving._imei || key;

      // Validate IMEI ONLY when one was actually provided.
      // If the giving has no IMEI (legacy / wizard tx without it) we trust verisure_number as the key.
      const imeiProvided = !!latestGiving._imei;
      const imeiValid = imeiProvided ? isValidImei(latestGiving._imei) : true;
      if (imeiProvided && !imeiValid) {
        phoneAnomalies.push({ imei: imeiForReport, type: 'invalid_imei', detail: brand });
      }

      // Look up price by Giving model
      const brandKey = normalizePhoneModel(brand);
      const modelEntry = brandKey
        ? phoneModels.find(m => normalizePhoneModel(m.name) === brandKey)
        : undefined;
      const phonePrice = modelEntry ? Number(modelEntry.price) : 0;

      const validReturns = returns; // duplicates collapse via "any return = returned"
      const hasReturn = validReturns.length > 0;
      const latestReturn = hasReturn ? validReturns[validReturns.length - 1] : undefined;

      // Duplicate return detection (warning only): 2+ Ingeleverd same IMEI same date
      if (returns.length >= 2) {
        const dateCounts = new Map<string, number>();
        for (const r of returns) dateCounts.set(r.transaction_date, (dateCounts.get(r.transaction_date) || 0) + 1);
        for (const [date, count] of dateCounts.entries()) {
          if (count >= 2) {
            phoneAnomalies.push({
              imei: imeiForReport, type: 'duplicate_return',
              detail: `${count} Returns on ${date}`,
            });
          }
        }
      }

      // Model mismatch detection (warning only)
      if (hasReturn) {
        const retBrand = (latestReturn!.phone_details as any)?.brand;
        if (retBrand && brand && retBrand !== brand) {
          phoneAnomalies.push({
            imei: imeiForReport, type: 'model_mismatch',
            detail: `Giving: ${brand} / Return: ${retBrand}`,
          });
        }
      }

      // Charge phone (only if IMEI valid)
      if (imeiValid) {
        if (!modelEntry && brand) {
          phoneAnomalies.push({ imei: imeiForReport, type: 'missing_price', detail: brand });
        }

        if (!hasReturn) {
          phonDebt += phonePrice;
          if (phonePrice > 0) {
            breakdown.push({ category: 'Phone', item: brand || 'Unknown', amount: phonePrice });
          }
        } else {
          const damage = normalizeDamageValue((latestReturn!.phone_details as any)?.damage);
          if (damage && damage !== 'Geen Schade') {
            phonDebt += phonePrice;
            if (phonePrice > 0) {
              breakdown.push({ category: 'Phone', item: `${brand} (Damaged)`, amount: phonePrice });
            }
          }
        }
      }

      // Charger — skipped entirely when IMEI is invalid (whole Phone tx treated as anomalous).
      // Operations rule: invalid IMEI = garbage handout, do not bill the charger either.
      if (givingDetails?.charger && imeiValid) {
        handoutFlags.phone_charger = true;
        const returnedCharger = hasReturn && (latestReturn!.phone_details as any)?.charger === true;
        if (!returnedCharger) {
          const cp = chargerPrice('phone');
          phonDebt += cp;
          if (cp > 0) breakdown.push({ category: 'Phone', item: 'Charger', amount: cp });
        }
      }
    }

    for (const r of orphanReturns) {
      const d = r.phone_details as any;
      phoneAnomalies.push({
        imei: String(d?.imei_number ?? '').trim() || 'unknown',
        type: 'orphan_return',
        detail: `Return on ${r.transaction_date} without prior Giving`,
      });
    }
  }
  phonDebt = floor0(phonDebt);

  // ─── TABLET / LAPTOP ───
  let tabletDebt = 0;
  const tabletHandout = findLatestHandout(personTxs, 'tablet');
  if (tabletHandout) {
    handoutFlags.tablet = true;
    if (tabletHandout.tablet_details == null) {
      dataQualityIssues.push({ category: 'tablet', type: 'null_details', detail: `tx ${tabletHandout.id}` });
    }
    const details = tabletHandout.tablet_details as any;
    const brand = details?.brand;
    const brandKey = normalizePhoneModel(brand);
    const model = brandKey
      ? tabletModels.find(m => normalizePhoneModel(m.name) === brandKey)
      : undefined;
    const tabletPrice = model ? Number(model.price) : 0;
    if (brand && !model) {
      dataQualityIssues.push({ category: 'tablet', type: 'missing_price', item: brand });
    }
    const tabletReturn = findReturnAfter(personTxs, 'tablet', tabletHandout.transaction_date);

    if (!tabletReturn) {
      tabletDebt = tabletPrice;
      breakdown.push({ category: 'Tablet', item: brand || 'Unknown', amount: tabletPrice });
      if (details?.charger) {
        handoutFlags.tablet_charger = true;
        const cp = tabletChargerPrice();
        tabletDebt += cp;
        breakdown.push({ category: 'Tablet', item: 'Charger', amount: cp });
      }
    } else {
      const returnDetails = tabletReturn.tablet_details as any;
      const tabDamage = normalizeDamageValue(returnDetails?.damage);
      if (tabDamage && tabDamage !== 'Geen Schade') {
        tabletDebt = tabletPrice;
        breakdown.push({ category: 'Tablet', item: `${brand} (Damaged)`, amount: tabletPrice });
      }
      if (details?.charger) {
        handoutFlags.tablet_charger = true;
        if (!returnDetails?.charger) {
          const cp = tabletChargerPrice();
          tabletDebt += cp;
          breakdown.push({ category: 'Tablet', item: 'Charger', amount: cp });
        }
      }
    }
  }
  tabletDebt = floor0(tabletDebt);

  // ─── DEMOBOX (per-item, then capped at DEMOBOX_CAP) ───
  // Single-branch logic only: aggregate unreturned items from the latest Giving
  // cycle. The "Demobox Complete Unit" representation does not exist in real
  // data and is intentionally not coded for. Cap applied to the components total.
  const demoboxHandout = findLatestHandout(personTxs, 'demobox');
  let demoboxRawTotal = 0;
  if (demoboxHandout) {
    if (demoboxHandout.demobox_details == null) {
      dataQualityIssues.push({ category: 'demobox', type: 'null_details', detail: `tx ${demoboxHandout.id}` });
    }
    const givenItems: string[] = (demoboxHandout.demobox_details as any)?.items || [];
    const demoboxReturn = findReturnAfter(personTxs, 'demobox', demoboxHandout.transaction_date);
    const returnedItems: string[] = demoboxReturn ? ((demoboxReturn.demobox_details as any)?.items || []) : [];

    for (const canonicalName of DEMOBOX_ITEMS) {
      const wasGiven = givenItems.some(i => matchesCanonical(i, canonicalName));
      if (wasGiven) {
        handoutFlags.demobox[canonicalName] = true;
        const wasReturned = returnedItems.some(i => matchesCanonical(i, canonicalName));
        if (!wasReturned) {
          const price = getPrice(canonicalName, 'demobox');
          demoboxItemDebts[canonicalName] = floor0(price);
          demoboxRawTotal += price;
          if (price > 0) {
            breakdown.push({ category: 'Demobox', item: canonicalName, amount: price });
          }
        } else {
          demoboxItemDebts[canonicalName] = 0;
        }
      }
    }
  }
  // Apply demobox cap to the items total (raw breakdown is preserved for transparency)
  const demoboxTotalCapped = Math.min(demoboxRawTotal, DEMOBOX_CAP);
  if (demoboxRawTotal > DEMOBOX_CAP) {
    dataQualityIssues.push({
      category: 'demobox',
      type: 'cap_applied',
      raw: demoboxRawTotal,
      capped: DEMOBOX_CAP,
    });
  }

  // ─── CLOTHING (cardinality-aware, DB-only pricing) ───
  let clothingDebt = 0;
  const clothingHandout = findLatestHandout(personTxs, 'clothing');
  if (clothingHandout) {
    handoutFlags.clothing = true;
    if (clothingHandout.clothing_details == null) {
      dataQualityIssues.push({ category: 'clothing', type: 'null_details', detail: `tx ${clothingHandout.id}` });
    }
    const givenItems: string[] = (clothingHandout.clothing_details as any)?.items || [];
    const clothingReturn = findReturnAfter(personTxs, 'clothing', clothingHandout.transaction_date);
    const returnedItems: string[] = clothingReturn ? ((clothingReturn.clothing_details as any)?.items || []) : [];

    // Track returns as a mutable pool to preserve cardinality
    const returnedPool = [...returnedItems];

    for (const item of givenItems) {
      const matchIdx = returnedPool.indexOf(item);
      if (matchIdx !== -1) {
        // Matched — remove from pool so duplicate items are counted correctly
        returnedPool.splice(matchIdx, 1);
      } else {
        // Unreturned — DB-only pricing. Wizard data uses both bare names
        // ("Pullover") and ordinaled names ("Pullover (2de)"). The DB stores
        // ordinaled rows for variants. Try in order: exact → "(1ste)" variant
        // → ordinal-stripped form. Only log missing_price if all three miss.
        const tryNames = [item];
        const stripped = stripClothingOrdinal(item);
        if (stripped === item) tryNames.push(`${item} (1ste)`);
        else tryNames.push(stripped);
        let price = 0;
        let pricedAs = item;
        const issuesBefore = dataQualityIssues.length;
        for (const name of tryNames) {
          price = getPrice(name, 'clothing');
          if (price > 0) { pricedAs = name; break; }
        }
        // Roll back any speculative missing_price logs from the failed attempts,
        // then log a single one if every attempt failed.
        dataQualityIssues.length = issuesBefore;
        if (price === 0) {
          dataQualityIssues.push({ category: 'clothing', type: 'missing_price', item });
        }
        clothingDebt += price;
        if (price > 0) {
          breakdown.push({ category: 'Clothing', item, amount: price });
        }
      }
    }
  }
  clothingDebt = floor0(clothingDebt);

  // ─── TOOLKIT (DB-only pricing, capped at TOOLKIT_CAP) ───
  let toolkitDebt = 0;
  let toolkitRawTotal = 0;
  const TOOLKIT_PARTS = [
    'Boor/Schroefmachine', 'Trap', 'Boormachine', 'Gereedschap',
    'Oplader boormachine', 'Koffer gereedschap', 'Montageset',
  ];
  const toolkitHandout = findLatestHandout(personTxs, 'toolkit');
  if (toolkitHandout) {
    handoutFlags.toolkit = true;
    if (toolkitHandout.toolkit_details == null) {
      dataQualityIssues.push({ category: 'toolkit', type: 'null_details', detail: `tx ${toolkitHandout.id}` });
    }
    const toolkitReturn = findReturnAfter(personTxs, 'toolkit', toolkitHandout.transaction_date);

    if (!toolkitReturn) {
      // Never returned → charge full toolkit (sum of DB part prices)
      for (const part of TOOLKIT_PARTS) {
        const price = getPrice(part, 'toolkit');
        toolkitRawTotal += price;
        if (price > 0) breakdown.push({ category: 'Toolkit', item: part, amount: price });
      }
      toolkitDebt = toolkitRawTotal;
    } else {
      const returnDetails = toolkitReturn.toolkit_details as any;
      const completeRaw = returnDetails?.complete;
      if (completeRaw === true) {
        toolkitDebt = 0;
      } else if (completeRaw !== false && completeRaw != null) {
        // Non-boolean (string, number, etc.) — log and treat as "not complete"
        dataQualityIssues.push({
          category: 'toolkit',
          type: 'invalid_complete',
          detail: `tx ${toolkitReturn.id}: complete=${JSON.stringify(completeRaw)}`,
        });
      }
      if (toolkitDebt === 0 && completeRaw !== true) {
        const missing: string[] = returnDetails?.missing_parts || [];
        if (!missing.includes('Niets ontbreekt')) {
          for (const part of missing) {
            const price = getPrice(part, 'toolkit');
            if (price > 0) {
              toolkitRawTotal += price;
              breakdown.push({ category: 'Toolkit', item: part, amount: price });
            }
          }
          toolkitDebt = toolkitRawTotal;
        }
      }
    }
  }
  // Apply toolkit cap
  const toolkitDebtCapped = Math.min(toolkitDebt, TOOLKIT_CAP);
  if (toolkitDebt > TOOLKIT_CAP) {
    dataQualityIssues.push({
      category: 'toolkit',
      type: 'cap_applied',
      raw: toolkitDebt,
      capped: TOOLKIT_CAP,
    });
  }
  toolkitDebt = floor0(toolkitDebtCapped);

  // ─── iZETTLE (DB-only pricing) ───
  let izettleDebt = 0;
  const izettlePriceFull = getPrice('iZettle', 'izettle');
  const izettlePriceBroken = getPrice('iZettle (broken screen)', 'izettle');
  const izettleHandout = findLatestHandout(personTxs, 'izettle');
  if (izettleHandout) {
    handoutFlags.izettle = true;
    if (izettleHandout.izettle_details == null) {
      // Note: izettle is often flagged true with null details (boolean-style use). Don't log.
    }
    const izettleReturn = findReturnAfter(personTxs, 'izettle', izettleHandout.transaction_date);

    if (!izettleReturn) {
      izettleDebt = izettlePriceFull;
      breakdown.push({ category: 'iZettle', item: 'iZettle (not returned)', amount: izettlePriceFull });
    } else {
      const damage = normalizeDamageValue((izettleReturn.izettle_details as any)?.damage);
      if (damage === 'Geen Schade') {
        izettleDebt = 0;
      } else if (damage === 'Gebroken Scherm') {
        izettleDebt = izettlePriceBroken;
        breakdown.push({ category: 'iZettle', item: 'iZettle (broken screen)', amount: izettlePriceBroken });
      } else if (damage) {
        izettleDebt = izettlePriceFull;
        breakdown.push({ category: 'iZettle', item: `iZettle (${damage})`, amount: izettlePriceFull });
      }
    }
  }
  izettleDebt = floor0(izettleDebt);

  // ─── BOOLEAN ITEMS (DB-only pricing) ───
  const idCardPrice = getPrice('ID Card', 'other');
  const idCard = computeBooleanDebt(personTxs, 'id_card', idCardPrice);
  handoutFlags.id_card = idCard.hadHandout;
  if (idCard.debt > 0) breakdown.push({ category: 'Other', item: 'ID Card', amount: idCardPrice });

  const accessPassPrice = getPrice('Access Pass', 'other');
  const accessPass = computeBooleanDebt(personTxs, 'access_pass', accessPassPrice);
  handoutFlags.access_pass = accessPass.hadHandout;
  if (accessPass.debt > 0) breakdown.push({ category: 'Other', item: 'Access Pass', amount: accessPassPrice });

  const binderPrice = getPrice('Sales Binder', 'other');
  const binder = computeBooleanDebt(personTxs, 'sales_binder', binderPrice);
  handoutFlags.sales_binder = binder.hadHandout;
  if (binder.debt > 0) breakdown.push({ category: 'Other', item: 'Binder', amount: binderPrice });

  // ─── TOTAL ───
  const totalDebt = floor0(
    phonDebt + tabletDebt + demoboxTotalCapped + toolkitDebt +
    izettleDebt + clothingDebt + idCard.debt + accessPass.debt + binder.debt,
  );

  return {
    totalDebt,
    breakdown,
    demoboxItemDebts,
    phonDebt,
    tabletDebt,
    toolkitDebt,
    izettleDebt,
    clothingDebt,
    idCardDebt: idCard.debt,
    accessPassDebt: accessPass.debt,
    binderDebt: binder.debt,
    handoutFlags,
    phoneAnomalies,
    dataQualityIssues,
  };
}

function emptyDebt(): PersonDebt {
  return {
    totalDebt: 0,
    breakdown: [],
    demoboxItemDebts: {},
    phonDebt: 0,
    tabletDebt: 0,
    toolkitDebt: 0,
    izettleDebt: 0,
    clothingDebt: 0,
    idCardDebt: 0,
    accessPassDebt: 0,
    binderDebt: 0,
    handoutFlags: {
      phone: false, phone_charger: false,
      tablet: false, tablet_charger: false,
      demobox: {},
      clothing: false, toolkit: false, izettle: false,
      sales_binder: false, id_card: false, access_pass: false,
    },
    phoneAnomalies: [],
    dataQualityIssues: [],
  };
}
