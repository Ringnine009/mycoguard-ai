import { describe, it, expect } from 'vitest';
import { computeRiskAssessment, MIN_TRAITS, MAX_CONFIDENCE } from '../engine/mushroomEngine';
import { MushroomTraits } from '../types';

/**
 * Acceptance tests for the uncertainty-quantified rule engine.
 *
 * Key contracts:
 *  1. Risk language is four-tier (low / medium / high / unknown) — never
 *     "edible" or "poisonous", never a single 100% confidence point.
 *  2. Confidence is an interval, always within (0, 0.97].
 *  3. Insufficient input (< 3 traits, or no discriminative traits) forces
 *     "unknown" (无法判断), even when a dangerous signal was observed.
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
    expect(r.confidence.point).toBeGreaterThanOrEqual(0.8);
  });
});

describe('computeRiskAssessment — insufficient input forces "unknown"', () => {
  it('returns unknown + incomplete when fewer than 3 traits are provided', () => {
    const r = computeRiskAssessment({ odor: 'f' });
    expect(r.riskLevel).toBe('unknown');
    expect(r.incomplete).toBe(true);
    // Honest, low-confidence interval — never a confident verdict.
    expect(r.confidence.upper).toBeLessThanOrEqual(0.3);
    expect(r.confidence.point).toBeGreaterThan(0);
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

  it.each(FOUL_ODORS.map((o) => [o]))('foul/strong odor %s → high risk, interval upper < 1', (odor) => {
    const r = computeRiskAssessment({ odor, ...neutral });
    expect(r.riskLevel).toBe('high');
    expect(r.confidence.point).toBeGreaterThanOrEqual(0.75);
    expect(r.confidence.upper).toBeLessThan(1);
    expect(r.ruleHits.some((h) => h.severity === 'critical')).toBe(true);
  });

  it('green spore print → high risk with critical rule hit', () => {
    const r = computeRiskAssessment({ sporePrintColor: 'r', capShape: 'x', capColor: 'e' });
    expect(r.riskLevel).toBe('high');
    expect(r.ruleHits.some((h) => h.id === 'spore-green')).toBe(true);
  });

  it('combined dangerous traits → high risk', () => {
    const r = computeRiskAssessment({
      odor: 'p', sporePrintColor: 'r', gillSize: 'n', bruises: 'f',
    });
    expect(r.riskLevel).toBe('high');
    expect(r.confidence.point).toBeGreaterThanOrEqual(0.75);
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
