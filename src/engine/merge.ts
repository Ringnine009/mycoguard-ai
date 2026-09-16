import type { MushroomTraits, RiskAssessment, VisionConsistency, VisionResult } from '../types.ts';
import { computeRiskAssessment, MAX_CONFIDENCE } from './mushroomEngine.ts';

/**
 * Traits the rule engine scores but a PHOTOGRAPH of an intact specimen cannot
 * show: `odor` is olfaction (a different modality), `stalkRoot` is underground
 * and only exposed by uprooting the mushroom.
 *
 * Mirrored by `NON_VISUAL_TRAITS` in app/services/vision.py; the two are
 * cross-checked by src/__tests__/modality.test.ts so they cannot drift.
 *
 * Manual entry is unaffected — a person standing over the specimen CAN smell
 * it and CAN dig it up; only the photo channel is restricted.
 */
export const NON_VISUAL_TRAITS: readonly (keyof MushroomTraits)[] = ['odor', 'stalkRoot'];

/** Split a vision-reported trait set into usable and non-observable parts. */
export function dropNonVisualTraits(vision: Partial<MushroomTraits>): {
  traits: Partial<MushroomTraits>;
  dropped: (keyof MushroomTraits)[];
} {
  const traits: Partial<MushroomTraits> = {};
  const dropped: (keyof MushroomTraits)[] = [];
  for (const [key, value] of Object.entries(vision) as [keyof MushroomTraits, string][]) {
    if (value === undefined || value === '') continue;
    if (NON_VISUAL_TRAITS.includes(key)) dropped.push(key);
    else traits[key] = value;
  }
  return { traits, dropped };
}

/**
 * Combine manual and vision-derived observations into one trait set.
 * Manual observations are direct and therefore win over model guesses, and the
 * visual channel is restricted to traits it can actually observe (see
 * NON_VISUAL_TRAITS) — a photo can never contribute an odor reading.
 */
export function mergeTraits(
  manual: MushroomTraits,
  vision: Partial<MushroomTraits> | undefined,
): MushroomTraits {
  if (!vision) return { ...manual };
  return { ...dropNonVisualTraits(vision).traits, ...manual };
}

/**
 * Dual-channel evidence fusion (photo mode).
 *
 * SAFETY CONTRACT (do not weaken): the visual channel may only WIDEN the
 * evidence interval. It never changes the risk tier, never moves the strength
 * point estimate, and never makes any verdict look more precise.
 *
 * Why widening only: the model's self-reported confidence is a confidence in a
 * SPECIES guess — an answer to a different question than "how well observed is
 * this specimen". Weighting it into the risk number was the original category
 * error; letting an AGREEING channel narrow the interval by ×0.85 was the same
 * error in smaller print (measured: a low-risk verdict rendered "7% – 33%" and
 * became "9% – 31%" as soon as a model reported confidence 0.10–0.30). An
 * optional, unobservable claim must not buy precision, so agreement is now a
 * no-op and only disagreement widens.
 *
 *   gap = |engine.strength − modelConfidence|
 *     < 0.12  → agree    (channels corroborate → interval unchanged)
 *     0.12–0.30 → partial (interval unchanged)
 *     > 0.30  → disagree (channels conflict → widen ×1.2, and say so on screen)
 *
 *   point'  = engine.point                      (unchanged, by construction)
 *   margin' = (engine.upper − engine.point) × factor, factor ∈ {1, 1.2}
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

  const gap = Math.abs(base.confidence.point - mc);
  const consistency: VisionConsistency =
    gap < 0.12 ? 'agree' : gap > 0.3 ? 'disagree' : 'partial';

  // Widening is the only admissible direction: 1.0 (unchanged) or 1.2 (wider).
  const factor = consistency === 'disagree' ? 1.2 : 1;
  const point = base.confidence.point;
  const margin = Math.max(base.confidence.upper - base.confidence.point, 0) * factor;
  const lower = Math.max(point - margin, 0.02);
  const upper = Math.min(point + margin, MAX_CONFIDENCE);

  return {
    ...base,
    confidence: { point, lower, upper },
    evidence: { ...base.evidence, intervalWidened: consistency === 'disagree' },
    visionConsistency: consistency,
  };
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
