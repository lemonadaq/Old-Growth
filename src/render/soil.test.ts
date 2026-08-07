import { describe, expect, it } from 'vitest';
import { SOIL_UNITS_PER_CANONICAL, STRATA } from '../content/soil';
import type { TreeLayout } from '../engine/tree';
import { depthToScreenY, soilBands } from './soil';

/** A layout with the ground line at 400px and 1 canonical unit = 500px. */
const LAYOUT: TreeLayout = { originX: 300, originY: 400, scale: 500 };

describe('depthToScreenY', () => {
  it('puts the surface on the trunk base', () => {
    expect(depthToScreenY(0, LAYOUT)).toBe(LAYOUT.originY);
  });

  it('grows downward at the layout’s scale', () => {
    // 500 soil units = half a canonical unit = 250px at this scale.
    expect(depthToScreenY(500, LAYOUT)).toBeCloseTo(650, 9);
    expect(depthToScreenY(SOIL_UNITS_PER_CANONICAL, LAYOUT)).toBeCloseTo(900, 9);
  });

  it('follows the tree’s scale, so bands and roots can never disagree', () => {
    const zoomed = { ...LAYOUT, scale: 250 };
    expect(depthToScreenY(500, zoomed)).toBeCloseTo(525, 9);
  });
});

describe('soilBands', () => {
  it('drops the layers that are below the canvas', () => {
    // At this scale only topsoil (0–300 → 400–550px) is on a 560px canvas.
    const bands = soilBands(LAYOUT, 560);
    expect(bands.map((band) => band.stratum.id)).toEqual(['topsoil', 'clay']);
  });

  it('brings the deeper layers into view as the scale shrinks', () => {
    const bands = soilBands({ ...LAYOUT, scale: 120 }, 1000);
    expect(bands.map((band) => band.stratum.id)).toEqual(STRATA.map((s) => s.id));
  });

  it('clips the bottom band to the canvas instead of running past it', () => {
    const bands = soilBands(LAYOUT, 700);
    for (const band of bands) {
      expect(band.bottom).toBeLessThanOrEqual(700);
      expect(band.top).toBeGreaterThanOrEqual(LAYOUT.originY);
    }
  });

  it('gives the bottomless band a finite bottom edge', () => {
    const bands = soilBands({ ...LAYOUT, scale: 100 }, 800);
    const bedrock = bands.find((band) => band.stratum.id === 'bedrock');
    expect(bedrock?.bottom).toBe(800);
    expect(Number.isFinite(bedrock?.gradientBottom ?? Infinity)).toBe(true);
  });

  it('stacks the bands with no gap and no overlap', () => {
    const bands = soilBands({ ...LAYOUT, scale: 120 }, 1000);
    for (let i = 1; i < bands.length; i += 1) {
      expect(bands[i].top).toBeCloseTo(bands[i - 1].bottom, 9);
    }
  });

  it('shades each band across its whole depth, not just its visible slice', () => {
    // Clay runs 300–800; at scale 500 its bottom is far below a 600px canvas,
    // but the gradient still spans the full band so the shading is continuous.
    const clay = soilBands(LAYOUT, 600).find((band) => band.stratum.id === 'clay');
    expect(clay?.bottom).toBe(600);
    expect(clay?.gradientBottom).toBeCloseTo(depthToScreenY(800, LAYOUT), 9);
  });

  it('draws nothing when the ground line is already off the bottom', () => {
    expect(soilBands({ ...LAYOUT, originY: 900 }, 800)).toEqual([]);
  });
});
