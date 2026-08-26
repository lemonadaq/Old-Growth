import { describe, expect, it } from 'vitest';
import { WEATHER_TELEGRAPH_SECONDS } from '../content/balance';
import { SEASON_BY_ID } from '../content/seasons';
import { WEATHER_BY_ID } from '../content/weather';
import type { Viewport } from '../engine/camera';
import type { TreeLayout } from '../engine/tree';
import type { WeatherSnapshot } from '../engine/types';
import {
  ANCHOR_RADIUS_PX,
  RAIN_DROPS,
  braceAnchorLayout,
  hitTestBraceAnchor,
  lightningFlash,
  raindropAt,
  seasonLeafCast,
  seasonSkyCast,
  seasonSoilCast,
  skyCasts,
  weatherSkyCast,
} from './weather';

const VIEWPORT: Viewport = { width: 1280, height: 800 };
const LAYOUT: TreeLayout = { originX: 640, originY: 500, scale: 400 };

/** A clear sky, and the two ways it can stop being clear. */
const CLEAR: WeatherSnapshot = { active: null, pending: null, storm: null };

const raining: WeatherSnapshot = {
  active: { id: 'rain', remainingSeconds: 30, fraction: 0.33 },
  pending: null,
  storm: null,
};

const stormComing = (inSeconds: number): WeatherSnapshot => ({
  active: null,
  pending: { id: 'storm', inSeconds },
  storm: null,
});

describe('season casts', () => {
  it('quote the season’s own tint, so content owns the colour', () => {
    for (const season of ['spring', 'summer', 'autumn', 'winter'] as const) {
      const tint = SEASON_BY_ID[season].tint;
      expect(seasonSkyCast(season)).toEqual({ color: tint.sky, strength: tint.skyStrength });
      expect(seasonLeafCast(season)).toEqual({ color: tint.leaf, strength: tint.leafStrength });
      expect(seasonSoilCast(season)).toEqual({ color: tint.soil, strength: tint.soilStrength });
    }
  });

  it('recolour foliage hardest in the two seasons that change the tree', () => {
    // Autumn turns the canopy and winter stops it working; both have to be
    // obvious from across the room. Spring and summer are the tree at work, and
    // the tree at work should look like itself.
    const worked = Math.max(seasonLeafCast('spring').strength, seasonLeafCast('summer').strength);
    for (const season of ['autumn', 'winter'] as const) {
      expect(seasonLeafCast(season).strength).toBeGreaterThan(worked);
    }
  });
});

describe('weatherSkyCast', () => {
  it('is nothing at all under a clear sky', () => {
    expect(weatherSkyCast(CLEAR)).toBeNull();
  });

  it('is the running event at its full strength', () => {
    expect(weatherSkyCast(raining)).toEqual({
      color: WEATHER_BY_ID.rain.color,
      strength: WEATHER_BY_ID.rain.skyStrength,
    });
  });

  it('ramps in over the telegraph, so the light turns before the banner is read', () => {
    const full = WEATHER_BY_ID.storm.skyStrength;
    expect(weatherSkyCast(stormComing(WEATHER_TELEGRAPH_SECONDS))?.strength).toBeCloseTo(0, 9);
    expect(weatherSkyCast(stormComing(WEATHER_TELEGRAPH_SECONDS / 2))?.strength).toBeCloseTo(
      full / 2,
      9,
    );
    expect(weatherSkyCast(stormComing(0))?.strength).toBeCloseTo(full, 9);
  });

  it('never ramps past full, even if the clock overshoots', () => {
    const cast = weatherSkyCast(stormComing(WEATHER_TELEGRAPH_SECONDS * 3));
    expect(cast?.strength).toBeGreaterThanOrEqual(0);
  });

  it('prefers what is happening to what is coming', () => {
    const both: WeatherSnapshot = { ...raining, pending: { id: 'storm', inSeconds: 2 } };
    expect(weatherSkyCast(both)?.color).toBe(WEATHER_BY_ID.rain.color);
  });
});

describe('skyCasts', () => {
  it('puts the season first and the weather over the top of it', () => {
    const casts = skyCasts('winter', raining);
    expect(casts).toHaveLength(2);
    expect(casts[0]).toEqual(seasonSkyCast('winter'));
    expect(casts[1]?.color).toBe(WEATHER_BY_ID.rain.color);
  });

  it('is the season alone under a clear sky', () => {
    expect(skyCasts('summer', CLEAR)).toEqual([seasonSkyCast('summer')]);
  });
});

