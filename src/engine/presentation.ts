import { ConfidenceInterval, RiskLevel } from '../types';

/**
 * Presentation helpers for risk + confidence rendering.
 * Pure functions — easily unit-tested.
 */

export interface RiskMeta {
  label: string;
  tone: 'danger' | 'warn' | 'safe' | 'muted';
  icon: string;
}

export const RISK_META: Record<RiskLevel, RiskMeta> = {
  low: { label: '低风险', tone: 'safe', icon: 'shield-check' },
  medium: { label: '中风险', tone: 'warn', icon: 'shield-alert' },
  high: { label: '高风险', tone: 'danger', icon: 'shield-x' },
  unknown: { label: '无法判断', tone: 'muted', icon: 'help' },
};

export function riskPresentation(level: RiskLevel): RiskMeta {
  return RISK_META[level];
}

const pct = (v: number) => `${Math.round(v * 100)}%`;

/** Format a confidence interval as a point estimate plus an en-dash range. */
export function formatConfidence(c: ConfidenceInterval): { point: string; range: string } {
  return {
    point: pct(c.point),
    range: `${pct(c.lower)} – ${pct(c.upper)}`,
  };
}
