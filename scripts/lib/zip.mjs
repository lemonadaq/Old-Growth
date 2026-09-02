import { deflateRawSync } from 'node:zlib';
import { crc32 } from './crc32.mjs';

/**
 * A minimal ZIP writer: one deflated entry per file, no directory entries, no
 * ZIP64.
 *
 * itch.io wants a zip with `index.html` at its root, and the alternatives were a
 * dependency or shelling out to `zip` — which is not installed everywhere a
 * release might be cut, and fails in a way nobody debugs on a release day. The
 * format's baseline is three record types and a CRC, all of which are here.
 *
 * Everything is stored with a fixed timestamp so two packages built from the
 * same files are byte-identical.
 */

/** 1980-01-01, the epoch of the DOS timestamp ZIP inherited. */
const DOS_TIME = 0;
const DOS_DATE = 33; // (1980 - 1980) << 9 | 1 << 5 | 1

const LOCAL_SIGNATURE = 0x04034b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const END_SIGNATURE = 0x06054b50;

/**
 * Pack `files` — `{ name, data }`, where `name` uses forward slashes and is
 * relative to the archive root — into a zip.
 */
export function zip(files) {
  const locals = [];
  const centrals = [];
  let offset = 0;

  for (const { name, data } of files) {
    const nameBytes = Buffer.from(name, 'utf8');
    const compressed = deflateRawSync(data, { level: 9 });
    // A file deflate makes bigger — a PNG, usually — is stored as-is. Method 0
    // is universally readable and never worse than the original.
    const stored = compressed.length >= data.length;
    const payload = stored ? Buffer.from(data) : compressed;
    const sum = crc32(data);

    const local = Buffer.alloc(30 + nameBytes.length);
    local.writeUInt32LE(LOCAL_SIGNATURE, 0);
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0x800, 6); // flags: UTF-8 names
    local.writeUInt16LE(stored ? 0 : 8, 8); // method
    local.writeUInt16LE(DOS_TIME, 10);
    local.writeUInt16LE(DOS_DATE, 12);
    local.writeUInt32LE(sum, 14);
    local.writeUInt32LE(payload.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    local.writeUInt16LE(0, 28); // extra field length
    nameBytes.copy(local, 30);

    const central = Buffer.alloc(46 + nameBytes.length);
    central.writeUInt32LE(CENTRAL_SIGNATURE, 0);
    central.writeUInt16LE(20, 4); // version made by
    central.writeUInt16LE(20, 6); // version needed
    central.writeUInt16LE(0x800, 8);
    central.writeUInt16LE(stored ? 0 : 8, 10);
    central.writeUInt16LE(DOS_TIME, 12);
    central.writeUInt16LE(DOS_DATE, 14);
    central.writeUInt32LE(sum, 16);
    central.writeUInt32LE(payload.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt16LE(0, 30); // extra
    central.writeUInt16LE(0, 32); // comment
    central.writeUInt16LE(0, 34); // disk number
    central.writeUInt16LE(0, 36); // internal attributes
    central.writeUInt32LE(0o644 << 16, 38); // external attributes: rw-r--r--
    central.writeUInt32LE(offset, 42);
    nameBytes.copy(central, 46);

    locals.push(local, payload);
    centrals.push(central);
    offset += local.length + payload.length;
  }

  const central = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(END_SIGNATURE, 0);
  end.writeUInt16LE(0, 4); // this disk
  end.writeUInt16LE(0, 6); // disk with the central directory
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(central.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20); // archive comment

  return Buffer.concat([...locals, central, end]);
}
