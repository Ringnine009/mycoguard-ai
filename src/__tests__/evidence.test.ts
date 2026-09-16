import { describe, it, expect } from 'vitest';
import {
  computeRiskAssessment,
  evidenceStrength,
  MAX_CONFIDENCE,
  MIN_TRAITS,
} from '../engine/mushroomEngine';
import { evaluateVision } from '../engine/merge';
import { MushroomTraits, RiskAssessment } from '../types';

/**
 * SAFETY CONTRACT — the number shown next to a verdict must never be readable
 * as "chance this mushroom is safe".
 *
 * Regression this suite guards (pre-fix behaviour, code-level evidence):
 *   mushroomEngine.ts computed `point = 0.4 + 0.3·(n/22) + 0.22·min(1,|Δscore|/8)`
 *   via `Math.abs(diff)`. Because the guard was |Δ|, a LARGE NEGATIVE score
 *   difference (strongly safety-leaning evidence) produced just as high a
 *   number as a large positive one: a 4-trait low-risk verdict rendered
 *   "74%" and a 7-trait one rendered "92%", i.e. the safer the conclusion,
 *   the higher the number — and ResultPanel painted it in the success colour
 *   with a green shield-check under a 0-100% scale.
 *
 * Fixed semantics (this file is the contract):
 *   - `confidence` is an EVIDENCE-STRENGTH interval: how much observational
 *     coverage supports the verdict, never how safe the mushroom is;
 *   - the risk TIER carries the direction, the number carries only strength
 *     and interval width — the two are decoupled;
 *   - evidence strength must never be higher for `low` than for `high`;
 *   - the vision channel may only WIDEN the interval, never move the point
 *     estimate, never change the tier, and never make a verdict look more
 *     precise (agreement is a no-op; only disagreement widens).
 */

/** Verdicts whose evidence is unambiguous, for tier-pair comparisons. */
const LOW = { odor: 'a', capShape: 'x', capColor: 'n' } as MushroomTraits;
const HIGH_CRITICAL = { odor: 'f', capShape: 'x', capColor: 'n' } as MushroomTraits;
const HIGH_MULTI = { sporePrintColor: 'r', gillColor: 'b', gillSize: 'n' } as MushroomTraits;

const strength = (t: MushroomTraits): number => computeRiskAssessment(t).evidence.strength;

