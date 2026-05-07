import { describe, it, expect } from 'vitest';
import { calculatePersonDebt, DEMOBOX_ITEMS, normalizeItemName, isValidImei } from '../debt';
import type { EquipmentTransaction, EquipmentPrice, PhoneModel, TabletModel } from '@/types';

// ─── Factories ───

const PERSON_ID = 'person-1';
let txCounter = 0;

function makeTx(overrides: Partial<EquipmentTransaction> & { transaction_type: string; transaction_date: string }): EquipmentTransaction {
  txCounter++;
  return {
    id: `tx-${txCounter}`,
    person_id: PERSON_ID,
    phone: false, phone_details: null,
    tablet: false, tablet_details: null,
    demobox: false, demobox_details: null,
    clothing: false, clothing_details: null,
    toolkit: false, toolkit_details: null,
    izettle: false, izettle_details: null,
    sales_binder: false, id_card: false, access_pass: false,
    sbc_user_id: null, sbc_name: null, sbc_signature: null, employee_signature: null,
    created_at: '2024-01-01', source_system: null, source_row_hash: null,
    import_batch_id: null, imported_at: null,
    ...overrides,
  } as EquipmentTransaction;
}

const phoneModels: PhoneModel[] = [
  { id: '1', name: 'Samsung A55', price: 350, active: true, price_confirmed: true },
  { id: '2', name: 'Samsung A25', price: 170, active: true, price_confirmed: true },
  { id: '3', name: 'Samsung A34 5G', price: 305, active: true, price_confirmed: true },
];

const tabletModels: TabletModel[] = [
  { id: '1', name: 'Dell Latitude 5440', price: 350, active: true, price_confirmed: true },
];

// Mirrors the active rows in `equipment_prices` so tests run against the same
// pricing surface the engine sees in production. Keep this list in sync with DB.
const prices: EquipmentPrice[] = [
  // Demobox
  { id: 'd1', category: 'demobox', item_name: 'Central Unit GW-CU2N', price: 83, active: true },
  { id: 'd2', category: 'demobox', item_name: 'Smartlock Danalock GW-SL', price: 80, active: true },
  { id: 'd3', category: 'demobox', item_name: 'Smoke Detector GW-SD3', price: 24, active: true },
  { id: 'd4', category: 'demobox', item_name: 'ARLO Wire-Free Video Doorbell White', price: 88, active: true },
  { id: 'd5', category: 'demobox', item_name: 'ARLO Ess. XL ST CAMERA 1-PACK', price: 69, active: true },
  { id: 'd6', category: 'demobox', item_name: 'Camera One GW-MD-C1 (Orion)', price: 66, active: true },
  { id: 'd7', category: 'demobox', item_name: 'Arlo Essential Wired 1 cam', price: 52, active: true },
  { id: 'd8', category: 'demobox', item_name: 'Siren Voice Keypad GW-SVK', price: 47, active: true },
  { id: 'd9', category: 'demobox', item_name: 'Keypad GW-KP-MOK1 Mini Outdoor', price: 31, active: true },
  { id: 'd10', category: 'demobox', item_name: 'Remote control Keyfob GW-KF white/grey', price: 14, active: true },
  { id: 'd11', category: 'demobox', item_name: 'Magnet Contact GW-MC2-SHOCK', price: 7, active: true },
  // Toolkit
  { id: 't1', category: 'toolkit', item_name: 'Boor/Schroefmachine', price: 180, active: true },
  { id: 't2', category: 'toolkit', item_name: 'Trap', price: 140, active: true },
  { id: 't3', category: 'toolkit', item_name: 'Boormachine', price: 135, active: true },
  { id: 't4', category: 'toolkit', item_name: 'Gereedschap', price: 75, active: true },
  { id: 't5', category: 'toolkit', item_name: 'Oplader boormachine', price: 65, active: true },
  { id: 't6', category: 'toolkit', item_name: 'Koffer gereedschap', price: 40, active: true },
  { id: 't7', category: 'toolkit', item_name: 'Montageset', price: 25, active: true },
  // Clothing
  { id: 'c1', category: 'clothing', item_name: 'Winterjas', price: 75, active: true },
  { id: 'c2', category: 'clothing', item_name: 'Tussenjas', price: 75, active: true },
  { id: 'c3', category: 'clothing', item_name: 'Pullover (1ste)', price: 30, active: true },
  { id: 'c4', category: 'clothing', item_name: 'Pullover (2de)', price: 30, active: true },
  { id: 'c5', category: 'clothing', item_name: 'Overhemd (1ste)', price: 25, active: true },
  { id: 'c6', category: 'clothing', item_name: 'Overhemd (2de)', price: 25, active: true },
  { id: 'c7', category: 'clothing', item_name: 'Polo (1ste)', price: 25, active: true },
  { id: 'c8', category: 'clothing', item_name: 'Polo (2de)', price: 25, active: true },
  { id: 'c9', category: 'clothing', item_name: 'Paraplu', price: 25, active: true },
  { id: 'c10', category: 'clothing', item_name: 'Bodywarmer', price: 20, active: true },
  // Other
  { id: 'o1', category: 'other', item_name: 'iZettle', price: 80, active: true },
  { id: 'o2', category: 'other', item_name: 'iZettle (broken screen)', price: 40, active: true },
  { id: 'o3', category: 'other', item_name: 'ID Card', price: 100, active: true },
  { id: 'o4', category: 'other', item_name: 'Access Pass', price: 25, active: true },
  { id: 'o5', category: 'other', item_name: 'Sales Binder', price: 20, active: true },
  { id: 'o6', category: 'other', item_name: 'Phone Charger', price: 10, active: true },
  { id: 'o7', category: 'other', item_name: 'Tablet Charger', price: 10, active: true },
];

