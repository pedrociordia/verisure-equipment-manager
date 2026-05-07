/**
 * Dossier fixtures — payroll 24/04/2026 + 06/05/2026 candidates.
 *
 * Numbers locked from the synced production DB after the Hybrid 2a refactor:
 *   - Tom Fraanje  (305834) → €554  (matches Operations' authoritative number)
 *   - Olaf Bruijns (299059) → €0    (everything returned 2026-04-02)
 *   - Estrella van Dam (348037) → €60  (re-handout 23/04, both Pullovers unreturned)
 *   - Abdel Ali (352651) → €910  (demobox 561 → 500 cap, +charger +clothing +ID +binder)
 *
 * Fixture data is a frozen snapshot from `equipment_transactions` so this test
 * survives DB drift. If real transactions change for these SE, regenerate.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { calculatePersonDebt } from '../debt';

const FIXTURE_PATH = join(__dirname, 'fixtures-2026-04-24.json');
const data = JSON.parse(readFileSync(FIXTURE_PATH, 'utf8'));
const { people, transactions, prices, phone_models, tablet_models } = data;

const byPersId = (pid: string) => people.find((p: any) => p.pers_id === pid);
const calc = (pid: string) =>
  calculatePersonDebt(byPersId(pid).id, transactions, prices, phone_models, tablet_models);

describe('Dossier fixtures @ payroll 2026-04-24', () => {
  it('Tom Fraanje (305834) → €554 — phone damaged + demobox keyfob + toolkit + clothing + binder', () => {
    const r = calc('305834');
    expect(r.totalDebt).toBe(554);
    expect(r.phonDebt).toBe(305);
    expect(r.toolkitDebt).toBe(140);
    expect(r.binderDebt).toBe(20);
    expect(r.dataQualityIssues.filter(i => i.type === 'cap_applied')).toHaveLength(0);
  });

  it('Olaf Bruijns (299059) → €0 — everything returned 2026-04-02', () => {
    const r = calc('299059');
    expect(r.totalDebt).toBe(0);
  });

  it('Estrella van Dam (348037) → €60 — both Pullovers from re-handout 2026-04-23', () => {
    const r = calc('348037');
    expect(r.totalDebt).toBe(60);
    expect(r.clothingDebt).toBe(60);
  });

  it('Abdel Ali (352651) → €900 — invalid_imei skips both phone AND charger; demobox cap activates', () => {
    const r = calc('352651');
    expect(r.totalDebt).toBe(900);
    expect(r.phonDebt).toBe(0); // invalid IMEI → entire phone tx (incl. charger) skipped
    expect(r.idCardDebt).toBe(100);
    expect(r.binderDebt).toBe(20);
    expect(r.phoneAnomalies.some(a => a.type === 'invalid_imei')).toBe(true);
    // No "Charger" line in breakdown when IMEI invalid
    expect(r.breakdown.some(b => b.category === 'Phone' && b.item === 'Charger')).toBe(false);
    const cap = r.dataQualityIssues.find(i => i.category === 'demobox' && i.type === 'cap_applied');
    expect(cap).toBeDefined();
    expect(cap!.raw).toBe(561);
    expect(cap!.capped).toBe(500);
  });
});
