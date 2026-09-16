/**
 * Reproducible safety evaluation of the MycoGuard offline rule engine.
 *
 * WHAT THIS MEASURES — and why it is the headline number of the project:
 * the engine is replayed over all 8,124 rows of the real UCI Mushrooms dataset
 * (`data/raw/agaricus-lepiota.data`) and graded on the one error that can hurt
 * somebody: a POISONOUS specimen reported as low risk ("false safe"). The
 * Random Forest's held-out accuracy is not the interesting number — that
 * dataset is near-linearly separable, so it is ~100% for almost any model and
 * carries no information. The false-safe rate does.
 *
 * It also reports the cost of that safety (false alarms on edible specimens,
 * binary accuracy) and the single-trait `odor` lookup baseline, so the engine's
 * accuracy can be compared against a one-column lookup table — a comparison it
 * does NOT win, and which is printed anyway.
 *
 * Usage:
 *   npm run eval:safety              # print + write data/raw/engine_safety_report.json
 *   node --experimental-strip-types scripts/eval_engine_safety.ts   # same, via node
 *
 * The dataset is not committed (data/raw/ is gitignored). Fetch it once with:
 *   scripts/analyze_dataset.py --download   (or place agaricus-lepiota.data there)
 * The script FAILS LOUDLY when the dataset is missing; it never reports zeros.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ENGINE_RULES, computeRiskAssessment } from '../src/engine/mushroomEngine.ts';
import { dropNonVisualTraits } from '../src/engine/merge.ts';
import type { MushroomTraits, RiskLevel } from '../src/types.ts';

export interface UciRow {
  /** True when the UCI class column is `p` (poisonous). */
  isPoisonous: boolean;
  /** Raw single-letter codes, keyed by the engine's trait names. */
  traits: MushroomTraits;
  /** The raw odor code — the single most predictive column. */
  odor: string;
}

export interface BaselineMetrics {
  rule: string;
  accuracy: number;
  falseSafe: number;
  falseSafeRate: number;
  falseAlarmRate: number;
}

export interface ReplayMetrics {
  dataset: string;
  dataFile: string;
  samples: number;
  poisonous: number;
  edible: number;
  /** THE headline metric: poisonous specimens graded `low`. */
  falseSafe: number;
  falseSafeRate: number;
  /** Poisonous specimens graded `low` or `unknown` (no usable warning). */
  falseSafeOrUnknown: number;
  falseSafeOrUnknownRate: number;
  /**
   * Cost, under the STRICT alarm convention: only a `high` verdict is treated
   * as an alarm, `medium` counts as "could not tell". This is the convention in
   * which the false-safe rate is achieved.
   */
  falseAlarms: number;
  falseAlarmRate: number;
  binaryAccuracy: number;
  /**
   * Cost, under the LOUD alarm convention: `medium` also counts as an alarm
   * (the UI does show it with a warning tone). Reported because it is the
   * honest cost of the safety margin the engine buys.
   */
  loudAlarmOnEdible: number;
  loudFalseAlarmRate: number;
  loudBinaryAccuracy: number;
  tierCounts: Record<RiskLevel, number>;
  odorBaseline: BaselineMetrics;
  rulesEvaluated: number;
  generatedBy: string;
}

/** The six UCI odor codes that are 100% poisonous class in the dataset. */
export const ODOR_ALARM_CODES: ReadonlySet<string> = new Set(['f', 'p', 'c', 'y', 's', 'm']);

/** UCI column order, 1:1 with the leading class column. */
const COLUMNS = [
  'class', 'capShape', 'capSurface', 'capColor', 'bruises', 'odor', 'gillAttachment',
  'gillSpacing', 'gillSize', 'gillColor', 'stalkShape', 'stalkRoot', 'stalkSurfaceAbove',
  'stalkSurfaceBelow', 'stalkColorAbove', 'stalkColorBelow', 'veilType', 'veilColor',
  'ringNumber', 'ringType', 'sporePrintColor', 'population', 'habitat',
] as const;

const TRAIT_KEYS = COLUMNS.slice(1) as readonly (keyof MushroomTraits)[];

/**
 * Parse agaricus-lepiota.data (headerless, comma separated). The file uses `?`
 * for the missing stalk-root category; that is a real category in this dataset
 * (see scripts/analyze_dataset.py), so it is preserved as the code `?`.
 *
 * Accepts `p`/`e` (canonical) and `1`/`0` (the common CSV re-encoding).
 */
