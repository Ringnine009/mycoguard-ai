// `.ts` extension required: scripts/eval_engine_safety.ts runs under Node's
// native type stripping, which (unlike Vite/vitest) resolves neither
// extensionless specifiers nor type-only names in a value import. tsconfig has
// allowImportingTsExtensions on, and `import type` is fully erased.
import type { MushroomTraits, RiskAssessment, RuleHit } from '../types.ts';

/**
 * MycoGuard offline rule engine.
 *
 * Design contract (see README "Uncertainty quantification"):
 *  - Risk language is four-tier: low / medium / high / unknown.
 *    The engine NEVER says "edible" or "poisonous".
 *  - DIRECTION and STRENGTH are separate: the four-tier risk level carries
 *    the direction; `evidence.strength` carries only how much observational
 *    coverage backs it. The strength number is bounded within (0, 0.97] and
 *    is never a probability of safety.
 *  - Insufficient input (< MIN_TRAITS traits, or no discriminative trait)
 *    forces "unknown", even when a dangerous signal was observed.
 *
 * Why the strength metric had to be rewritten (v3): the previous point
 * estimate used `Math.abs(diff)` of the risk/safety score difference, so a
 * LARGE NEGATIVE difference — i.e. strong evidence for the safe class —
 * produced just as high a number as a large positive one (measured: a
 * 4-trait low-risk verdict rendered 74%, a 7-trait one 92%). Rendered next to
 * a green success badge, that reads as "74% safe to eat". The metric below is
 * built from trait coverage and signal conflict ONLY: it is invariant to the
 * direction of the score difference, so a low-risk verdict can never look
 * better-evidenced than a high-risk verdict.
 *
 * Weights v2 are grounded in the REAL UCI Mushrooms dataset (8,124 samples):
 *  - 100%-purity decision branches (single class in the full dataset) set the
 *    strong signals, with support counts (n) recorded in each rule detail;
 *  - remaining weights follow Random-Forest Gini importance + per-value
 *    poisonous rates (see scripts/analyze_dataset.py → distilled_rules.json).
 * They describe statistical associations in that dataset, not biological laws.
 *
 * ENGINE_RULES is the single source of truth for the weight table; it is
 * mirrored by scripts/analyze_dataset.py and cross-checked against the
 * committed distilled_rules.json in src/__tests__/distilled.test.ts.
 */

export const MIN_TRAITS = 3;
/**
 * Hard ceiling for the evidence-strength number. The engine must never render
 * a number that could be read as certainty, so the cap is deliberately below
 * 1.0 for every tier, including the strongest critical signal.
 */
export const MAX_CONFIDENCE = 0.97;
/** Total trait slots in MushroomTraits — the denominator of coverage. */
export const TOTAL_TRAITS = 22;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export interface EngineRule {
  id: string;
  trait: keyof MushroomTraits;
  /** One or more matching trait codes. */
  values: readonly string[];
  side: 'p' | 'e';
  weight: number;
  severity: 'critical' | 'warning' | 'info';
  label: string;
  detail: string;
}

/** Strong risk signals (UCI purity: these odors are 100% poisonous, n=36..2160). */
const FOUL_ODORS = ['f', 'p', 'c', 'y', 's', 'm'] as const;
/** Safety anchors (UCI purity: almond/anise odors are 100% edible, n=400 each). */
const SAFE_ODOR_ANCHORS = ['a', 'l'] as const;

/**
 * Weight table v2. Order matters only for rule-hit display order.
 * Numeric values mirror scripts/analyze_dataset.py (ENGINE_WEIGHTS) exactly.
 */
