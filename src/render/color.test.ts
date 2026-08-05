import { describe, expect, it } from 'vitest';
import { mixHex, mixRgb, parseHex, rgbToCss, rgbaToCss, sampleKeyframes, shade } from './color';
import { mixSky, SKY_TRACK } from './palette';

describe('color', () => {
  it('parses long and short hex forms', () => {
    expect(parseHex('#8fc6e8')).toEqual({ r: 0x8f, g: 0xc6, b: 0xe8 });
    expect(parseHex('#fff')).toEqual({ r: 255, g: 255, b: 255 });
    expect(parseHex('000000')).toEqual({ r: 0, g: 0, b: 0 });
  });

  it('rejects malformed hex', () => {
    expect(() => parseHex('#12345')).toThrow(/Invalid hex color/);
    expect(() => parseHex('nope')).toThrow(/Invalid hex color/);
  });

  it('formats css colors, clamping and rounding channels', () => {
    expect(rgbToCss({ r: 1.4, g: 300, b: -20 })).toBe('rgb(1, 255, 0)');
    expect(rgbaToCss({ r: 0, g: 0, b: 0 }, 0.5)).toBe('rgba(0, 0, 0, 0.5)');
    expect(rgbaToCss({ r: 0, g: 0, b: 0 }, 5)).toBe('rgba(0, 0, 0, 1)');
  });

  it('mixes colors linearly and clamps t', () => {
    const black = { r: 0, g: 0, b: 0 };
    const white = { r: 255, g: 255, b: 255 };
    expect(mixRgb(black, white, 0.5)).toEqual({ r: 127.5, g: 127.5, b: 127.5 });
    expect(mixRgb(black, white, -3)).toEqual(black);
    expect(mixRgb(black, white, 12)).toEqual(white);
    expect(mixHex('#000000', '#ffffff', 1)).toBe('rgb(255, 255, 255)');
  });

  it('shades toward black and toward white', () => {
    const grey = { r: 100, g: 100, b: 100 };
    expect(shade(grey, 0.5)).toEqual({ r: 50, g: 50, b: 50 });
    expect(shade(grey, 2).r).toBeGreaterThan(grey.r);
  });
});

describe('sampleKeyframes', () => {
  const track = [
    { at: 0, value: 0 },
    { at: 0.5, value: 100 },
  ];
  const blendNumbers = (a: number, b: number, t: number) => a + (b - a) * t;

  it('returns keyframe values exactly at their positions', () => {
    expect(sampleKeyframes(track, 0, blendNumbers)).toBe(0);
    expect(sampleKeyframes(track, 0.5, blendNumbers)).toBe(100);
  });

  it('interpolates between neighbouring keyframes', () => {
    expect(sampleKeyframes(track, 0.25, blendNumbers)).toBeCloseTo(50);
  });

  it('wraps cyclically from the last keyframe back to the first', () => {
    // 0.75 is halfway from the 0.5 keyframe back around to the 0.0 keyframe.
    expect(sampleKeyframes(track, 0.75, blendNumbers)).toBeCloseTo(50);
    expect(sampleKeyframes(track, 1.25, blendNumbers)).toBeCloseTo(50);
    expect(sampleKeyframes(track, -0.75, blendNumbers)).toBeCloseTo(50);
  });

  it('handles a single-keyframe track', () => {
    expect(sampleKeyframes([{ at: 0.3, value: 42 }], 0.9, blendNumbers)).toBe(42);
  });

  it('throws on an empty track', () => {
    expect(() => sampleKeyframes([], 0, blendNumbers)).toThrow(/empty/);
  });
});

describe('sky track', () => {
  it('is sorted and inside one cycle', () => {
    const positions = SKY_TRACK.map((k) => k.at);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
    expect(positions[0]).toBeGreaterThanOrEqual(0);
    expect(positions[positions.length - 1]).toBeLessThan(1);
  });

  it('lerps the sky continuously through the day', () => {
    const midnight = sampleKeyframes(SKY_TRACK, 0, mixSky);
    const noon = sampleKeyframes(SKY_TRACK, 0.5, mixSky);
    const justAfterMidnight = sampleKeyframes(SKY_TRACK, 0.005, mixSky);

    // Noon is far brighter than midnight...
    expect(noon.top.r + noon.top.g + noon.top.b).toBeGreaterThan(
      midnight.top.r + midnight.top.g + midnight.top.b,
    );
    // ...and the wrap point is smooth, not a jump.
    expect(Math.abs(justAfterMidnight.top.b - midnight.top.b)).toBeLessThan(4);
  });

  it('dims the ambient light at night and peaks it at noon', () => {
    const noon = sampleKeyframes(SKY_TRACK, 0.5, mixSky);
    const midnight = sampleKeyframes(SKY_TRACK, 0, mixSky);
    expect(noon.ambient).toEqual({ r: 255, g: 255, b: 255 });
    expect(midnight.ambient.r).toBeLessThan(150);
  });
});
