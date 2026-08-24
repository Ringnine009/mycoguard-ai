import React, { useId, useMemo } from 'react';
import { MushroomTraits } from '../types';
import { COLOR_MAP } from '../constants';
import { useI18n } from '../i18n';

interface MushroomCanvasProps {
  traits: MushroomTraits;
}

/**
 * Real-time parametric SVG mushroom renderer — v5 "product illustration".
 *
 * Two views: side morphology + underside (gill) view. Every visible trait
 * updates the drawing instantly:
 *  - cap shape / surface (scales, grooves, fibres, gloss) / color
 *  - stalk shape (UCI e=enlarging, t=tapering), stalk-root base
 *    (bulb / club / cup / rooting / missing)
 *  - ring type (pendant / flaring / sheathing / cortinate web / zone / gone)
 *  - gill size / spacing / color (bottom-view density & thickness)
 *  - bruising tint on the stalk when bruises=t
 *
 * v5 fixes:
 *  - geometry guard: every element stays inside the 300×300 viewBox (a
 *    regression previously put the stalk's right edge at x≈15012 via
 *    `150 + w.toFixed(1)` string concatenation); a clipPath bounds the whole
 *    drawing as defense-in-depth. Enforced by
 *    src/__tests__/canvasGeometry.test.tsx.
 *  - corrected stalk-shape taper semantics
 *  - beautification: stalk highlight + rim reflection, contact shadow,
 *    curved gill lines, gradient lighting.
 *
 * Zero dependencies — pure SVG.
 */
