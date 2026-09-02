import { inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { crc32 } from './crc32.mjs';
import { encodePng } from './png.mjs';
import { encodeIco } from './ico.mjs';
import { JS_BUDGET_BYTES, formatBytes, summarize } from './bundle.mjs';
import { precacheList, serviceWorkerSource } from './sw.mjs';

describe('crc32', () => {
  it('matches the known check value for "123456789"', () => {
    expect(crc32(Buffer.from('123456789'))).toBe(0xcbf43926);
  });

  it('is resumable, so a file can be summed in pieces', () => {
    const whole = Buffer.from('old growth');
    expect(crc32(whole.subarray(4), crc32(whole.subarray(0, 4)))).toBe(crc32(whole));
  });
});

describe('encodePng', () => {
  /** Read the chunks back out of an encoded file. */
  function chunks(png) {
    const found = [];
    let cursor = 8;
    while (cursor < png.length) {
      const length = png.readUInt32BE(cursor);
      const type = png.toString('ascii', cursor + 4, cursor + 8);
      const data = png.subarray(cursor + 8, cursor + 8 + length);
      const stored = png.readUInt32BE(cursor + 8 + length);
      expect(crc32(png.subarray(cursor + 4, cursor + 8 + length))).toBe(stored);
      found.push({ type, data });
      cursor += 12 + length;
    }
    return found;
  }

  it('writes a signature, a header and the pixels it was given', () => {
    const width = 3;
    const height = 2;
    const rgba = new Uint8Array(width * height * 4);
    for (let i = 0; i < rgba.length; i += 1) rgba[i] = (i * 7) % 256;

    const png = encodePng(width, height, rgba);
    expect([...png.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

    const parts = chunks(png);
    expect(parts.map((part) => part.type)).toEqual(['IHDR', 'IDAT', 'IEND']);
    expect(parts[0].data.readUInt32BE(0)).toBe(width);
    expect(parts[0].data.readUInt32BE(4)).toBe(height);
    expect(parts[0].data[8]).toBe(8); // 8 bits per channel
    expect(parts[0].data[9]).toBe(6); // RGBA

    // Every scanline is filter 0 followed by that row's pixels, unchanged.
    const raw = inflateSync(parts[1].data);
    for (let y = 0; y < height; y += 1) {
      const row = raw.subarray(y * (width * 4 + 1), (y + 1) * (width * 4 + 1));
      expect(row[0]).toBe(0);
      expect([...row.subarray(1)]).toEqual([...rgba.subarray(y * width * 4, (y + 1) * width * 4)]);
    }
  });

  it('refuses a pixel buffer that does not match the dimensions', () => {
    expect(() => encodePng(2, 2, new Uint8Array(8))).toThrow(/expected 16 bytes/);
  });
});

describe('encodeIco', () => {
  it('writes a directory of PNGs a browser can index', () => {
    const png16 = encodePng(16, 16, new Uint8Array(16 * 16 * 4));
    const png32 = encodePng(32, 32, new Uint8Array(32 * 32 * 4));
    const ico = encodeIco([
      { size: 16, png: png16 },
      { size: 32, png: png32 },
    ]);

    expect(ico.readUInt16LE(0)).toBe(0); // reserved
    expect(ico.readUInt16LE(2)).toBe(1); // type: icon
    expect(ico.readUInt16LE(4)).toBe(2); // two images

    const sizes = [16, 32];
    for (let index = 0; index < 2; index += 1) {
      const entry = 6 + index * 16;
      expect(ico[entry]).toBe(sizes[index]);
      expect(ico[entry + 1]).toBe(sizes[index]);
      const length = ico.readUInt32LE(entry + 8);
      const offset = ico.readUInt32LE(entry + 12);
      const payload = ico.subarray(offset, offset + length);
      expect([...payload.subarray(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]);
    }
  });

  it('refuses a size the format cannot describe', () => {
    const png = encodePng(1, 1, new Uint8Array(4));
    expect(() => encodeIco([{ size: 512, png }])).toThrow(/outside the 1-256 range/);
    expect(() => encodeIco([])).toThrow(/at least one image/);
  });
});

describe('precacheList', () => {
  it('takes the shell and the hashed assets', () => {
    expect(precacheList(['index.html', 'assets/index-a1b2.js', 'icons/icon-192.png'])).toEqual([
      'index.html',
      'assets/index-a1b2.js',
      'icons/icon-192.png',
    ]);
  });

  it('leaves out the worker itself, source maps and the social card', () => {
    const kept = precacheList([
      'index.html',
      'sw.js',
      'assets/index-a1b2.js',
      'assets/index-a1b2.js.map',
      'og-image.png',
      'audio/ASSETS_TODO.md',
    ]);
    expect(kept).toEqual(['index.html', 'assets/index-a1b2.js']);
  });
});

describe('serviceWorkerSource', () => {
  const source = serviceWorkerSource({
    cacheName: 'old-growth-abc123',
    assets: ['index.html', 'assets/index-a1b2.js'],
  });

  it('names its cache and lists what it precaches', () => {
    expect(source).toContain('"old-growth-abc123"');
    expect(source).toContain('"assets/index-a1b2.js"');
  });

  it('serves navigations from the network first, so a new build reaches players', () => {
    // The shell is the only URL that is not content-hashed; caching it first
    // would pin a returning player to the build they first opened.
    expect(source).toMatch(/request\.mode === 'navigate'[\s\S]*fetch\(request\)/);
  });

  it('never calls skipWaiting, which would swap assets under a running tab', () => {
    expect(source).not.toContain('skipWaiting');
  });
});

describe('bundle budget', () => {
  it('splits a build by kind and totals it', () => {
    const summary = summarize([
      { file: 'assets/index-a.js', raw: 300, gzip: 100 },
      { file: 'assets/vendor-b.js', raw: 200, gzip: 50 },
      { file: 'assets/index-c.css', raw: 80, gzip: 20 },
      { file: 'index.html', raw: 10, gzip: 5 },
      { file: 'icons/icon-192.png', raw: 500, gzip: 480 },
    ]);

    expect(summary.totals.js).toEqual({ count: 2, raw: 500, gzip: 150 });
    expect(summary.totals.css.gzip).toBe(20);
    expect(summary.totals.other.count).toBe(1);
    expect(summary.withinBudget).toBe(true);
  });

  it('fails when the gzipped JavaScript passes 1.2 MB', () => {
    const over = summarize([{ file: 'a.js', raw: 9e9, gzip: JS_BUDGET_BYTES + 1 }]);
    expect(over.withinBudget).toBe(false);
    // And passes at exactly the ceiling: a budget is a limit, not a target.
    expect(summarize([{ file: 'a.js', raw: 9e9, gzip: JS_BUDGET_BYTES }]).withinBudget).toBe(true);
  });

  it('formats sizes the way a person reads them', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(2048)).toBe('2.0 KB');
    expect(formatBytes(3 * 1024 * 1024)).toBe('3.00 MB');
  });
});
