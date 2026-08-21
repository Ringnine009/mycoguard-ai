import React from 'react';
import { MushroomTraits } from '../types';
import { COLOR_MAP } from '../constants';

interface MushroomCanvasProps {
  traits: MushroomTraits;
}

/**
 * Real-time parametric SVG mushroom renderer.
 * Two views: side morphology + underside (gill) view. Every visible trait
 * (shape, color, gills, rings, bruising) updates the drawing instantly.
 * Ported from the original course project and restyled for the dark theme.
 */
export const MushroomCanvas: React.FC<MushroomCanvasProps> = ({ traits }) => {
  const capColor = COLOR_MAP[traits.capColor || ''] || '#b45309';
  const stalkColorAbove = COLOR_MAP[traits.stalkColorAbove || ''] || '#d6d3d1';
  const stalkColorBelow = COLOR_MAP[traits.stalkColorBelow || ''] || '#d6d3d1';
  const gillColor = COLOR_MAP[traits.gillColor || ''] || '#e5e7eb';
  const neutralStalk = '#3f3f46';

  const getCapPath = () => {
    switch (traits.capShape) {
      case 'b': return 'M 50 100 Q 50 10 150 10 Q 250 10 250 100 L 50 100 Z'; // 钟形
      case 'c': return 'M 50 110 L 150 10 L 250 110 Z'; // 锥形
      case 'x': return 'M 40 100 Q 150 0 260 100 Z'; // 凸面
      case 'f': return 'M 40 95 Q 150 85 260 95 L 260 85 Q 150 75 40 85 Z'; // 平展
      case 'k': return 'M 40 100 Q 100 60 130 60 Q 150 10 170 60 Q 200 60 260 100 Z'; // 中心凸起
      case 's': return 'M 40 100 Q 100 60 130 60 Q 150 105 170 60 Q 200 60 260 100 Z'; // 中心凹陷
      default: return 'M 40 100 Q 150 20 260 100 Z';
    }
  };

  const renderStalk = () => {
    const isTwoRings = traits.ringNumber === 't';
    const hasRing = traits.ringNumber === 'o' || isTwoRings;
    const topY = 90;
    const bottomY = 260;
    const midY1 = isTwoRings ? 155 : 160;
    const midY2 = isTwoRings ? 158 : 160;

    const getWidthAtY = (y: number) => {
      const progress = (y - topY) / (bottomY - topY);
      const baseWidth = traits.stalkShape === 't' ? 15 : 25;
      const topWidth = traits.stalkShape === 'e' ? 15 : 25;
      return topWidth + (baseWidth - topWidth) * progress;
    };

    const createSegment = (y1: number, y2: number, color: string) => {
      const w1 = getWidthAtY(y1);
      const w2 = getWidthAtY(y2);
      return (
        <path
          key={`${y1}-${y2}`}
          d={`M ${150 - w1} ${y1} L ${150 + w1} ${y1} L ${150 + w2} ${y2} L ${150 - w2} ${y2} Z`}
          fill={color}
          stroke="rgba(0,0,0,0.35)"
          strokeWidth="1.2"
        />
      );
    };

    if (!hasRing) return createSegment(topY, bottomY, stalkColorAbove);
    if (isTwoRings) {
      return (
        <g>
          {createSegment(topY, midY1, stalkColorAbove)}
          {createSegment(midY1, midY2, neutralStalk)}
          {createSegment(midY2, bottomY, stalkColorBelow)}
        </g>
      );
    }
    return (
      <g>
        {createSegment(topY, midY1, stalkColorAbove)}
        {createSegment(midY1, bottomY, stalkColorBelow)}
      </g>
    );
  };

  const renderRings = () => {
    if (traits.ringNumber === 'n') return null;
    const isTwoRings = traits.ringNumber === 't';
    return (
      <g fill="#d4d4d8" stroke="rgba(0,0,0,0.4)" strokeWidth="1.2">
        <ellipse cx="150" cy={isTwoRings ? 155 : 160} rx="30" ry="6" />
        {isTwoRings && <ellipse cx="150" cy="158" rx="33" ry="6" />}
      </g>
    );
  };

  const gillCount = traits.gillSpacing === 'w' ? 80 : traits.gillSpacing === 'c' ? 40 : 18;

  return (
    <div className="canvas-grid">
      <div className="canvas-card">
        <svg viewBox="0 0 300 300" role="img" aria-label="蘑菇侧面形态渲染">
          <ellipse cx="150" cy="268" rx="42" ry="9" fill="rgba(0,0,0,0.4)" />
          {renderStalk()}
          {renderRings()}
          <path d={getCapPath()} fill={capColor} stroke="rgba(0,0,0,0.5)" strokeWidth="2" />
        </svg>
        <div className="canvas-caption">Side · 形态视图</div>
      </div>

      <div className="canvas-card">
        <svg viewBox="0 0 300 300" role="img" aria-label="蘑菇菌褶视图渲染">
          <circle cx="150" cy="150" r="120" fill={capColor} stroke="rgba(0,0,0,0.5)" strokeWidth="2" />
          <g stroke={gillColor} strokeOpacity="0.85" strokeWidth={traits.gillSize === 'n' ? '1' : '3'}>
            {Array.from({ length: gillCount }).map((_, i, arr) => {
              const angle = (i * 360) / arr.length;
              const x2 = 150 + 115 * Math.cos((angle * Math.PI) / 180);
              const y2 = 150 + 115 * Math.sin((angle * Math.PI) / 180);
              return <line key={i} x1="150" y1="150" x2={x2} y2={y2} />;
            })}
          </g>
          <circle cx="150" cy="150" r="40" fill={stalkColorAbove} stroke="rgba(0,0,0,0.5)" strokeWidth="2" />
        </svg>
        <div className="canvas-caption">Under · 菌褶视图</div>
      </div>
    </div>
  );
};
