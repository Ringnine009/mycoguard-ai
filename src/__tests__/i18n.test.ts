import { describe, it, expect } from 'vitest';
import { translate, RULE_EN } from '../i18n';
import { ENGINE_RULES } from '../engine/mushroomEngine';
import { riskPresentation } from '../engine/presentation';
import { buildExpertNarrative } from '../engine/expert';
import { buildVisionPipeline } from '../engine/pipeline';
import { computeRiskAssessment } from '../engine/mushroomEngine';
import { evaluateVision } from '../engine/merge';

describe('i18n — zh/en dictionary', () => {
  it('translates key UI strings to English', () => {
    expect(translate('开始分析', 'en')).toBe('Analyze');
    expect(translate('高风险', 'en')).toBe('High risk');
    expect(translate('无法判断', 'en')).toBe('Unknown');
    expect(translate('拍照识别', 'en')).toBe('Photo ID');
    expect(translate('免责声明', 'en')).toBe('Disclaimer');
  });

  it('falls back to the zh source for untranslated keys', () => {
    expect(translate('some-untranslated-key', 'en')).toBe('some-untranslated-key');
    expect(translate('开始分析', 'zh')).toBe('开始分析');
  });

  it('covers every engine rule id with an English label and detail', () => {
    for (const rule of ENGINE_RULES) {
      const en = RULE_EN[rule.id];
      expect(en, `missing RULE_EN for ${rule.id}`).toBeTruthy();
      expect(en.label.length).toBeGreaterThan(0);
      expect(en.detail.length).toBeGreaterThan(0);
    }
  });
});

describe('i18n — bilingual presentation', () => {
  it('risk presentation switches language', () => {
    expect(riskPresentation('high', 'en').label).toBe('High risk');
    expect(riskPresentation('high', 'zh').label).toBe('高风险');
    expect(riskPresentation('unknown', 'en').label).toBe('Unknown');
  });

  it('expert narrative produces English with the mandatory safety sentence', () => {
    const assessment = computeRiskAssessment({ odor: 'f', capShape: 'x', capColor: 'n' });
    const en = buildExpertNarrative(assessment, { odor: 'f', capShape: 'x', capColor: 'n' }, 'en');
    expect(en).toContain('Never eat a wild mushroom without a professional identification');
    expect(en).toContain('Observed traits');
    expect(en).toContain('Foul odor signal');
  });

  it('vision pipeline steps are translated', () => {
    const vision = {
      status: 'ok' as const,
      speciesGuess: 'Amanita muscaria',
      modelConfidence: 0.9,
      traits: { capColor: 'r' },
      notes: '',
      warnings: [],
    };
    const assessment = evaluateVision({ odor: 'f', capShape: 'x' }, vision);
    const steps = buildVisionPipeline(vision, assessment, 3, 'en');
    expect(steps[0].kicker).toBe('Vision');
    expect(steps[1].detail).toBe('1 vision traits');
    expect(steps[3].kicker).toBe('Fused evidence interval');
  });
});
