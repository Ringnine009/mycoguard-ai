/**
 * Core domain types for MycoGuard.
 *
 * Risk language is deliberately non-absolute: MycoGuard never states that a
 * mushroom is "edible" or "poisonous". Every verdict is a risk level with a
 * confidence *interval* (never a single point, never 100%).
 */

/** The 22 morphological traits from the UCI Mushrooms dataset (original codes). */
export type MushroomTraits = {
  capShape?: string; // 菌盖形状 b|c|x|f|k|s
  capSurface?: string; // 菌盖表面 f|g|y|s
  capColor?: string; // 菌盖颜色 n|b|c|g|r|p|u|e|w|y
  bruises?: string; // 受伤是否变色 t|f
  odor?: string; // 气味 a|l|c|y|f|m|n|p|s
  gillAttachment?: string; // 菌褶附着 a|d|f|n
  gillSpacing?: string; // 菌褶间距 c|w|d
  gillSize?: string; // 菌褶大小 b|n
  gillColor?: string; // 菌褶颜色 k|n|b|h|g|r|o|p|u|e|w|y
  stalkShape?: string; // 菌柄形状 e|t
  stalkRoot?: string; // 菌柄根部 b|c|u|e|r|?
  stalkSurfaceAbove?: string; // 菌环以上表面 f|y|k|s
  stalkSurfaceBelow?: string; // 菌环以下表面 f|y|k|s
  stalkColorAbove?: string; // 菌环以上颜色 n|b|c|o|p|e|w|y
  stalkColorBelow?: string; // 菌环以下颜色 n|b|c|o|p|e|w|y
  veilType?: string; // 菌幕类型 p|u
  veilColor?: string; // 菌幕颜色 n|o|w|y
  ringNumber?: string; // 菌环数量 n|o|t
  ringType?: string; // 菌环类型 c|e|f|l|n|p|s|z
  sporePrintColor?: string; // 孢子印颜色 k|n|b|h|r|o|u|w|y
  population?: string; // 种群分布 a|c|n|s|v|y
  habitat?: string; // 栖息地 g|l|m|p|u|w|d
};

/** Four-tier risk language. Never "edible" / "poisonous". */
export type RiskLevel = 'low' | 'medium' | 'high' | 'unknown';

/**
 * Confidence is always an interval [lower, upper] with a point estimate.
 * Values are clamped to (0, 0.97): the engine is calibrated so it can never
 * claim certainty.
 */
export interface ConfidenceInterval {
  point: number;
  lower: number;
  upper: number;
}

export type SignalSeverity = 'info' | 'warning' | 'critical';

/** A single rule that fired, for explainability. */
export interface RuleHit {
  id: string;
  label: string;
  severity: SignalSeverity;
  detail: string;
}

/**
 * Dual-channel consistency between the offline rule engine and the vision
 * model: agree / partial / disagree by confidence gap, or n-a when the
 * vision channel provided nothing usable.
 */
export type VisionConsistency = 'agree' | 'partial' | 'disagree' | 'n-a';

export interface RiskAssessment {
  riskLevel: RiskLevel;
  confidence: ConfidenceInterval;
  reasoning: string;
  guidance: string;
  ruleHits: RuleHit[];
  /** True when input was insufficient and the engine was forced to "unknown". */
  incomplete: boolean;
  /** Set only when a photo was analyzed (see engine/merge.ts fusion). */
  visionConsistency?: VisionConsistency;
}

/** Result of the optional vision-based analysis (proxied by the backend). */
export interface VisionResult {
  status: 'ok';
  /** Best-effort species guess, or null when the model is not confident. */
  speciesGuess: string | null;
  /** Model self-reported confidence for the species guess, 0..1. */
  modelConfidence: number;
  /** Traits the model claims it could see in the photo (may be incomplete). */
  traits: Partial<MushroomTraits>;
  /** 1–2 sentence plain-language observation summary. */
  notes: string;
  warnings: string[];
}

/** One Q&A turn of the built-in safety-knowledge chat. */
export interface ChatReply {
  answer: string;
  mode: 'rule' | 'llm' | 'fallback';
  source?: string;
  matched: boolean;
}

/** Backend health probe result. */
export interface BackendHealth {
  status: 'ok';
  vision: boolean;
  chat: boolean;
}

export interface TraitOption {
  label: string;
  value: string;
}

export interface TraitDefinition {
  id: keyof MushroomTraits;
  label: string;
  options: TraitOption[];
  critical?: boolean;
  hint?: string;
}
