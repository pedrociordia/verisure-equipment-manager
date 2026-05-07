/**
 * Per-SE isolation guard. Two SEs in the same `transactions[]` array with
 * overlapping dates must yield distinct, non-contaminated totals.
 */
import { describe, it, expect } from 'vitest';
import { calculatePersonDebt } from '../debt';
import type { EquipmentTransaction, EquipmentPrice, PhoneModel } from '@/types';

const A = 'person-a';
const B = 'person-b';

const phoneModels: PhoneModel[] = [
  { id: '1', name: 'Samsung A25', price: 170, active: true, price_confirmed: true },
  { id: '2', name: 'Samsung A55', price: 350, active: true, price_confirmed: true },
];
const prices: EquipmentPrice[] = [
  { id: 'o1', category: 'other', item_name: 'ID Card', price: 100, active: true },
  { id: 'o2', category: 'other', item_name: 'Sales Binder', price: 20, active: true },
  { id: 'o3', category: 'other', item_name: 'Phone Charger', price: 10, active: true },
];

let n = 0;
const tx = (person_id: string, type: 'Uitgifte' | 'Ingeleverd', date: string, extra: Partial<EquipmentTransaction>): EquipmentTransaction => ({
  id: `tx-${++n}`, person_id, transaction_type: type, transaction_date: date,
  phone: false, phone_details: null, tablet: false, tablet_details: null,
  demobox: false, demobox_details: null, clothing: false, clothing_details: null,
  toolkit: false, toolkit_details: null, izettle: false, izettle_details: null,
  sales_binder: false, id_card: false, access_pass: false,
  sbc_user_id: null, sbc_name: null, sbc_signature: null, employee_signature: null,
  created_at: '2024-01-01', source_system: null, source_row_hash: null,
  import_batch_id: null, imported_at: null,
  ...extra,
} as EquipmentTransaction);

describe('Per-SE isolation', () => {
  it('two SEs with overlapping dates produce distinct totals', () => {
    const txs: EquipmentTransaction[] = [
      // Person A: phone given, never returned (€170) + ID card (€100)
      tx(A, 'Uitgifte', '2024-06-01', { phone: true, phone_details: { brand: 'Samsung A25', verisure_number: '111', imei_number: '350249607029864', charger: false, damage: 'Geen Schade' } as any, id_card: true }),
      // Person B: phone given (€350) + binder (€20), same date
      tx(B, 'Uitgifte', '2024-06-01', { phone: true, phone_details: { brand: 'Samsung A55', verisure_number: '222', imei_number: '350249607029999', charger: false, damage: 'Geen Schade' } as any, sales_binder: true }),
      // Person B returns phone clean
      tx(B, 'Ingeleverd', '2025-01-15', { phone: true, phone_details: { brand: 'Samsung A55', verisure_number: '222', imei_number: '350249607029999', charger: false, damage: 'Geen Schade' } as any }),
    ];
    const a = calculatePersonDebt(A, txs, prices, phoneModels, []);
    const b = calculatePersonDebt(B, txs, prices, phoneModels, []);
    expect(a.totalDebt).toBe(270); // 170 + 100
    expect(b.totalDebt).toBe(20);  // binder only
    expect(a.idCardDebt).toBe(100);
    expect(b.idCardDebt).toBe(0);
    expect(b.binderDebt).toBe(20);
    expect(a.binderDebt).toBe(0);
  });
});
