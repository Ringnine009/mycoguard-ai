import { describe, it, expect } from 'vitest';
import { buildExpertNarrative } from '../engine/expert';
import { computeRiskAssessment } from '../engine/mushroomEngine';
import { MushroomTraits } from '../types';

/**
 * The offline result page must be at least as informative as the original
 * course app's Gemini-generated expert text — and it must work with ZERO
 * network. buildExpertNarrative is the deterministic replacement: a rich,
 * mycologically-toned explanation built purely from the rule hits.
 */

const cases: Array<[string, MushroomTraits]> = [
  ['high', { odor: 'f', capShape: 'x', capColor: 'n' }],
  ['medium', { odor: 'n', gillSize: 'n', gillSpacing: 'w', stalkRoot: 'r', bruises: 'f' }],
  ['low', { odor: 'a', capShape: 'x', capColor: 'n' }],
  ['unknown', { odor: 'f' }],
];

describe('buildExpertNarrative — offline expert explanation', () => {
  it.each(cases)('produces non-empty narrative for %s', (_level, traits) => {
    const text = buildExpertNarrative(computeRiskAssessment(traits), traits);
    expect(text.trim().length).toBeGreaterThan(80);
  });

  it.each(cases)('always carries the mandatory safety sentence (%s)', (_level, traits) => {
    const text = buildExpertNarrative(computeRiskAssessment(traits), traits);
    expect(text).toContain('严禁在未经过线下专业鉴定前食用野生真菌');
  });

  it('names the specific observed signal for a high-risk foul odor', () => {
    const text = buildExpertNarrative(computeRiskAssessment({ odor: 'f', capShape: 'x', capColor: 'n' }), {
      odor: 'f',
      capShape: 'x',
      capColor: 'n',
    });
    expect(text).toContain('气味');
  });

  it('explains WHY an unknown verdict was forced (incomplete input)', () => {
    const text = buildExpertNarrative(computeRiskAssessment({ odor: 'f' }), { odor: 'f' });
    expect(text).toMatch(/信息不足|无法建立|不足以/);
  });

  it('does not claim edibility or toxicity in any level', () => {
    for (const [, traits] of cases) {
      const text = buildExpertNarrative(computeRiskAssessment(traits), traits);
      expect(text).not.toMatch(/可食用|有毒|无毒|能吃/);
    }
  });
});
