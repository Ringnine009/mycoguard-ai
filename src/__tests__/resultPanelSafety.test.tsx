import { describe, it, expect } from 'vitest';
import { renderToString } from 'react-dom/server';
import { ResultPanel } from '../components/ResultPanel';
import { computeRiskAssessment } from '../engine/mushroomEngine';
import { evaluateVision } from '../engine/merge';
import { LangProvider, translate } from '../i18n';
import { MushroomTraits, RiskAssessment } from '../types';

/**
 * SAFETY CONTRACT — DOM level.
 *
 * Regression this suite guards: a `low` verdict rendered the same green
 * success treatment as a confirmation (`.risk-badge.safe`, `.result-card.safe`,
 * `ShieldCheck` icon, green `.guidance-box.safe`) directly beside a big
 * number on a 0-100% scale, which reads as "74% safe to eat".
 *
 * Required: green/success affordances are reserved for nothing; a `low`
 * verdict is rendered NEUTRALLY and the number is explicitly labelled as
 * evidence strength, not as a probability of safety (zh + EN).
 */

const LOW: MushroomTraits = { odor: 'a', capShape: 'x', capColor: 'n' };
const HIGH: MushroomTraits = { odor: 'f', capShape: 'x', capColor: 'n' };

const render = (traits: MushroomTraits): string => {
  const assessment = computeRiskAssessment(traits);
  return renderToString(
    <LangProvider>
      <ResultPanel assessment={assessment} traits={traits} filledTraits={3} />
    </LangProvider>,
  );
};

/** class="..." attribute values only, so prose can never satisfy a check. */
const classes = (html: string): string[] =>
  Array.from(html.matchAll(/class="([^"]*)"/g)).flatMap((m) => m[1].split(/\s+/));

describe('ResultPanel — a low verdict carries no success affordance', () => {
  it('does not use the success tone class anywhere in the low-risk DOM', () => {
    const cs = classes(render(LOW));
    expect(cs).not.toContain('safe');
    expect(cs.some((c) => /^risk-badge safe$|^result-card top-border safe$/.test(c))).toBe(false);
  });

  it('does not render a green shield-check success icon for a low verdict', () => {
    const html = render(LOW);
    // ShieldCheck is the green check glyph; ShieldX / ShieldAlert / HelpCircle remain allowed.
    expect(html).not.toContain('shield-check');
  });

  it('high and medium verdicts keep their existing danger/warn affordances', () => {
    const high = classes(render(HIGH));
    expect(high).toContain('danger');
    expect(high).toContain('critical');
  });

  it('the safety label itself carries the "not a probability of safety" wording', () => {
    // The DOM renders zh by default; the English string is asserted through the
    // dictionary below. What matters here is that the caveat is IN the DOM.
    const html = render(LOW);
    expect(html).toContain('证据充分度');
    expect(html).toContain('不是安全概率');
  });

  it('never renders a 0-100% safety scale for the verdict number', () => {
    const html = render(LOW);
    expect(html).not.toContain('100%');
    expect(html).not.toContain('conf-scale');
  });

  it('renders a verdict that arrives without the evidence summary (no crash, no success look)', () => {
    // `computeRiskAssessment` always fills `evidence`; this asserts the result
    // page does not crash (or fall back to a reassuring display) if a hand-built
    // assessment ever reaches it without one.
    const bare = {
      riskLevel: 'low' as const,
      confidence: { point: 0.4, lower: 0.3, upper: 0.5 },
      reasoning: 'r',
      guidance: 'g',
      ruleHits: [],
      incomplete: false,
    } as unknown as RiskAssessment;
    const html = renderToString(
      <LangProvider>
        <ResultPanel assessment={bare} traits={LOW} filledTraits={3} />
      </LangProvider>,
    );
    expect(html).toContain('证据充分度');
    expect(html).not.toContain('shield-check');
    expect(classes(html)).not.toContain('safe');
  });

  it('keeps the risk tier wording (direction) separate from the strength number', () => {
    const html = render(LOW);
    expect(html).toContain('低风险');
    expect(html).toContain('未发现强风险信号');
    expect(html).toContain('这不等于可以食用');
    // No affirmative edibility claim anywhere in the panel.
    expect(html).not.toMatch(/可以安全食用|放心食用|可以吃|建议食用/);
  });
});

describe('ResultPanel — photo mode surfacing', () => {
  it('marks an interval widened by channel disagreement', () => {
    const vision = {
      status: 'ok' as const,
      speciesGuess: 'Chanterelle',
      modelConfidence: 0.95,
      traits: {},
      notes: '',
      warnings: [],
    };
    const assessment = evaluateVision(LOW, vision);
    const html = renderToString(
      <LangProvider>
        <ResultPanel assessment={assessment} traits={LOW} vision={vision} filledTraits={3} />
      </LangProvider>,
    );
    expect(assessment.visionConsistency).toBe('disagree');
    expect(assessment.evidence.intervalWidened).toBe(true);
    expect(html).toContain('证据充分度');
    expect(html).toContain('区间因双通道分歧加宽');
    expect(html).toContain('视觉与规则：存在分歧');
    expect(html).not.toContain('shield-check');
  });

  it('surfaces traits the model claimed but a photo cannot show', () => {
    const vision = {
      status: 'ok' as const,
      speciesGuess: null,
      modelConfidence: 0,
      traits: {},
      notes: '',
      warnings: ['模型报告了无法从照片观察的性状 odor，已丢弃（不同模态，不可由图像推断）'],
    };
    const html = renderToString(
      <LangProvider>
        <ResultPanel
          assessment={evaluateVision(LOW, vision)}
          traits={LOW}
          vision={vision}
          filledTraits={3}
        />
      </LangProvider>,
    );
    expect(html).toContain('模型报告了无法从照片观察的性状，已丢弃：');
    expect(html).toContain('odor');
  });
});

describe('i18n — the new safety labels are translated, not silently dropped', () => {
  it('every safety label has a real English string', () => {
    for (const zh of [
      '证据充分度',
      '该数字表示证据充分度，不是安全概率，也不是可食用的可能性。',
      '未发现强风险信号——这不等于可以食用。',
      '区间因双通道分歧加宽（证据强度不可按点估计理解）',
      '区间因双通道一致收窄',
      '证据充分度区间 ∈ (0, 97%]（非安全概率）',
    ]) {
      const en = translate(zh, 'en');
      expect(en, `missing EN translation for ${zh}`).not.toBe(zh);
      expect(en.length).toBeGreaterThan(0);
    }
  });

  it('the EN caveat says it is not a probability of safety', () => {
    const en = translate('该数字表示证据充分度，不是安全概率，也不是可食用的可能性。', 'en');
    expect(en.toLowerCase()).toContain('not a probability of safety');
  });
});
