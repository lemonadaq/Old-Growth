import { describe, expect, it } from 'vitest';
import { lerpColor, parseHex, toCss } from './color';
import { SKY_KEYFRAMES } from './palette';
import { hillHeightAt, skyColors } from './sky';

describe('parseHex', () => {
  it('reads long and short forms alike', () => {
    expect(parseHex('#8fc6e8')).toEqual({ r: 0x8f, g: 0xc6, b: 0xe8 });
    expect(parseHex('#fff')).toEqual({ r: 255, g: 255, b: 255 });
  });

  it('rejects anything that is not a colour', () => {
    expect(() => parseHex('#12345')).toThrow();
    expect(() => parseHex('rebeccapurple')).toThrow();
  });
});

describe('lerpColor', () => {
  it('returns the endpoints exactly', () => {
    expect(lerpColor('#000000', '#ffffff', 0)).toBe(toCss({ r: 0, g: 0, b: 0 }));
    expect(lerpColor('#000000', '#ffffff', 1)).toBe(toCss({ r: 255, g: 255, b: 255 }));
  });

  it('blends per channel', () => {
    expect(lerpColor('#000000', '#ffffff', 0.5)).toBe('rgb(128, 128, 128)');
  });

  it('clamps out-of-range factors', () => {
    expect(lerpColor('#000000', '#ffffff', -3)).toBe('rgb(0, 0, 0)');
    expect(lerpColor('#000000', '#ffffff', 9)).toBe('rgb(255, 255, 255)');
  });
});

describe('skyColors', () => {
  it('hits each keyframe exactly on its own mark', () => {
    for (const frame of SKY_KEYFRAMES) {
      const colors = skyColors(frame.at);
      expect(colors.top).toBe(toCss(parseHex(frame.top)));
      expect(colors.bottom).toBe(toCss(parseHex(frame.bottom)));
    }
  });

  it('wraps at midnight without a seam', () => {
    expect(skyColors(1)).toEqual(skyColors(0));
    expect(skyColors(2.5)).toEqual(skyColors(0.5));
  });

  it('lands between its neighbours mid-interval', () => {
    const [first, second] = SKY_KEYFRAMES;
    const middle = skyColors((first.at + second.at) / 2);
    expect(middle.top).not.toBe(toCss(parseHex(first.top)));
    expect(middle.top).not.toBe(toCss(parseHex(second.top)));
  });

  it('gives midday a brighter sky than deep night', () => {
    const brightness = (css: string) =>
      css
        .slice(4, -1)
        .split(',')
        .reduce((sum, part) => sum + Number(part), 0);
    expect(brightness(skyColors(0.31).top)).toBeGreaterThan(brightness(skyColors(0.8).top));
  });
});

describe('hillHeightAt', () => {
  it('is the same ridge every time it is asked', () => {
    expect(hillHeightAt(123.5, 0, 80)).toBe(hillHeightAt(123.5, 0, 80));
  });

  it('never collapses to nothing, and never overshoots its amplitude', () => {
    for (let x = -2000; x <= 2000; x += 37) {
      const height = hillHeightAt(x, 0, 80);
      expect(height).toBeGreaterThan(0);
      expect(height).toBeLessThanOrEqual(80);
    }
  });

  it('varies along the ridgeline', () => {
    const samples = new Set<number>();
    for (let x = 0; x < 900; x += 50) samples.add(Math.round(hillHeightAt(x, 0, 80)));
    expect(samples.size).toBeGreaterThan(4);
  });

  it('gives the two bands different profiles', () => {
    expect(hillHeightAt(200, 0, 80)).not.toBeCloseTo(hillHeightAt(200, 1, 80));
  });

  it('scales with the amplitude it is given', () => {
    expect(hillHeightAt(310, 0, 160)).toBeCloseTo(hillHeightAt(310, 0, 80) * 2);
  });
});