describe('evidence strength — direction and strength are decoupled', () => {
  it('a low-risk verdict is never reported as better-evidenced than a high-risk verdict', () => {
    // Catches the old |Δscore| bug directly: 8.5 safety-leaning points used to
    // out-score 6.0 risk-leaning points purely because the gap was bigger.
    expect(strength(LOW)).toBeLessThanOrEqual(strength(HIGH_CRITICAL));
    expect(strength(LOW)).toBeLessThanOrEqual(strength(HIGH_MULTI));
  });

  it('the metric is invariant to the sign of the score difference', () => {
    // THE regression guard for the pre-fix bug. With `Math.abs(diff)` in the
    // formula, swapping which side dominates changed the number by |Δ|·0.22;
    // {odor a} used to score higher than {odor f} purely because the safety
    // anchor outweighed the risk signal. Same magnitudes, opposite direction:
    // the strength must not move at all.
    const dominant = { active: 3, ruleHits: 1, critical: false, discriminative: 1 };
    expect(evidenceStrength({ ...dominant, pScore: 6, eScore: 0 })).toBe(
      evidenceStrength({ ...dominant, pScore: 0, eScore: 6 }),
    );
    // ...and a bigger gap must not mean better evidence either.
    expect(evidenceStrength({ ...dominant, pScore: 0, eScore: 9 })).toBe(
      evidenceStrength({ ...dominant, pScore: 0, eScore: 3 }),
    );
    // Concrete engine-level counterpart: same traits, opposite anchor.
    expect(strength({ odor: 'a', capShape: 'x', capColor: 'n' })).toBeLessThan(
      strength({ odor: 'f', capShape: 'x', capColor: 'n' }),
    );
  });

  it('a forced-unknown verdict carries the weakest evidence of all tiers', () => {
    const unknown = computeRiskAssessment({ odor: 'f' });
    expect(unknown.riskLevel).toBe('unknown');
    expect(unknown.evidence.strength).toBeLessThan(strength(LOW));
    expect(unknown.evidence.strength).toBeLessThan(strength(HIGH_CRITICAL));
    // ...and it must not advertise itself as certain in either direction.
    expect(unknown.confidence.lower).toBeLessThan(unknown.confidence.point);
    expect(unknown.confidence.upper).toBeLessThan(0.3);
  });

  it('more observed traits can only raise evidence strength, never lower it', () => {
    const small = computeRiskAssessment({ odor: 'a', capShape: 'x', capColor: 'n' });
    const large = computeRiskAssessment({
      odor: 'a', capShape: 'x', capColor: 'n', gillSize: 'b', gillSpacing: 'w', stalkRoot: 'r',
    });
    expect(large.evidence.strength).toBeGreaterThan(small.evidence.strength);
    expect(large.confidence.upper).toBeGreaterThanOrEqual(small.confidence.upper);
    // Both intervals stay well-formed and inside the (0, 0.97] contract.
    for (const r of [small, large]) {
      expect(r.confidence.lower).toBeGreaterThan(0);
      expect(r.confidence.lower).toBeLessThan(r.confidence.point);
      expect(r.confidence.point).toBeLessThan(r.confidence.upper);
      expect(r.confidence.upper).toBeLessThanOrEqual(MAX_CONFIDENCE);
    }
  });

  it('the interval tightens RELATIVE to the evidence as coverage grows', () => {
    // Absolute width cannot be monotone (a near-zero strength has a near-zero
    // interval), but the relative width must shrink with coverage — that is
    // what "more evidence" is supposed to mean on screen.
    const rel = (t: MushroomTraits) => {
      const r = computeRiskAssessment(t);
      return (r.confidence.upper - r.confidence.lower) / r.confidence.point;
    };
    expect(rel({ odor: 'a', capShape: 'x', capColor: 'n' })).toBeGreaterThan(
      rel({
        odor: 'a', capShape: 'x', capColor: 'n', gillSize: 'b', gillSpacing: 'w', stalkRoot: 'r',
        bruises: 't', population: 'a',
      }),
    );
  });

  it('evidence strength is bounded and never claims certainty', () => {
    const everything: MushroomTraits = {
      capShape: 'x', capSurface: 'f', capColor: 'n', bruises: 't', odor: 'a',
      gillAttachment: 'f', gillSpacing: 'w', gillSize: 'b', gillColor: 'e',
      stalkShape: 'e', stalkRoot: 'r', stalkSurfaceAbove: 'f', stalkSurfaceBelow: 'f',
      stalkColorAbove: 'n', stalkColorBelow: 'n', veilType: 'p', veilColor: 'w',
      ringNumber: 'o', ringType: 'f', sporePrintColor: 'k', population: 'a', habitat: 'w',
    };
    const r = computeRiskAssessment(everything);
    expect(r.evidence.strength).toBeGreaterThan(0);
    expect(r.evidence.strength).toBeLessThan(1);
    expect(r.evidence.strength).toBeLessThanOrEqual(MAX_CONFIDENCE);
    expect(r.evidence.traitsObserved).toBe(22);
    expect(r.evidence.ruleHits).toBe(r.ruleHits.length);
  });

  it('a well-observed low verdict may not out-rank a clear high verdict in display strength', () => {
    // The reading-order rule, one level up from the matched-evidence case: a
    // low/medium verdict is an ABSENCE of finding, so it must not be presented
    // as better-evidenced than an unambiguous risk finding — otherwise the
    // strongest-looking bar in the app belongs to the safest-looking verdict.
    const lowWide = computeRiskAssessment({
      odor: 'a', gillSize: 'b', gillSpacing: 'w', stalkRoot: 'r', bruises: 't',
      capShape: 'x', capColor: 'n', population: 'a',
    });
    const highClear = computeRiskAssessment({ odor: 'f', capShape: 'x', capColor: 'n' });
    const mixedMedium = computeRiskAssessment({
      odor: 'n', gillSize: 'n', gillSpacing: 'w', stalkRoot: 'r', bruises: 'f',
    });
    expect(lowWide.riskLevel).toBe('low');
    expect(mixedMedium.riskLevel).toBe('medium');
    expect(highClear.riskLevel).toBe('high');
    expect(lowWide.evidence.strength).toBeLessThanOrEqual(highClear.evidence.strength);
    expect(mixedMedium.evidence.strength).toBeLessThanOrEqual(highClear.evidence.strength);
    // Conflict must cost evidence, not buy it: a mixed verdict cannot out-score
    // the same traits resolved one way.
    expect(mixedMedium.evidence.strength).toBeLessThan(strength({
      odor: 'f', gillSize: 'n', gillSpacing: 'w', stalkRoot: 'r', bruises: 'f',
    }));
  });
});

