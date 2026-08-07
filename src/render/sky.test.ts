import { describe, expect, it } from 'vitest';
import { SUNLIT_FRACTION } from '../content/daylight';
import { lerpColor, parseHex, toCss } from './color';
import { SKY_KEYFRAMES } from './palette';
import { celestialAt, hillHeightAt, skyColors } from './sky';

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

describe('celestialAt', () => {
  it('puts the sun up through the lit part of the day', () => {
    expect(celestialAt(0.01).kind).toBe('sun');
    expect(celestialAt(SUNLIT_FRACTION / 2).kind).toBe('sun');
    expect(celestialAt(SUNLIT_FRACTION - 0.001).kind).toBe('sun');
  });

  it('hands over to the moon at sundown and keeps it up all night', () => {
    expect(celestialAt(SUNLIT_FRACTION).kind).toBe('moon');
    expect(celestialAt(0.9).kind).toBe('moon');
  });

  it('peaks each body halfway through its own arc', () => {
    expect(celestialAt(SUNLIT_FRACTION / 2).altitude).toBeCloseTo(1, 6);
    expect(celestialAt((1 + SUNLIT_FRACTION) / 2).altitude).toBeCloseTo(1, 6);
  });

  it('swaps bodies at the horizon, so the handover is never seen', () => {
    expect(celestialAt(SUNLIT_FRACTION - 1e-9).altitude).toBeCloseTo(0, 6);
    expect(celestialAt(SUNLIT_FRACTION).altitude).toBeCloseTo(0, 6);
    expect(celestialAt(0).altitude).toBeCloseTo(0, 6);
    expect(celestialAt(1 - 1e-9).altitude).toBeCloseTo(0, 6);
  });

  it('travels one way across the sky', () => {
    let previous = -1;
    for (let t = 0; t < SUNLIT_FRACTION; t += 0.02) {
      const { progress } = celestialAt(t);
      expect(progress).toBeGreaterThan(previous);
      previous = progress;
    }
  });

  it('keeps altitude inside the sky', () => {
    for (let t = 0; t < 1; t += 0.01) {
      const { altitude } = celestialAt(t);
      expect(altitude).toBeGreaterThanOrEqual(0);
      expect(altitude).toBeLessThanOrEqual(1);
    }
  });

  it('wraps like the day does', () => {
    expect(celestialAt(1.25)).toEqual(celestialAt(0.25));
    expect(celestialAt(-0.25)).toEqual(celestialAt(0.75));
  });
});