export function loadUciRows(csv: string): UciRow[] {
  const rows: UciRow[] = [];
  for (const raw of csv.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('class,')) continue;
    const cells = line.split(',');
    if (cells.length !== COLUMNS.length) {
      throw new Error(`row has ${cells.length} cells, expected ${COLUMNS.length}: ${line.slice(0, 40)}`);
    }
    const cls = cells[0].toLowerCase();
    const isPoisonous = cls === 'p' || cls === '1';
    if (!isPoisonous && cls !== 'e' && cls !== '0') {
      throw new Error(`unknown class code ${JSON.stringify(cells[0])} — is this agaricus-lepiota?`);
    }
    const traits: MushroomTraits = {};
    TRAIT_KEYS.forEach((key, i) => {
      traits[key] = cells[i + 1];
    });
    rows.push({ isPoisonous, traits, odor: cells[COLUMNS.indexOf('odor')] });
  }
  return rows;
}

/** Grade one row with the real engine. */
export function evaluateRow(row: UciRow): { riskLevel: RiskLevel } {
  return { riskLevel: computeRiskAssessment(row.traits).riskLevel };
}

/** A row is "warned" when the verdict is high or medium; low/unknown are not. */
const isAlarm = (level: RiskLevel): boolean => level === 'high' || level === 'medium';
/** Strict convention: only a `high` verdict counts as an alarm. */
const isLoudAlarm = (level: RiskLevel): boolean => level === 'high';

export interface ReplayOptions {
  /** Replace the grader (used to prove the guard can fail). */
  grade?: (row: UciRow) => RiskLevel;
  /** Post-process a verdict, e.g. to simulate a more lenient tier mapping. */
  postprocess?: (level: RiskLevel, row: UciRow) => RiskLevel;
}

export function runReplay(rows: UciRow[], options: ReplayOptions = {}): ReplayMetrics {
  const grade = options.grade ?? ((row: UciRow) => evaluateRow(row).riskLevel);
  const tierCounts: Record<RiskLevel, number> = { low: 0, medium: 0, high: 0, unknown: 0 };

  let poisonous = 0;
  let edible = 0;
  let falseSafe = 0;
  let falseSafeOrUnknown = 0;
  /** Edible rows graded high (strict convention). */
  let falseAlarmsHighOnly = 0;
  /** Edible rows graded high OR medium (loud convention). */
  let falseAlarmsHighMedium = 0;
  let odorFalseSafe = 0;
  let odorFalseAlarms = 0;
  let odorCorrect = 0;

  for (const row of rows) {
    const raw = grade(row);
    const level = options.postprocess ? options.postprocess(raw, row) : raw;
    tierCounts[level] += 1;
    if (row.isPoisonous) poisonous += 1;
    else edible += 1;

    if (row.isPoisonous) {
      if (level === 'low') falseSafe += 1;
      if (level === 'low' || level === 'unknown') falseSafeOrUnknown += 1;
    } else {
      if (isAlarm(level)) falseAlarmsHighMedium += 1;
      if (isLoudAlarm(level)) falseAlarmsHighOnly += 1;
    }

    // Single-trait odor lookup: alarm iff the odor code is one of the six
    // 100%-poisonous codes. No other column is consulted.
    const odorAlarm = ODOR_ALARM_CODES.has(row.odor);
    if (odorAlarm === row.isPoisonous) odorCorrect += 1;
    if (row.isPoisonous && !odorAlarm) odorFalseSafe += 1;
    if (!row.isPoisonous && odorAlarm) odorFalseAlarms += 1;
  }

  const n = rows.length;
  // "A poisonous mushroom was flagged" = anything that is not low/unknown.
  const truePositives = poisonous - falseSafeOrUnknown;

  return {
    dataset: 'UCI Mushrooms (agaricus-lepiota)',
    dataFile: 'data/raw/agaricus-lepiota.data',
    samples: n,
    poisonous,
    edible,
    falseSafe,
    falseSafeRate: poisonous ? falseSafe / poisonous : 0,
    falseSafeOrUnknown,
    falseSafeOrUnknownRate: poisonous ? falseSafeOrUnknown / poisonous : 0,
    falseAlarms: falseAlarmsHighOnly,
    falseAlarmRate: edible ? falseAlarmsHighOnly / edible : 0,
    binaryAccuracy: n ? (truePositives + (edible - falseAlarmsHighOnly)) / n : 0,
    loudAlarmOnEdible: falseAlarmsHighMedium,
    loudFalseAlarmRate: edible ? falseAlarmsHighMedium / edible : 0,
    loudBinaryAccuracy: n ? (truePositives + (edible - falseAlarmsHighMedium)) / n : 0,
    tierCounts,
    odorBaseline: {
      rule: 'single-trait lookup: odor ∈ {c,f,m,p,s,y} → alarm, else no alarm',
      accuracy: n ? odorCorrect / n : 0,
      falseSafe: odorFalseSafe,
      falseSafeRate: poisonous ? odorFalseSafe / poisonous : 0,
      falseAlarmRate: edible ? odorFalseAlarms / edible : 0,
    },
    rulesEvaluated: ENGINE_RULES.length,
    generatedBy: 'scripts/eval_engine_safety.ts',
  };
}

