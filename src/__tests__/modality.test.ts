import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mergeTraits, evaluateVision, dropNonVisualTraits, NON_VISUAL_TRAITS } from '../engine/merge';
import { MushroomTraits, VisionResult } from '../types';

/**
 * Modality guard — frontend half.
 *
 * The backend (`app/services/vision.py`) already refuses to hand the model a
 * code table for non-visible traits, but a photo channel is a trust boundary:
 * anything arriving over HTTP is a claim about a still image, and a claim that
 * cannot be observed from that image must be discarded before it reaches the
 * risk engine. `odor` is a 6.0-weight critical risk rule AND a 3.5 safety
 * anchor, so a hallucinated "almond odor" is enough to move a verdict towards
 * low risk on its own.
 *
 * The two halves are cross-checked against each other below, so they cannot
 * drift apart the way README and vision.py did.
 */

const backendPath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../app/services/vision.py',
);
const backendSource = readFileSync(backendPath, 'utf8');

const vision = (overrides: Partial<VisionResult>): VisionResult => ({
  status: 'ok',
  speciesGuess: null,
  modelConfidence: 0,
  traits: {},
  notes: '',
  warnings: [],
  ...overrides,
});

describe('NON_VISUAL_TRAITS — frontend and backend agree', () => {
  it('matches the backend denylist exactly (no silent drift)', () => {
    const m = backendSource.match(/NON_VISUAL_TRAITS\s*=\s*frozenset\(\{([^}]*)\}\)/);
    expect(m, 'NON_VISUAL_TRAITS not found in app/services/vision.py').toBeTruthy();
    const backendList = Array.from(m![1].matchAll(/"([^"]+)"/g)).map((x) => x[1]).sort();
    expect(backendList.length).toBeGreaterThan(0);
    expect([...NON_VISUAL_TRAITS].sort()).toEqual(backendList);
  });

  it('never counts a trait the user can supply by hand as non-visual', () => {
    // The denylist constrains the PHOTO channel only; manual entry is a
    // different modality and must stay able to record odor and stalk root.
    const manual: MushroomTraits = { odor: 'f', stalkRoot: 'r', capShape: 'x' };
    expect(mergeTraits(manual, undefined)).toEqual(manual);
    expect(manual.odor).toBe('f');
    expect(manual.stalkRoot).toBe('r');
  });
});

describe('dropNonVisualTraits — the photo channel cannot claim them', () => {
  it('removes odor and stalk root from a vision trait set', () => {
    const out = dropNonVisualTraits({ odor: 'a', stalkRoot: 'r', capColor: 'n' });
    expect(out.traits).toEqual({ capColor: 'n' });
    expect(out.dropped).toEqual(expect.arrayContaining(['odor', 'stalkRoot']));
  });

  it('leaves a fully visible trait set untouched', () => {
    const visible = { capColor: 'n', gillColor: 'b', ringType: 'l' };
    const out = dropNonVisualTraits(visible);
    expect(out.traits).toEqual(visible);
    expect(out.dropped).toEqual([]);
  });
});

describe('the engine never scores a hallucinated non-visual trait', () => {
  it('a vision-only "almond odor" cannot steer the verdict', () => {
    // Pre-fix: {odor a, capShape x, capColor n} from a photo produced a
    // low-risk verdict off an unobservable claim. Now odor is dropped, the
    // discriminative count falls to zero, and the engine forces "unknown".
    const r = evaluateVision({}, vision({ traits: { odor: 'a', capShape: 'x', capColor: 'n' } }));
    expect(r.riskLevel).toBe('unknown');
    expect(r.incomplete).toBe(true);
    expect(r.ruleHits.some((h) => h.id === 'odor-safety-anchor')).toBe(false);
  });

  it('a vision-only foul odor cannot steer the verdict either', () => {
    const r = evaluateVision({}, vision({ traits: { odor: 'f', capShape: 'x', capColor: 'n' } }));
    expect(r.ruleHits.some((h) => h.id === 'odor-foul')).toBe(false);
  });

  it('manual odor still scores normally (manual entry is its own modality)', () => {
    const r = evaluateVision({ odor: 'a' }, vision({ traits: { capShape: 'x', capColor: 'n' } }));
    expect(r.riskLevel).toBe('low');
    expect(r.ruleHits.some((h) => h.id === 'odor-safety-anchor')).toBe(true);
  });

  it('a manual value is never overwritten by a dropped vision value', () => {
    const traits = mergeTraits({ odor: 'f', capShape: 'x', capColor: 'n' }, { odor: 'a' });
    expect(traits.odor).toBe('f');
  });
});
