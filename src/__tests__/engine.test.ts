import { describe, it, expect } from 'vitest';
import { computeRiskAssessment, MIN_TRAITS, MAX_CONFIDENCE } from '../engine/mushroomEngine';
import { MushroomTraits } from '../types';

/**
 * Acceptance tests for the uncertainty-quantified rule engine.
 *
 * Key contracts:
 *  1. Risk language is four-tier (low / medium / high / unknown) — never
 *     "edible" or "poisonous", never a 100% evidence point.
 *  2. Evidence strength is an interval, always within (0, 0.97]. It measures
 *     how well-observed the specimen is, NOT how safe it is (see
 *     evidence.test.ts for the direction/strength separation contract).
 *  3. Insufficient input (< 3 traits, or no discriminative traits) forces
 *     "unknown" (无法判断), even when a dangerous signal was observed.
 *
 * SEMANTIC CHANGE (v3, documented in docs/upgrade-notes.md): the number these
 * tests used to assert on was `0.4 + 0.3·(n/22) + 0.22·min(1,|Δscore|/8)` — a
 * "confidence" that grew with the ABSOLUTE score gap, so it rose for strongly
 * SAFE evidence too (measured: 74% on a low-risk verdict, 92% at the top).
 * Rendered with a green check under a 0-100% scale, that reads as "74% safe
 * to eat". The per-verdict numbers asserted below were therefore re-grounded
 * on evidence strength: no test was loosened to fit the new formula, each one
 * now asserts the property it was always about (the tier, and that the
 * evidence signal is real and never claims certainty).
 */
describe('computeRiskAssessment — data-grounded rules (UCI distillation v2)', () => {
  // Weights recalibrated from scripts/analyze_dataset.py on the real 8,124-row
  // dataset: purity branches + Gini importances. gill-color and ring-type were
  // previously unscored despite being top-3/top-5 traits — now covered.

  it('buff (浅黄) gill color → high risk (dataset: 100% poisonous, n=1728)', () => {
    const r = computeRiskAssessment({ gillColor: 'b', capShape: 'x', capColor: 'n' });
    expect(r.riskLevel).toBe('high');
    expect(r.ruleHits.some((h) => h.id === 'gill-color-buff')).toBe(true);
  });

  it('large pendant ring → high risk (dataset: 100% poisonous, n=1296)', () => {
    const r = computeRiskAssessment({ ringType: 'l', capShape: 'x', capColor: 'n' });
    expect(r.riskLevel).toBe('high');
    expect(r.ruleHits.some((h) => h.id === 'ring-large')).toBe(true);
  });

  it('abundant population → low risk (dataset: 100% edible, n=384)', () => {
    const r = computeRiskAssessment({ population: 'a', capShape: 'x', capColor: 'n' });
    expect(r.riskLevel).toBe('low');
    expect(r.ruleHits.some((h) => h.id === 'population-anchor')).toBe(true);
  });

  it('buff gills + almond odor → mixed medium', () => {
    const r = computeRiskAssessment({ gillColor: 'b', odor: 'a', capShape: 'x' });
    expect(r.riskLevel).toBe('medium');
  });

  it('spore green + buff gills + narrow gills → strongly high', () => {
    const r = computeRiskAssessment({ sporePrintColor: 'r', gillColor: 'b', gillSize: 'n' });
    expect(r.riskLevel).toBe('high');
    // Three critical/warning signals on only three observed traits: the tier is
    // decisive (see GUIDANCE.high) while the evidence strength stays modest —
    // and the interval must not reach certainty.
    expect(r.evidence.strength).toBeGreaterThan(0.1);
    expect(r.confidence.upper).toBeLessThan(MAX_CONFIDENCE);
    expect(r.ruleHits.some((h) => h.severity === 'critical')).toBe(true);
    expect(r.ruleHits.length).toBe(3);
  });
});

describe('computeRiskAssessment — insufficient input forces "unknown"', () => {
  it('returns unknown + incomplete when fewer than 3 traits are provided', () => {
    const r = computeRiskAssessment({ odor: 'f' });
    expect(r.riskLevel).toBe('unknown');
    expect(r.incomplete).toBe(true);
    // Honest, weakest-evidence interval — never a confident verdict. The point
    // is deliberately lower than any directional verdict's evidence strength.
    expect(r.confidence.upper).toBeLessThanOrEqual(0.3);
    expect(r.confidence.point).toBeGreaterThan(0);
    expect(r.evidence.strength).toBeLessThan(0.05);
  });

  it('still surfaces a critical rule hit inside an unknown result (warning preserved)', () => {
    const r = computeRiskAssessment({ odor: 'f' });
    expect(r.ruleHits.some((h) => h.severity === 'critical')).toBe(true);
  });

  it('forces unknown even when a strong signal is present but input is incomplete', () => {
    const r = computeRiskAssessment({ sporePrintColor: 'r', odor: 'f' });
    expect(r.riskLevel).toBe('unknown');
    expect(r.incomplete).toBe(true);
  });

  it('forces unknown when 3+ traits carry no discriminative power', () => {
    const r = computeRiskAssessment({ capShape: 'x', capColor: 'n', gillColor: 'w' });
    expect(r.riskLevel).toBe('unknown');
    expect(r.incomplete).toBe(true);
  });

  it('does not force unknown when at least 3 traits include a discriminative one', () => {
    const r = computeRiskAssessment({ capShape: 'x', capColor: 'n', odor: 'a' });
    expect(r.incomplete).toBe(false);
  });
});

