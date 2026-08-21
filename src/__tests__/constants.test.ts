import { describe, it, expect } from 'vitest';
import { CORE_TRAITS, ADVANCED_TRAITS, COLOR_MAP, ALL_TRAITS } from '../constants';

describe('trait definitions — data integrity', () => {
  it('defines exactly 22 traits (the full UCI feature set)', () => {
    expect(ALL_TRAITS.length).toBe(22);
    expect(CORE_TRAITS.length + ADVANCED_TRAITS.length).toBe(22);
  });

  it('has unique trait ids', () => {
    const ids = ALL_TRAITS.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every trait has at least one option with a label and a value', () => {
    for (const t of ALL_TRAITS) {
      expect(t.options.length).toBeGreaterThan(0);
      for (const o of t.options) {
        expect(o.label.length).toBeGreaterThan(0);
        expect(o.value.length).toBeGreaterThan(0);
      }
    }
  });

  it('COLOR_MAP covers every color-style trait option', () => {
    const colorTraits = ALL_TRAITS.filter((t) => t.id.toLowerCase().includes('color'));
    for (const t of colorTraits) {
      for (const o of t.options) {
        expect(COLOR_MAP[o.value]).toBeTruthy();
      }
    }
  });
});