describe('measured display values — pinned so silent drift is caught', () => {
  /**
   * These are the numbers the UI actually renders, measured after the v3 fix.
   * The BEFORE values (from the pre-fix `|Δscore|` formula, re-measured against
   * the current rule table) were 54% / 80% / 72% / 92% / 18% — i.e. the two
   * LOW verdicts sat between the high verdict and a fully observed specimen.
   * See docs/upgrade-notes.md for the full table.
   */
  const pct = (t: MushroomTraits): number => Math.round(computeRiskAssessment(t).evidence.strength * 100);

  const SEVEN_LOW: MushroomTraits = {
    odor: 'a', gillSize: 'b', gillSpacing: 'w', stalkRoot: 'r', bruises: 't', capShape: 'x', capColor: 'n',
  };
  const TWENTY_TWO: MushroomTraits = {
    capShape: 'x', capSurface: 'f', capColor: 'n', bruises: 't', odor: 'a',
    gillAttachment: 'f', gillSpacing: 'w', gillSize: 'b', gillColor: 'e',
    stalkShape: 'e', stalkRoot: 'r', stalkSurfaceAbove: 'f', stalkSurfaceBelow: 'f',
    stalkColorAbove: 'n', stalkColorBelow: 'n', veilType: 'p', veilColor: 'w',
    ringNumber: 'o', ringType: 'f', sporePrintColor: 'k', population: 'a', habitat: 'w',
  };

  it('every tier renders a strictly sub-certainty percentage', () => {
    for (const t of [LOW, HIGH_CRITICAL, HIGH_MULTI, SEVEN_LOW, TWENTY_TWO]) {
      expect(pct(t)).toBeGreaterThan(0);
      expect(pct(t)).toBeLessThan(100);
    }
  });

  it('a fully observed but low-risk specimen cannot claim more evidence than a clear finding', () => {
    // 22/22 traits observed used to read 77% (pre-fix: 92%) for a LOW verdict —
    // the fullest bar in the app belonging to the safest-reading verdict. The
    // ceiling keeps such a verdict at 20%, above a 3-trait low verdict (7%) and
    // below any high finding.
    expect(pct(TWENTY_TWO)).toBe(20);
    expect(TWENTY_TWO && computeRiskAssessment(TWENTY_TWO).riskLevel).toBe('low');
    expect(pct(TWENTY_TWO)).toBeLessThanOrEqual(pct(HIGH_CRITICAL));
  });

  it('a 3-trait low verdict shows 7% and a 3-trait critical-high verdict 22%', () => {
    expect(pct(LOW)).toBe(7);
    expect(pct(HIGH_CRITICAL)).toBe(22);
  });

  it('coverage still separates sparse from well-observed verdicts below the ceiling', () => {
    expect(pct(LOW)).toBe(7);
    expect(pct(SEVEN_LOW)).toBe(20);
    expect(pct(SEVEN_LOW)).toBeGreaterThan(pct(LOW));
    expect(pct(SEVEN_LOW)).toBeLessThanOrEqual(pct(HIGH_CRITICAL));
  });

  it('the forced-unknown verdict is the smallest number the app can show', () => {
    const u = computeRiskAssessment({ odor: 'f' });
    expect(Math.round(u.evidence.strength * 100)).toBe(4);
    expect(u.confidence).toEqual({ point: 0.04, lower: 0.02, upper: 0.18 });
    for (const t of [LOW, HIGH_CRITICAL, HIGH_MULTI, SEVEN_LOW]) {
      expect(u.evidence.strength).toBeLessThan(computeRiskAssessment(t).evidence.strength);
    }
  });
});

