import { describe, it, expect } from 'vitest';
import { formatConfidence, riskPresentation, RISK_META } from '../engine/presentation';
import { RiskLevel } from '../types';

describe('formatConfidence — interval presentation', () => {
  it('formats point estimate as a rounded percentage', () => {
    expect(formatConfidence({ point: 0.823, lower: 0.75, upper: 0.89 }).point).toBe('82%');
  });

  it('formats the interval range with en-dash', () => {
    expect(formatConfidence({ point: 0.823, lower: 0.75, upper: 0.89 }).range).toBe('75% – 89%');
  });

  it('never formats a 100% point (engine cannot claim certainty)', () => {
    const f = formatConfidence({ point: 0.97, lower: 0.9, upper: 0.97 });
    expect(f.point).not.toBe('100%');
  });
});

describe('riskPresentation — four-tier language', () => {
  it('covers exactly the four risk levels', () => {
    expect(Object.keys(RISK_META).sort()).toEqual(['high', 'low', 'medium', 'unknown']);
  });

  it('maps every level to a label, tone and icon', () => {
    for (const level of ['low', 'medium', 'high', 'unknown'] as RiskLevel[]) {
      const p = riskPresentation(level);
      expect(p.label.length).toBeGreaterThan(0);
      expect(p.tone).toMatch(/^(danger|warn|safe|muted)$/);
      expect(p.icon).toBeTruthy();
    }
  });

  it('high risk maps to danger tone, low to safe tone', () => {
    expect(riskPresentation('high').tone).toBe('danger');
    expect(riskPresentation('low').tone).toBe('safe');
    expect(riskPresentation('unknown').tone).toBe('muted');
  });
});
