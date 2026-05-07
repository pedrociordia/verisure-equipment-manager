import { describe, it, expect } from 'vitest';
import { buildExportRow, DEMOBOX_TO_COLUMN } from '../exportDebtData';

const emptyDebt = {
  phonDebt: 0,
  tabletDebt: 0,
  toolkitDebt: 0,
  clothingDebt: 0,
  idCardDebt: 0,
  binderDebt: 0,
  izettleDebt: 0,
  accessPassDebt: 0,
  demoboxItemDebts: {} as Record<string, number>,
};

const noDerived = { payrollDeduction: 0, refund: 0, adjustment: 0 };

describe('buildExportRow — demobox column mapping', () => {
  it('places each demobox component in its own column', () => {
    const row = buildExportRow({
      persId: 'E001',
      salesName: 'Test User',
      debt: {
        ...emptyDebt,
        demoboxItemDebts: {
          'ARLO Wire-Free VD White': 50,
          'Smartlock Danalock GW-SL': 80,
          'Magnet Contact GW-MC2-SHOCK': 12,
        },
      },
      derived: noDerived,
    });

    expect(row['Arlo WF VD']).toBe(50);
    expect(row['Smartlock']).toBe(80);
    expect(row['Magnet']).toBe(12);
    // Confirm nothing leaked into the legacy lumped bucket
    expect(row['Central Unit']).toBe(0);
    expect(row['Total Eq.']).toBe(142);
    expect(row['Total Debt']).toBe(142);
  });

  it('covers every documented demobox item', () => {
    const expectedKeys = [
      'ARLO Wire-Free VD White',
      'Central Unit GW-CU2N',
      'Smartlock Danalock GW-SL',
      'Arlo Ess. XL SL CAMERA 1-PACK',
      'Camera One GW-MD-C1 (Orion)',
      'Arlo Essential Wired 1 cam',
      'Siren Voice Keypad GW-SVK',
      'Keypad GW-KP-MOK1 Mini Outdoor',
      'Smoke Detector GW-SD3',
      'Remote control Keyfob GW-KF white/grey',
      'Magnet Contact GW-MC2-SHOCK',
    ];
    for (const k of expectedKeys) expect(DEMOBOX_TO_COLUMN[k]).toBeTruthy();
  });

  it('falls back to Central Unit for unknown canonical names', () => {
    const row = buildExportRow({
      persId: 'E002',
      salesName: 'Unknown Items',
      debt: { ...emptyDebt, demoboxItemDebts: { 'Mystery Gadget': 25 } },
      derived: noDerived,
    });
    expect(row['Central Unit']).toBe(25);
  });
});
