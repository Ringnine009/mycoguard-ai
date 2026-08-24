import { describe, it, expect } from 'vitest';
import { renderToString } from 'react-dom/server';
import { MushroomCanvas } from '../components/MushroomCanvas';
import { MushroomTraits } from '../types';

/**
 * Geometry guard for the side-view SVG illustration.
 *
 * Every rendered shape (cap / stalk / ring / base / shadow / texture) must
 * stay fully inside the 300×300 viewBox with a ≥8px safe margin, for any
 * trait combination. Regression this guards: `150 + w.toFixed(1)` string
 * concatenation pushed the right side of the stalk to x≈15012.
 */

const VIEW = 300;
const MARGIN = 8; // safe margin required on every side

interface Box {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

const box = (minX: number, minY: number, maxX: number, maxY: number): Box => ({ minX, minY, maxX, maxY });
const union = (a: Box, b: Box): Box =>
  box(Math.min(a.minX, b.minX), Math.min(a.minY, b.minY), Math.max(a.maxX, b.maxX), Math.max(a.maxY, b.maxY));

/** Exact-ish bbox for a path `d` string (control points included → conservative). */
function pathBBox(d: string): Box {
  let b = box(Infinity, Infinity, -Infinity, -Infinity);
  const re = /([MLQCZ])\s*([-\d.eE\s,]*)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(d)) !== null) {
    if (m[1] === 'Z') continue;
    const nums = (m[2].match(/-?\d*\.?\d+(?:e[+-]?\d+)?/gi) ?? []).map(Number);
    for (let i = 0; i + 1 < nums.length; i += 2) {
      b = union(b, box(nums[i], nums[i + 1], nums[i], nums[i + 1]));
    }
  }
  if (!isFinite(b.minX)) throw new Error(`unparseable path: ${d}`);
  return b;
}

function getAttrs(tag: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /([a-zA-Z_:][\w:.-]*)\s*=\s*"([^"]*)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(tag)) !== null) out[m[1]] = m[2];
  return out;
}

/** Collect every geometry element's bounding box from the rendered SVG. */
function collectBounds(html: string): Box[] {
  const bounds: Box[] = [];
  const tagRe = /<(path|circle|ellipse|line)\b[^>]*>/g;
  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(html)) !== null) {
    const tag = m[0];
    const a = getAttrs(tag);
    const num = (k: string) => (a[k] !== undefined ? Number(a[k]) : NaN);
    if (m[1] === 'path' && a.d) {
      bounds.push(pathBBox(a.d));
    } else if (m[1] === 'circle') {
      const r = num('r');
      bounds.push(box(num('cx') - r, num('cy') - r, num('cx') + r, num('cy') + r));
    } else if (m[1] === 'ellipse') {
      const rx = num('rx');
      const ry = num('ry');
      bounds.push(box(num('cx') - rx, num('cy') - ry, num('cx') + rx, num('cy') + ry));
    } else if (m[1] === 'line') {
      bounds.push(box(num('x1'), num('y1'), num('x2'), num('y2')));
    }
  }
  return bounds;
}

function renderBounds(traits: MushroomTraits): Box[] {
  const html = renderToString(<MushroomCanvas traits={traits} />);
  return collectBounds(html);
}

/** Representative combos: cap-shape × stalk-root × ring-type (+ surface/shape variants). */
function enumerate(): MushroomTraits[] {
  const combos: MushroomTraits[] = [];
  for (const capShape of ['b', 'c', 'x', 'f', 'k', 's'] as const) {
    for (const stalkRoot of ['b', 'c', 'u', 'e', 'r', '?'] as const) {
      for (const ringType of ['c', 'e', 'f', 'l', 'n', 'p', 's', 'z'] as const) {
        combos.push({
          capShape,
          capSurface: 'y',
          capColor: 'e',
          stalkRoot,
          ringType,
          ringNumber: ringType === 'n' ? 'n' : 'o',
          stalkShape: 'e',
          gillColor: 'w',
          gillSize: 'n',
          gillSpacing: 'c',
        });
      }
    }
  }
  // extra dimensions: cap surface × stalk shape × bruising
  for (const capSurface of ['f', 'g', 's', 'y'] as const) {
    combos.push({ capShape: 'x', capSurface, stalkRoot: 'e', ringType: 'n', ringNumber: 'n', stalkShape: 't', bruises: 't', capColor: 'n', gillColor: 'b' });
  }
  return combos;
}

const COMBOS = enumerate();

describe('MushroomCanvas geometry — every shape inside the viewBox with margin', () => {
  it(`enumerates ${COMBOS.length} representative trait combos`, () => {
    expect(COMBOS.length).toBeGreaterThanOrEqual(12);
  });

  it.each(COMBOS.map((t, i) => [i, t] as const))(
    'combo %i: no element exceeds the 300×300 viewBox minus %ipx margin',
    (_i, traits) => {
      const bounds = renderBounds(traits);
      expect(bounds.length).toBeGreaterThan(0);
      for (const b of bounds) {
        expect(b.minX, `minX ${JSON.stringify(b)} for ${JSON.stringify(traits)}`).toBeGreaterThanOrEqual(MARGIN - 0.01);
        expect(b.minY, `minY ${JSON.stringify(b)}`).toBeGreaterThanOrEqual(MARGIN - 0.01);
        expect(b.maxX, `maxX ${JSON.stringify(b)}`).toBeLessThanOrEqual(VIEW - MARGIN + 0.01);
        expect(b.maxY, `maxY ${JSON.stringify(b)}`).toBeLessThanOrEqual(VIEW - MARGIN + 0.01);
      }
    },
  );

  it('keeps the whole mushroom horizontally centered (stable under trait change)', () => {
    for (const traits of [
      { capShape: 'x' as const },
      { capShape: 'f' as const, stalkRoot: 'b' as const, ringType: 'l' as const, ringNumber: 'o' as const },
      { capShape: 'c' as const, stalkRoot: 'r' as const },
    ]) {
      const b = renderBounds(traits).reduce(union);
      const center = (b.minX + b.maxX) / 2;
      expect(Math.abs(center - 150)).toBeLessThan(2);
    }
  });
});
