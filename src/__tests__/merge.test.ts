import { describe, it, expect } from 'vitest';
import { mergeTraits, evaluateVision } from '../engine/merge';
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
