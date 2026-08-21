import { MushroomTraits, RiskAssessment, RuleHit } from '../types';

/**
 * MycoGuard offline rule engine.
 *
 * Design contract (see README "Uncertainty quantification"):
 *  - Risk language is four-tier: low / medium / high / unknown.
 *    The engine NEVER says "edible" or "poisonous".
 *  - Confidence is always an interval within (0, 0.97] — never 100%.
 *  - Insufficient input (< MIN_TRAITS traits, or no discriminative trait)
 *    forces "unknown", even when a dangerous signal was observed.
 *
 * Weights were distilled from the UCI Mushrooms dataset (8,124 samples) via a
 * Random Forest + purity scan — reproduce with scripts/analyze_dataset.py.
 * They describe statistical associations, not absolute biological laws.
 */

export const MIN_TRAITS = 3;
export const MAX_CONFIDENCE = 0.97;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Strong risk signals (UCI: foul/strong odors always co-occurred with the poisonous class). */
const FOUL_ODORS: ReadonlySet<string> = new Set(['f', 'p', 'c', 'y', 's', 'm']);
/** Safety anchors (UCI: almond/anise odors always co-occurred with the edible class). */
const SAFE_ODOR_ANCHORS: ReadonlySet<string> = new Set(['a', 'l']);

interface Scored {
  pScore: number;
  eScore: number;
  discriminative: number;
  ruleHits: RuleHit[];
}

function scoreTraits(traits: MushroomTraits): Scored {
  const acc: Scored = { pScore: 0, eScore: 0, discriminative: 0, ruleHits: [] };
  const add = (kind: 'p' | 'e', amount: number, hit?: RuleHit) => {
    if (kind === 'p') acc.pScore += amount;
    else acc.eScore += amount;
    acc.discriminative += 1;
    if (hit) acc.ruleHits.push(hit);
  };

  // Odor — the single most informative trait in the dataset.
  if (traits.odor) {
    if (FOUL_ODORS.has(traits.odor)) {
      add('p', 6.0, {
        id: 'odor-foul',
        label: '气味强风险信号',
        severity: 'critical',
        detail: '恶臭/辛辣/刺激性等气味在数据集中与高风险物种强相关（统计关联，非绝对）。',
      });
    } else if (SAFE_ODOR_ANCHORS.has(traits.odor)) {
      add('e', 3.5, {
        id: 'odor-safety-anchor',
        label: '气味安全锚点',
        severity: 'info',
        detail: '杏仁/茴香味在数据集中未观察到毒例，仅作统计参考，不构成安全结论。',
      });
    }
  }

  // Spore print — green spore print flags Chlorophyllum molybdites (大青褶伞).
  if (traits.sporePrintColor === 'r') {
    add('p', 5.5, {
      id: 'spore-green',
      label: '绿色孢子印信号',
      severity: 'critical',
      detail: '绿色孢子印是常见中毒物种大青褶伞的关键特征（统计关联，非绝对）。',
    });
  }

  // Gill morphology.
  if (traits.gillSize === 'n') add('p', 3.5, { id: 'gill-narrow', label: '窄菌褶', severity: 'warning', detail: '窄菌褶在数据集中偏向高风险类。' });
  else if (traits.gillSize === 'b') add('e', 1.0);
  if (traits.gillSpacing === 'c') add('p', 1.5);
  else if (traits.gillSpacing === 'w') add('e', 2.5, { id: 'gill-wide', label: '宽菌褶', severity: 'info', detail: '宽菌褶在数据集中偏向低风险类。' });

  // Stalk root & bruising.
  if (traits.stalkRoot === 'r') add('e', 3.5, { id: 'root-tapered', label: '根状菌柄', severity: 'info', detail: '根状菌柄在数据集中偏向低风险类。' });
  else if (traits.stalkRoot === '?') add('p', 2.5, { id: 'root-missing', label: '菌柄根缺失', severity: 'warning', detail: '根缺失在数据集中偏向高风险类。' });
  if (traits.bruises === 't') add('e', 2.0, { id: 'bruises-yes', label: '碰伤变色', severity: 'info', detail: '碰伤变色在数据集中偏向低风险类。' });
  else if (traits.bruises === 'f') add('p', 2.0, { id: 'bruises-no', label: '碰伤不变色', severity: 'warning', detail: '碰伤不变色在数据集中偏向高风险类。' });

  // Environment.
  if (traits.habitat === 'p' || traits.habitat === 'u') add('p', 1.0, { id: 'habitat-urban', label: '路径/城市生境', severity: 'warning', detail: '路径与城市生境在数据集中偏向高风险类。' });
  if (traits.population === 'v') add('p', 1.5, { id: 'population-several', label: '数个种群', severity: 'warning', detail: '数个种群在数据集中偏向高风险类。' });

  return acc;
}

