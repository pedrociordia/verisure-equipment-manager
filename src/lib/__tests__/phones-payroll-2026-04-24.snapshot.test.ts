/**
 * Snapshot test — Payroll 24-04-2026 (Phones)
 *
 * Regression guard for the IMEI-based phone debt logic. Fixtures below are a
 * frozen dump of real `equipment_transactions` rows (only `phone=true`) for
 * the 4 SE that defined the original bug surface:
 *
 *   - Tom Fraanje (305834): 1 IMEI, returned with broken screen → €305
 *   - Abdel Ali (352651):    fake IMEI placeholder + charger      → €10  (charger only)
 *   - Brenda Bouman (314236): 1 IMEI with model mismatch + dup returns → €0
 *   - Dustin van der Heiden (355092): 1 IMEI never returned        → €170
 *
 * If you touch `src/lib/debt.ts` and break any of these, this PR fails CI.
 * Do NOT edit fixtures to make a test pass — fix the logic instead.
 */
import { describe, it, expect } from 'vitest';
import { calculatePersonDebt } from '../debt';
import type { EquipmentTransaction, PhoneModel } from '@/types';

// ─── Frozen catalog (matches DB on 2026-04-24) ─────────────────────────────
const phoneModels: PhoneModel[] = [
  { id: 'pm-a25',   name: 'Samsung A25',     price: 170, active: true, price_confirmed: true },
  { id: 'pm-a34',   name: 'Samsung A34 5G',  price: 305, active: true, price_confirmed: true },
  { id: 'pm-a35',   name: 'Samsung A35 5G',  price: 320, active: true, price_confirmed: true },
  { id: 'pm-a55',   name: 'Samsung A55',     price: 350, active: true, price_confirmed: true },
];

// ─── Helper to build minimal EquipmentTransaction rows ─────────────────────
let counter = 0;
function tx(personId: string, type: 'Uitgifte' | 'Ingeleverd', date: string, details: any): EquipmentTransaction {
  counter++;
  return {
    id: `snap-${counter}`,
    person_id: personId,
    transaction_type: type,
    transaction_date: date,
    sbc_user_id: null, sbc_name: null, sbc_signature: null, employee_signature: null,
    phone: true, phone_details: details,
    tablet: false, tablet_details: null,
    demobox: false, demobox_details: null,
    clothing: false, clothing_details: null,
    toolkit: false, toolkit_details: null,
    izettle: false, izettle_details: null,
    sales_binder: false, id_card: false, access_pass: false,
    created_at: '2024-01-01',
    source_system: 'historical_import', source_row_hash: null,
    import_batch_id: null, imported_at: null,
  } as EquipmentTransaction;
}

// ─── Frozen fixtures (verbatim from production) ────────────────────────────

// Tom Fraanje — pers_id 305834
const TOM = 'bc6a5deb-9c97-46c7-b851-ca5079d4e509';
const tomTxs: EquipmentTransaction[] = [
  tx(TOM, 'Uitgifte',  '2024-06-04', {
    brand: 'Samsung A34 5G', phone_model: 'Samsung A34 5G',
    imei_number: '355088506285028', verisure_number: '0683496034',
    charger: false, damage: 'Geen Schade',
  }),
  tx(TOM, 'Ingeleverd', '2026-04-01', {
    brand: 'Samsung A34 5G', phone_model: 'Samsung A34 5G',
    imei_number: '355088506285028', verisure_number: '0683496034',
    charger: false, damage: 'Gebroken Scherm',
  }),
];

// Abdel Ali — pers_id 352651
const ABDEL = '39db5f45-b997-4cf1-bd04-b98f72bc4959';
const abdelTxs: EquipmentTransaction[] = [
  tx(ABDEL, 'Uitgifte', '2026-02-06', {
    brand: 'Samsung A35 5G', phone_model: 'Samsung A35 5G',
    imei_number: '123456789123456', // fake IMEI placeholder
    verisure_number: '0622688583',
    charger: true, damage: 'Geen Schade',
  }),
];

// Brenda Bouman — pers_id 314236
const BRENDA = '8faa3662-e8de-470b-aba8-ba6a51dd77bd';
const brendaTxs: EquipmentTransaction[] = [
  tx(BRENDA, 'Uitgifte',  '2024-10-14', {
    brand: 'Samsung A34 5G', phone_model: 'Samsung A34 5G',
    imei_number: '355088506687363', verisure_number: '0683693731',
    charger: true, damage: 'Geen Schade',
  }),
  tx(BRENDA, 'Ingeleverd', '2026-03-26', {
    brand: 'Samsung A35 5G', phone_model: 'Samsung A35 5G', // mismatch w/ Giving brand
    imei_number: '355088506687363', verisure_number: '0683693731',
    charger: true, damage: 'Geen Schade',
  }),
  tx(BRENDA, 'Ingeleverd', '2026-04-22', {
    brand: 'Samsung A35 5G', imei_number: '355088506687363', verisure_number: '0683693731',
    charger: true, damage: 'Geen Schade',
  }),
  tx(BRENDA, 'Ingeleverd', '2026-04-22', {
    brand: 'Samsung A35 5G', imei_number: '355088506687363', verisure_number: '0683693731',
    charger: true, damage: 'Geen Schade',
  }),
  tx(BRENDA, 'Ingeleverd', '2026-04-24', {
    brand: 'Samsung A35 5G', imei_number: '355088506687363', verisure_number: '0683693731',
    charger: true, damage: 'Geen Schade',
  }),
];

// Dustin van der Heiden — pers_id 355092
const DUSTIN = '8c1ca647-85c5-4147-91db-b3bca6be1d70';
const dustinTxs: EquipmentTransaction[] = [
  tx(DUSTIN, 'Uitgifte', '2026-02-27', {
    brand: 'Samsung A25', phone_model: 'Samsung A25',
    imei_number: '350249607029864', verisure_number: '0622999661',
    charger: false, damage: 'Geen Schade',
  }),
];

// ─── Snapshot ──────────────────────────────────────────────────────────────
describe('Snapshot — Phone debt @ payroll 2026-04-24', () => {
  it('Tom Fraanje (305834) → €305 (A34 5G returned with broken screen)', () => {
    const r = calculatePersonDebt(TOM, tomTxs, [], phoneModels, []);
    expect(r.phonDebt).toBe(305);
  });

  it('Abdel Ali (352651) → €0 (fake IMEI skips phone AND charger)', () => {
    const r = calculatePersonDebt(ABDEL, abdelTxs, [], phoneModels, []);
    expect(r.phonDebt).toBe(0);
    expect(r.phoneAnomalies.some(a => a.type === 'invalid_imei')).toBe(true);
  });

  it('Brenda Bouman (314236) → €0 (returned despite model mismatch + duplicate returns on 2026-04-22)', () => {
    const r = calculatePersonDebt(BRENDA, brendaTxs, [], phoneModels, []);
    expect(r.phonDebt).toBe(0);
    expect(r.phoneAnomalies.some(a => a.type === 'model_mismatch')).toBe(true);
    expect(r.phoneAnomalies.some(a => a.type === 'duplicate_return')).toBe(true);
  });

  it('Dustin van der Heiden (355092) → €170 (A25 never returned)', () => {
    const r = calculatePersonDebt(DUSTIN, dustinTxs, [], phoneModels, []);
    expect(r.phonDebt).toBe(170);
  });
});