function calc(txs: EquipmentTransaction[]) {
  return calculatePersonDebt(PERSON_ID, txs, prices, phoneModels, tabletModels);
}

// ─── Tests ───

describe('calculatePersonDebt', () => {
  it('returns zero debt when no transactions', () => {
    const result = calc([]);
    expect(result.totalDebt).toBe(0);
    expect(result.handoutFlags.phone).toBe(false);
  });

  it('return without handout → 0 debt', () => {
    const txs = [makeTx({ transaction_type: 'Ingeleverd', transaction_date: '2024-06-01', phone: true, phone_details: { verisure_number: '123', brand: 'Samsung A55', imei: '', sim_pin: '', charger: true, damage: 'Geen Schade' } as any })];
    const result = calc(txs);
    expect(result.phonDebt).toBe(0);
    expect(result.handoutFlags.phone).toBe(false);
  });

  it('phone not returned → full model price', () => {
    const txs = [makeTx({ transaction_type: 'Uitgifte', transaction_date: '2024-01-01', phone: true, phone_details: { verisure_number: '123', brand: 'Samsung A55', imei: '', sim_pin: '', charger: false, damage: '' } as any })];
    const result = calc(txs);
    expect(result.phonDebt).toBe(350);
    expect(result.handoutFlags.phone).toBe(true);
  });

  it('phone returned damaged → full model price', () => {
    const txs = [
      makeTx({ transaction_type: 'Uitgifte', transaction_date: '2024-01-01', phone: true, phone_details: { verisure_number: '123', brand: 'Samsung A55', imei: '', sim_pin: '', charger: false, damage: '' } as any }),
      makeTx({ transaction_type: 'Ingeleverd', transaction_date: '2024-06-01', phone: true, phone_details: { verisure_number: '123', brand: 'Samsung A55', imei: '', sim_pin: '', charger: false, damage: 'Deuken of Krassen' } as any }),
    ];
    const result = calc(txs);
    expect(result.phonDebt).toBe(350);
  });

  it('phone returned good → 0', () => {
    const txs = [
      makeTx({ transaction_type: 'Uitgifte', transaction_date: '2024-01-01', phone: true, phone_details: { verisure_number: '123', brand: 'Samsung A55', imei: '', sim_pin: '', charger: false, damage: '' } as any }),
      makeTx({ transaction_type: 'Ingeleverd', transaction_date: '2024-06-01', phone: true, phone_details: { verisure_number: '123', brand: 'Samsung A55', imei: '', sim_pin: '', charger: false, damage: 'Geen Schade' } as any }),
    ];
    const result = calc(txs);
    expect(result.phonDebt).toBe(0);
  });

  it('phone charger given but not returned → +€10 (no double count)', () => {
    const txs = [
      makeTx({ transaction_type: 'Uitgifte', transaction_date: '2024-01-01', phone: true, phone_details: { verisure_number: '123', brand: 'Samsung A25', imei: '', sim_pin: '', charger: true, damage: '' } as any }),
    ];
    const result = calc(txs);
    // model (170) + charger (10) = 180
    expect(result.phonDebt).toBe(180);
    expect(result.handoutFlags.phone_charger).toBe(true);
  });

  it('phone charger given and returned → no charger debt', () => {
    const txs = [
      makeTx({ transaction_type: 'Uitgifte', transaction_date: '2024-01-01', phone: true, phone_details: { verisure_number: '123', brand: 'Samsung A25', imei: '', sim_pin: '', charger: true, damage: '' } as any }),
      makeTx({ transaction_type: 'Ingeleverd', transaction_date: '2024-06-01', phone: true, phone_details: { verisure_number: '123', brand: 'Samsung A25', imei: '', sim_pin: '', charger: true, damage: 'Geen Schade' } as any }),
    ];
    const result = calc(txs);
    expect(result.phonDebt).toBe(0);
  });

  it('multiple handouts — latest wins', () => {
    const txs = [
      makeTx({ transaction_type: 'Uitgifte', transaction_date: '2023-01-01', phone: true, phone_details: { verisure_number: '111', brand: 'Samsung A25', imei: '', sim_pin: '', charger: false, damage: '' } as any }),
      makeTx({ transaction_type: 'Ingeleverd', transaction_date: '2023-06-01', phone: true, phone_details: { verisure_number: '111', brand: 'Samsung A25', imei: '', sim_pin: '', charger: false, damage: 'Geen Schade' } as any }),
      // Upgrade to A55
      makeTx({ transaction_type: 'Uitgifte', transaction_date: '2024-01-01', phone: true, phone_details: { verisure_number: '222', brand: 'Samsung A55', imei: '', sim_pin: '', charger: false, damage: '' } as any }),
    ];
    const result = calc(txs);
    // Latest handout is A55, not returned
    expect(result.phonDebt).toBe(350);
  });

  it('return before latest handout does NOT cancel debt', () => {
    const txs = [
      makeTx({ transaction_type: 'Ingeleverd', transaction_date: '2023-12-01', phone: true, phone_details: { verisure_number: '111', brand: 'Samsung A25', imei: '', sim_pin: '', charger: false, damage: 'Geen Schade' } as any }),
      makeTx({ transaction_type: 'Uitgifte', transaction_date: '2024-01-01', phone: true, phone_details: { verisure_number: '222', brand: 'Samsung A55', imei: '', sim_pin: '', charger: false, damage: '' } as any }),
    ];
    const result = calc(txs);
    expect(result.phonDebt).toBe(350);
  });

  it('demobox partial return — only unreturned items charged', () => {
    const txs = [
      makeTx({
        transaction_type: 'Uitgifte', transaction_date: '2024-01-01', demobox: true,
        demobox_details: { installation_number: '1', items: ['Central Unit GW-CU2N', 'Smartlock Danalock GW-SL', 'Smoke Detector GW-SD3'] } as any,
      }),
      makeTx({
        transaction_type: 'Ingeleverd', transaction_date: '2024-06-01', demobox: true,
        demobox_details: { installation_number: '1', items: ['Central Unit GW-CU2N'] } as any,
      }),
    ];
    const result = calc(txs);
    expect(result.demoboxItemDebts['Central Unit GW-CU2N']).toBe(0);
    expect(result.demoboxItemDebts['Smartlock Danalock GW-SL']).toBe(80);
    expect(result.demoboxItemDebts['Smoke Detector GW-SD3']).toBe(24); // fallback price
    expect(result.handoutFlags.demobox['Central Unit GW-CU2N']).toBe(true);
    expect(result.handoutFlags.demobox['Smoke Detector GW-SD3']).toBe(true);
    // Items not given should not appear
    expect(result.handoutFlags.demobox['Magnet Contact GW-MC2-SHOCK']).toBeUndefined();
  });

  it('clothing partial return — cardinality preserved', () => {
    const txs = [
      makeTx({
        transaction_type: 'Uitgifte', transaction_date: '2024-01-01', clothing: true,
        clothing_details: { items: ['Winterjas', 'Polo (1ste)', 'Polo (2de)'] } as any,
      }),
      makeTx({
        transaction_type: 'Ingeleverd', transaction_date: '2024-06-01', clothing: true,
        clothing_details: { items: ['Winterjas', 'Polo (1ste)'] } as any,
      }),
    ];
    const result = calc(txs);
    // Unreturned: Polo (2de) = €25
    expect(result.clothingDebt).toBe(25);
  });

  it('clothing — 2 identical items given, 1 returned → debt for 1', () => {
    const txs = [
      makeTx({
        transaction_type: 'Uitgifte', transaction_date: '2024-01-01', clothing: true,
        clothing_details: { items: ['Pullover (1ste)', 'Pullover (1ste)'] } as any,
      }),
      makeTx({
        transaction_type: 'Ingeleverd', transaction_date: '2024-06-01', clothing: true,
        clothing_details: { items: ['Pullover (1ste)'] } as any,
      }),
    ];
    const result = calc(txs);
    expect(result.clothingDebt).toBe(30); // 1 × €30
  });

  it('toolkit not returned → €500 (capped from €660 raw)', () => {
    const txs = [makeTx({ transaction_type: 'Uitgifte', transaction_date: '2024-01-01', toolkit: true })];
    const result = calc(txs);
    expect(result.toolkitDebt).toBe(500);
    expect(result.dataQualityIssues.some(i => i.category === 'toolkit' && i.type === 'cap_applied')).toBe(true);
  });

  it('toolkit returned complete → €0', () => {
    const txs = [
      makeTx({ transaction_type: 'Uitgifte', transaction_date: '2024-01-01', toolkit: true }),
      makeTx({ transaction_type: 'Ingeleverd', transaction_date: '2024-06-01', toolkit: true, toolkit_details: { complete: true, missing_parts: [] } as any }),
    ];
    const result = calc(txs);
    expect(result.toolkitDebt).toBe(0);
  });

  it('toolkit "Niets ontbreekt" → €0', () => {
    const txs = [
      makeTx({ transaction_type: 'Uitgifte', transaction_date: '2024-01-01', toolkit: true }),
      makeTx({ transaction_type: 'Ingeleverd', transaction_date: '2024-06-01', toolkit: true, toolkit_details: { complete: false, missing_parts: ['Niets ontbreekt'] } as any }),
    ];
    const result = calc(txs);
    expect(result.toolkitDebt).toBe(0);
  });

  it('toolkit with missing parts → sum of those parts', () => {
    const txs = [
      makeTx({ transaction_type: 'Uitgifte', transaction_date: '2024-01-01', toolkit: true }),
      makeTx({ transaction_type: 'Ingeleverd', transaction_date: '2024-06-01', toolkit: true, toolkit_details: { complete: false, missing_parts: ['Trap', 'Montageset'] } as any }),
    ];
    const result = calc(txs);
    expect(result.toolkitDebt).toBe(140 + 25); // 165
  });

  it('iZettle not returned → €80', () => {
    const txs = [makeTx({ transaction_type: 'Uitgifte', transaction_date: '2024-01-01', izettle: true })];
    const result = calc(txs);
    expect(result.izettleDebt).toBe(80);
  });

  it('iZettle broken screen → €40', () => {
    const txs = [
      makeTx({ transaction_type: 'Uitgifte', transaction_date: '2024-01-01', izettle: true }),
      makeTx({ transaction_type: 'Ingeleverd', transaction_date: '2024-06-01', izettle: true, izettle_details: { damage: 'Gebroken Scherm' } as any }),
    ];
    const result = calc(txs);
    expect(result.izettleDebt).toBe(40);
  });

  it('iZettle no damage → €0', () => {
    const txs = [
      makeTx({ transaction_type: 'Uitgifte', transaction_date: '2024-01-01', izettle: true }),
      makeTx({ transaction_type: 'Ingeleverd', transaction_date: '2024-06-01', izettle: true, izettle_details: { damage: 'Geen Schade' } as any }),
    ];
    const result = calc(txs);
    expect(result.izettleDebt).toBe(0);
  });

  it('boolean items — id_card given not returned → €100', () => {
    const txs = [makeTx({ transaction_type: 'Uitgifte', transaction_date: '2024-01-01', id_card: true })];
    const result = calc(txs);
    expect(result.idCardDebt).toBe(100);
    expect(result.handoutFlags.id_card).toBe(true);
  });

  it('boolean items — access_pass given and returned → €0', () => {
    const txs = [
      makeTx({ transaction_type: 'Uitgifte', transaction_date: '2024-01-01', access_pass: true }),
      makeTx({ transaction_type: 'Ingeleverd', transaction_date: '2024-06-01', access_pass: true }),
    ];
    const result = calc(txs);
    expect(result.accessPassDebt).toBe(0);
    expect(result.handoutFlags.access_pass).toBe(true);
  });

  it('total debt sums all categories', () => {
    const txs = [
      makeTx({ transaction_type: 'Uitgifte', transaction_date: '2024-01-01', phone: true, phone_details: { verisure_number: '123', brand: 'Samsung A25', imei: '', sim_pin: '', charger: true, damage: '' } as any, id_card: true, sales_binder: true }),
    ];
    const result = calc(txs);
    // phone 170 + charger 10 + id_card 100 + binder 20 = 300
    expect(result.totalDebt).toBe(300);
  });

  it('no transactions → zero debt with empty handout flags', () => {
    const result = calc([]);
    expect(result.totalDebt).toBe(0);
    expect(result.breakdown).toHaveLength(0);
    expect(result.handoutFlags.phone).toBe(false);
    expect(result.handoutFlags.toolkit).toBe(false);
    expect(Object.keys(result.demoboxItemDebts)).toHaveLength(0);
  });

  it('demobox missing DB price → €0 + missing_price data-quality issue (no silent fallback)', () => {
    const txs = [
      makeTx({
        transaction_type: 'Uitgifte', transaction_date: '2024-01-01', demobox: true,
        demobox_details: { items: ['Smoke Detector GW-SD3'] } as any,
      }),
    ];
    const result = calculatePersonDebt(PERSON_ID, txs, [], phoneModels, tabletModels);
    expect(result.demoboxItemDebts['Smoke Detector GW-SD3']).toBe(0);
    expect(result.dataQualityIssues.some(i => i.type === 'missing_price' && i.item === 'Smoke Detector GW-SD3')).toBe(true);
  });

  it('same-day return of old phone does NOT cancel new handout debt', () => {
    const txs = [
      makeTx({ transaction_type: 'Ingeleverd', transaction_date: '2024-01-15', phone: true, phone_details: { verisure_number: '111', brand: 'Samsung A25', imei: '', sim_pin: '', charger: false, damage: 'Geen Schade' } as any }),
      makeTx({ transaction_type: 'Uitgifte', transaction_date: '2024-01-15', phone: true, phone_details: { verisure_number: '222', brand: 'Samsung A55', imei: '', sim_pin: '', charger: true, damage: '' } as any }),
    ];
    const result = calc(txs);
    // New handout A55 (350) + charger (10) = 360, old return same day should NOT cancel it
    expect(result.phonDebt).toBe(360);
    expect(result.handoutFlags.phone).toBe(true);
    expect(result.handoutFlags.phone_charger).toBe(true);
  });

  it('normalizeItemName handles invisible chars and dash variants', () => {
    expect(normalizeItemName('hello\u00A0world')).toBe('hello world');
    expect(normalizeItemName('a–b—c')).toBe('a-b-c');
    expect(normalizeItemName('  HELLO  WORLD  ')).toBe('hello world');
  });
});