export const ENGINE_RULES: readonly EngineRule[] = [
  // ---- Risk side (pScore) ----
  {
    id: 'odor-foul',
    trait: 'odor',
    values: FOUL_ODORS,
    side: 'p',
    weight: 6.0,
    severity: 'critical',
    label: '气味强风险信号',
    detail: '恶臭/辛辣/刺激性/鱼腥/杂酚油/霉味在数据集 3,796 例中全部对应高风险类（统计关联，非绝对）。',
  },
  {
    id: 'spore-green',
    trait: 'sporePrintColor',
    values: ['r'],
    side: 'p',
    weight: 5.5,
    severity: 'critical',
    label: '绿色孢子印信号',
    detail: '绿色孢子印是常见中毒物种大青褶伞的关键特征，数据集 72 例全部对应高风险类（统计关联，非绝对）。',
  },
  {
    id: 'gill-color-buff',
    trait: 'gillColor',
    values: ['b'],
    side: 'p',
    weight: 4.0,
    severity: 'warning',
    label: '菌褶浅黄信号',
    detail: '菌褶浅黄色在数据集 1,728 例中全部对应高风险类（统计关联；野外观色易受光照影响，仅供参考）。',
  },
  {
    id: 'gill-color-green',
    trait: 'gillColor',
    values: ['r'],
    side: 'p',
    weight: 2.0,
    severity: 'warning',
    label: '菌褶绿色信号',
    detail: '菌褶绿色（UCI 编码 r）在数据集 24 例中全部对应高风险类（样本量小，统计关联）。',
  },
  {
    id: 'ring-large',
    trait: 'ringType',
    values: ['l'],
    side: 'p',
    weight: 4.0,
    severity: 'warning',
    label: '大型菌环信号',
    detail: '大型垂悬菌环在数据集 1,296 例中全部对应高风险类（统计关联，非绝对）。',
  },
  {
    id: 'ring-type-none',
    trait: 'ringType',
    values: ['n'],
    side: 'p',
    weight: 2.0,
    severity: 'warning',
    label: '无菌环信号',
    detail: '无菌环在数据集 36 例中全部对应高风险类（样本量小，统计关联）。',
  },
  {
    id: 'ring-number-none',
    trait: 'ringNumber',
    values: ['n'],
    side: 'p',
    weight: 2.0,
    severity: 'warning',
    label: '无菌环数量信号',
    detail: '菌环数量为无时在数据集 36 例中全部对应高风险类（样本量小，统计关联）。',
  },
  {
    id: 'gill-narrow',
    trait: 'gillSize',
    values: ['n'],
    side: 'p',
    weight: 3.5,
    severity: 'warning',
    label: '窄菌褶',
    detail: '窄菌褶在数据集中 88.5% 对应高风险类。',
  },
  {
    id: 'gill-close',
    trait: 'gillSpacing',
    values: ['c'],
    side: 'p',
    weight: 1.5,
    severity: 'warning',
    label: '近菌褶',
    detail: '近菌褶在数据集中 55.8% 对应高风险类。',
  },
  {
    id: 'root-missing',
    trait: 'stalkRoot',
    values: ['?'],
    side: 'p',
    weight: 2.5,
    severity: 'warning',
    label: '菌柄根缺失',
    detail: '根缺失在数据集中 71.0% 对应高风险类。',
  },
  {
    id: 'bruises-no',
    trait: 'bruises',
    values: ['f'],
    side: 'p',
    weight: 2.0,
    severity: 'warning',
    label: '碰伤不变色',
    detail: '碰伤不变色在数据集中 69.3% 对应高风险类。',
  },
  {
    id: 'habitat-path',
    trait: 'habitat',
    values: ['p'],
    side: 'p',
    weight: 1.5,
    severity: 'warning',
    label: '路径生境',
    detail: '路径生境在数据集中 88.1% 对应高风险类。',
  },
  {
    id: 'habitat-urban',
    trait: 'habitat',
    values: ['u'],
    side: 'p',
    weight: 1.0,
    severity: 'warning',
    label: '城市生境',
    detail: '城市生境在数据集中 73.9% 对应高风险类。',
  },
  {
    id: 'population-several',
    trait: 'population',
    values: ['v'],
    side: 'p',
    weight: 1.5,
    severity: 'warning',
    label: '数个种群',
    detail: '数个种群在数据集中 70.5% 对应高风险类。',
  },
  {
    id: 'cap-umbonate',
    trait: 'capShape',
    values: ['k'],
    side: 'p',
    weight: 1.5,
    severity: 'warning',
    label: '中央凸起菌盖',
    detail: '中央凸起菌盖在数据集中 72.5% 对应高风险类。',
  },
  {
    id: 'stalk-above-buff',
    trait: 'stalkColorAbove',
    values: ['b'],
    side: 'p',
    weight: 1.5,
    severity: 'warning',
    label: '菌环以上浅黄色',
    detail: '菌环以上浅黄色在数据集 432 例中全部对应高风险类（统计关联）。',
  },
  // ---- Safety side (eScore) ----
  {
    id: 'odor-safety-anchor',
    trait: 'odor',
    values: SAFE_ODOR_ANCHORS,
    side: 'e',
    weight: 3.5,
    severity: 'info',
    label: '气味安全锚点',
    detail: '杏仁/茴香味在数据集 800 例中未观察到风险样本，仅作统计参考，不构成安全结论。',
  },
  {
    id: 'gill-color-anchor',
    trait: 'gillColor',
    values: ['e', 'o'],
    side: 'e',
    weight: 2.0,
    severity: 'info',
    label: '菌褶颜色安全锚点',
    detail: '菌褶红色/橙色在数据集中未观察到风险样本（n=96/64，统计参考，不构成安全结论）。',
  },
  {
    id: 'ring-flaring',
    trait: 'ringType',
    values: ['f'],
    side: 'e',
    weight: 1.5,
    severity: 'info',
    label: '喇叭状菌环参考',
    detail: '喇叭状菌环在数据集 48 例中未观察到风险样本（统计参考）。',
  },
  {
    id: 'gill-broad',
    trait: 'gillSize',
    values: ['b'],
    side: 'e',
    weight: 1.0,
    severity: 'info',
    label: '宽菌褶',
    detail: '宽菌褶在数据集中 69.9% 对应安全类。',
  },
  {
    id: 'gill-wide',
    trait: 'gillSpacing',
    values: ['w'],
    side: 'e',
    weight: 2.5,
    severity: 'info',
    label: '宽菌褶间距',
    detail: '宽菌褶间距在数据集中 91.5% 对应安全类。',
  },
  {
    id: 'root-tapered',
    trait: 'stalkRoot',
    values: ['r'],
    side: 'e',
    weight: 3.5,
    severity: 'info',
    label: '根状菌柄锚点',
    detail: '根状菌柄在数据集 192 例中全部对应安全类（统计参考，不构成安全结论）。',
  },
  {
    id: 'root-club',
    trait: 'stalkRoot',
    values: ['c'],
    side: 'e',
    weight: 1.5,
    severity: 'info',
    label: '棒状菌柄参考',
    detail: '棒状菌柄在数据集中 92.1% 对应安全类。',
  },
  {
    id: 'bruises-yes',
    trait: 'bruises',
    values: ['t'],
    side: 'e',
    weight: 2.0,
    severity: 'info',
    label: '碰伤变色参考',
    detail: '碰伤变色在数据集中 81.5% 对应安全类。',
  },
  {
    id: 'habitat-waste',
    trait: 'habitat',
    values: ['w'],
    side: 'e',
    weight: 1.5,
    severity: 'info',
    label: '荒地生境锚点',
    detail: '荒地生境在数据集 192 例中全部对应安全类（统计参考）。',
  },
  {
    id: 'population-anchor',
    trait: 'population',
    values: ['a', 'n'],
    side: 'e',
    weight: 3.0,
    severity: 'info',
    label: '种群安全锚点',
    detail: '丰富/大量种群在数据集 784 例中全部对应安全类（统计参考，不构成安全结论）。',
  },
  {
    id: 'cap-sunken',
    trait: 'capShape',
    values: ['s'],
    side: 'e',
    weight: 1.0,
    severity: 'info',
    label: '中央凹陷菌盖参考',
    detail: '中央凹陷菌盖在数据集 32 例中全部对应安全类（样本量小）。',
  },
];

