import { describe, it, expect } from 'vitest';
import { computeCaseDerived } from '../debtFollowup';

const near = (a: number, b: number, tol = 0.01) => expect(Math.abs(a - b)).toBeLessThanOrEqual(tol);

describe('debtFollowup formulas — 4 real fixtures from legacy CSV', () => {
  it('Rob Pijnenburg (356850) — initial 495, deduction 495, no refund/adj → RA=495 TR=990 CVD=0 TBF=495', () => {
    const r = computeCaseDerived({
      initialDebt: 495, currentEngineDebt: 0,
      movements: [{ movement_type: 'payroll_deduction', amount: 495 }],
    });
    near(r.recoveredAssets, 495);
    near(r.totalRecovered, 990);
    near(r.currentValueDebt, 0);
    near(r.toBeRefunded, 495);
  });

  it('Bono Potemans (291503) — initial 620, deduction 302.49, refund 302 → TR=620.49 TBF=0.49', () => {
    const r = computeCaseDerived({
      initialDebt: 620, currentEngineDebt: 0,
      movements: [
        { movement_type: 'payroll_deduction', amount: 302.49 },
        { movement_type: 'refund', amount: 302 },
      ],
    });
    near(r.recoveredAssets, 620);
    near(r.totalRecovered, 620.49);
    near(r.currentValueDebt, 0);
    near(r.toBeRefunded, 0.49);
  });

  it('Felipe v.Rosmalen (303570) — initial 705, deduction 400.49, refund 400 → TR=705.49 TBF=0.49', () => {
    const r = computeCaseDerived({
      initialDebt: 705, currentEngineDebt: 0,
      movements: [
        { movement_type: 'payroll_deduction', amount: 400.49 },
        { movement_type: 'refund', amount: 400 },
      ],
    });
    near(r.totalRecovered, 705.49);
    near(r.toBeRefunded, 0.49);
  });

  it('Abdul Q. Ahmad (274376) — initial 1429, ded 899.71, ref 233, adj 666, engine=1332 → CAD=666 RA=763 TR=1429.71 TBF=0.71', () => {
    const r = computeCaseDerived({
      initialDebt: 1429, currentEngineDebt: 1332,
      movements: [
        { movement_type: 'payroll_deduction', amount: 899.71 },
        { movement_type: 'refund', amount: 233 },
        { movement_type: 'adjustment', amount: 666 },
      ],
    });
    near(r.currentAssetsDebt, 666);
    near(r.recoveredAssets, 763);
    near(r.totalRecovered, 1429.71);
    near(r.currentValueDebt, 0);
    near(r.toBeRefunded, 0.71);
  });

  it('manually_settled overrides computed flag', () => {
    const r = computeCaseDerived({
      initialDebt: 100, currentEngineDebt: 100,
      movements: [], manuallySettled: true,
    });
    expect(r.currentValueDebt).toBe(100);
    expect(r.settled).toBe(true);
  });

  it('clamps never go negative — over-refund still yields TR>=0 and CVD>=0', () => {
    const r = computeCaseDerived({
      initialDebt: 50, currentEngineDebt: 0,
      movements: [{ movement_type: 'refund', amount: 999 }],
    });
    expect(r.currentValueDebt).toBeGreaterThanOrEqual(0);
    expect(r.toBeRefunded).toBeGreaterThanOrEqual(0);
  });
});

describe('debtFollowup — frozen_engine_debt scenarios (historical-import bug fix)', () => {
  it('Tijmen — initial 1951, frozen=1951, deduction 1951 → settled, CVD=0, TBF=0', () => {
    const r = computeCaseDerived({
      initialDebt: 1951,
      currentEngineDebt: 1951, // sourced from frozen_engine_debt, not live engine
      movements: [{ movement_type: 'payroll_deduction', amount: 1951 }],
    });
    near(r.recoveredAssets, 0);
    near(r.currentValueDebt, 0);
    near(r.toBeRefunded, 0);
    expect(r.settled).toBe(true);
  });

  it('Michael Wong — initial 2061, frozen=2061, deduction 1341.63 → CVD=719.37, TBF=0', () => {
    const r = computeCaseDerived({
      initialDebt: 2061,
      currentEngineDebt: 2061,
      movements: [{ movement_type: 'payroll_deduction', amount: 1341.63 }],
    });
    near(r.currentValueDebt, 719.37);
    near(r.toBeRefunded, 0);
    expect(r.settled).toBe(false);
  });

  it('App case fallback — frozen null path, live engine value drives derived', () => {
    // simulates DebtFollowup resolver: when frozen is null, currentEngineDebt comes from engine
    const liveEngine = 200;
    const r = computeCaseDerived({
      initialDebt: 500,
      currentEngineDebt: liveEngine,
      movements: [{ movement_type: 'payroll_deduction', amount: 100 }],
    });
    near(r.currentAssetsDebt, 200);
    near(r.recoveredAssets, 300);
    near(r.currentValueDebt, 100);
    near(r.toBeRefunded, 0);
  });
});
