import { MushroomTraits, RiskAssessment, VisionResult } from '../types';
import { computeRiskAssessment } from './mushroomEngine';

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

/**
 * Evaluate a photo identification: merge vision-observed traits into the
 * manual set, then run the *same* offline rule engine. This keeps the risk
 * language and uncertainty grading identical across both input modes.
 */
export function evaluateVision(
  manual: MushroomTraits,
  vision: VisionResult | undefined,
): RiskAssessment {
  const traits = vision ? mergeTraits(manual, vision.traits) : { ...manual };
  return computeRiskAssessment(traits);
}
