import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ENGINE_RULES } from '../engine/mushroomEngine';

/**
 * Cross-check between the committed evidence file (distilled_rules.json,
 * produced by scripts/analyze_dataset.py) and the engine's weight table.
 * If someone edits one side without the other, this suite goes red.
 */

const distilledPath = resolve(dirname(fileURLToPath(import.meta.url)), '../../distilled_rules.json');
const distilled = JSON.parse(readFileSync(distilledPath, 'utf8')) as {
  purity_rules: Record<string, Record<string, string>>;
  engine_weights: Record<string, { weight: number }>;
  held_out_accuracy: number;
  feature_importance: Record<string, number>;
};

describe('distilled_rules.json ↔ engine weight table', () => {
  it('covers every engine rule with the exact same weight', () => {
    expect(Object.keys(distilled.engine_weights).length).toBe(ENGINE_RULES.length);
    for (const rule of ENGINE_RULES) {
      const entry = distilled.engine_weights[rule.id];
      expect(entry, `missing json entry for ${rule.id}`).toBeTruthy();
      expect(entry.weight, `${rule.id} weight`).toBe(rule.weight);
    }
  });

  it('has no orphan entries in the JSON (every id exists in the engine)', () => {
    const engineIds = new Set(ENGINE_RULES.map((r) => r.id));
    for (const id of Object.keys(distilled.engine_weights)) {
      expect(engineIds.has(id), `orphan json rule ${id}`).toBe(true);
    }
  });

  it('purity scan covers all 22 traits', () => {
    expect(Object.keys(distilled.purity_rules).length).toBe(22);
  });

  it('records a held-out accuracy and full feature importances', () => {
    expect(typeof distilled.held_out_accuracy).toBe('number');
    expect(Object.keys(distilled.feature_importance).length).toBe(22);
  });
});
