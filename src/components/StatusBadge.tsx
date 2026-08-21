import React from 'react';
import { BackendHealth } from '../types';

interface StatusBadgeProps {
  health: BackendHealth | null | undefined; // undefined = probing
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ health }) => {
  if (health === undefined) {
    return (
      <span className="status-badge">
        <span className="status-dot" /> 检测后端…
      </span>
    );
  }
  const online = health !== null;
  const vision = online && health.vision;
  const chat = online && health.chat;
  const label = !online
    ? '纯离线模式 · 规则引擎'
    : vision && chat
      ? '在线增强 · 视觉 + 问答'
      : vision
        ? '在线增强 · 视觉'
        : chat
          ? '在线增强 · 问答'
          : '纯离线模式 · 规则引擎';
  return (
    <span className={`status-badge ${online ? 'online' : 'offline'}`}>
      <span className="status-dot" /> {label}
    </span>
  );
};
