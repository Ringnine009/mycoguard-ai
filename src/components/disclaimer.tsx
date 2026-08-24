import React from 'react';
import { useI18n } from '../i18n';

/**
 * Single source of truth for the legal disclaimer shown across the UI.
 * The result page MUST always render a prominent banner built from this text.
 * The zh constant is the source; the EN variant is a full translation.
 */
export const DISCLAIMER_TEXT =
  '本工具为机器学习辅助参考，仅供参考，不构成食用建议。' +
  '野外蘑菇识别存在不确定性，任何结论都不能替代真菌学专家的鉴定；' +
  '请勿仅凭本工具结果食用野生蘑菇。';

export const DISCLAIMER_TEXT_EN =
  'This tool is a machine-learning reference only. ' +
  'Wild-mushroom identification is uncertain and no conclusion here replaces a mycologist\u2019s identification; ' +
  'never eat wild mushrooms based on this tool alone.';

export const DisclaimerBanner: React.FC = () => {
  const { t } = useI18n();
  return (
    <div className="mycoguard-disclaimer" role="note" aria-label={t('免责声明')}>
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
        <line x1="12" y1="9" x2="12" y2="13" />
        <line x1="12" y1="17" x2="12.01" y2="17" />
      </svg>
      <span>{t(DISCLAIMER_TEXT)}</span>
    </div>
  );
};
