import { describe, it, expect } from 'vitest';
import { SCENARIOS, Scenario } from '../engine/scenarios';
import { computeRiskAssessment } from '../engine/mushroomEngine';
import { ALL_TRAITS } from '../constants';
import { RiskLevel } from '../types';

/**
 * Example scenarios exist to remove the "22 dropdowns" barrier: one click
 * fills a plausible, honest trait combination and demonstrates a level.
 * Contract: ids unique, every trait value is a valid option code, and each
 * scenario's engine verdict matches its documented expectation.
 */

const EXPECTED_LEVEL: Record<string, RiskLevel> = {
  'chlorophyllum-molybdites': 'high',
  'chanterelle-like': 'low',
  'amanita-muscaria-appearance': 'unknown',
  'mixed-signals': 'medium',
  'sparse-input': 'unknown',
};

describe('scenarios — data integrity', () => {
  it('defines scenarios with unique ids and labels', () => {
    const ids = SCENARIOS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const s of SCENARIOS) {
      expect(s.label.length).toBeGreaterThan(0);
      expect(s.traits).toBeTruthy();
    }
  });

  it('every scenario trait value is a valid option code', () => {
    const valid = new Map<string, Set<string>>(
      ALL_TRAITS.map((t) => [t.id, new Set(t.options.map((o) => o.value))]),
    );
    for (const s of SCENARIOS) {
      for (const [id, value] of Object.entries(s.traits)) {
        expect(valid.get(id)?.has(value), `${s.id}.${id}=${value}`).toBe(true);
      }
    }
  });

  it('every scenario id has a documented expected level', () => {
    for (const s of SCENARIOS) {
      expect(EXPECTED_LEVEL[s.id], s.id).toBeTruthy();
    }
  });
});

describe('scenarios — engine verdicts', () => {
  it.each(SCENARIOS.map((s) => [s.id, s] as const))(
    'scenario %s produces the documented risk level',
    (id, s: Scenario) => {
      const r = computeRiskAssessment(s.traits);
      expect(r.riskLevel, `${id}: ${r.guidance}`).toBe(EXPECTED_LEVEL[id]);
    },
  );

  it('the high-risk scenario surfaces the green spore print rule', () => {
    const s = SCENARIOS.find((x) => x.id === 'chlorophyllum-molybdites')!;
    const r = computeRiskAssessment(s.traits);
    expect(r.ruleHits.some((h) => h.id === 'spore-green')).toBe(true);
  });
});
