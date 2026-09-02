/**
 * A `favicon.ico` writer: a directory of PNGs, which is all a modern ICO is.
 *
 * The SVG favicon covers every browser released this decade. This file exists
 * for everything else that goes looking for `/favicon.ico` without being told
 * to — old browsers, feed readers, link unfurlers, and the crawler that will
 * log a 404 against the site for the rest of its life if it is not there.
 */

/** Pack `{ size, png }` entries into an ICO. Sizes must be 1–256 pixels. */
export function encodeIco(images) {
  if (images.length === 0) throw new Error('encodeIco: needs at least one image');

  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(images.length, 4);

  const directory = Buffer.alloc(16 * images.length);
  let offset = header.length + directory.length;

  images.forEach((image, index) => {
    if (image.size < 1 || image.size > 256) {
      throw new Error(`encodeIco: ${image.size}px is outside the 1-256 range`);
    }
    const entry = index * 16;
    // 256 is written as 0: the field is one byte, and the format's way of
    // saying "the big one" is to overflow it.
    directory[entry] = image.size === 256 ? 0 : image.size;
    directory[entry + 1] = image.size === 256 ? 0 : image.size;
    directory[entry + 2] = 0; // palette size
    directory[entry + 3] = 0; // reserved
    directory.writeUInt16LE(1, entry + 4); // colour planes
    directory.writeUInt16LE(32, entry + 6); // bits per pixel
    directory.writeUInt32LE(image.png.length, entry + 8);
    directory.writeUInt32LE(offset, entry + 12);
    offset += image.png.length;
  });

  return Buffer.concat([header, directory, ...images.map((image) => image.png)]);
}
