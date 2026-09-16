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
  // NOTE (modality fix): these cases used `odor` as the vision-supplied trait.
  // Odor cannot be photographed, so the photo channel no longer contributes it
  // (see modality.test.ts); the gap-filling contract is unchanged and is now
  // exercised with traits a photo really can carry.

  it('fills gaps with vision traits', () => {
    const merged = mergeTraits({ capShape: 'x' }, { capColor: 'r', gillColor: 'b' });
    expect(merged.capShape).toBe('x');
    expect(merged.capColor).toBe('r');
    expect(merged.gillColor).toBe('b');
  });

  it('manual value overrides a conflicting vision value', () => {
    const merged = mergeTraits({ capColor: 'w' }, { capColor: 'r', gillColor: 'b' });
    expect(merged.capColor).toBe('w');
    expect(merged.gillColor).toBe('b');
  });

  it('never accepts a non-observable trait from the photo channel', () => {
    const merged = mergeTraits({ capShape: 'x' }, { odor: 'f', stalkRoot: 'r', capColor: 'r' });
    expect(merged.odor).toBeUndefined();
    expect(merged.stalkRoot).toBeUndefined();
    expect(merged.capColor).toBe('r');
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

  it('a visible critical signal in the photo → high risk', () => {
    // `sporePrintColor: r` (green spore print) is the strongest visual critical
    // signal the dataset offers; the old case here used a vision-reported odor.
    const r = evaluateVision({}, vision({ traits: { sporePrintColor: 'r', capColor: 'e', capShape: 'x' } }));
    expect(r.riskLevel).toBe('high');
    expect(r.ruleHits.some((h) => h.id === 'spore-green')).toBe(true);
  });

  it('a vision-reported odor cannot steer the verdict (unobservable claim)', () => {
    const r = evaluateVision({}, vision({ traits: { odor: 'f', capColor: 'e', capShape: 'x' } }));
    expect(r.riskLevel).toBe('unknown');
    expect(r.ruleHits.some((h) => h.id === 'odor-foul')).toBe(false);
  });

  it('manual traits complement sparse vision evidence', () => {
    // Manual adds odor (a modality only the observer has); vision contributes
    // capColor — together ≥3 discriminative traits.
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

  it('agreeing confident vision narrows the interval but never moves the point', () => {
    const traits = { odor: 'f', capShape: 'x', capColor: 'n' };
    const base = computeRiskAssessment(traits);
    // Semantic change (v3): the vision model's SPECIES confidence used to be
    // weighted into the risk number (`0.65·engine + 0.35·model`), a category
    // error that made a verdict look more certain the more confident the model
    // was. Fusion now only scales the interval width.
    const r = evaluateVision(traits, vision({ modelConfidence: base.confidence.point }));
    expect(r.visionConsistency).toBe('agree');
    expect(r.confidence.point).toBe(base.confidence.point);
    expect(r.evidence.strength).toBe(base.evidence.strength);
    expect(r.confidence.upper - r.confidence.lower).toBeLessThan(base.confidence.upper - base.confidence.lower);
    expect(r.evidence.intervalWidened).toBe(false);
    expect(r.confidence.upper).toBeLessThanOrEqual(0.97);
  });

  it('disagreeing confident vision widens the interval and flags it', () => {
    const traits = { odor: 'a', capShape: 'x', capColor: 'n' };
    const base = computeRiskAssessment(traits);
    const r = evaluateVision(traits, vision({ modelConfidence: 0.95 }));
    expect(r.visionConsistency).toBe('disagree');
    expect(r.confidence.point).toBe(base.confidence.point);
    expect(r.confidence.upper - r.confidence.lower).toBeGreaterThan(base.confidence.upper - base.confidence.lower);
    expect(r.evidence.intervalWidened).toBe(true);
  });

  it('partial agreement maps to partial consistency', () => {
    const traits = { odor: 'a', capShape: 'x', capColor: 'n' };
    const base = computeRiskAssessment(traits);
    // Sit inside the 0.12–0.30 gap band, derived from the engine's own number.
    const r = evaluateVision(traits, vision({ modelConfidence: base.confidence.point + 0.2 }));
    expect(r.visionConsistency).toBe('partial');
    expect(r.confidence.point).toBe(base.confidence.point);
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
