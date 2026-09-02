import { inflateRawSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { crc32 } from './crc32.mjs';
import { zip } from './zip.mjs';

/**
 * The zip goes to itch.io, where nobody is standing by to debug it: if the
 * archive is malformed the upload is simply rejected, or worse, accepted and
 * served as a white page. So these tests read the archive back the way a reader
 * does — end record, central directory, then each entry — rather than checking
 * that the writer wrote what it wrote.
 */

const END_SIGNATURE = 0x06054b50;

/** Parse an archive into `{ name, data }`, the way a zip reader would. */
function unzip(buffer) {
  const end = buffer.length - 22;
  expect(buffer.readUInt32LE(end)).toBe(END_SIGNATURE);
  const count = buffer.readUInt16LE(end + 10);
  let cursor = buffer.readUInt32LE(end + 16);

  const files = [];
  for (let i = 0; i < count; i += 1) {
    expect(buffer.readUInt32LE(cursor)).toBe(0x02014b50);
    const method = buffer.readUInt16LE(cursor + 10);
    const sum = buffer.readUInt32LE(cursor + 16);
    const compressedSize = buffer.readUInt32LE(cursor + 20);
    const size = buffer.readUInt32LE(cursor + 24);
    const nameLength = buffer.readUInt16LE(cursor + 28);
    const offset = buffer.readUInt32LE(cursor + 42);
    const name = buffer.toString('utf8', cursor + 46, cursor + 46 + nameLength);

    expect(buffer.readUInt32LE(offset)).toBe(0x04034b50);
    const localNameLength = buffer.readUInt16LE(offset + 26);
    const extraLength = buffer.readUInt16LE(offset + 28);
    const start = offset + 30 + localNameLength + extraLength;
    const payload = buffer.subarray(start, start + compressedSize);
    const data = method === 0 ? Buffer.from(payload) : inflateRawSync(payload);

    expect(data.length).toBe(size);
    expect(crc32(data)).toBe(sum);
    files.push({ name, data });

    cursor += 46 + nameLength + buffer.readUInt16LE(cursor + 30) + buffer.readUInt16LE(cursor + 32);
  }
  return files;
}

describe('zip', () => {
  it('round-trips text and binary entries', () => {
    const html = Buffer.from('<!doctype html><title>Old Growth</title>'.repeat(20));
    const binary = Buffer.from(Array.from({ length: 512 }, (_, i) => (i * 37) % 256));

    const files = unzip(
      zip([
        { name: 'index.html', data: html },
        { name: 'assets/index-a1b2c3.js', data: binary },
      ]),
    );

    expect(files.map((file) => file.name)).toEqual(['index.html', 'assets/index-a1b2c3.js']);
    expect(files[0].data.equals(html)).toBe(true);
    expect(files[1].data.equals(binary)).toBe(true);
  });

  it('keeps index.html at the archive root, which is what itch.io looks for', () => {
    const files = unzip(zip([{ name: 'index.html', data: Buffer.from('hi') }]));
    expect(files[0].name).toBe('index.html');
  });

  it('stores rather than deflates data that compression would grow', () => {
    // Random bytes: deflate adds a header and gives nothing back.
    const noise = Buffer.from(Array.from({ length: 64 }, (_, i) => (i * 101 + 17) % 256));
    const archive = zip([{ name: 'noise.bin', data: noise }]);
    expect(archive.readUInt16LE(8)).toBe(0); // method 0 in the local header
    expect(unzip(archive)[0].data.equals(noise)).toBe(true);
  });

  it('is byte-identical for identical input, so a rebuild is not a new upload', () => {
    const files = [{ name: 'index.html', data: Buffer.from('same') }];
    expect(zip(files).equals(zip(files))).toBe(true);
  });

  it('writes an empty archive rather than throwing', () => {
    expect(unzip(zip([]))).toEqual([]);
  });
});