const countActiveTraits = (traits: MushroomTraits): number =>
  Object.values(traits).filter((v) => v !== undefined && v !== '').length;

function levelOf(pScore: number, eScore: number, critical: boolean): 'low' | 'medium' | 'high' {
  if (critical) return 'high';
  const diff = pScore - eScore;
  if (diff >= 4) return 'high';
  if (diff > 0) return 'medium';
  if (diff <= -3) return 'low';
  return 'medium';
}

const REASONING: Record<string, string> = {
  low: '观测特征的统计倾向与低风险样本一致，但野外鉴别存在不确定性；任何结论都只是概率性参考。',
  medium: '风险信号相互混合（既有偏向安全的特征，也有偏向风险的信号），无法给出明确的风险倾向。',
  high: '命中了多个强风险信号，统计特征与高风险物种一致。强烈建议按最坏情况处理：不要食用。',
  unknown: '输入不足或缺少判别性性状，无法给出任何风险倾向——这本身就是一个安全信号。',
};

const GUIDANCE: Record<string, string> = {
  low: '低风险（统计倾向安全）：仅表示观测特征与安全类样本一致，绝不构成食用建议。食用前请务必由真菌学专家确认。',
  medium: '中风险（信号混合）：请补充气味、孢子印颜色、菌褶等关键性状，或咨询当地真菌学会/植物园。',
  high: '高风险：强烈建议不要食用，也不要徒手接触后进食。请停止采集并咨询专业人士。',
  unknown: '无法判断：信息不足。请不要食用该蘑菇，先补充观察数据，或改用拍照识别寻求第二意见。',
};

export function computeRiskAssessment(traits: MushroomTraits): RiskAssessment {
  const active = countActiveTraits(traits);
  const { pScore, eScore, discriminative, ruleHits } = scoreTraits(traits);
  const critical = ruleHits.some((h) => h.severity === 'critical');

  // Forced "unknown": not enough evidence for ANY directional verdict.
  if (active < MIN_TRAITS || discriminative === 0) {
    return {
      riskLevel: 'unknown',
      confidence: { point: 0.18, lower: 0.05, upper: 0.3 },
      reasoning: REASONING.unknown,
      guidance: GUIDANCE.unknown,
      ruleHits,
      incomplete: true,
    };
  }

  const diff = pScore - eScore;
  const riskLevel = levelOf(pScore, eScore, critical);

  // Point estimate: base + data richness + logic certainty; critical signals
  // raise the floor but never reach certainty.
  const base = 0.4 + 0.3 * (active / 22) + 0.22 * Math.min(1, Math.abs(diff) / 8);
  const point = clamp(critical ? Math.max(base, 0.8) : base, 0.05, MAX_CONFIDENCE);

  // Interval width shrinks as evidence accumulates; critical signals narrow it further.
  const margin = (0.16 - 0.1 * (active / 22)) * (critical ? 0.6 : 1);
  const lower = clamp(point - margin, 0.02, point);
  const upper = clamp(point + margin, point, MAX_CONFIDENCE);

  return {
    riskLevel,
    confidence: { point, lower, upper },
    reasoning: REASONING[riskLevel],
    guidance: GUIDANCE[riskLevel],
    ruleHits,
    incomplete: false,
  };
}
