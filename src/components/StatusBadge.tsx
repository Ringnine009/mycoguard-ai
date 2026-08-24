import React from 'react';
import { BackendHealth } from '../types';
import { useI18n } from '../i18n';

interface StatusBadgeProps {
  health: BackendHealth | null | undefined; // undefined = probing
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ health }) => {
  const { t } = useI18n();
  if (health === undefined) {
    return (
      <span className="status-badge">
        <span className="status-dot" /> {t('检测后端…')}
      </span>
    );
  }
  const online = health !== null;
  const vision = online && health.vision;
  const chat = online && health.chat;
  const label = !online
    ? t('纯离线模式 · 规则引擎')
    : vision && chat
      ? t('在线增强 · 视觉 + 问答')
      : vision
        ? t('在线增强 · 视觉')
        : chat
          ? t('在线增强 · 问答')
          : t('纯离线模式 · 规则引擎');
  return (
    <span className={`status-badge ${online ? 'online' : 'offline'}`}>
      <span className="status-dot" /> {label}
    </span>
  );
};
