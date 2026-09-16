import { ConfidenceInterval, RiskLevel, RuleHit } from '../types';
import { Lang, ruleEn, translate } from '../i18n';

/**
 * Presentation helpers for risk + confidence rendering.
 * Pure functions — easily unit-tested. Default language is zh so existing
 * call sites and tests keep working.
 */

export interface RiskMeta {
  label: string;
  /**
   * Visual tone. `neutral` is the tone for a `low` verdict: a low verdict is
   * "no strong risk signal found", never a success/confirmation state, so it
   * must not carry the green `safe` affordance.
   */
  tone: 'danger' | 'warn' | 'neutral' | 'muted';
  icon: string;
}

const RISK_META_ZH: Record<RiskLevel, Omit<RiskMeta, 'label'> & { zh: string }> = {
  low: { zh: '低风险', tone: 'neutral', icon: 'help' },
  medium: { zh: '中风险', tone: 'warn', icon: 'shield-alert' },
  high: { zh: '高风险', tone: 'danger', icon: 'shield-x' },
  unknown: { zh: '无法判断', tone: 'muted', icon: 'help' },
};

/** Keyed by risk level so tests can enumerate the four tiers. */
export const RISK_META: Record<RiskLevel, RiskMeta> = {
  low: { label: '低风险', tone: 'neutral', icon: 'help' },
  medium: { label: '中风险', tone: 'warn', icon: 'shield-alert' },
  high: { label: '高风险', tone: 'danger', icon: 'shield-x' },
  unknown: { label: '无法判断', tone: 'muted', icon: 'help' },
};

export function riskPresentation(level: RiskLevel, lang: Lang = 'zh'): RiskMeta {
  const m = RISK_META[level];
  return { ...m, label: translate(RISK_META_ZH[level].zh, lang) };
}

const pct = (v: number) => `${Math.round(v * 100)}%`;

/**
 * Format the evidence-strength interval as a point estimate plus an en-dash
 * range. Callers must label it as evidence strength — the returned value is
 * NOT a probability that the mushroom is safe.
 */
export function formatConfidence(c: ConfidenceInterval): { point: string; range: string } {
  return {
    point: pct(c.point),
    range: `${pct(c.lower)} – ${pct(c.upper)}`,
  };
}

/** Bilingual label for a fired rule (fallback to the engine's Chinese). */
export function ruleLabel(hit: RuleHit, lang: Lang = 'zh'): string {
  return ruleEn(hit.id, lang).label ?? hit.label;
}

/** Bilingual detail for a fired rule (fallback to the engine's Chinese). */
export function ruleDetail(hit: RuleHit, lang: Lang = 'zh'): string {
  return ruleEn(hit.id, lang).detail ?? hit.detail;
}