export const MushroomCanvas: React.FC<MushroomCanvasProps> = ({ traits }) => {
  const { t } = useI18n();
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');

  const capColor = COLOR_MAP[traits.capColor || ''] || '#b45309';
  const stalkColorAbove = COLOR_MAP[traits.stalkColorAbove || ''] || '#d6d3d1';
  const stalkColorBelow = COLOR_MAP[traits.stalkColorBelow || ''] || '#d6d3d1';
  const gillColor = COLOR_MAP[traits.gillColor || ''] || '#e5e7eb';
  const neutralRing = '#b9bcc4';
  const bruised = traits.bruises === 't';

  const capShape = traits.capShape || 'x';
  const capSurface = traits.capSurface || 's';
  const stalkRoot = traits.stalkRoot || 'e';
  const ringType = traits.ringType || (traits.ringNumber ? 'p' : 'n');
  const hasRing = traits.ringNumber === 'o' || traits.ringNumber === 't';
  const stalkShape = traits.stalkShape || 'e';

  const rad = (deg: number) => (deg * Math.PI) / 180;

  // Deterministic pseudo-random scatter for textures (stable per trait combo).
  const scatter = useMemo(() => {
    let seed = 7;
    const rnd = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    return { rnd };
  }, []);
  const texturePoints = useMemo(
    () =>
      Array.from({ length: 16 }, () => ({
        x: 72 + scatter.rnd() * 156,
        y: 20 + scatter.rnd() * 58,
        r: 2.4 + scatter.rnd() * 3.2,
        rot: scatter.rnd() * 360,
      })),
    [scatter, capSurface, capColor],
  );
  const gillRands = useMemo(
    () => Array.from({ length: 84 }, () => 0.55 + scatter.rnd() * 0.45),
    [scatter, traits.gillSpacing, traits.gillColor],
  );

  /* ---------------- Cap silhouette ---------------- */
  const capPath = (() => {
    switch (capShape) {
      case 'b': // 钟形 bell
        return 'M 58 102 C 52 52 84 18 150 18 C 216 18 248 52 242 102 C 208 88 92 88 58 102 Z';
      case 'c': // 锥形 cone
        return 'M 62 104 Q 106 60 150 12 Q 194 60 238 104 C 208 88 92 88 62 104 Z';
      case 'x': // 凸面 convex
        return 'M 44 100 Q 150 10 256 100 C 218 82 82 82 44 100 Z';
      case 'f': // 平展 flat
        return 'M 36 94 Q 150 64 264 94 C 222 84 78 84 36 94 Z';
      case 'k': // 中心凸起 umbonate
        return 'M 44 100 Q 100 74 122 60 Q 150 24 178 60 Q 200 74 256 100 C 214 84 86 84 44 100 Z';
      case 's': // 中心凹陷 depressed
        return 'M 42 100 Q 92 56 128 76 Q 150 90 172 76 Q 208 56 258 100 C 218 84 82 84 42 100 Z';
      default:
        return 'M 44 100 Q 150 -8 256 100 C 218 82 82 82 44 100 Z';
    }
  })();

  /* ---------------- Stalk silhouette ---------------- */
  const getWidthAtY = (y: number) => {
    const topY = 92;
    const bottomY = 238;
    const progress = Math.max(0, (y - topY) / (bottomY - topY));
    // UCI stalk-shape: e = enlarging (narrow top → wide base), t = tapering.
    const topWidth = stalkShape === 'e' ? 12 : stalkShape === 't' ? 26 : 20;
    const baseWidth = stalkShape === 'e' ? 26 : stalkShape === 't' ? 12 : 22;
    let w = topWidth + (baseWidth - topWidth) * progress;
    // Root-type base bulges / tapers below the soil line.
    if (y > 228) {
      if (stalkRoot === 'b') w += 14 * Math.sin(((y - 228) / 18) * Math.PI * 0.5) + 6;
      else if (stalkRoot === 'c') w += 8 * ((y - 228) / 18) + 2;
      else if (stalkRoot === 'u') w -= 2;
      else if (stalkRoot === 'r') w -= 10 * ((y - 228) / 18);
      else if (stalkRoot === '?') w -= 2;
    }
    return Math.max(4, Math.min(96, w)); // never exceed viewBox half-width
  };

  const stalkTopY = 92;
  const stalkBottomY = stalkRoot === 'r' ? 268 : stalkRoot === '?' ? 232 : 246;

  const stalkPath = (() => {
    const steps = 14;
    let d = `M ${(150 - getWidthAtY(stalkTopY)).toFixed(1)} ${stalkTopY}`;
    for (let i = 1; i <= steps; i++) {
      const y = stalkTopY + ((stalkBottomY - stalkTopY) * i) / steps;
      const w = getWidthAtY(y);
      d += ` L ${(150 - w).toFixed(1)} ${y.toFixed(1)}`;
    }
    for (let i = steps; i >= 0; i--) {
      const y = stalkTopY + ((stalkBottomY - stalkTopY) * i) / steps;
      const w = getWidthAtY(y);
      d += ` L ${(150 + w).toFixed(1)} ${y.toFixed(1)}`;
    }
    d += ' Z';
    return d;
  })();

  /* ---------------- Textures ---------------- */
  const renderCapTexture = () => {
    const darker = 'rgba(0,0,0,0.22)';
    const lighter = 'rgba(255,255,255,0.4)';
    switch (capSurface) {
      case 'y': // 鳞片 scales (classic Amanita white flecks)
        return (
          <g data-part="cap-texture" className="mush-texture">
            {texturePoints.map((p, i) => (
              <ellipse
                key={i}
                cx={p.x}
                cy={p.y}
                rx={p.r}
                ry={p.r * 0.72}
                fill={i % 3 === 0 ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.55)'}
                stroke="rgba(0,0,0,0.12)"
                strokeWidth="0.6"
                transform={`rotate(${p.rot.toFixed(0)} ${p.x} ${p.y})`}
                opacity="0.9"
              />
            ))}
          </g>
        );
      case 'g': // 凹槽 grooves
        return (
          <g data-part="cap-texture" className="mush-texture" stroke={darker} strokeWidth="1.4" fill="none" opacity="0.55">
            {Array.from({ length: 12 }).map((_, i) => {
              const a = -Math.PI / 2 + ((i - 5.5) / 11) * Math.PI;
              const x1 = 150 + 34 * Math.cos(a);
              const y1 = 74 + 18 * Math.sin(a);
              const x2 = 150 + 104 * Math.cos(a);
              const y2 = 92 + 14 * Math.sin(a);
              return (
                <path
                  key={i}
                  d={`M ${x1.toFixed(1)} ${y1.toFixed(1)} Q ${(150 + 70 * Math.cos(a)).toFixed(1)} ${36} ${x2.toFixed(1)} ${y2.toFixed(1)}`}
                />
              );
            })}
          </g>
        );
      case 'f': // 纤维 fibrous
        return (
          <g data-part="cap-texture" className="mush-texture" stroke={darker} strokeWidth="1.1" fill="none" opacity="0.4">
            {Array.from({ length: 9 }).map((_, i) => (
              <path key={i} d={`M ${92 + i * 16} 96 Q ${90 + i * 16} 50 ${108 + i * 14} 26`} />
            ))}
          </g>
        );
      case 's': // 光滑 smooth → glossy highlight
      default:
        return (
          <g data-part="cap-texture" className="mush-texture">
            <ellipse cx="116" cy="42" rx="34" ry="16" fill={lighter} opacity="0.7" transform="rotate(-24 116 42)" />
            <ellipse cx="126" cy="36" rx="18" ry="8" fill={lighter} opacity="0.5" transform="rotate(-24 126 36)" />
          </g>
        );
    }
  };

  /* ---------------- Ring / annulus ---------------- */
  const ringY = 158;
  const renderRing = () => {
    if (!hasRing) return null;
    const col = neutralRing;
    switch (ringType) {
      case 'f': // 喇叭状 flaring (points up)
        return (
          <g data-part="ring" className="mush-morph" fill={col} stroke="rgba(0,0,0,0.25)" strokeWidth="1">
            <path d={`M ${150 - 34} ${ringY - 14} Q ${150} ${ringY + 6} ${150 + 34} ${ringY - 14} L ${150 + 22} ${ringY + 2} Q ${150} ${ringY + 14} ${150 - 22} ${ringY + 2} Z`} />
          </g>
        );
      case 's': // 鞘状 sheathing (sleeve down the stalk)
        return (
          <g data-part="ring" className="mush-morph" fill={col} stroke="rgba(0,0,0,0.2)" strokeWidth="1" opacity="0.9">
            <path d={`M ${150 - 30} ${ringY} Q ${150 - 40} ${ringY + 34} ${150 - 20} ${ringY + 52} L ${150 + 20} ${ringY + 52} Q ${150 + 40} ${ringY + 34} ${150 + 30} ${ringY} Z`} />
          </g>
        );
      case 'e': // 消失状 evanescent (faint partial band)
        return (
          <g data-part="ring" className="mush-morph" fill="none" stroke={col} strokeWidth="2" opacity="0.45" strokeDasharray="2 3">
            <path d={`M ${150 - 26} ${ringY} Q ${150} ${ringY + 4} ${150 + 26} ${ringY}`} />
          </g>
        );
      case 'z': // 带状 zone (thin band)
        return (
          <g data-part="ring" className="mush-morph" fill={col} stroke="rgba(0,0,0,0.2)" strokeWidth="0.8" opacity="0.85">
            <ellipse cx="150" cy={ringY} rx="27" ry="4.5" />
          </g>
        );
      case 'c': // 蛛网状 cortinate web
        return (
          <g data-part="ring" className="mush-morph" stroke={col} strokeWidth="0.9" fill="none" opacity="0.8">
            {Array.from({ length: 10 }).map((_, i) => {
              const a = (i / 10) * Math.PI * 2;
              return (
                <line
                  key={i}
                  x1={150 + 24 * Math.cos(a)}
                  y1={ringY + 8 * Math.sin(a)}
                  x2={150 + 34 * Math.cos(a + 0.5)}
                  y2={ringY - 8 + 8 * Math.sin(a + 0.5)}
                />
              );
            })}
            <circle cx="150" cy={ringY} r="27" fill="rgba(255,255,255,0.35)" strokeWidth="0.8" />
          </g>
        );
      case 'l': // 大型 large pendant skirt
        return (
          <g data-part="ring" className="mush-morph" fill={col} stroke="rgba(0,0,0,0.25)" strokeWidth="1">
            <path d={`M ${150 - 34} ${ringY - 6} Q ${150} ${ringY - 18} ${150 + 34} ${ringY - 6} L ${150 + 40} ${ringY + 6} Q ${150} ${ringY + 24} ${150 - 40} ${ringY + 6} Z`} />
            <path d={`M ${150 - 38} ${ringY + 4} Q ${150 - 26} ${ringY + 8} ${150 - 16} ${ringY + 4}`} fill="none" stroke="rgba(0,0,0,0.18)" strokeWidth="1" />
            <path d={`M ${150 + 16} ${ringY + 4} Q ${150 + 26} ${ringY + 8} ${150 + 38} ${ringY + 4}`} fill="none" stroke="rgba(0,0,0,0.18)" strokeWidth="1" />
          </g>
        );
      case 'p': // 垂悬状 pendant (default)
      default:
        return (
          <g data-part="ring" className="mush-morph" fill={col} stroke="rgba(0,0,0,0.25)" strokeWidth="1">
            <path d={`M ${150 - 30} ${ringY - 4} Q ${150} ${ringY - 12} ${150 + 30} ${ringY - 4} L ${150 + 34} ${ringY + 8} Q ${150} ${ringY + 18} ${150 - 34} ${ringY + 8} Z`} />
            {[150 - 22, 150, 150 + 22].map((x) => (
              <path key={x} d={`M ${x - 5} ${ringY + 8} Q ${x} ${ringY + 14} ${x + 5} ${ringY + 8}`} fill="none" stroke="rgba(0,0,0,0.18)" strokeWidth="1" />
            ))}
          </g>
        );
    }
  };

  /* ---------------- Volva / base (stalk-root) ---------------- */
  const renderBase = () => {
    switch (stalkRoot) {
      case 'b': // 球状 bulbous
        return (
          <g data-part="base" className="mush-morph">
            <ellipse cx="150" cy="246" rx="34" ry="15" fill={stalkColorBelow} stroke="rgba(0,0,0,0.25)" strokeWidth="1.2" />
            <ellipse cx="150" cy="252" rx="20" ry="6" fill="rgba(0,0,0,0.14)" />
          </g>
        );
      case 'c': // 棒状 club
        return (
          <g data-part="base" className="mush-morph">
            <path d={`M ${150 - 26} 234 Q ${150 - 34} 250 ${150 - 16} 252 L ${150 + 16} 252 Q ${150 + 34} 250 ${150 + 26} 234 Z`} fill={stalkColorBelow} stroke="rgba(0,0,0,0.25)" strokeWidth="1.2" />
          </g>
        );
      case 'u': // 杯状 cup / volva
        return (
          <g data-part="base" className="mush-morph">
            <path d={`M ${150 - 30} 232 Q ${150 - 46} 258 ${150 - 18} 262 L ${150 + 18} 262 Q ${150 + 46} 258 ${150 + 30} 232 Z`} fill={stalkColorBelow} stroke="rgba(0,0,0,0.3)" strokeWidth="1.4" />
            <ellipse cx="150" cy="259" rx="17" ry="4" fill="rgba(0,0,0,0.14)" />
          </g>
        );
      case 'r': // 根状 rooting (tapers to a root)
        return (
          <g data-part="base" className="mush-morph" opacity="0.95">
            <path d={`M ${150 - 14} 240 Q ${150 - 4} 258 ${150} 272 Q ${150 + 4} 258 ${150 + 14} 240 Z`} fill={stalkColorBelow} stroke="rgba(0,0,0,0.22)" strokeWidth="1" />
          </g>
        );
      case '?': // 缺失 missing (broken off)
        return (
          <g data-part="base" className="mush-morph">
            <path d={`M ${150 - 20} 224 L ${150 - 12} 234 L ${150 - 2} 226 L ${150 + 8} 236 L ${150 + 18} 228 Z`} fill="rgba(0,0,0,0.18)" />
            <path d={`M ${150 - 21} 224 Q ${150} 218 ${150 + 21} 224`} fill="none" stroke="rgba(0,0,0,0.25)" strokeWidth="1.2" />
          </g>
        );
      case 'e': // 等长 equal
      default:
        return null;
    }
  };

  /* ---------------- Bottom (gill) view ---------------- */
  const gillCount = traits.gillSpacing === 'w' ? 84 : traits.gillSpacing === 'c' ? 44 : 22;
  const gillWidth = traits.gillSize === 'n' ? 1.1 : 2.7;

  return (
    <div className="canvas-grid">
      {/* ============ Side morphology ============ */}
      <div className="canvas-card">
        <svg viewBox="0 0 300 300" className="mush-canvas" role="img" aria-label="蘑菇侧面形态渲染（参数化 SVG）">
          <defs>
            <radialGradient id={`cap-${uid}`} cx="0.38" cy="0.22" r="0.95">
              <stop offset="0%" stopColor="#ffffff" stopOpacity="0.85" />
              <stop offset="18%" stopColor={capColor} />
              <stop offset="78%" stopColor={capColor} />
              <stop offset="100%" stopColor="#000000" stopOpacity="0.45" />
            </radialGradient>
            <linearGradient id={`stalk-${uid}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#ffffff" stopOpacity="0.6" />
              <stop offset="30%" stopColor={stalkColorAbove} />
              <stop offset="100%" stopColor={stalkColorBelow} />
            </linearGradient>
            <radialGradient id={`shadow-${uid}`} cx="0.5" cy="0.5" r="0.5">
              <stop offset="0%" stopColor="#000000" stopOpacity="0.2" />
              <stop offset="65%" stopColor="#000000" stopOpacity="0.07" />
              <stop offset="100%" stopColor="#000000" stopOpacity="0" />
            </radialGradient>
            <clipPath id={`stalkclip-${uid}`}>
              <path d={stalkPath} />
            </clipPath>
            {/* Geometry guard: nothing may paint outside the viewBox. */}
            <clipPath id={`bound-${uid}`}>
              <rect x="0" y="0" width="300" height="300" />
            </clipPath>
          </defs>

          <g clipPath={`url(#bound-${uid})`}>
            {/* soft ground shadow + contact shadow */}
            <ellipse data-part="shadow" cx="150" cy="278" rx="88" ry="14" fill={`url(#shadow-${uid})`} className="mush-shadow" />
            <ellipse data-part="shadow" cx="150" cy="272" rx="34" ry="6" fill="rgba(0,0,0,0.13)" />

            <g className="mush-morph" key={`side-${capShape}-${capSurface}-${capColor}-${stalkRoot}-${ringType}-${traits.ringNumber}`}>
              {/* stalk with longitudinal highlight */}
              <path data-part="stalk" d={stalkPath} fill={`url(#stalk-${uid})`} stroke="rgba(0,0,0,0.28)" strokeWidth="1.4" />
              <g clipPath={`url(#stalkclip-${uid})`}>
                <path
                  data-part="stalk-highlight"
                  d={`M ${150 - 18} 96 C ${150 - 14} 150 ${150 - 12} 200 ${150 - 10} ${stalkBottomY - 4} L ${150 - 4} ${stalkBottomY - 4} C ${150 - 5} 200 ${150 - 6} 150 ${150 - 9} 96 Z`}
                  fill="#ffffff"
                  opacity="0.32"
                />
                {bruised && <path data-part="bruise" d={stalkPath} fill="rgba(120,60,30,0.25)" stroke="none" className="mush-bruise" />}
              </g>
              {/* base structures (volva / bulb / root) */}
              {renderBase()}
              {/* ring */}
              {renderRing()}
              {/* cap */}
              <path data-part="cap" d={capPath} fill={`url(#cap-${uid})`} stroke="rgba(0,0,0,0.35)" strokeWidth="1.6" />
              {/* cap rim reflection (light catching the lower-right edge) */}
              <path
                data-part="cap-highlight"
                d={capPath}
                fill="none"
                stroke="#ffffff"
                strokeOpacity="0.4"
                strokeWidth="1.4"
                transform="translate(0 -1.5)"
              />
              {/* surface texture */}
              <clipPath id={`capclip-${uid}`}>
                <path d={capPath} />
              </clipPath>
              <g clipPath={`url(#capclip-${uid})`}>{renderCapTexture()}</g>
              {/* gill edge peeking under the cap */}
              {capShape !== 'f' && (
                <path
                  data-part="gill-edge"
                  d="M 48 100 C 92 92 208 92 252 100 C 208 98 92 98 48 100 Z"
                  fill={gillColor}
                  stroke="rgba(0,0,0,0.2)"
                  strokeWidth="0.8"
                  opacity="0.9"
                />
              )}
            </g>
          </g>
        </svg>
        <div className="canvas-caption">{t('Side · 形态视图')}</div>
      </div>

      {/* ============ Underside (gill) view ============ */}
      <div className="canvas-card">
        <svg viewBox="0 0 300 300" className="mush-canvas" role="img" aria-label="蘑菇菌褶底面视图（参数化 SVG）">
          <defs>
            <radialGradient id={`capunder-${uid}`} cx="0.5" cy="0.5" r="0.5">
              <stop offset="0%" stopColor={capColor} />
              <stop offset="100%" stopColor="#000000" stopOpacity="0.55" />
            </radialGradient>
            <radialGradient id={`gillbg-${uid}`} cx="0.5" cy="0.5" r="0.5">
              <stop offset="0%" stopColor={gillColor} />
              <stop offset="85%" stopColor={gillColor} />
              <stop offset="100%" stopColor="#000000" stopOpacity="0.25" />
            </radialGradient>
            <radialGradient id={`stipe-${uid}`} cx="0.35" cy="0.3" r="0.9">
              <stop offset="0%" stopColor="#ffffff" stopOpacity="0.9" />
              <stop offset="40%" stopColor={stalkColorAbove} />
              <stop offset="100%" stopColor={stalkColorBelow} />
            </radialGradient>
          </defs>

          <g className="mush-morph" key={`under-${capColor}-${gillColor}-${traits.gillSpacing}-${traits.gillSize}`}>
            {/* cap margin */}
            <circle data-part="gcap" cx="150" cy="150" r="122" fill={`url(#capunder-${uid})`} stroke="rgba(0,0,0,0.3)" strokeWidth="2" />
            {/* gill field */}
            <circle data-part="ggill" cx="150" cy="150" r="102" fill={`url(#gillbg-${uid})`} stroke="rgba(0,0,0,0.12)" strokeWidth="1" />
            {/* curved gill lines for a more natural perspective */}
            <g stroke={gillColor} strokeWidth={gillWidth} strokeLinecap="round" fill="none">
              {Array.from({ length: gillCount }).map((_, i) => {
                const a0 = (i * 360) / gillCount;
                const r0 = 26 + 14 * gillRands[i];
                const r1 = 98;
                const bend = (i % 2 === 0 ? 1 : -1) * 3;
                const mid = (r0 + r1) / 2;
                const x0 = 150 + r0 * Math.cos(rad(a0));
                const y0 = 150 + r0 * Math.sin(rad(a0));
                const mx = 150 + mid * Math.cos(rad(a0 + bend));
                const my = 150 + mid * Math.sin(rad(a0 + bend));
                const x1 = 150 + r1 * Math.cos(rad(a0));
                const y1 = 150 + r1 * Math.sin(rad(a0));
                return (
                  <path
                    key={i}
                    data-part="ggill-line"
                    d={`M ${x0.toFixed(1)} ${y0.toFixed(1)} Q ${mx.toFixed(1)} ${my.toFixed(1)} ${x1.toFixed(1)} ${y1.toFixed(1)}`}
                    opacity="0.75"
                  />
                );
              })}
            </g>
            {/* stipe cross-section */}
            <circle data-part="gstipe" cx="150" cy="150" r="34" fill={`url(#stipe-${uid})`} stroke="rgba(0,0,0,0.3)" strokeWidth="1.6" />
            {hasRing && (
              <circle data-part="gring" cx="150" cy="150" r="40" fill="none" stroke={neutralRing} strokeWidth="3" strokeDasharray="6 4" opacity="0.8" />
            )}
            <circle data-part="gstipe-hl" cx="150" cy="150" r="8" fill="rgba(255,255,255,0.5)" opacity="0.6" />
          </g>
        </svg>
        <div className="canvas-caption">{t('Under · 菌褶视图')}</div>
      </div>
    </div>
  );
};