describe('vision fusion may not manufacture certainty', () => {
  const base = computeRiskAssessment(LOW);
  const vision = (modelConfidence: number) => ({
    status: 'ok' as const,
    speciesGuess: 'Chanterelle',
    modelConfidence,
    traits: {},
    notes: '',
    warnings: [],
  });

  it('a confident visual channel never moves the evidence point estimate', () => {
    for (const mc of [0.1, 0.35, 0.5, 0.85, 0.95, 1]) {
      const fused = evaluateVision(LOW, vision(mc));
      expect(fused.confidence.point, `modelConfidence ${mc}`).toBe(base.confidence.point);
      expect(fused.evidence.strength, `modelConfidence ${mc}`).toBe(base.evidence.strength);
    }
  });

  it('never changes the risk tier, whatever the visual channel claims', () => {
    for (const mc of [0, 0.05, 0.5, 0.99, 1]) {
      expect(evaluateVision(LOW, vision(mc)).riskLevel).toBe('low');
      expect(evaluateVision(HIGH_CRITICAL, vision(mc)).riskLevel).toBe('high');
    }
  });

  it('an agreeing visual channel may not tighten the interval at all', () => {
    // The visual channel is OPTIONAL and its confidence is a confidence in a
    // SPECIES guess — a claim about a different question. It therefore has no
    // authority to make any verdict look more precise: agreement may leave the
    // interval alone, disagreement may widen it. The pre-fix version narrowed
    // by ×0.85 on agreement, which let a model's species confidence make a
    // low-risk verdict render "9% – 31%" instead of "7% – 33%" — measurably
    // more certain, on the safest-reading verdict.
    const fused = evaluateVision(LOW, vision(0.15));
    const width = (a: RiskAssessment) => a.confidence.upper - a.confidence.lower;
    expect(fused.visionConsistency).toBe('agree');
    expect(width(fused)).toBeGreaterThanOrEqual(width(base));
    expect(fused.confidence.lower).toBeLessThanOrEqual(base.confidence.lower);
    expect(fused.confidence.upper).toBeGreaterThanOrEqual(base.confidence.upper);
    expect(fused.confidence.point).toBe(base.confidence.point);
    expect(fused.evidence.intervalWidened ?? false).toBe(false);
  });

  it('a disagreeing visual channel widens the interval and flags the widening', () => {
    const fused = evaluateVision(LOW, vision(0.95));
    const width = (a: RiskAssessment) => a.confidence.upper - a.confidence.lower;
    expect(fused.visionConsistency).toBe('disagree');
    expect(width(fused)).toBeGreaterThan(width(base));
    expect(fused.evidence.intervalWidened).toBe(true);
  });

  it('the fused interval stays inside (0, 0.97] and well-formed', () => {
    const fused = evaluateVision(HIGH_CRITICAL, vision(0.2));
    expect(fused.confidence.lower).toBeLessThanOrEqual(fused.confidence.point);
    expect(fused.confidence.point).toBeLessThanOrEqual(fused.confidence.upper);
    expect(fused.confidence.upper).toBeLessThanOrEqual(MAX_CONFIDENCE);
    expect(fused.confidence.lower).toBeGreaterThan(0);
  });

  it('MIN_TRAITS is unchanged by this refactor (forced-unknown threshold intact)', () => {
    expect(MIN_TRAITS).toBe(3);
  });
});
