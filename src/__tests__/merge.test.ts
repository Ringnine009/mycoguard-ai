import { describe, it, expect } from 'vitest';
import { mergeTraits, evaluateVision } from '../engine/merge';
import { computeRiskAssessment } from '../engine/mushroomEngine';
import { VisionResult } from '../types';

const vision = (overrides: Partial<VisionResult>): VisionResult => ({
  status: 'ok',
  speciesGuess: null,
  modelConfidence: 0,
  traits: {},
  notes: '',
  warnings: [],
  ...overrides,
});

describe('mergeTraits — manual observations win over vision', () => {
  it('fills gaps with vision traits', () => {
    const merged = mergeTraits({ capShape: 'x' }, { capColor: 'r', odor: 'f' });
    expect(merged.capShape).toBe('x');
    expect(merged.capColor).toBe('r');
    expect(merged.odor).toBe('f');
  });

  it('manual value overrides a conflicting vision value', () => {
    const merged = mergeTraits({ capColor: 'w' }, { capColor: 'r', odor: 'f' });
    expect(merged.capColor).toBe('w');
    expect(merged.odor).toBe('f');
  });

  it('handles missing vision gracefully', () => {
    const merged = mergeTraits({ capShape: 'x' }, undefined);
    expect(merged).toEqual({ capShape: 'x' });
  });
});

describe('evaluateVision — photo identification flows through the shared engine', () => {
  it('incomplete vision evidence → unknown', () => {
    const r = evaluateVision({}, vision({ traits: { capColor: 'r' } }));
    expect(r.riskLevel).toBe('unknown');
    expect(r.incomplete).toBe(true);
  });

  it('vision-observed dangerous signal → high risk', () => {
    const r = evaluateVision({}, vision({ traits: { odor: 'f', capColor: 'e', capShape: 'x' } }));
    expect(r.riskLevel).toBe('high');
  });

  it('manual traits complement sparse vision evidence', () => {
    // Manual adds odor; vision contributes capColor — together ≥3 discriminative traits.
    const r = evaluateVision({ odor: 'a' }, vision({ traits: { capColor: 'n', capShape: 'x' } }));
    expect(r.incomplete).toBe(false);
    expect(r.riskLevel).toBe('low');
  });

  it('returns unknown when vision result is absent and manual input is empty', () => {
    const r = evaluateVision({}, undefined);
    expect(r.riskLevel).toBe('unknown');
    expect(r.incomplete).toBe(true);
  });
});

describe('fuseVisionConfidence — dual-channel confidence fusion', () => {
  // modelConfidence is interpreted as "visual channel reliability": a
  // confident visual read raises/narrows the engine interval when it agrees,
  // and widens it when it disagrees. See merge.ts for the full formula.

  it('no vision → interval and consistency untouched', () => {
    const manual = { odor: 'a', capShape: 'x', capColor: 'n' };
    const r = evaluateVision(manual, undefined);
    expect(r.visionConsistency).toBeUndefined();
    expect(r.confidence).toEqual(computeRiskAssessment(manual).confidence);
  });

  it('modelConfidence 0 (nothing seen) → engine interval kept, consistency n-a', () => {
    const r = evaluateVision({ odor: 'a', capShape: 'x', capColor: 'n' }, vision({ modelConfidence: 0 }));
    expect(r.visionConsistency).toBe('n-a');
    expect(r.confidence).toEqual(computeRiskAssessment({ odor: 'a', capShape: 'x', capColor: 'n' }).confidence);
  });

  it('agreeing confident vision narrows the interval and raises the point', () => {
    const base = computeRiskAssessment({ odor: 'f', capShape: 'x', capColor: 'n' });
    const r = evaluateVision({ odor: 'f', capShape: 'x', capColor: 'n' }, vision({ modelConfidence: 0.85 }));
    expect(r.visionConsistency).toBe('agree');
    expect(r.confidence.point).toBeGreaterThan(base.confidence.point);
    expect(r.confidence.upper - r.confidence.lower).toBeLessThan(base.confidence.upper - base.confidence.lower);
    expect(r.confidence.upper).toBeLessThanOrEqual(0.97);
  });

  it('disagreeing confident vision widens the interval', () => {
    const base = computeRiskAssessment({ odor: 'a', capShape: 'x', capColor: 'n' });
    const r = evaluateVision({ odor: 'a', capShape: 'x', capColor: 'n' }, vision({ modelConfidence: 0.95 }));
    expect(r.visionConsistency).toBe('disagree');
    expect(r.confidence.upper - r.confidence.lower).toBeGreaterThan(base.confidence.upper - base.confidence.lower);
  });

  it('partial agreement maps to partial consistency', () => {
    // base point for {odor a, capShape x, capColor n} ≈ 0.537; mc 0.35 → Δ≈0.19 (partial band)
    const r = evaluateVision({ odor: 'a', capShape: 'x', capColor: 'n' }, vision({ modelConfidence: 0.35 }));
    expect(r.visionConsistency).toBe('partial');
  });

  it('confident model cannot rescue an unknown (insufficient) verdict → partial', () => {
    const r = evaluateVision({}, vision({ modelConfidence: 0.9, traits: { capColor: 'r' } }));
    expect(r.riskLevel).toBe('unknown');
    expect(r.visionConsistency).toBe('partial');
  });

  it('fused interval is always well-formed and never claims certainty', () => {
    const manual = { odor: 'a', capShape: 'x', capColor: 'n' };
    const r = evaluateVision(manual, vision({ modelConfidence: 0.9 }));
    expect(r.confidence.lower).toBeLessThanOrEqual(r.confidence.point);
    expect(r.confidence.point).toBeLessThanOrEqual(r.confidence.upper);
    expect(r.confidence.upper).toBeLessThanOrEqual(0.97);
  });
});