/**
 * The photo channel must be replayed too: it can only report visible traits, so
 * a hallucinated `odor` must not be able to change the metric. Replays every
 * row through the engine twice — with and without the photo-channel trait
 * filter — and reports both. They must be identical, because the dataset's own
 * odor column is preserved and the filter is applied only to model-reported
 * traits (an observer standing at the specimen can still smell it).
 */
export function photoChannelDelta(rows: UciRow[]): { samples: number; changedVerdicts: number } {
  let changed = 0;
  for (const row of rows) {
    const base = computeRiskAssessment(row.traits).riskLevel;
    const filtered = computeRiskAssessment({
      ...dropNonVisualTraits(row.traits).traits,
      odor: row.traits.odor,
    }).riskLevel;
    if (base !== filtered) changed += 1;
  }
  return { samples: rows.length, changedVerdicts: changed };
}

function main(): number {
  const here = dirname(fileURLToPath(import.meta.url));
  const repoRoot = resolve(here, '..');
  const dataPath = process.argv[2] ?? resolve(repoRoot, 'data/raw/agaricus-lepiota.data');
  const outPath = resolve(repoRoot, 'data/raw/engine_safety_report.json');

  if (!existsSync(dataPath)) {
    console.error(
      `[error] dataset not found at ${dataPath}\n` +
        '        fetch it once with:  .venv\\Scripts\\python scripts/analyze_dataset.py --download\n' +
        '        or from https://archive.ics.uci.edu/ml/machine-learning-databases/mushroom/agaricus-lepiota.data',
    );
    return 1;
  }

  const rows = loadUciRows(readFileSync(dataPath, 'utf8'));
  const m = runReplay(rows);

  console.log(`[data]  ${m.samples} rows · poisonous ${m.poisonous} · edible ${m.edible}`);
  console.log(`[tiers] ${JSON.stringify(m.tierCounts)}`);
  console.log('');
  console.log('  SAFETY (the headline)');
  console.log(`    false safe (poisonous → low)     ${m.falseSafe} / ${m.poisonous}   (${(m.falseSafeRate * 100).toFixed(2)}%)`);
  console.log(`    false safe or unknown            ${m.falseSafeOrUnknown} / ${m.poisonous}   (${(m.falseSafeOrUnknownRate * 100).toFixed(2)}%)`);
  console.log('  COST (strict: only `high` counts as an alarm)');
  console.log(`    false alarms (edible → high)     ${m.falseAlarms} / ${m.edible}   (${(m.falseAlarmRate * 100).toFixed(2)}%)`);
  console.log(`    binary accuracy                  ${(m.binaryAccuracy * 100).toFixed(2)}%`);
  console.log('  COST (loud: `medium` also counts as an alarm, as the UI shows it)');
  console.log(`    over-warned (edible → high|med)  ${m.loudAlarmOnEdible} / ${m.edible}   (${(m.loudFalseAlarmRate * 100).toFixed(2)}%)`);
  console.log(`    binary accuracy                  ${(m.loudBinaryAccuracy * 100).toFixed(2)}%`);
  console.log('  BASELINE (one column, no engine)');
  console.log(`    ${m.odorBaseline.rule}`);
  console.log(`    accuracy                         ${(m.odorBaseline.accuracy * 100).toFixed(2)}%`);
  console.log(`    false safe                       ${m.odorBaseline.falseSafe} / ${m.poisonous}   (${(m.odorBaseline.falseSafeRate * 100).toFixed(2)}%)`);
  console.log(`    false alarms                     ${(m.odorBaseline.falseAlarmRate * 100).toFixed(2)}%`);
  console.log('');
  console.log(
    m.odorBaseline.accuracy > m.binaryAccuracy
      ? '  [note] the single-trait odor lookup BEATS the engine on accuracy.\n' +
        '         The engine\'s justification is the false-safe rate, not its accuracy.'
      : '  [note] the engine beats the single-trait odor lookup on accuracy.',
  );

  const delta = photoChannelDelta(rows);
  console.log(
    `[photo] dropping non-observable traits (odor/stalkRoot) from a hypothetical photo-only report ` +
      `changes ${delta.changedVerdicts} of ${delta.samples} verdicts. In the app this never applies: ` +
      'photos do not carry those columns at all — manual entry does.',
  );

  writeFileSync(outPath, `${JSON.stringify(m, null, 2)}\n`, 'utf8');
  console.log(`[out]  ${outPath}`);
  return m.falseSafe === 0 ? 0 : 2;
}

// Run only when invoked directly (vitest imports this module for the tests).
const invokedDirectly =
  process.argv[1] !== undefined &&
  (process.argv[1].endsWith('eval_engine_safety.ts') || process.argv[1].endsWith('eval_engine_safety.js'));
if (invokedDirectly) {
  process.exitCode = main();
}
