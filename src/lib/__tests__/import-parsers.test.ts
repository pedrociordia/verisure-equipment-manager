import { describe, it, expect } from 'vitest';
import { parseEuropeanDate, parseEquipmentCsv, extractMissingPeopleFromEquipment, computeHashSync } from '../import-parsers';

describe('parseEuropeanDate', () => {
  it('converts Excel serial number 44186 to a valid date', () => {
    expect(parseEuropeanDate(44186)).toBe('2020-12-21');
  });

  it('converts Excel serial number as string', () => {
    expect(parseEuropeanDate('44375.083333333336')).toBe('2021-06-28');
  });

  it('handles European dd-mm-yyyy', () => {
    expect(parseEuropeanDate('15-12-2020')).toBe('2020-12-15');
  });

  it('handles ISO yyyy-mm-dd', () => {
    expect(parseEuropeanDate('2020-12-15')).toBe('2020-12-15');
  });

  it('handles ISO with time', () => {
    expect(parseEuropeanDate('2020-12-15T10:00:00Z')).toBe('2020-12-15');
  });

  it('handles Date objects', () => {
    expect(parseEuropeanDate(new Date('2020-12-15'))).toBe('2020-12-15');
  });

  it('returns null for empty/null', () => {
    expect(parseEuropeanDate(null)).toBeNull();
    expect(parseEuropeanDate('')).toBeNull();
    expect(parseEuropeanDate(undefined)).toBeNull();
  });
});

describe('parseEquipmentCsv', () => {
  const makeRow = (overrides: Record<string, any> = {}) => ({
    employee_details: JSON.stringify({ persId: '12345', salesId: '100SG', salesName: 'Test Person' }),
    transaction: 'Giving',
    date: '2021-06-22',
    phone: 'Yes',
    phone_details: JSON.stringify([{ phone_number: '06123', phone_model: 'Samsung', imei_number: '111', pin_code: '1234', charger: 'Yes', phone_damage: 'No damage' }]),
    tablet: 'No',
    tablet_details: '[]',
    demobox: 'No',
    demobox_details: '[]',
    clothing: 'No',
    clothing_details: '[]',
    toolkit: 'No',
    toolkit_details: '[]',
    iZettle: 'No',
    iZettle_details: '[]',
    sales_binder: 'No',
    id_card: 'No',
    access_pass: 'No',
    coordinator_name: 'John',
    location: JSON.stringify({ id: '100', districtcode: 'D100', name: 'Amsterdam' }),
    ...overrides,
  });

  it('parses persId (lowercase d) correctly', () => {
    const { rows } = parseEquipmentCsv([makeRow()]);
    expect(rows).toHaveLength(1);
    expect(rows[0].person_pers_id).toBe('12345');
  });

  it('parses persID (uppercase D) correctly', () => {
    const { rows } = parseEquipmentCsv([makeRow({
      employee_details: JSON.stringify({ persID: '99999', salesID: '200SG', salesName: 'Old Person' }),
    })]);
    expect(rows).toHaveLength(1);
    expect(rows[0].person_pers_id).toBe('99999');
  });

  it('converts Excel serial date to YYYY-MM-DD', () => {
    const { rows } = parseEquipmentCsv([makeRow({ date: 44375.083333333336 })]);
    expect(rows[0].transaction_date).toBe('2021-06-28');
  });

  it('converts Giving to Uitgifte and Receiving to Ingeleverd', () => {
    const { rows: givingRows } = parseEquipmentCsv([makeRow({ transaction: 'Giving' })]);
    expect(givingRows[0].transaction_type).toBe('Uitgifte');

    const { rows: receivingRows } = parseEquipmentCsv([makeRow({ transaction: 'Receiving' })]);
    expect(receivingRows[0].transaction_type).toBe('Ingeleverd');
  });

  it('infers boolean from detail payload when column says No', () => {
    const { rows } = parseEquipmentCsv([makeRow({
      phone: 'No',
      phone_details: JSON.stringify([{ phone_number: '06123', phone_model: 'Samsung' }]),
    })]);
    expect(rows[0].phone).toBe(true); // inferred from non-empty payload
  });

  it('handles empty detail arrays without crashing', () => {
    const { rows } = parseEquipmentCsv([makeRow({
      phone_details: '[]',
      tablet_details: '[]',
      demobox_details: '[]',
      clothing_details: '[]',
      toolkit_details: '[]',
      iZettle_details: '[]',
    })]);
    expect(rows).toHaveLength(1);
    expect(rows[0].phone_details).toBeNull();
    expect(rows[0].tablet_details).toBeNull();
  });

  it('normalizes English damage to Dutch', () => {
    const { rows } = parseEquipmentCsv([makeRow({
      phone_details: JSON.stringify([{ phone_damage: 'No damage', charger: 'Yes' }]),
    })]);
    expect(rows[0].phone_details?.phone_damage).toBe('Geen Schade');
  });

  it('handles coordinator as JSON object', () => {
    const { rows } = parseEquipmentCsv([makeRow({
      coordinator_name: JSON.stringify({ salesAssistantBranchManager: 'Jane SBC' }),
    })]);
    expect(rows[0].sbc_name).toBe('Jane SBC');
  });

  it('handles coordinator as plain string', () => {
    const { rows } = parseEquipmentCsv([makeRow({ coordinator_name: 'Plain Name' })]);
    expect(rows[0].sbc_name).toBe('Plain Name');
  });

  it('preserves tablet laptop_number', () => {
    const { rows } = parseEquipmentCsv([makeRow({
      tablet: 'Yes',
      tablet_details: JSON.stringify([{ tablet_model: 'iPad', tablet_imei_number: 'IMEI123', charger: 'Yes', tablet_damage: 'No damage' }]),
    })]);
    expect(rows[0].tablet_details?.laptop_number).toBe('IMEI123');
  });

  it('skips rows without persId', () => {
    const { rows } = parseEquipmentCsv([makeRow({
      employee_details: JSON.stringify({ salesName: 'No ID' }),
    })]);
    expect(rows).toHaveLength(0);
  });

  it('tags demobox items format with source_format', () => {
    const { rows } = parseEquipmentCsv([makeRow({
      demobox: 'Yes',
      demobox_details: JSON.stringify([{ demoboxItems: ['Item A [€10]', 'Item B [€20]'] }]),
    })]);
    expect(rows[0].demobox_details?.source_format).toBe('items');
    expect(rows[0].demobox_details?.items).toEqual(['Item A', 'Item B']);
  });

  it('tags demobox legacy-missing-parts format', () => {
    const { rows } = parseEquipmentCsv([makeRow({
      demobox: 'Yes',
      demobox_details: JSON.stringify([{ demobox_complete: 'Yes', demobox_missing_parts: [] }]),
    })]);
    expect(rows[0].demobox_details?.source_format).toBe('legacy-missing-parts');
    expect(rows[0].demobox_details?.complete).toBe(true);
  });

  it('tags demobox backpack format', () => {
    const { rows } = parseEquipmentCsv([makeRow({
      demobox: 'Yes',
      demobox_details: JSON.stringify([{ demobox_backpack: 'Yes' }]),
    })]);
    expect(rows[0].demobox_details?.source_format).toBe('backpack');
    expect(rows[0].demobox_details?.backpack).toBe(true);
  });
});

