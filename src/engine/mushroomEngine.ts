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
 * Weights v2 are grounded in the REAL UCI Mushrooms dataset (8,124 samples):
 *  - 100%-purity decision branches (single class in the full dataset) set the
 *    strong signals, with support counts (n) recorded in each rule detail;
 *  - remaining weights follow Random-Forest Gini importance + per-value
 *    poisonous rates (see scripts/analyze_dataset.py → distilled_rules.json).
 * They describe statistical associations in that dataset, not biological laws.
 */

export const MIN_TRAITS = 3;
export const MAX_CONFIDENCE = 0.97;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Strong risk signals (UCI purity: these odors are 100% poisonous, n=36..2160). */
const FOUL_ODORS: ReadonlySet<string> = new Set(['f', 'p', 'c', 'y', 's', 'm']);
/** Safety anchors (UCI purity: almond/anise odors are 100% edible, n=400 each). */
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

  // ---- Odor: the single most informative trait (Gini 0.161) ----
  if (traits.odor) {
    if (FOUL_ODORS.has(traits.odor)) {
      add('p', 6.0, {
        id: 'odor-foul',
        label: '气味强风险信号',
        severity: 'critical',
        detail: '恶臭/辛辣/刺激性/鱼腥/杂酚油/霉味在数据集 3,796 例中全部对应高风险类（统计关联，非绝对）。',
      });
    } else if (SAFE_ODOR_ANCHORS.has(traits.odor)) {
      add('e', 3.5, {
        id: 'odor-safety-anchor',
        label: '气味安全锚点',
        severity: 'info',
        detail: '杏仁/茴香味在数据集 800 例中未观察到风险样本，仅作统计参考，不构成安全结论。',
      });
    }
  }

  // ---- Spore print: green flags Chlorophyllum molybdites (Gini 0.093) ----
  if (traits.sporePrintColor === 'r') {
    add('p', 5.5, {
      id: 'spore-green',
      label: '绿色孢子印信号',
      severity: 'critical',
      detail: '绿色孢子印是常见中毒物种大青褶伞的关键特征，数据集 72 例全部对应高风险类（统计关联，非绝对）。',
    });
  }

  // ---- Gill color: 2nd most important trait (Gini 0.112), formerly unscored ----
  if (traits.gillColor === 'b') {
    add('p', 4.0, {
      id: 'gill-color-buff',
      label: '菌褶浅黄信号',
      severity: 'warning',
      detail: '菌褶浅黄色在数据集 1,728 例中全部对应高风险类（统计关联；野外观色易受光照影响，仅供参考）。',
    });
  } else if (traits.gillColor === 'r') {
    add('p', 2.0, {
      id: 'gill-color-red',
      label: '菌褶红色信号',
      severity: 'warning',
      detail: '菌褶红色在数据集 24 例中全部对应高风险类（样本量小，统计关联）。',
    });
  } else if (traits.gillColor === 'e' || traits.gillColor === 'o') {
    add('e', 2.0, {
      id: 'gill-color-anchor',
      label: '菌褶颜色安全锚点',
      severity: 'info',
      detail: '菌褶红色/橙色在数据集中未观察到风险样本（n=96/64，统计参考，不构成安全结论）。',
    });
  }

  // ---- Ring: formerly unscored despite Gini 0.070 ----
  if (traits.ringType === 'l') {
    add('p', 4.0, {
      id: 'ring-large',
      label: '大型菌环信号',
      severity: 'warning',
      detail: '大型垂悬菌环在数据集 1,296 例中全部对应高风险类（统计关联，非绝对）。',
    });
  } else if (traits.ringType === 'n') {
    add('p', 2.0, {
      id: 'ring-type-none',
      label: '无菌环信号',
      severity: 'warning',
      detail: '无菌环在数据集 36 例中全部对应高风险类（样本量小，统计关联）。',
    });
  } else if (traits.ringType === 'f') {
    add('e', 1.5, {
      id: 'ring-flaring',
      label: '喇叭状菌环参考',
      severity: 'info',
      detail: '喇叭状菌环在数据集 48 例中未观察到风险样本（统计参考）。',
    });
  }
  if (traits.ringNumber === 'n') {
    add('p', 2.0, {
      id: 'ring-number-none',
      label: '无菌环数量信号',
      severity: 'warning',
      detail: '菌环数量为无时在数据集 36 例中全部对应高风险类（样本量小，统计关联）。',
    });
  }

  // ---- Gill morphology ----
  if (traits.gillSize === 'n') {
    add('p', 3.5, { id: 'gill-narrow', label: '窄菌褶', severity: 'warning', detail: '窄菌褶在数据集中 88.5% 对应高风险类。' });
  } else if (traits.gillSize === 'b') {
    add('e', 1.0, { id: 'gill-broad', label: '宽菌褶', severity: 'info', detail: '宽菌褶在数据集中 69.9% 对应安全类。' });
  }
  if (traits.gillSpacing === 'c') {
    add('p', 1.5, { id: 'gill-close', label: '近菌褶', severity: 'warning', detail: '近菌褶在数据集中 55.8% 对应高风险类。' });
  } else if (traits.gillSpacing === 'w') {
    add('e', 2.5, { id: 'gill-wide', label: '宽菌褶间距', severity: 'info', detail: '宽菌褶间距在数据集中 91.5% 对应安全类。' });
  }

  // ---- Stalk root ----
  if (traits.stalkRoot === 'r') {
    add('e', 3.5, {
      id: 'root-tapered',
      label: '根状菌柄锚点',
      severity: 'info',
      detail: '根状菌柄在数据集 192 例中全部对应安全类（统计参考，不构成安全结论）。',
    });
  } else if (traits.stalkRoot === '?') {
    add('p', 2.5, { id: 'root-missing', label: '菌柄根缺失', severity: 'warning', detail: '根缺失在数据集中 71.0% 对应高风险类。' });
  } else if (traits.stalkRoot === 'c') {
    add('e', 1.5, { id: 'root-club', label: '棒状菌柄参考', severity: 'info', detail: '棒状菌柄在数据集中 92.1% 对应安全类。' });
  }

  // ---- Bruising ----
  if (traits.bruises === 't') {
    add('e', 2.0, { id: 'bruises-yes', label: '碰伤变色参考', severity: 'info', detail: '碰伤变色在数据集中 81.5% 对应安全类。' });
  } else if (traits.bruises === 'f') {
    add('p', 2.0, { id: 'bruises-no', label: '碰伤不变色', severity: 'warning', detail: '碰伤不变色在数据集中 69.3% 对应高风险类。' });
  }

  // ---- Environment ----
  if (traits.habitat === 'p') {
    add('p', 1.5, { id: 'habitat-path', label: '路径生境', severity: 'warning', detail: '路径生境在数据集中 88.1% 对应高风险类。' });
  } else if (traits.habitat === 'u') {
    add('p', 1.0, { id: 'habitat-urban', label: '城市生境', severity: 'warning', detail: '城市生境在数据集中 73.9% 对应高风险类。' });
  } else if (traits.habitat === 'w') {
    add('e', 1.5, { id: 'habitat-waste', label: '荒地生境锚点', severity: 'info', detail: '荒地生境在数据集 192 例中全部对应安全类（统计参考）。' });
  }
  if (traits.population === 'v') {
    add('p', 1.5, { id: 'population-several', label: '数个种群', severity: 'warning', detail: '数个种群在数据集中 70.5% 对应高风险类。' });
  } else if (traits.population === 'a' || traits.population === 'n') {
    add('e', 3.0, {
      id: 'population-anchor',
      label: '种群安全锚点',
      severity: 'info',
      detail: '丰富/大量种群在数据集 784 例中全部对应安全类（统计参考，不构成安全结论）。',
    });
  }

  // ---- Cap ----
  if (traits.capShape === 'k') {
    add('p', 1.5, { id: 'cap-umbonate', label: '中央凸起菌盖', severity: 'warning', detail: '中央凸起菌盖在数据集中 72.5% 对应高风险类。' });
  } else if (traits.capShape === 's') {
    add('e', 1.0, { id: 'cap-sunken', label: '中央凹陷菌盖参考', severity: 'info', detail: '中央凹陷菌盖在数据集 32 例中全部对应安全类（样本量小）。' });
  }
  if (traits.stalkColorAbove === 'b') {
    add('p', 1.5, { id: 'stalk-above-buff', label: '菌环以上浅黄色', severity: 'warning', detail: '菌环以上浅黄色在数据集 432 例中全部对应高风险类（统计关联）。' });
  }

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