interface Scored {
  pScore: number;
  eScore: number;
  discriminative: number;
  ruleHits: RuleHit[];
}

function scoreTraits(traits: MushroomTraits): Scored {
  const acc: Scored = { pScore: 0, eScore: 0, discriminative: 0, ruleHits: [] };
  for (const rule of ENGINE_RULES) {
    const observed = traits[rule.trait];
    if (observed && rule.values.includes(observed)) {
      if (rule.side === 'p') acc.pScore += rule.weight;
      else acc.eScore += rule.weight;
      acc.discriminative += 1;
      acc.ruleHits.push({
        id: rule.id,
        label: rule.label,
        severity: rule.severity,
        detail: rule.detail,
      });
    }
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

/**
 * EVIDENCE STRENGTH — how well-observed the specimen is, nothing else.
 *
 * Inputs are coverage, rule support and conflict only:
 *   coverage = traits reported / TOTAL_TRAITS   (0..1)
 *   rules    = distinct engine rules that fired (normalised over 3..6 hits —
 *              three rules is the minimum for a directional verdict)
 *   tension  = min(pScore, eScore) / max(pScore, eScore)  (0 = all signals
 *              point one way, →1 = the two sides cancel out)
 *
 * `Math.abs(pScore − eScore)` — the old, unsafe ingredient — is deliberately
 * absent: neither the sign nor the size of the risk/safety score difference
 * may move this number, otherwise strong evidence FOR the safe class would
 * inflate it and a "low risk" verdict would render a higher score than a
 * "high risk" one (the pre-fix bug: 74% for low, 92% for the strongest case).
 *
 * `critical` adds a small fixed bonus (0.15) because a decisive risk signal is
 * stronger evidence than a vague one. It is the SAME bonus for every tier that
 * fires one, so it cannot make `low` outscore `high`, and a broader
 * observation set can still out-score a narrow critical hit.
 */
export function evidenceStrength(args: {
  active: number;
  pScore: number;
  eScore: number;
  ruleHits: number;
  critical: boolean;
  discriminative: number;
}): number {
  const { active, pScore, eScore, ruleHits, critical, discriminative } = args;
  const coverage = clamp(active / TOTAL_TRAITS, 0, 1);
  const ruleFactor = clamp((ruleHits - 3) / 3, 0, 1);
  const hi = Math.max(pScore, eScore);
  const tension = hi > 0 ? clamp(Math.min(pScore, eScore) / hi, 0, 1) : 0;

  const raw =
    0.5 * Math.pow(coverage, 1.2) +
    0.25 * ruleFactor +
    0.1 * tension +
    (critical ? 0.15 : 0) +
    (discriminative > 0 ? 0.02 : 0);
  return clamp(raw, 0.02, MAX_CONFIDENCE);
}

export function computeRiskAssessment(traits: MushroomTraits): RiskAssessment {
  const active = countActiveTraits(traits);
  const { pScore, eScore, discriminative, ruleHits } = scoreTraits(traits);
  const critical = ruleHits.some((h) => h.severity === 'critical');

  // Forced "unknown": not enough evidence for ANY directional verdict, so the
  // evidence strength must be the weakest number the app can show — lower than
  // any directional verdict, however sparse, and explicitly not "certain".
  if (active < MIN_TRAITS || discriminative === 0) {
    const point = 0.04;
    return {
      riskLevel: 'unknown',
      confidence: { point, lower: 0.02, upper: 0.18 },
      evidence: {
        strength: point,
        traitsObserved: active,
        ruleHits: ruleHits.length,
        intervalWidened: false,
      },
      reasoning: REASONING.unknown,
      guidance: GUIDANCE.unknown,
      ruleHits,
      incomplete: true,
    };
  }

  const riskLevel = levelOf(pScore, eScore, critical);

  // Strength of the evidence — NOT a directional confidence, NOT a safety
  // probability. See evidenceStrength() for why |Δscore| is not an input.
  const strength = evidenceStrength({
    active,
    pScore,
    eScore,
    ruleHits: ruleHits.length,
    critical,
    discriminative,
  });
  const point = strength;

  // Interval half-width, as a FRACTION of the evidence strength:
  //   relativeHalfWidth = clamp(0.9 − coverage, 0.15, 0.9) × (critical ? 0.6 : 1)
  // A sparse observation set (< ~3 of 22 traits) cannot support a tight
  // interval, so the relative width starts near its most pessimistic value and
  // tightens as coverage grows. Deriving the margin from a bounded RELATIVE
  // half-width keeps the interval honest AND monotone: more evidence ⇒ higher
  // point ⇒ strictly narrower interval, and the width can never collapse to
  // zero or be defeated by the 0.02 floor.
  const relHalf = clamp(0.9 - active / TOTAL_TRAITS, 0.15, 0.9) * (critical ? 0.6 : 1);
  const margin = point * relHalf;
  const lower = Math.max(point - margin, 0.02);
  const upper = Math.min(point + margin, MAX_CONFIDENCE);

  return {
    riskLevel,
    confidence: { point, lower, upper },
    evidence: {
      strength,
      traitsObserved: active,
      ruleHits: ruleHits.length,
      intervalWidened: false,
    },
    reasoning: REASONING[riskLevel],
    guidance: GUIDANCE[riskLevel],
    ruleHits,
    incomplete: false,
  };
}
