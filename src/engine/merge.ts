import { MushroomTraits, RiskAssessment, VisionConsistency, VisionResult } from '../types';
import { computeRiskAssessment, MAX_CONFIDENCE } from './mushroomEngine';

/**
 * Combine manual and vision-derived observations into one trait set.
 * Manual observations are direct and therefore win over model guesses.
 */
export function mergeTraits(
  manual: MushroomTraits,
  vision: Partial<MushroomTraits> | undefined,
): MushroomTraits {
  return { ...(vision ?? {}), ...manual };
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * Dual-channel confidence fusion (photo mode).
 *
 * Interpretation: the vision model's self-reported `modelConfidence` is
 * treated as the *reliability of the visual channel* (it is a confidence in
 * the species guess, used here as a proxy for "how much should the visual
 * read weigh"). The engine's confidence comes from trait statistics.
 *
 *   agreement = |engine.point − modelConfidence|
 *     < 0.12  → agree    (channels corroborate → narrow interval)
 *     0.12–0.30 → partial
 *     > 0.30  → disagree (channels conflict → widen interval)
 *
 *   point'  = clamp(0.65·engine.point + 0.35·modelConfidence, 0.05, 0.97)
 *   margin' = (engine.upper − engine.point) × (agree 0.85 / partial 1.0 / disagree 1.2)
 *   interval' = [point' − margin', point' + margin'] ⊂ (0, 0.97]
 *
 * Edge cases: no vision → untouched; modelConfidence 0 (nothing seen) →
 * keep the engine interval, mark consistency n-a; engine "unknown" →
 * a confident model cannot rescue insufficient evidence (consistency partial).
 */
export function fuseVisionConfidence(
  base: RiskAssessment,
  vision: VisionResult | undefined,
): RiskAssessment {
  if (!vision) return base;
  const mc = vision.modelConfidence;
  if (mc <= 0) return { ...base, visionConsistency: 'n-a' };
  if (base.riskLevel === 'unknown') return { ...base, visionConsistency: 'partial' };

  const agreement = Math.abs(base.confidence.point - mc);
  const consistency: VisionConsistency =
    agreement < 0.12 ? 'agree' : agreement > 0.3 ? 'disagree' : 'partial';

  const point = clamp(0.65 * base.confidence.point + 0.35 * mc, 0.05, MAX_CONFIDENCE);
  const factor = consistency === 'agree' ? 0.85 : consistency === 'disagree' ? 1.2 : 1.0;
  const margin = (base.confidence.upper - base.confidence.point) * factor;
  const lower = clamp(point - margin, 0.02, point);
  const upper = clamp(point + margin, point, MAX_CONFIDENCE);

  return { ...base, confidence: { point, lower, upper }, visionConsistency: consistency };
}

/**
 * Evaluate a photo identification: merge vision-observed traits into the
 * manual set, run the *same* offline rule engine, then fuse the vision
 * confidence into the interval. This keeps the risk language identical
 * across both input modes while surfacing the dual-channel agreement.
 */
export function evaluateVision(
  manual: MushroomTraits,
  vision: VisionResult | undefined,
): RiskAssessment {
  const traits = vision ? mergeTraits(manual, vision.traits) : { ...manual };
  return fuseVisionConfidence(computeRiskAssessment(traits), vision);
}
