import { deflateSync } from 'node:zlib';
import { crc32 } from './crc32.mjs';

/**
 * A minimal PNG writer: 8-bit RGBA, no interlacing, one `IDAT`.
 *
 * The game needs four raster files (two icons, one maskable icon, one social
 * card) generated from one glyph, and every library that would draw them for us
 * is a native module — `sharp`, `canvas`, headless Chrome. PNG's baseline is a
 * signature, three chunks and a filter byte per row, and `zlib` is in the
 * standard library, so the whole encoder is this file and the build stays
 * `npm ci` on any machine.
 */

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** One length-type-data-CRC chunk. The CRC covers the type and the data. */
function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

/**
 * Encode `rgba` (`width * height * 4` bytes, row-major) as a PNG buffer.
 *
 * Every row is written with filter 0 (`None`). The predictive filters exist to
 * make the deflate stream smaller, and on flat-shaded shapes at icon sizes the
 * difference is a few kilobytes against a chunk of encoder nobody here would
 * ever read again.
 */
export function encodePng(width, height, rgba) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    throw new Error(`encodePng: bad dimensions ${width}x${height}`);
  }
  const expected = width * height * 4;
  if (rgba.length !== expected) {
    throw new Error(`encodePng: expected ${expected} bytes of pixels, got ${rgba.length}`);
  }

  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0;
    Buffer.from(rgba.buffer, rgba.byteOffset + y * stride, stride).copy(raw, y * (stride + 1) + 1);
  }

  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // colour type: truecolour with alpha
  header[10] = 0; // deflate
  header[11] = 0; // adaptive filtering
  header[12] = 0; // no interlace

  return Buffer.concat([
    SIGNATURE,
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
