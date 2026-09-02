/**
 * CRC-32 (IEEE 802.3), the checksum both PNG chunks and ZIP entries are
 * required to carry.
 *
 * Written out rather than pulled in: it is twenty lines, and the alternative is
 * a dependency in the build path of a game that ships as a static folder.
 */

/** The standard table, built once on first use. */
const TABLE = new Uint32Array(256);
for (let i = 0; i < 256; i += 1) {
  let value = i;
  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  TABLE[i] = value >>> 0;
}

/**
 * The checksum of `bytes`, as an unsigned 32-bit number.
 *
 * `seed` is the running value, so a large file can be summed in pieces:
 * `crc32(b, crc32(a))` equals `crc32(concat(a, b))`.
 */
export function crc32(bytes, seed = 0) {
  let crc = (seed ^ 0xffffffff) >>> 0;
  for (const byte of bytes) {
    crc = (TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8)) >>> 0;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
