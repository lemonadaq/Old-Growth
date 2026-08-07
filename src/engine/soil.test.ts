import { describe, expect, it } from 'vitest';
import {
  DEPTH_PRODUCTION_SCALE,
  SOIL_UNITS_PER_CANONICAL,
  STRATA,
  VEIN_HALF_SPAN,
  VEIN_MAX_DEPTH,
  VEIN_RADIUS_MAX,
  VEIN_RADIUS_MIN,
  VEIN_RICHNESS_MAX,
  VEIN_RICHNESS_MIN,
} from '../content/soil';
import {
  BARREN_SOIL,
  canonicalYAt,
  createSoilMap,
  depthAt,
  depthMultiplier,
  soilConditionsAt,
  stratumAt,
  veinAt,
} from './soil';

describe('depth conversion', () => {
  it('puts the surface at zero and measures downward', () => {
    expect(depthAt(0)).toBeCloseTo(0, 9);
    expect(depthAt(-0.3)).toBeCloseTo(300, 9);
    expect(depthAt(-1.6)).toBeCloseTo(1600, 9);
  });

  it('reports canopy heights as negative depth', () => {
    expect(depthAt(0.5)).toBeCloseTo(-500, 9);
  });

  it('round-trips through canonicalYAt', () => {
    for (const depth of [0, 120, 300, 940, 1600, 2400]) {
      expect(depthAt(canonicalYAt(depth))).toBeCloseTo(depth, 9);
    }
  });

  it('uses the documented soil-units-per-canonical scale', () => {
    expect(depthAt(-1)).toBeCloseTo(SOIL_UNITS_PER_CANONICAL, 9);
  });
});

describe('stratumAt', () => {
  it('names the layer at the surface', () => {
    expect(stratumAt(0).id).toBe('topsoil');
    expect(stratumAt(299).id).toBe('topsoil');
  });

  it('treats band boundaries as belonging to the lower band', () => {
    expect(stratumAt(300).id).toBe('clay');
    expect(stratumAt(800).id).toBe('rock');
    expect(stratumAt(1600).id).toBe('bedrock');
  });

  it('keeps reporting bedrock however deep it goes', () => {
    expect(stratumAt(50_000).id).toBe('bedrock');
  });

  it('falls back to the topmost band above ground', () => {
    expect(stratumAt(-400).id).toBe('topsoil');
  });

  it('describes a contiguous column with no gaps', () => {
    for (let i = 1; i < STRATA.length; i += 1) {
      expect(STRATA[i].top).toBe(STRATA[i - 1].bottom);
    }
  });
});

describe('depthMultiplier', () => {
  it('gives a surface root no bonus', () => {
    expect(depthMultiplier(0)).toBeCloseTo(1, 9);
  });

  it('doubles production at the scale depth', () => {
    expect(depthMultiplier(DEPTH_PRODUCTION_SCALE)).toBeCloseTo(2, 9);
  });

  it('scales linearly with depth', () => {
    expect(depthMultiplier(250)).toBeCloseTo(1.5, 9);
    expect(depthMultiplier(1600)).toBeCloseTo(1 + 1600 / DEPTH_PRODUCTION_SCALE, 9);
  });

  it('never penalises a part above the surface', () => {
    expect(depthMultiplier(-900)).toBeCloseTo(1, 9);
  });
});

describe('createSoilMap', () => {
  it('is deterministic: one seed, one arrangement of ore', () => {
    expect(createSoilMap(12345).veins).toEqual(createSoilMap(12345).veins);
  });

  it('lays out a different world for a different seed', () => {
    const a = createSoilMap(1).veins;
    const b = createSoilMap(2).veins;
    expect(a.some((vein, i) => vein.center.x !== b[i].center.x)).toBe(true);
  });

  it('keeps every pocket inside the generated bounds', () => {
    for (const vein of createSoilMap(777).veins) {
      const depth = depthAt(vein.center.y);
      expect(depth).toBeGreaterThanOrEqual(0);
      expect(depth).toBeLessThanOrEqual(VEIN_MAX_DEPTH);
      expect(Math.abs(vein.center.x)).toBeLessThanOrEqual(VEIN_HALF_SPAN);
      expect(vein.radius * SOIL_UNITS_PER_CANONICAL).toBeGreaterThanOrEqual(VEIN_RADIUS_MIN);
      expect(vein.radius * SOIL_UNITS_PER_CANONICAL).toBeLessThanOrEqual(VEIN_RADIUS_MAX);
      expect(vein.richness).toBeGreaterThanOrEqual(VEIN_RICHNESS_MIN);
      expect(vein.richness).toBeLessThanOrEqual(VEIN_RICHNESS_MAX);
    }
  });

  it('buries most of the ore in the clay and the rock', () => {
    const veins = createSoilMap(2024).veins;
    const deep = veins.filter((vein) => {
      const id = stratumAt(depthAt(vein.center.y)).id;
      return id === 'clay' || id === 'rock';
    });
    expect(deep.length / veins.length).toBeGreaterThan(0.6);
  });

  it('gives every pocket a distinct id', () => {
    const veins = createSoilMap(9).veins;
    expect(new Set(veins.map((vein) => vein.id)).size).toBe(veins.length);
  });
});

describe('veinAt', () => {
  const soil = {
    seed: 0,
    veins: [
      { id: 'a', center: { x: 0, y: -0.5 }, radius: 0.1, richness: 1.2 },
      { id: 'rich', center: { x: 0.05, y: -0.5 }, radius: 0.1, richness: 2 },
      { id: 'far', center: { x: 5, y: -0.5 }, radius: 0.1, richness: 9 },
    ],
  };

  it('finds the pocket a point sits inside', () => {
    expect(veinAt(soil, { x: -0.08, y: -0.5 })?.id).toBe('a');
  });

  it('returns nothing outside every pocket', () => {
    expect(veinAt(soil, { x: 0, y: -0.9 })).toBeNull();
  });

  it('counts the boundary as inside', () => {
    expect(veinAt(soil, { x: -0.1, y: -0.5 })?.id).toBe('a');
  });

  it('awards the richest pocket where two overlap', () => {
    expect(veinAt(soil, { x: 0.02, y: -0.5 })?.id).toBe('rich');
  });

  it('finds nothing at all in barren ground', () => {
    expect(veinAt(BARREN_SOIL, { x: 0, y: -0.5 })).toBeNull();
  });
});

describe('soilConditionsAt', () => {
  it('reports depth, layer, multiplier and vein together', () => {
    const soil = {
      seed: 0,
      veins: [{ id: 'a', center: { x: 0, y: -0.5 }, radius: 0.1, richness: 1.5 }],
    };
    const conditions = soilConditionsAt(soil, { x: 0, y: -0.5 });

    expect(conditions.depth).toBeCloseTo(500, 9);
    expect(conditions.stratum.id).toBe('clay');
    expect(conditions.multiplier).toBeCloseTo(2, 9);
    expect(conditions.vein?.richness).toBeCloseTo(1.5, 9);
  });

  it('gives a canopy point no depth bonus', () => {
    const conditions = soilConditionsAt(BARREN_SOIL, { x: 0, y: 0.8 });
    expect(conditions.depth).toBeCloseTo(-800, 9);
    expect(conditions.multiplier).toBeCloseTo(1, 9);
  });
});
