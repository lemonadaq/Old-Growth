/**
 * The tree glyph, drawn in code.
 *
 * The game's mark is one tree: a tapered trunk, three leaf clusters, two roots
 * reaching into the soil. It has to exist as a 192px icon, a 512px icon, a
 * maskable icon with a fat safe zone, and a 1200x630 social card — the same
 * drawing at four sizes, which is exactly the job a vector is for. There is no
 * SVG rasteriser here that is not a native module, so the shapes are described
 * as inside-tests and sampled: nine samples per pixel, last layer painted wins,
 * coverage averaged. That gives clean edges at every size from one description,
 * and `public/icon.svg` holds the same drawing for anything that wants vectors.
 *
 * All coordinates are in device pixels. The layout is computed by the callers
 * below from a box, so one geometry serves the square icons and the wide card.
 */

/** Palette, kept in step with `src/render/palette.ts` by hand. */
export const GLYPH_COLORS = {
  skyTop: [0x8f, 0xc6, 0xe8],
  skyBottom: [0xe7, 0xf0, 0xd8],
  soilTop: [0x6b, 0x4a, 0x2b],
  soilBottom: [0x2e, 0x1d, 0x10],
  bark: [0x6a, 0x47, 0x26],
  barkHighlight: [0x8c, 0x62, 0x38],
  leaf: [0x6f, 0x9e, 0x4a],
  leafShade: [0x4f, 0x7a, 0x35],
  leafHighlight: [0x93, 0xbd, 0x63],
  root: [0xa8, 0x87, 0x5e],
  hillFar: [0x9f, 0xb7, 0xa0],
  hillNear: [0x7f, 0x9c, 0x7e],
  sun: [0xff, 0xf3, 0xc4],
};

/* --------------------------------------------------------------- shapes */

/** A rectangle with rounded corners. */
export function roundedRect(x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  return (px, py) => {
    if (px < x || px > x + w || py < y || py > y + h) return false;
    const dx = Math.max(x + radius - px, 0, px - (x + w - radius));
    const dy = Math.max(y + radius - py, 0, py - (y + h - radius));
    return dx * dx + dy * dy <= radius * radius;
  };
}

export function circle(cx, cy, r) {
  return (px, py) => (px - cx) ** 2 + (py - cy) ** 2 <= r * r;
}

/** A thick line with round ends — every branch and root in the glyph. */
export function capsule(x0, y0, x1, y1, r) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const lengthSquared = dx * dx + dy * dy || 1;
  return (px, py) => {
    const t = Math.max(0, Math.min(1, ((px - x0) * dx + (py - y0) * dy) / lengthSquared));
    const nx = x0 + t * dx - px;
    const ny = y0 + t * dy - py;
    return nx * nx + ny * ny <= r * r;
  };
}

/** A trunk: vertical, wide at the bottom, narrow at the top. */
export function taper(cx, yTop, yBottom, halfTop, halfBottom) {
  return (px, py) => {
    if (py < yTop || py > yBottom) return false;
    const t = (py - yTop) / (yBottom - yTop);
    return Math.abs(px - cx) <= halfTop + (halfBottom - halfTop) * t;
  };
}

/** Everything. Used as the background layer's shape. */
export const everywhere = () => true;

/* ---------------------------------------------------------------- paint */

/** A vertical gradient between two colours, over `[yTop, yBottom]`. */
export function verticalGradient(yTop, yBottom, top, bottom) {
  return (_px, py) => {
    const t = Math.max(0, Math.min(1, (py - yTop) / (yBottom - yTop || 1)));
    return [
      top[0] + (bottom[0] - top[0]) * t,
      top[1] + (bottom[1] - top[1]) * t,
      top[2] + (bottom[2] - top[2]) * t,
    ];
  };
}

/**
 * Sample `layers` into an RGBA buffer.
 *
 * Painter's algorithm per sub-sample: the last layer whose shape contains the
 * sample decides its colour, and a sample inside no layer stays transparent.
 * Averaging the sub-samples is what produces both the anti-aliased outline and
 * the soft edges between clusters, with no compositing rules to get wrong.
 */
export function paint(width, height, layers, samplesPerAxis = 3) {
  const rgba = new Uint8Array(width * height * 4);
  const step = 1 / samplesPerAxis;
  const offset = step / 2;
  const total = samplesPerAxis * samplesPerAxis;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let r = 0;
      let g = 0;
      let b = 0;
      let covered = 0;

      for (let sy = 0; sy < samplesPerAxis; sy += 1) {
        for (let sx = 0; sx < samplesPerAxis; sx += 1) {
          const px = x + offset + sx * step;
          const py = y + offset + sy * step;
          let hit = null;
          for (const layer of layers) {
            if (layer.shape(px, py)) hit = layer;
          }
          if (!hit) continue;
          const color = typeof hit.fill === 'function' ? hit.fill(px, py) : hit.fill;
          r += color[0];
          g += color[1];
          b += color[2];
          covered += 1;
        }
      }

      const index = (y * width + x) * 4;
      if (covered === 0) continue;
      rgba[index] = Math.round(r / covered);
      rgba[index + 1] = Math.round(g / covered);
      rgba[index + 2] = Math.round(b / covered);
      rgba[index + 3] = Math.round((covered / total) * 255);
    }
  }

  return rgba;
}

/* ----------------------------------------------------------------- tree */

/**
 * The tree itself, laid out inside a square box of `size` at `(x, y)`.
 *
 * Proportions are fractions of the box, so the same numbers hold at 192px and
 * at 512px. The roots are not decoration: half this game happens underground,
 * and an icon showing only a canopy would be advertising a different one.
 */
