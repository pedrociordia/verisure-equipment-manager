/**
 * Data-quality guarantees. The engine must NEVER crash on malformed data.
 * Each scenario must produce a finite total and log a `dataQualityIssue`.
 */
import { describe, it, expect } from 'vitest';
import { calculatePersonDebt } from '../debt';
import type { EquipmentTransaction, EquipmentPrice, PhoneModel } from '@/types';

const PID = 'p-1';
const phoneModels: PhoneModel[] = [
  { id: '1', name: 'Samsung A25', price: 170, active: true, price_confirmed: true },
];
const prices: EquipmentPrice[] = [
  { id: 't1', category: 'toolkit', item_name: 'Trap', price: 140, active: true },
  { id: 'd1', category: 'demobox', item_name: 'Central Unit GW-CU2N', price: 83, active: true },
  { id: 'o1', category: 'other', item_name: 'ID Card', price: 100, active: true },
  { id: 'o2', category: 'other', item_name: 'Phone Charger', price: 10, active: true },
];

let n = 0;
const tx = (extra: Partial<EquipmentTransaction>): EquipmentTransaction => ({
  id: `tx-${++n}`, person_id: PID, transaction_type: 'Uitgifte', transaction_date: '2024-06-01',
  phone: false, phone_details: null, tablet: false, tablet_details: null,
  demobox: false, demobox_details: null, clothing: false, clothing_details: null,
  toolkit: false, toolkit_details: null, izettle: false, izettle_details: null,
  sales_binder: false, id_card: false, access_pass: false,
  sbc_user_id: null, sbc_name: null, sbc_signature: null, employee_signature: null,
  created_at: '2024-01-01', source_system: null, source_row_hash: null,
  import_batch_id: null, imported_at: null,
  ...extra,
} as EquipmentTransaction);

describe('Data-quality resilience', () => {
  it('toolkit complete=string ("Yes") → flagged as invalid_complete, treated as not complete', () => {
    const txs = [
      tx({ toolkit: true }),
      tx({ transaction_type: 'Ingeleverd', transaction_date: '2025-01-01', toolkit: true,
           toolkit_details: { complete: 'Yes', missing_parts: ['Trap'] } as any }),
    ];
    const r = calculatePersonDebt(PID, txs, prices, phoneModels, []);
    expect(r.dataQualityIssues.some(i => i.type === 'invalid_complete')).toBe(true);
    expect(r.toolkitDebt).toBe(140); // Trap charged because complete was not boolean true
  });

  it('unknown phone model → missing_price anomaly + €0 phone charge', () => {
    const txs = [
      tx({ phone: true, phone_details: { brand: 'Samsung XYZ-Imaginary', verisure_number: '111', imei_number: '350249607029864', charger: false, damage: 'Geen Schade' } as any }),
    ];
    const r = calculatePersonDebt(PID, txs, prices, phoneModels, []);
    expect(r.phonDebt).toBe(0);
    expect(r.phoneAnomalies.some(a => a.type === 'missing_price')).toBe(true);
  });

  it('transaction_type outside enum → unknown_tx_type issue, not a crash', () => {
    const txs = [tx({ transaction_type: 'GarbageType' as any, id_card: true })];
    const r = calculatePersonDebt(PID, txs, prices, phoneModels, []);
    expect(Number.isFinite(r.totalDebt)).toBe(true);
    expect(r.dataQualityIssues.some(i => i.type === 'unknown_tx_type')).toBe(true);
  });

  it('null details on flagged category → null_details issue, no crash', () => {
    const txs = [tx({ toolkit: true, toolkit_details: null })];
    const r = calculatePersonDebt(PID, txs, prices, phoneModels, []);
    expect(Number.isFinite(r.totalDebt)).toBe(true);
    expect(r.dataQualityIssues.some(i => i.category === 'toolkit' && i.type === 'null_details')).toBe(true);
  });

  it('more returned than given (clothing) → debt floors at €0, never negative', () => {
    const txs = [
      tx({ clothing: true, clothing_details: { items: ['Polo (1ste)'] } as any }),
      tx({ transaction_type: 'Ingeleverd', transaction_date: '2025-01-01', clothing: true,
           clothing_details: { items: ['Polo (1ste)', 'Polo (2de)', 'Winterjas'] } as any }),
    ];
    const r = calculatePersonDebt(PID, txs, prices, phoneModels, []);
    expect(r.clothingDebt).toBe(0);
    expect(r.totalDebt).toBeGreaterThanOrEqual(0);
  });

  it('missing DB price (boolean item) → €0 + missing_price issue', () => {
    // No "Sales Binder" row in fixture prices → missing_price logged
    const txs = [tx({ sales_binder: true })];
    const r = calculatePersonDebt(PID, txs, prices, phoneModels, []);
    expect(r.binderDebt).toBe(0);
    expect(r.dataQualityIssues.some(i => i.type === 'missing_price' && i.item === 'Sales Binder')).toBe(true);
  });
});
