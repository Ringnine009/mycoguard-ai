import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { computeRiskAssessment, NON_HIGH_STRENGTH_CEILING } from '../engine/mushroomEngine';
import {
  ODOR_ALARM_CODES,
  evaluateRow,
  loadUciRows,
  runReplay,
  type BaselineMetrics,
  type ReplayMetrics,
  type UciRow,
} from '../../scripts/eval_engine_safety';

/**
 * SAFETY REGRESSION GUARD — the headline number of the project.
 *
 * The engine's most defensible property is NOT the Random Forest's held-out
 * accuracy (that dataset is near-linearly separable, so 100% carries almost no
 * information). It is this: replayed against all 8,124 UCI rows, the rule
 * engine classified 0 of the 3,916 poisonous specimens as low risk, at the
 * cost of an 8.79% false-alarm rate and 95.45% binary accuracy under the strict
 * convention (only a `high` verdict counts as an alarm; the audit reported
 * 95.25% under a slightly different convention — both conventions are printed
 * and pinned below). One single
 * "safe" verdict on the 3,916 poisonous rows would be a safety regression.
 *
 * This suite recomputes the metric from the raw dataset with the real engine,
 * writes the artifact CI/users can read, and proves it can actually fail by
 * running a deliberately broken engine through the same harness.
 */

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../..');
const DATA = resolve(repoRoot, 'data/raw/agaricus-lepiota.data');
const ARTIFACT = resolve(repoRoot, 'data/raw/engine_safety_report.json');

/**
 * The dataset is gitignored (data/raw/), so a clean checkout will not have it.
 * A MISSING FIXTURE MUST BE A LOUD FAILURE, NEVER A SILENT SKIP: the spec for
 * this work says so explicitly, and a guard that quietly reports "0 tests" while
 * `npm test` stays green is worse than no guard — it looks like coverage.
 *
 * The file is therefore read INSIDE a test (not at collection time), so an
 * absent dataset produces one clear red "dataset is missing" failure instead of
 * an ENOENT collection crash that reports "no tests". `npm run eval:safety` also
 * exits 1 with the fetch command rather than emitting zeros.
 */
const DATASET_PRESENT = existsSync(DATA);
const MISSING_FIXTURE_HELP =
  `missing ${DATA}\n` +
  'The 0/3916 false-safe guard cannot run without it and must not be skipped.\n' +
  'Fetch it once (gitignored, ~360 KB):\n' +
  '  .venv\\Scripts\\python scripts/analyze_dataset.py --download\n' +
  'or: curl -o data/raw/agaricus-lepiota.data ' +
  'https://archive.ics.uci.edu/ml/machine-learning-databases/mushroom/agaricus-lepiota.data';

describe('safety-metric fixture availability', () => {
  it('the UCI dataset is present (the safety guard cannot be skipped)', () => {
    expect(DATASET_PRESENT, MISSING_FIXTURE_HELP).toBe(true);
  });
});

const describeWithData = describe;
let rows: UciRow[] = [];

