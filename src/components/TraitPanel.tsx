import React, { useState } from 'react';
import { MushroomTraits, TraitDefinition } from '../types';
import { CORE_TRAITS, ADVANCED_TRAITS } from '../constants';

interface TraitPanelProps {
  traits: MushroomTraits;
  disabled?: boolean;
  onChange: (id: keyof MushroomTraits, value: string) => void;
}

function TraitField({
  def,
  value,
  disabled,
  onChange,
}: {
  def: TraitDefinition;
  value: string | undefined;
  disabled?: boolean;
  onChange: (id: keyof MushroomTraits, value: string) => void;
}) {
  return (
    <div className="trait-field">
      <label className="trait-label" htmlFor={`trait-${def.id}`}>
        <span>
          {def.label}
          {def.critical && <span className="critical-mark"> *</span>}
        </span>
        {def.hint && <span className="trait-hint">{def.hint}</span>}
      </label>
      <select
        id={`trait-${def.id}`}
        className="trait-select"
        value={value || ''}
        disabled={disabled}
        onChange={(e) => onChange(def.id, e.target.value)}
      >
        <option value="">— 未观察 —</option>
        {def.options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export const TraitPanel: React.FC<TraitPanelProps> = ({ traits, disabled, onChange }) => {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const filled = Object.values(traits).filter((v) => v).length;

  return (
    <div className="input-scroll">
      <div className="trait-group">
        <div className="trait-group-title">
          <span className="dot core" /> 核心关键特征
        </div>
        {CORE_TRAITS.map((t) => (
          <TraitField key={t.id} def={t} value={traits[t.id]} disabled={disabled} onChange={onChange} />
        ))}
      </div>

      <button
        type="button"
        className="adv-toggle"
        onClick={() => setShowAdvanced((v) => !v)}
        aria-expanded={showAdvanced}
      >
        <span>▸</span> 辅助结构特征（{showAdvanced ? '收起' : `${ADVANCED_TRAITS.length} 项，展开`}）
      </button>

      {showAdvanced && (
        <div className="trait-group" style={{ marginTop: 10 }}>
          <div className="trait-group-title">
            <span className="dot adv" /> 辅助观察项
          </div>
          {ADVANCED_TRAITS.map((t) => (
            <TraitField key={t.id} def={t} value={traits[t.id]} disabled={disabled} onChange={onChange} />
          ))}
        </div>
      )}

      <div className="footer-tech" style={{ marginTop: 14 }}>
        <span>已观察 {filled} / 22 项</span>
        <span>≥ 3 项才可给出方向性判断</span>
      </div>
    </div>
  );
};
