import { describe, it, expect } from 'vitest';
import { buildVisionPipeline } from '../engine/pipeline';
import { computeRiskAssessment } from '../engine/mushroomEngine';
import { evaluateVision } from '../engine/merge';
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

describe('buildVisionPipeline — dual-channel flow visualization', () => {
  it('emits the four documented steps in order', () => {
    const v = vision({ speciesGuess: 'Amanita muscaria', traits: { capColor: 'r', capShape: 'x' }, modelConfidence: 0.85 });
    const assessment = evaluateVision({ odor: 'f' }, v);
    const steps = buildVisionPipeline(v, assessment, 5);
    expect(steps.map((s) => s.id)).toEqual(['vision', 'traits', 'engine', 'fusion']);
    expect(steps[0].detail).toBe('Amanita muscaria');
    expect(steps[1].detail).toContain('2 项');
    expect(steps[2].detail).toContain('5 项');
    expect(steps[3].detail).toContain('一致'); // agree band for |0.8-0.85|
  });

  it('shows "未能识别物种" when the model has no guess', () => {
    const v = vision({ traits: { capColor: 'r' } });
    const steps = buildVisionPipeline(v, evaluateVision({}, v), 1);
    expect(steps[0].detail).toBe('未能识别物种');
  });

  it('fusion step reflects consistency n-a when the model gave no confidence', () => {
    const v = vision({ modelConfidence: 0, speciesGuess: null });
    const steps = buildVisionPipeline(v, evaluateVision({ odor: 'f', capShape: 'x' }, v), 2);
    expect(steps[3].detail).toContain('无视觉置信度');
  });

  it('every step carries a non-empty detail (UI-ready)', () => {
    const v = vision({ speciesGuess: null, modelConfidence: 0.9 });
    const assessment = computeRiskAssessment({ odor: 'f', capShape: 'x', capColor: 'n' });
    for (const s of buildVisionPipeline(v, assessment, 3)) {
      expect(s.detail.trim().length).toBeGreaterThan(0);
    }
  });
});