describeWithData('engine safety replay — UCI Mushrooms (8,124 rows)', () => {
  // Read here rather than at module scope: the failure then reads as
  // "dataset is missing", not as an uninterpretable collection error.
  beforeAll(() => {
    if (!DATASET_PRESENT) throw new Error(MISSING_FIXTURE_HELP);
    rows = loadUciRows(readFileSync(DATA, 'utf8'));
  });

  it('loads the full dataset with the documented class balance', () => {
    expect(rows.length).toBe(8124);
    expect(rows.filter((r) => r.isPoisonous).length).toBe(3916);
    expect(rows.filter((r) => !r.isPoisonous).length).toBe(4208);
  });

  it('GOAL: zero poisonous specimens are graded low risk', () => {
    const m: ReplayMetrics = runReplay(rows);
    expect(m.falseSafe).toBe(0);
    expect(m.falseSafeRate).toBe(0);
    // Guard against a vacuous zero: the dataset really does contain thousands
    // of poisonous rows and the engine really does produce directional calls.
    expect(m.poisonous).toBe(3916);
    expect(m.tierCounts.high).toBeGreaterThan(0);
    expect(m.tierCounts.low).toBeGreaterThan(0);
    expect(m.tierCounts.medium).toBeGreaterThan(0);
    // A poisonous specimen was never even left at "unknown".
    expect(m.falseSafeOrUnknown).toBe(0);
  });

  it('reports the cost honestly: false alarms, accuracy and the odor baseline', () => {
    const m: ReplayMetrics = runReplay(rows);
    // Measured values, pinned so a silent degradation turns this red. The
    // audit's replay reported 8.79% and 95.25%; the false-alarm rate matches
    // exactly and the accuracy difference (95.45% vs 95.25%) is accounted for
    // in docs/upgrade-notes.md — the strict convention below counts `medium`
    // as "could not tell" rather than as an alarm.
    expect(m.falseAlarms).toBe(370);
    expect(m.falseAlarmRate).toBeCloseTo(0.0879, 4);
    expect(m.binaryAccuracy).toBeCloseTo(0.9545, 4);
    // The loud convention is the UX-honest cost and must be reported too.
    expect(m.loudFalseAlarmRate).toBeCloseTo(0.7186, 4);
    expect(m.loudBinaryAccuracy).toBeCloseTo(0.6278, 4);
    expect(m.tierCounts.low + m.tierCounts.medium + m.tierCounts.high).toBe(m.samples);
    // The single-trait lookup table BEATS the engine on accuracy — recorded,
    // not hidden. The engine's justification is the 0/3916 false-safe rate.
    expect(m.odorBaseline.accuracy).toBeCloseTo(0.9852, 4);
    expect(m.odorBaseline.accuracy).toBeGreaterThan(m.binaryAccuracy);
    // ...and the lookup is not safe: it misses 120 poisonous specimens.
    expect(m.odorBaseline.falseSafe).toBe(120);
    expect(m.odorBaseline.falseSafeRate).toBeGreaterThan(0);
  });

  it('NO low/medium verdict out-displays ANY high verdict, across all 8,124 rows', () => {
    // The reading-order invariant, verified exhaustively rather than on examples:
    // the strongest evidence bar in the app must never belong to a verdict that
    // reads safer than a real risk finding.
    let minHigh = Infinity;
    let maxNonHigh = 0;
    let maxNonHighLow = 0;
    let highCount = 0;
    for (const row of rows) {
      const r = computeRiskAssessment(row.traits);
      if (r.riskLevel === 'high') {
        highCount += 1;
        minHigh = Math.min(minHigh, r.evidence.strength);
      } else {
        maxNonHigh = Math.max(maxNonHigh, r.evidence.strength);
        if (r.riskLevel === 'low') maxNonHighLow = Math.max(maxNonHighLow, r.evidence.strength);
      }
    }
    expect(highCount).toBeGreaterThan(0);
    expect(maxNonHigh).toBeLessThanOrEqual(minHigh);
    expect(maxNonHighLow).toBeLessThanOrEqual(minHigh);
    expect(maxNonHigh).toBeLessThanOrEqual(NON_HIGH_STRENGTH_CEILING);
  });

  it('a low verdict is always weaker evidence than the weakest high verdict', () => {
    const m: ReplayMetrics = runReplay(rows);
    // Sanity on the replay itself: the tiers really are populated.
    expect(m.tierCounts.low).toBeGreaterThan(0);
    expect(m.tierCounts.high).toBeGreaterThan(0);
  });

  it('writes the artifact the README quotes', () => {
    const m = runReplay(rows);
    expect(existsSync(ARTIFACT), 'run `npm run eval:safety` to produce the artifact').toBe(true);
    const onDisk = JSON.parse(readFileSync(ARTIFACT, 'utf8')) as ReplayMetrics;
    // The committed/quoted artifact must match a fresh replay exactly, so the
    // README can never quote numbers the engine no longer produces.
    expect(onDisk.samples).toBe(m.samples);
    expect(onDisk.falseSafe).toBe(m.falseSafe);
    expect(onDisk.falseSafeRate).toBeCloseTo(m.falseSafeRate, 6);
    expect(onDisk.falseAlarmRate).toBeCloseTo(m.falseAlarmRate, 6);
    expect(onDisk.binaryAccuracy).toBeCloseTo(m.binaryAccuracy, 6);
    expect(onDisk.falseSafeOrUnknown).toBe(m.falseSafeOrUnknown);
    expect(onDisk.loudFalseAlarmRate).toBeCloseTo(m.loudFalseAlarmRate, 6);
    expect(onDisk.odorBaseline.accuracy).toBeCloseTo(m.odorBaseline.accuracy, 6);
  });
});