describe('computeRiskAssessment — high-risk signals', () => {
  const FOUL_ODORS = ['f', 'p', 'c', 'y', 's', 'm'] as const;
  const neutral = { capShape: 'x', capColor: 'n' } as const;

  /**
   * Old assertion here: `confidence.point >= 0.75`. That was the bug surfaced
   * in the audit — a critical odor on three observed traits rendered "75%+"
   * next to a green badge, readable as a safety score. The critical signal must
   * still be decisive (high tier, critical severity, real evidence) but it may
   * no longer inflate the number: it now adds a fixed +0.15 evidence bonus on
   * top of coverage, landing near 0.22 for this input.
   */
  it.each(FOUL_ODORS.map((o) => [o]))('foul/strong odor %s → high risk, interval upper < 1', (odor) => {
    const r = computeRiskAssessment({ odor, ...neutral });
    expect(r.riskLevel).toBe('high');
    expect(r.evidence.strength).toBeGreaterThan(0.15); // real, non-trivial evidence
    expect(r.confidence.upper).toBeLessThan(MAX_CONFIDENCE);
    expect(r.ruleHits.some((h) => h.severity === 'critical')).toBe(true);
  });

  it('green spore print → high risk with critical rule hit', () => {
    const r = computeRiskAssessment({ sporePrintColor: 'r', capShape: 'x', capColor: 'e' });
    expect(r.riskLevel).toBe('high');
    expect(r.ruleHits.some((h) => h.id === 'spore-green')).toBe(true);
  });

  it('combined dangerous traits → high risk with more evidence than a single signal', () => {
    const single = computeRiskAssessment({ odor: 'f', ...neutral });
    const r = computeRiskAssessment({
      odor: 'p', sporePrintColor: 'r', gillSize: 'n', bruises: 'f',
    });
    expect(r.riskLevel).toBe('high');
    expect(r.evidence.strength).toBeGreaterThan(single.evidence.strength);
    expect(r.evidence.ruleHits).toBeGreaterThan(single.evidence.ruleHits);
  });
});

describe('computeRiskAssessment — safety anchors are NOT absolute', () => {
  it('almond odor leans low risk but never claims edibility', () => {
    const r = computeRiskAssessment({ odor: 'a', capShape: 'x', capColor: 'n' });
    expect(r.riskLevel).toBe('low');
    // Interval must remain bounded — no certainty.
    expect(r.confidence.upper).toBeLessThan(MAX_CONFIDENCE);
    expect(r.ruleHits.some((h) => h.id === 'odor-safety-anchor')).toBe(true);
  });

  it('mixed signals resolve to medium', () => {
    const r = computeRiskAssessment({
      odor: 'n', gillSize: 'n', gillSpacing: 'w', stalkRoot: 'r', bruises: 'f',
    });
    // gillSize n (+3.5p), bruises f (+2.0p) vs gillSpacing w (+2.5e), stalkRoot r (+3.5e)
    expect(r.riskLevel).toBe('medium');
  });
});

describe('computeRiskAssessment — never claims certainty', () => {
  const samples: MushroomTraits[] = [
    { odor: 'a', gillSize: 'b', gillSpacing: 'w', stalkRoot: 'r', bruises: 't', capShape: 'x', capColor: 'n' },
    { odor: 'p', sporePrintColor: 'r', gillSize: 'n', bruises: 'f' },
    { odor: 'f' },
    { odor: 'l', capShape: 'b', capColor: 'w', gillColor: 'w', gillSpacing: 'w' },
    { capShape: 'k', capColor: 'g', habitat: 'd', population: 'v', gillSize: 'n' },
  ];

  it.each(samples.map((s, i) => [i, s]))('sample %i keeps confidence strictly inside (0, 0.97]', (_i, traits) => {
    const r = computeRiskAssessment(traits);
    expect(r.confidence.point).toBeGreaterThan(0);
    expect(r.confidence.point).toBeLessThanOrEqual(MAX_CONFIDENCE);
    expect(r.confidence.upper).toBeLessThanOrEqual(MAX_CONFIDENCE);
  });

  it.each(samples.map((s, i) => [i, s]))('sample %i produces a well-formed interval lower ≤ point ≤ upper', (_i, traits) => {
    const r = computeRiskAssessment(traits);
    expect(r.confidence.lower).toBeLessThanOrEqual(r.confidence.point);
    expect(r.confidence.point).toBeLessThanOrEqual(r.confidence.upper);
  });

  it.each(samples.map((s, i) => [i, s]))(
    'sample %i never uses absolute edible/poisonous language',
    (_i, traits) => {
      const r = computeRiskAssessment(traits);
      const text = [r.reasoning, r.guidance, ...r.ruleHits.map((h) => h.label + h.detail)].join(' ');
      expect(text).not.toMatch(/可食用|有毒|无毒|能吃|不可食用/);
    },
  );
});

describe('computeRiskAssessment — every verdict carries guidance', () => {
  it('all four risk levels produce non-empty guidance', () => {
    const cases: MushroomTraits[] = [
      { odor: 'f', capShape: 'x', capColor: 'n' }, // high
      { odor: 'n', gillSize: 'n', gillSpacing: 'w', stalkRoot: 'r', bruises: 'f' }, // medium
      { odor: 'a', capShape: 'x', capColor: 'n' }, // low
      { odor: 'f' }, // unknown
    ];
    for (const t of cases) {
      const r = computeRiskAssessment(t);
      expect(r.guidance.trim().length).toBeGreaterThan(0);
    }
  });

  it('exposes MIN_TRAITS so the UI can show a requirement', () => {
    expect(MIN_TRAITS).toBe(3);
    expect(MAX_CONFIDENCE).toBeLessThan(1);
  });
});
