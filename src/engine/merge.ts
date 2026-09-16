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
 * SAFETY CONTRACT (do not weaken): the visual channel may only change the
 * WIDTH of the evidence interval — never the risk tier, never the strength
 * point estimate. The vision model's self-reported `modelConfidence` is a
 * confidence in a SPECIES guess; weighting it into the risk/evidence number
 * was a category error (it made a low-risk verdict look *more* certain the
 * more confident the model was, whatever the model actually saw).
 *
 *   gap = |engine.point − modelConfidence|
 *     < 0.12  → agree    (channels corroborate → narrow ×0.85)
 *     0.12–0.30 → partial
 *     > 0.30  → disagree (channels conflict → widen ×1.2)
 *
 *   point'  = engine.point                      (unchanged, by construction)
 *   margin' = (engine.upper − engine.point) × factor
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

  const factor = consistency === 'agree' ? 0.85 : consistency === 'disagree' ? 1.2 : 1.0;
  // The point estimate is the engine's evidence strength and is NOT moved:
  // a photo is an extra observation channel, not extra certainty.
  const point = base.confidence.point;
  const margin = Math.max(base.confidence.upper - base.confidence.point, 0) * factor;
  // Same construction as the engine: a half-width clamped only against the
  // (0, 0.97] bounds, so narrower evidence can never look wider.
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