describe('computeHashSync', () => {
  it('produces stable hash for same input', () => {
    const h1 = computeHashSync('test|input');
    const h2 = computeHashSync('test|input');
    expect(h1).toBe(h2);
  });

  it('produces different hash for different input', () => {
    expect(computeHashSync('a')).not.toBe(computeHashSync('b'));
  });
});

describe('parseEuropeanDate — fractional Excel serials', () => {
  it('handles fractional serial (time component stripped)', () => {
    expect(parseEuropeanDate(44375.99)).toBe('2021-06-28');
  });

  it('handles integer serial', () => {
    expect(parseEuropeanDate(44186)).toBe('2020-12-21');
  });

  it('handles serial as string with fraction', () => {
    expect(parseEuropeanDate('44375.083333333336')).toBe('2021-06-28');
  });
});

describe('extractMissingPeopleFromEquipment', () => {
  it('extracts people not in existing set', () => {
    const rawRows = [
      { employee_details: JSON.stringify({ persId: '111', salesId: 'S1', salesName: 'Alice' }), location: JSON.stringify({ districtcode: 'D100', name: 'Amsterdam' }) },
      { employee_details: JSON.stringify({ persId: '222', salesId: 'S2', salesName: 'Bob' }), location: JSON.stringify({ districtcode: 'D200', name: 'Rotterdam' }) },
    ];
    const existing = new Set(['111']);
    const branches = [{ id: 100, district_code: 'D100', name: 'Amsterdam' }];
    const result = extractMissingPeopleFromEquipment(rawRows, existing, branches);
    expect(result).toHaveLength(1);
    expect(result[0].pers_id).toBe('222');
    expect(result[0].sales_name).toBe('Bob');
  });
});