describe('raindropAt', () => {
  it('keeps every drop on or near the canvas', () => {
    for (let i = 0; i < RAIN_DROPS; i += 1) {
      const drop = raindropAt(i, 3.7, VIEWPORT);
      expect(drop.y).toBeGreaterThanOrEqual(-20);
      expect(drop.y).toBeLessThanOrEqual(VIEWPORT.height + 20);
      expect(drop.x).toBeGreaterThanOrEqual(-VIEWPORT.height);
      expect(drop.x).toBeLessThanOrEqual(VIEWPORT.width + VIEWPORT.height);
      expect(drop.length).toBeGreaterThan(0);
    }
  });

  it('is a pure function of the clock: the same second draws the same rain', () => {
    expect(raindropAt(4, 2.5, VIEWPORT)).toEqual(raindropAt(4, 2.5, VIEWPORT));
  });

  it('falls: a later moment is further down the screen', () => {
    const before = raindropAt(0, 0.02, VIEWPORT);
    const after = raindropAt(0, 0.12, VIEWPORT);
    expect(after.y).toBeGreaterThan(before.y);
  });

  it('scatters drops across columns rather than stacking them in one', () => {
    const columns = new Set<number>();
    for (let i = 0; i < 40; i += 1) columns.add(Math.round(raindropAt(i, 1, VIEWPORT).x));
    expect(columns.size).toBeGreaterThan(30);
  });
});

describe('lightningFlash', () => {
  it('stays inside [0, 1]', () => {
    for (let t = 0; t < 12; t += 0.017) {
      const flash = lightningFlash(t);
      expect(flash).toBeGreaterThanOrEqual(0);
      expect(flash).toBeLessThanOrEqual(1);
    }
  });

  it('strikes at the top of its period and decays from there', () => {
    expect(lightningFlash(0)).toBeCloseTo(1, 9);
    expect(lightningFlash(0.08)).toBeLessThan(1);
    expect(lightningFlash(0.08)).toBeGreaterThan(0);
  });

  it('is dark for most of the period — a constant flash is a broken screen', () => {
    let lit = 0;
    let samples = 0;
    for (let t = 0; t < 30; t += 0.01) {
      samples += 1;
      if (lightningFlash(t) > 0) lit += 1;
    }
    expect(lit / samples).toBeLessThan(0.2);
  });

  it('repeats: the storm keeps flashing for its whole fifteen seconds', () => {
    expect(lightningFlash(3.1)).toBeCloseTo(lightningFlash(0), 6);
  });
});

describe('the brace anchor', () => {
  it('sits at the foot of the trunk, a little above the ground line', () => {
    const anchor = braceAnchorLayout(VIEWPORT, LAYOUT);
    expect(anchor.x).toBeCloseTo(LAYOUT.originX, 9);
    expect(anchor.y).toBeLessThan(LAYOUT.originY);
    expect(anchor.radius).toBe(ANCHOR_RADIUS_PX);
  });

  it('stays reachable when the camera has taken the trunk off-screen', () => {
    const offscreen = braceAnchorLayout(VIEWPORT, { originX: -900, originY: 4000, scale: 400 });
    expect(offscreen.x).toBeGreaterThanOrEqual(0);
    expect(offscreen.x).toBeLessThanOrEqual(VIEWPORT.width);
    expect(offscreen.y).toBeGreaterThanOrEqual(0);
    expect(offscreen.y).toBeLessThanOrEqual(VIEWPORT.height);
  });

  it('answers a press inside it and nothing outside it', () => {
    const anchor = braceAnchorLayout(VIEWPORT, LAYOUT);
    expect(hitTestBraceAnchor({ x: anchor.x, y: anchor.y }, anchor)).toBe(true);
    expect(hitTestBraceAnchor({ x: anchor.x + anchor.radius - 1, y: anchor.y }, anchor)).toBe(true);
    expect(hitTestBraceAnchor({ x: anchor.x + anchor.radius + 2, y: anchor.y }, anchor)).toBe(
      false,
    );
    expect(hitTestBraceAnchor({ x: 0, y: 0 }, anchor)).toBe(false);
  });
});