export function treeLayers(x, y, size, { groundLine = 0.78 } = {}) {
  const u = (value) => x + value * size;
  const v = (value) => y + value * size;
  const s = (value) => value * size;
  const ground = v(groundLine);

  return [
    // Roots first: drawn under the trunk so the joins disappear behind it.
    {
      shape: capsule(u(0.5), ground - s(0.02), u(0.3), v(0.95), s(0.028)),
      fill: GLYPH_COLORS.root,
    },
    {
      shape: capsule(u(0.5), ground - s(0.02), u(0.71), v(0.93), s(0.026)),
      fill: GLYPH_COLORS.root,
    },
    { shape: capsule(u(0.5), ground, u(0.52), v(0.99), s(0.02)), fill: GLYPH_COLORS.root },

    // Trunk and its two limbs.
    { shape: taper(u(0.5), v(0.34), v(0.84), s(0.045), s(0.085)), fill: GLYPH_COLORS.bark },
    { shape: capsule(u(0.5), v(0.56), u(0.28), v(0.42), s(0.036)), fill: GLYPH_COLORS.bark },
    { shape: capsule(u(0.5), v(0.5), u(0.73), v(0.37), s(0.034)), fill: GLYPH_COLORS.bark },
    // A sunlit edge down the right of the trunk, which is what stops the
    // silhouette reading as a flat brown post at 192px.
    {
      shape: taper(u(0.545), v(0.36), v(0.82), s(0.014), s(0.026)),
      fill: GLYPH_COLORS.barkHighlight,
    },

    // Canopy: shade first, then the body, then the highlight facing the sun.
    { shape: circle(u(0.5), v(0.3), s(0.235)), fill: GLYPH_COLORS.leafShade },
    { shape: circle(u(0.26), v(0.4), s(0.15)), fill: GLYPH_COLORS.leafShade },
    { shape: circle(u(0.75), v(0.35), s(0.16)), fill: GLYPH_COLORS.leafShade },
    { shape: circle(u(0.5), v(0.28), s(0.215)), fill: GLYPH_COLORS.leaf },
    { shape: circle(u(0.26), v(0.385), s(0.132)), fill: GLYPH_COLORS.leaf },
    { shape: circle(u(0.75), v(0.335), s(0.142)), fill: GLYPH_COLORS.leaf },
    { shape: circle(u(0.44), v(0.21), s(0.1)), fill: GLYPH_COLORS.leafHighlight },
    { shape: circle(u(0.71), v(0.29), s(0.055)), fill: GLYPH_COLORS.leafHighlight },
  ];
}

/**
 * A square app icon: sky, soil, tree.
 *
 * `padding` is the fraction of the canvas left empty around the artwork —
 * `0.06` for the plain icons, and considerably more for the maskable one, which
 * Android is entitled to crop to a circle inscribed in the middle 80%.
 */
export function renderIcon(size, { padding = 0.06, cornerRadius = 0.22 } = {}) {
  const inset = size * padding;
  const box = size - inset * 2;
  const ground = inset + box * 0.78;

  const layers = [
    {
      shape: roundedRect(inset, inset, box, box, size * cornerRadius),
      fill: verticalGradient(inset, ground, GLYPH_COLORS.skyTop, GLYPH_COLORS.skyBottom),
    },
    {
      shape: (px, py) =>
        py >= ground && roundedRect(inset, inset, box, box, size * cornerRadius)(px, py),
      fill: verticalGradient(ground, inset + box, GLYPH_COLORS.soilTop, GLYPH_COLORS.soilBottom),
    },
    { shape: circle(inset + box * 0.83, inset + box * 0.15, box * 0.075), fill: GLYPH_COLORS.sun },
    ...treeLayers(inset, inset, box).map((layer) => ({
      ...layer,
      // Clip to the card, so a root never runs off the rounded corner.
      shape: (px, py) =>
        layer.shape(px, py) && roundedRect(inset, inset, box, box, size * cornerRadius)(px, py),
    })),
  ];

  return paint(size, size, layers);
}

/**
 * The social card: the same tree on a wide gradient, with two hill bands for
 * depth. A placeholder by design — it carries no text, because a title drawn
 * without a font renderer looks worse than no title at all, and the tree is the
 * part a link preview needs to be recognisable by.
 */
export function renderSocialCard(width, height) {
  const ground = height * 0.78;
  const boxSize = height * 0.86;
  const boxX = (width - boxSize) / 2;
  const boxY = height * 0.05;
  // Line the tree's own ground up with the card's, so the roots go under the
  // soil rather than standing on it.
  const groundLine = (ground - boxY) / boxSize;

  return paint(width, height, [
    {
      shape: everywhere,
      fill: verticalGradient(0, ground, GLYPH_COLORS.skyTop, GLYPH_COLORS.skyBottom),
    },
    { shape: circle(width * 0.86, height * 0.2, height * 0.075), fill: GLYPH_COLORS.sun },
    {
      shape: (px, py) =>
        py >= ground - height * 0.09 + Math.sin(px / (width * 0.09)) * height * 0.02,
      fill: GLYPH_COLORS.hillFar,
    },
    {
      shape: (px, py) =>
        py >= ground - height * 0.045 + Math.cos(px / (width * 0.07)) * height * 0.015,
      fill: GLYPH_COLORS.hillNear,
    },
    {
      shape: (_px, py) => py >= ground,
      fill: verticalGradient(ground, height, GLYPH_COLORS.soilTop, GLYPH_COLORS.soilBottom),
    },
    ...treeLayers(boxX, boxY, boxSize, { groundLine }),
  ]);
}
