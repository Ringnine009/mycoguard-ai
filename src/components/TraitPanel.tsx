import React, { useState } from 'react';
import { MushroomTraits, TraitDefinition } from '../types';
import { CORE_TRAITS, ADVANCED_TRAITS } from '../constants';
import { useI18n } from '../i18n';

interface TraitPanelProps {
  traits: MushroomTraits;
  disabled?: boolean;
  /** Trait keys that came from the vision model (photo mode) — shown as badges. */
  visionTraits?: ReadonlySet<string>;
  onChange: (id: keyof MushroomTraits, value: string) => void;
}

function TraitField({
  def,
  value,
  disabled,
  fromVision,
  onChange,
}: {
  def: TraitDefinition;
  value: string | undefined;
  disabled?: boolean;
  fromVision?: boolean;
  onChange: (id: keyof MushroomTraits, value: string) => void;
}) {
  const { t } = useI18n();
  return (
    <div className="trait-field">
      <label className="trait-label" htmlFor={`trait-${def.id}`}>
        <span>
          {t(def.label)}
          {def.critical && <span className="critical-mark"> *</span>}
          {fromVision && (
            <span className="vision-badge" title="vision">
              ● vision
            </span>
          )}
        </span>
        {def.hint && <span className="trait-hint">{t(def.hint)}</span>}
      </label>
      <select
        id={`trait-${def.id}`}
        className="trait-select"
        value={value || ''}
        disabled={disabled}
        onChange={(e) => onChange(def.id, e.target.value)}
      >
        <option value="">{t('— 未观察 —')}</option>
        {def.options.map((o) => (
          <option key={o.value} value={o.value}>
            {t(o.label)}
          </option>
        ))}
      </select>
    </div>
  );
}

export const TraitPanel: React.FC<TraitPanelProps> = ({ traits, disabled, visionTraits, onChange }) => {
  const { t } = useI18n();
  const [showAdvanced, setShowAdvanced] = useState(false);
  const filled = Object.values(traits).filter((v) => v).length;
  const visionCount = visionTraits ? [...visionTraits].filter((k) => traits[k as keyof MushroomTraits]).length : 0;

  return (
    <div className="input-scroll">
      <div className="trait-group">
        <div className="trait-group-title">
          <span className="dot core" /> {t('核心关键特征')}
        </div>
        {CORE_TRAITS.map((tr) => (
          <TraitField
            key={tr.id}
            def={tr}
            value={traits[tr.id]}
            disabled={disabled}
            fromVision={visionTraits?.has(tr.id)}
            onChange={onChange}
          />
        ))}
      </div>

      <button
        type="button"
        className="adv-toggle"
        onClick={() => setShowAdvanced((v) => !v)}
        aria-expanded={showAdvanced}
      >
        <span>▸</span> {t('辅助结构特征（')}
        {showAdvanced ? t('收起') : `${ADVANCED_TRAITS.length} ${t('项，展开')}`}
      </button>

      {showAdvanced && (
        <div className="trait-group" style={{ marginTop: 10 }}>
          <div className="trait-group-title">
            <span className="dot adv" /> {t('辅助观察项')}
          </div>
          {ADVANCED_TRAITS.map((tr) => (
            <TraitField
              key={tr.id}
              def={tr}
              value={traits[tr.id]}
              disabled={disabled}
              fromVision={visionTraits?.has(tr.id)}
              onChange={onChange}
            />
          ))}
        </div>
      )}

      <div className="footer-tech" style={{ marginTop: 14 }}>
        <span>
          {t('已观察')} {filled} {t('/ 22 项')}
          {visionCount > 0 ? `${t('（含视觉')} ${visionCount} ${t('项）')}` : ''}
        </span>
        <span>{t('≥ 3 项才可给出方向性判断')}</span>
      </div>
    </div>
  );
};
