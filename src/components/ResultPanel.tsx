import React from 'react';
import { MushroomTraits, RiskAssessment, VisionResult } from '../types';
import { formatConfidence, riskPresentation } from '../engine/presentation';
import { buildExpertNarrative } from '../engine/expert';
import { DisclaimerBanner } from './disclaimer';
import { AlertTriangle, HelpCircle, ShieldAlert, ShieldCheck, ShieldX } from './icons';

const TONE_CLASS: Record<string, string> = {
  danger: 'danger',
  warn: 'warn',
  safe: 'safe',
  muted: 'muted',
};

const SEV_ICON: Record<string, React.ReactNode> = {
  critical: <ShieldX size={14} />,
  warning: <AlertTriangle size={14} />,
  info: <HelpCircle size={14} />,
};

/** Dual-channel consistency labels (vision vs rule engine). */
const CONSISTENCY_LABEL: Record<string, string> = {
  agree: '视觉与规则：一致',
  partial: '视觉与规则：部分一致',
  disagree: '视觉与规则：存在分歧',
  'n-a': '视觉：未提供有效信息',
};

interface ResultPanelProps {
  assessment: RiskAssessment;
  traits: MushroomTraits;
  vision?: VisionResult | null;
  /** Trait count currently filled (for the incomplete hint). */
  filledTraits: number;
}

export const ResultPanel: React.FC<ResultPanelProps> = ({ assessment, traits, vision, filledTraits }) => {
  const meta = riskPresentation(assessment.riskLevel);
  const tone = TONE_CLASS[meta.tone];
  const conf = formatConfidence(assessment.confidence);
  const lowerPct = Math.round(assessment.confidence.lower * 100);
  const upperPct = Math.round(assessment.confidence.upper * 100);
  const pointPct = Math.round(assessment.confidence.point * 100);
  const consistency = assessment.visionConsistency;

  const RiskIcon = meta.icon === 'shield-x' ? ShieldX : meta.icon === 'shield-alert' ? ShieldAlert : meta.icon === 'shield-check' ? ShieldCheck : HelpCircle;

  return (
    <div className="result-area">
      <div className={`result-card top-border ${tone === 'safe' ? 'safe' : ''}`} style={{ ['--tone' as string]: tone === 'danger' ? 'var(--danger)' : tone === 'warn' ? 'var(--warn)' : tone === 'safe' ? 'var(--safe)' : 'var(--muted-c)' }}>
        <div className="result-head">
          <div>
            <span className={`risk-badge ${tone}`}>
              <RiskIcon size={15} />
              {meta.label}
            </span>
            <h2 className="result-title">
              {assessment.incomplete
                ? '信息不足，已强制「无法判断」'
                : '风险分级结果（不确定性量化）'}
            </h2>
          </div>
        </div>

        <div className="conf-block">
          <div className="conf-row">
            <span className="conf-point">{conf.point}</span>
            <span className="conf-range">区间 {conf.range}</span>
            <span className="conf-label">置信度区间</span>
          </div>
          <div className="conf-bar">
            <div
              className="conf-band"
              style={{ left: `${lowerPct}%`, width: `${Math.max(0.5, upperPct - lowerPct)}%` }}
            />
            <div className="conf-marker" style={{ left: `${pointPct}%` }} />
          </div>
          <div className="conf-scale">
            <span>0%</span>
            <span>50%</span>
            <span>100%</span>
          </div>
        </div>

        <div className="result-body">
          {vision && (
            <div className="chip-row">
              {vision.speciesGuess && (
                <span className="chip vision">
                  疑似物种：{vision.speciesGuess}（模型自评 {(vision.modelConfidence * 100).toFixed(0)}%）
                </span>
              )}
              {vision.notes && <span className="chip vision">{vision.notes}</span>}
              {consistency && (
                <span className={`chip consistency ${consistency}`}>{CONSISTENCY_LABEL[consistency]}</span>
              )}
            </div>
          )}

          {assessment.incomplete && (
            <div className="guidance-box muted">
              已录入 {filledTraits} 项性状，不足以给出方向性判断——这本身就是一个安全信号。
              请补充 <strong>气味、孢子印颜色、菌褶大小</strong> 等关键性状后再分析。
            </div>
          )}

          <div className={`guidance-box ${tone}`}>{assessment.guidance}</div>

          {assessment.ruleHits.length > 0 && (
            <div>
              <div className="section-label">命中的规则（可解释性）</div>
              <div className="rule-list">
                {assessment.ruleHits.map((hit) => (
                  <div className="rule-item" key={hit.id}>
                    <span className={`rule-sev ${hit.severity}`}>{SEV_ICON[hit.severity]}</span>
                    <div>
                      <div className="rule-title">{hit.label}</div>
                      <div className="rule-detail">{hit.detail}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div>
            <div className="section-label">专家解读（离线可解释性）</div>
            <div className="reasoning-box expert">{buildExpertNarrative(assessment, traits)}</div>
          </div>

          <div>
            <div className="section-label">推理说明</div>
            <div className="reasoning-box">{assessment.reasoning}</div>
          </div>
        </div>
      </div>

      <div className="disclaimer-prominent">
        <DisclaimerBanner />
      </div>
    </div>
  );
};
