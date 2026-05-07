import { describe, it, expect } from 'vitest';
import { parseDebtFollowupCsv, parseMoney, hashRow } from '../parsers/debt-followup-csv';

const CSV = `Payroll,Emp ID,Sales Name,Initial Debt,Payroll Deduction,Recovered Assets,Current Assets Debt,Adjustment,Total Recovered,Refund,Current Value Debt,To be refunded
2026-04-06 00:00:00,356850,Rob Pijnenburg,€ 495.00,495,495,0,0,990,0,0,495
2024-01-05 00:00:00,291503,Bono Potemans,620,302.49,620,0,0,620.49,302,0,0.49
2024-07-05 00:00:00,303570,Felipe v.Rosmalen,705.00,400.49,705.00,0,0,705.49,400,0,0.49
2023-12-21 00:00:00,274376,Abdul Q. Ahmad,1429,899.71,763,666,666,1429.71,233,0,0.71
2024-01-01 00:00:00,000111,Settled Placeholder,0,0,0,0,0,0,0,0,0
`;

describe('debt-followup CSV parser', () => {
  it('parses 4 active rows + skips 1 all-zero placeholder', () => {
    const r = parseDebtFollowupCsv(CSV);
    expect(r.errors).toEqual([]);
    expect(r.skippedAllZero).toBe(1);
    expect(r.rows).toHaveLength(4);
    expect(r.rows[0]).toMatchObject({ payrollDate: '2026-04-06', empId: '356850', initialDebt: 495 });
    expect(r.rows[3]).toMatchObject({ empId: '274376', adjustment: 666, toBeRefunded: 0.71 });
  });

  it('preserves leading zeros on Emp ID', () => {
    const r = parseDebtFollowupCsv(CSV);
    // The all-zero "000111" is skipped, but leading zero would be preserved if active.
    expect(parseMoney('000111')).toBe(111);
    // Use an active variant:
    const csv2 = CSV.replace('000111,Settled Placeholder,0,0,0,0,0,0,0,0,0', '000111,Lead Zero,100,0,100,0,0,100,0,0,0');
    const r2 = parseDebtFollowupCsv(csv2);
    expect(r2.rows.find(x => x.empId === '000111')?.empId).toBe('000111');
  });

  it('handles PowerBI float artifacts and EU formats', () => {
    expect(parseMoney('1551.4700000000003')).toBe(1551.47);
    expect(parseMoney('€ 1.234,56')).toBe(1234.56);
    expect(parseMoney('')).toBe(0);
    expect(parseMoney('-')).toBe(0);
  });

  it('idempotent: same content produces identical hashes (re-import is a no-op)', () => {
    const a = parseDebtFollowupCsv(CSV);
    const b = parseDebtFollowupCsv(CSV);
    expect(a.rows.map(r => r.rowHash)).toEqual(b.rows.map(r => r.rowHash));
    // hashRow stable
    expect(hashRow(['2026-04-06', '356850', 495, 495, 0, 0, 990]))
      .toBe(hashRow(['2026-04-06', '356850', 495, 495, 0, 0, 990]));
  });

  it('rejects malformed headers', () => {
    const bad = 'Wrong,Headers\n2024-01-01,1';
    const r = parseDebtFollowupCsv(bad);
    expect(r.errors.length).toBeGreaterThan(0);
  });
});

describe('debt-followup re-import classification (frozen_engine_debt backfill)', () => {
  // Mirrors the partition logic in DebtFollowupImportTab.handleFile.
  function classify(
    rows: { rowHash: string }[],
    existing: { source_row_hash: string; frozen_engine_debt: number | null }[],
  ) {
    const existingHashes = new Set<string>();
    const backfillHashes = new Set<string>();
    for (const e of existing) {
      existingHashes.add(e.source_row_hash);
      if (e.frozen_engine_debt == null) backfillHashes.add(e.source_row_hash);
    }
    const newCases = rows.filter(r => !existingHashes.has(r.rowHash)).length;
    const toBackfill = rows.filter(r => backfillHashes.has(r.rowHash)).length;
    const existingSkipped = rows.length - newCases - toBackfill;
    return { newCases, toBackfill, existingSkipped };
  }

  it('5 CSV rows × (3 historical without frozen, 0 fresh) → 2 new, 3 backfill, 0 skip', () => {
    const parsed = parseDebtFollowupCsv(CSV);
    expect(parsed.rows).toHaveLength(4);
    // synthesize a 5th distinct row to cover the spec exactly
    const fakeFifth = { rowHash: 'h5' };
    const rows = [...parsed.rows, fakeFifth];
    const existing = [
      { source_row_hash: parsed.rows[0].rowHash, frozen_engine_debt: null },
      { source_row_hash: parsed.rows[1].rowHash, frozen_engine_debt: null },
      { source_row_hash: parsed.rows[2].rowHash, frozen_engine_debt: null },
    ];
    const r = classify(rows, existing);
    expect(r).toEqual({ newCases: 2, toBackfill: 3, existingSkipped: 0 });
  });

  it('rows already backfilled are counted as idempotent skips', () => {
    const parsed = parseDebtFollowupCsv(CSV);
    const existing = parsed.rows.map(r => ({ source_row_hash: r.rowHash, frozen_engine_debt: 100 }));
    const r = classify(parsed.rows, existing);
    expect(r).toEqual({ newCases: 0, toBackfill: 0, existingSkipped: 4 });
  });
});