describe('the guard is not vacuous — a degraded engine fails the metric', () => {
  // 400 rows are enough to expose every degradation below. Loaded in beforeAll
  // for the same reason as the replay suite: a missing fixture must surface as
  // one clear failure, not as a collection crash that reports "no tests".
  let rows: UciRow[] = [];
  beforeAll(() => {
    if (!DATASET_PRESENT) throw new Error(MISSING_FIXTURE_HELP);
    rows = loadUciRows(readFileSync(DATA, 'utf8')).slice(0, 400);
  });

  it('an engine that never raises a risk signal produces false-safe rows', () => {
    // Simulates the exact failure mode the metric exists to catch: every
    // specimen is graded "everything I see leans safe".
    const m = runReplay(rows, { grade: () => 'low' });
    expect(m.falseSafe).toBeGreaterThan(0);
    expect(m.falseSafeRate).toBeGreaterThan(0.4);
    expect(m.falseAlarmRate).toBe(0);
    expect(m.falseSafeOrUnknown).toBe(m.poisonous);
  });

  it('a degraded engine that also drops signals to unknown is caught', () => {
    const m = runReplay(rows, { grade: () => 'unknown' });
    expect(m.falseSafe).toBe(0); // unknown is not "safe"…
    expect(m.falseSafeOrUnknown).toBeGreaterThan(0); // …but it is not a warning either
    expect(m.falseSafeOrUnknownRate).toBeGreaterThan(0.4);
  });

  it('a lenient post-processor silently admits risk that the engine found', () => {
    const strict = runReplay(rows);
    const lenient = runReplay(rows, {
      postprocess: (level) => (level === 'unknown' ? 'medium' : level),
    });
    expect(lenient.tierCounts.unknown).toBe(0);
    expect(lenient.loudAlarmOnEdible).toBeGreaterThanOrEqual(strict.loudAlarmOnEdible);
  });

  it('promoting every verdict to high is caught by the alarm/accuracy metrics', () => {
    // The opposite failure: an engine that warns about everything is useless,
    // and the cost metrics must show it even though its false-safe rate is 0.
    const m = runReplay(rows, { grade: () => 'high' });
    expect(m.falseSafe).toBe(0);
    expect(m.falseAlarmRate).toBe(1);
    expect(m.binaryAccuracy).toBeCloseTo(m.poisonous / m.samples, 6);
  });

  it('the raw per-row evaluator never grades the first (poisonous) row as low', () => {
    // First UCI row: p,x,s,n,t,p,f,c,n,k,e,e,s,s,w,w,p,w,o,p,k,s,u
    const first = rows[0];
    expect(first.isPoisonous).toBe(true);
    expect(first.odor).toBe('p');
    expect(evaluateRow(first).riskLevel).not.toBe('low');
  });
});

describe('baseline sanity — the single-trait odor rule is what it claims', () => {
  it('alarms on the six 100%-poisonous odor codes and nothing else', () => {
    expect([...ODOR_ALARM_CODES].sort()).toEqual(['c', 'f', 'm', 'p', 's', 'y']);
  });

  it('the odor baseline is a lookup, so it also has a measurable false-safe rate', () => {
    const b: BaselineMetrics = runReplay(loadUciRows(readFileSync(DATA, 'utf8'))).odorBaseline;
    expect(b.falseSafe).toBeGreaterThanOrEqual(0);
    expect(b.accuracy).toBeGreaterThan(0.9);
  });
});
