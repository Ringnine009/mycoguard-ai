import React, { useEffect, useState } from 'react';
import { MushroomTraits, RiskAssessment, VisionResult } from '../types';
import { formatConfidence, riskPresentation, ruleDetail, ruleLabel } from '../engine/presentation';
import { buildExpertNarrative } from '../engine/expert';
import { buildVisionPipeline } from '../engine/pipeline';
import { DisclaimerBanner } from './disclaimer';
import { useI18n } from '../i18n';
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

/** Dual-channel consistency labels (vision vs rule engine) — zh source, i18n at render. */
const CONSISTENCY_ZH: Record<string, string> = {
  agree: '视觉与规则：一致',
  partial: '视觉与规则：部分一致',
  disagree: '视觉与规则：存在分歧',
  'n-a': '视觉：未提供有效信息',
};

interface ResultPanelProps {
  assessment: RiskAssessment;
  traits: MushroomTraits;
  vision?: VisionResult | null;
  /** Preview URL of the analyzed photo (shown in the result page). */
  photoUrl?: string;
  /** Trait count currently filled (for the incomplete hint). */
  filledTraits: number;
}

export const ResultPanel: React.FC<ResultPanelProps> = ({ assessment, traits, vision, photoUrl, filledTraits }) => {
  const { t, lang } = useI18n();
  const [zoom, setZoom] = useState(false);

  // Close the lightbox with Escape (works regardless of focus).
  useEffect(() => {
    if (!zoom) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setZoom(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [zoom]);

  const meta = riskPresentation(assessment.riskLevel, lang);
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
              {assessment.incomplete ? t('信息不足，已强制「无法判断」') : t('风险分级结果（不确定性量化）')}
            </h2>
          </div>
        </div>

        <div className="conf-block">
          <div className="conf-row">
            <span className="conf-point">{conf.point}</span>
            <span className="conf-range">{t('区间')} {conf.range}</span>
            <span className="conf-label">{t('置信度区间')}</span>
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
          {/* the analyzed photo, with click-to-zoom */}
          {photoUrl && (
            <div>
              <button type="button" className="used-photo" onClick={() => setZoom(true)}>
                <img src={photoUrl} alt={t('分析所用照片')} />
                <span>{t('分析所用照片 · 点击放大')}</span>
              </button>
              {zoom && (
                <div className="lightbox" role="dialog" aria-modal="true" onClick={() => setZoom(false)}>
                  <img src={photoUrl} alt={t('分析所用照片')} />
                  <span className="lightbox-hint">{t('关闭')} (Esc / click)</span>
                </div>
              )}
            </div>
          )}

          {vision && (
            <div>
              <div className="section-label">{t('双通道分析链路')}</div>
              <div className="pipeline">
                {buildVisionPipeline(vision, assessment, filledTraits, lang).map((step, i) => (
                  <React.Fragment key={step.id}>
                    {i > 0 && <span className="pipeline-arrow">→</span>}
                    <div className={`pipeline-step${step.active ? ' active' : ''}`}>
                      <div className="ps-kicker">{step.kicker}</div>
                      <div className="ps-detail">{step.detail}</div>
                    </div>
                  </React.Fragment>
                ))}
              </div>
            </div>
          )}

          {vision && (
            <div className="chip-row">
              {vision.speciesGuess && (
                <span className="chip vision">
                  {t('疑似物种：')}
                  {vision.speciesGuess}
                  {t('（模型自评')} {(vision.modelConfidence * 100).toFixed(0)}
                  {t('%）')}
                </span>
              )}
              {vision.notes && <span className="chip vision">{vision.notes}</span>}
              {consistency && (
                <span className={`chip consistency ${consistency}`}>{t(CONSISTENCY_ZH[consistency])}</span>
              )}
            </div>
          )}

          {assessment.incomplete && (
            <div className="guidance-box muted">
              {t('已录入')} {filledTraits} {t('项性状，不足以给出方向性判断——这本身就是一个安全信号。')}
              {t('请补充')} <strong>{t('气味、孢子印颜色、菌褶大小')}</strong> {t('等关键性状后再分析。')}
            </div>
          )}

          <div className={`guidance-box ${tone}`}>{t(assessment.guidance)}</div>

          {assessment.ruleHits.length > 0 && (
            <div>
              <div className="section-label">{t('命中的规则（可解释性）')}</div>
              <div className="rule-list">
                {assessment.ruleHits.map((hit) => (
                  <div className="rule-item" key={hit.id}>
                    <span className={`rule-sev ${hit.severity}`}>{SEV_ICON[hit.severity]}</span>
                    <div>
                      <div className="rule-title">{ruleLabel(hit, lang)}</div>
                      <div className="rule-detail">{ruleDetail(hit, lang)}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div>
            <div className="section-label">{t('专家解读（离线可解释性）')}</div>
            <div className="reasoning-box expert">{buildExpertNarrative(assessment, traits, lang)}</div>
          </div>

          <div>
            <div className="section-label">{t('推理说明')}</div>
            <div className="reasoning-box">{t(assessment.reasoning)}</div>
          </div>
        </div>
      </div>

      <div className="disclaimer-prominent">
        <DisclaimerBanner />
      </div>
    </div>
  );
};