// ═══════════════════════════════════════════════
// Phone debt — IMEI-based (Dossier TC1-TC10)
// ═══════════════════════════════════════════════

const REAL_IMEI_A = '355088506285028';
const REAL_IMEI_B = '355088506687363';
const REAL_IMEI_C = '350249607029864';
const FAKE_IMEI = '123456789123456';

function phoneTx(opts: {
  type: 'Uitgifte' | 'Ingeleverd';
  date: string;
  imei: string;
  brand: string;
  damage?: string;
  charger?: boolean;
  vNum?: string;
}): EquipmentTransaction {
  return makeTx({
    transaction_type: opts.type,
    transaction_date: opts.date,
    phone: true,
    phone_details: {
      verisure_number: opts.vNum ?? '0612345678',
      brand: opts.brand,
      phone_model: opts.brand,
      imei_number: opts.imei,
      imei: opts.imei,
      sim_pin: '0000',
      charger: opts.charger ?? false,
      damage: opts.damage ?? '',
    } as any,
  });
}

describe('Phone debt — IMEI-based (Dossier)', () => {
  it('isValidImei: rejects placeholders and bad formats', () => {
    expect(isValidImei('355088506285028')).toBe(true);
    expect(isValidImei('123456789123456')).toBe(false);
    expect(isValidImei('000000000000000')).toBe(false);
    expect(isValidImei('111111111111111')).toBe(false);
    expect(isValidImei('999999999999999')).toBe(false);
    expect(isValidImei('123')).toBe(false);
    expect(isValidImei('')).toBe(false);
    expect(isValidImei(null)).toBe(false);
    expect(isValidImei('Geen sticker!!!')).toBe(false);
    expect(isValidImei('3.52984E+14')).toBe(false);
  });

  it('TC1: A34 5G no devuelto → €305', () => {
    const r = calc([phoneTx({ type: 'Uitgifte', date: '2024-06-04', imei: REAL_IMEI_A, brand: 'Samsung A34 5G' })]);
    expect(r.phonDebt).toBe(305);
  });

  it('TC2: A55 devuelto Broken screen → €350', () => {
    const r = calc([
      phoneTx({ type: 'Uitgifte',  date: '2024-06-04', imei: REAL_IMEI_A, brand: 'Samsung A55' }),
      phoneTx({ type: 'Ingeleverd', date: '2026-04-01', imei: REAL_IMEI_A, brand: 'Samsung A55', damage: 'Gebroken Scherm' }),
    ]);
    expect(r.phonDebt).toBe(350);
  });

  it('TC3: A55 devuelto OK → €0', () => {
    const r = calc([
      phoneTx({ type: 'Uitgifte',  date: '2024-06-04', imei: REAL_IMEI_A, brand: 'Samsung A55' }),
      phoneTx({ type: 'Ingeleverd', date: '2026-04-01', imei: REAL_IMEI_A, brand: 'Samsung A55', damage: 'Geen Schade' }),
    ]);
    expect(r.phonDebt).toBe(0);
  });

  it('TC4: A34 5G + charger, devolvió teléfono OK pero no charger → €10', () => {
    const r = calc([
      phoneTx({ type: 'Uitgifte',  date: '2024-06-04', imei: REAL_IMEI_A, brand: 'Samsung A34 5G', charger: true }),
      phoneTx({ type: 'Ingeleverd', date: '2026-04-01', imei: REAL_IMEI_A, brand: 'Samsung A34 5G', damage: 'Geen Schade', charger: false }),
    ]);
    expect(r.phonDebt).toBe(10);
  });

  it('TC5: 5 receivings duplicados del mismo IMEI, todos OK → €0', () => {
    const r = calc([
      phoneTx({ type: 'Uitgifte',  date: '2024-06-04', imei: REAL_IMEI_A, brand: 'Samsung A55' }),
      phoneTx({ type: 'Ingeleverd', date: '2026-03-01', imei: REAL_IMEI_A, brand: 'Samsung A55', damage: 'Geen Schade' }),
      phoneTx({ type: 'Ingeleverd', date: '2026-03-15', imei: REAL_IMEI_A, brand: 'Samsung A55', damage: 'Geen Schade' }),
      phoneTx({ type: 'Ingeleverd', date: '2026-04-01', imei: REAL_IMEI_A, brand: 'Samsung A55', damage: 'Geen Schade' }),
      phoneTx({ type: 'Ingeleverd', date: '2026-04-15', imei: REAL_IMEI_A, brand: 'Samsung A55', damage: 'Geen Schade' }),
      phoneTx({ type: 'Ingeleverd', date: '2026-04-22', imei: REAL_IMEI_A, brand: 'Samsung A55', damage: 'Geen Schade' }),
    ]);
    expect(r.phonDebt).toBe(0);
  });

  it('TC6: Giving A34 5G, Return A35 5G mismo IMEI OK → €0 + warning model_mismatch', () => {
    const r = calc([
      phoneTx({ type: 'Uitgifte',  date: '2024-10-14', imei: REAL_IMEI_B, brand: 'Samsung A34 5G' }),
      phoneTx({ type: 'Ingeleverd', date: '2026-03-26', imei: REAL_IMEI_B, brand: 'Samsung A35 5G', damage: 'Geen Schade' }),
    ]);
    expect(r.phonDebt).toBe(0);
    expect(r.phoneAnomalies.some(a => a.type === 'model_mismatch')).toBe(true);
  });

  it('TC8: modelo no en phone_models → €0 + anomalía missing_price', () => {
    const r = calc([
      phoneTx({ type: 'Uitgifte', date: '2024-06-04', imei: REAL_IMEI_A, brand: 'Samsung Z999 Unknown' }),
    ]);
    expect(r.phonDebt).toBe(0);
    expect(r.phoneAnomalies.some(a => a.type === 'missing_price')).toBe(true);
  });

  it('TC9: IMEI placeholder 123456789123456 → invalid_imei skips phone AND charger (€0)', () => {
    const r = calc([
      phoneTx({ type: 'Uitgifte', date: '2026-02-06', imei: FAKE_IMEI, brand: 'Samsung A35 5G', charger: true }),
    ]);
    expect(r.phonDebt).toBe(0); // entire phone tx (incl. charger) treated as anomalous
    expect(r.phoneAnomalies.some(a => a.type === 'invalid_imei')).toBe(true);
  });

  it('TC10: phoneDebt nunca negativo', () => {
    const r = calc([
      phoneTx({ type: 'Ingeleverd', date: '2026-04-01', imei: REAL_IMEI_A, brand: 'Samsung A55', damage: 'Geen Schade' }),
    ]);
    expect(r.phonDebt).toBe(0);
    expect(r.phoneAnomalies.some(a => a.type === 'orphan_return')).toBe(true);
  });

  it('Tom Fraanje: 2 IMEIs (uno OK, uno Broken screen) → €305', () => {
    const r = calc([
      // IMEI A: entregado y devuelto roto
      phoneTx({ type: 'Uitgifte',  date: '2024-06-04', imei: REAL_IMEI_A, brand: 'Samsung A34 5G' }),
      phoneTx({ type: 'Ingeleverd', date: '2026-04-01', imei: REAL_IMEI_A, brand: 'Samsung A34 5G', damage: 'Gebroken Scherm' }),
      // IMEI B: entregado con charger y devuelto OK con charger
      phoneTx({ type: 'Uitgifte',  date: '2024-10-14', imei: REAL_IMEI_B, brand: 'Samsung A34 5G', charger: true }),
      phoneTx({ type: 'Ingeleverd', date: '2026-03-26', imei: REAL_IMEI_B, brand: 'Samsung A35 5G', damage: 'Geen Schade', charger: true }),
    ]);
    expect(r.phonDebt).toBe(305);
  });

  it('Abdel Ali: IMEI falso con charger → €0 (charger excluido también)', () => {
    const r = calc([
      phoneTx({ type: 'Uitgifte', date: '2026-02-06', imei: FAKE_IMEI, brand: 'Samsung A35 5G', charger: true }),
    ]);
    expect(r.phonDebt).toBe(0);
  });

  it('Brenda Bouman: model mismatch + duplicados, todos OK → €0', () => {
    const r = calc([
      phoneTx({ type: 'Uitgifte',  date: '2024-10-14', imei: REAL_IMEI_B, brand: 'Samsung A34 5G', charger: true }),
      phoneTx({ type: 'Ingeleverd', date: '2026-03-26', imei: REAL_IMEI_B, brand: 'Samsung A35 5G', damage: 'Geen Schade', charger: true }),
      phoneTx({ type: 'Ingeleverd', date: '2026-04-22', imei: REAL_IMEI_B, brand: 'Samsung A35 5G', damage: 'Geen Schade', charger: true }),
      phoneTx({ type: 'Ingeleverd', date: '2026-04-22', imei: REAL_IMEI_B, brand: 'Samsung A35 5G', damage: 'Geen Schade', charger: true }),
      phoneTx({ type: 'Ingeleverd', date: '2026-04-24', imei: REAL_IMEI_B, brand: 'Samsung A35 5G', damage: 'Geen Schade', charger: true }),
    ]);
    expect(r.phonDebt).toBe(0);
  });

  // ─── TC11: orphan return con IMEI propio (Receiving puro, sin Giving previo) ───
  it('TC11: orphan return — Receiving sin Giving previo → €0 + anomalía con IMEI correcto', () => {
    const r = calc([
      phoneTx({ type: 'Uitgifte',  date: '2024-06-04', imei: REAL_IMEI_A, brand: 'Samsung A55' }),
      phoneTx({ type: 'Ingeleverd', date: '2026-04-01', imei: REAL_IMEI_A, brand: 'Samsung A55', damage: 'Geen Schade' }),
      // Receiving huérfano de un IMEI distinto que nunca se entregó
      phoneTx({ type: 'Ingeleverd', date: '2026-04-22', imei: REAL_IMEI_C, brand: 'Samsung A55', damage: 'Geen Schade' }),
    ]);
    expect(r.phonDebt).toBe(0);
    const orphans = r.phoneAnomalies.filter(a => a.type === 'orphan_return');
    expect(orphans.length).toBeGreaterThanOrEqual(1);
    expect(orphans.some(a => a.imei === REAL_IMEI_C)).toBe(true);
  });

  // ─── TC12: Tom Fraanje real (regresión completa) ───
  // 2 IMEIs: A34 5G devuelto Broken screen (€305) + A55 devuelto OK con charger no devuelto (€10)
  it('TC12: Tom Fraanje real — 2 IMEIs, uno dañado y otro con charger perdido → €315', () => {
    const r = calc([
      phoneTx({ type: 'Uitgifte',  date: '2024-06-04', imei: REAL_IMEI_A, brand: 'Samsung A34 5G', charger: true }),
      phoneTx({ type: 'Ingeleverd', date: '2026-04-01', imei: REAL_IMEI_A, brand: 'Samsung A34 5G', damage: 'Gebroken Scherm', charger: true }),
      phoneTx({ type: 'Uitgifte',  date: '2024-10-14', imei: REAL_IMEI_B, brand: 'Samsung A55', charger: true }),
      phoneTx({ type: 'Ingeleverd', date: '2026-03-26', imei: REAL_IMEI_B, brand: 'Samsung A55', damage: 'Geen Schade', charger: false }),
    ]);
    // A34 dañado (305) + charger A55 no devuelto (10) = 315
    expect(r.phonDebt).toBe(315);
  });

  // ─── Normalización: lookup tolerante a whitespace y case en el modelo ───
  it('lookup: brand con doble espacio y mayúsculas distintas encuentra el modelo', () => {
    const r = calc([
      phoneTx({ type: 'Uitgifte', date: '2024-06-04', imei: REAL_IMEI_A, brand: '  samsung   a55  ' }),
    ]);
    expect(r.phonDebt).toBe(350);
    expect(r.phoneAnomalies.some(a => a.type === 'missing_price')).toBe(false);
  });

  // ─── Normalización: damage en EN/NL/null/vacío/"n/a" → no cobra ───
  it('damage normalization: "No damage", "N/A", null, "" → no cobra', () => {
    const cases: Array<string | null | undefined> = ['No damage', 'NO DAMAGE', 'no damage', 'N/A', 'n/a', '', null as any, undefined as any, 'Geen Schade', 'GEEN SCHADE'];
    for (const damage of cases) {
      const r = calc([
        phoneTx({ type: 'Uitgifte',  date: '2024-06-04', imei: REAL_IMEI_A, brand: 'Samsung A55' }),
        phoneTx({ type: 'Ingeleverd', date: '2026-04-01', imei: REAL_IMEI_A, brand: 'Samsung A55', damage: damage as any }),
      ]);
      expect(r.phonDebt, `damage=${JSON.stringify(damage)} should be 0`).toBe(0);
    }
  });

  // ─── Filtro phone_number robusto ───
  it('phone_number "0", "null", "" → la transacción se ignora (no entra al cálculo)', () => {
    const badNums = ['', '0', 'null', 'N/A', 'undefined'];
    for (const vNum of badNums) {
      const r = calc([
        phoneTx({ type: 'Uitgifte', date: '2024-06-04', imei: REAL_IMEI_A, brand: 'Samsung A55', vNum }),
      ]);
      expect(r.phonDebt, `vNum=${JSON.stringify(vNum)} should yield 0`).toBe(0);
      expect(r.handoutFlags.phone, `vNum=${JSON.stringify(vNum)} should not flag handout`).toBe(false);
    }
  });
});

// ─── asOf snapshot ───
describe('calculatePersonDebt — asOf snapshot', () => {
  it('asOf in the past returns a snapshot ignoring later transactions', () => {
    const txs = [
      makeTx({ transaction_type: 'Uitgifte', transaction_date: '2024-06-01', id_card: true }),
      makeTx({ transaction_type: 'Ingeleverd', transaction_date: '2025-01-15', id_card: true }),
    ];
    const snap = calculatePersonDebt(PERSON_ID, txs, prices, phoneModels, tabletModels, new Date('2024-12-31'));
    const today = calculatePersonDebt(PERSON_ID, txs, prices, phoneModels, tabletModels);
    expect(snap.idCardDebt).toBe(100);
    expect(today.idCardDebt).toBe(0);
  });

  it('asOf far in the future ≡ omitting asOf', () => {
    const txs = [
      makeTx({ transaction_type: 'Uitgifte', transaction_date: '2024-06-01', sales_binder: true }),
    ];
    const a = calculatePersonDebt(PERSON_ID, txs, prices, phoneModels, tabletModels);
    const b = calculatePersonDebt(PERSON_ID, txs, prices, phoneModels, tabletModels, new Date('2099-01-01'));
    expect(a.totalDebt).toBe(b.totalDebt);
  });
});
