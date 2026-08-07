import { describe, expect, it } from 'vitest';
import {
  BEDROCK_Y,
  CLOUD_LEVEL_Y,
  HORIZONTAL_SPAN,
  MAX_ZOOM,
  MIN_ZOOM,
  cameraFromLayout,
  cameraLayout,
  clampCamera,
  panCamera,
  refitCamera,
  scrollCamera,
  zoomCameraAt,
  type Camera,
  type Viewport,
} from './camera';

const VIEWPORT: Viewport = { width: 800, height: 600 };

/** A camera looking at the ground line, zoomed in enough that panning is legal. */
function camera(overrides: Partial<Camera> = {}): Camera {
  return { x: 0, y: 0, zoom: 1, baseScale: 300, ...overrides };
}

/** The world point currently under a screen point. */
function worldAt(cam: Camera, screen: { x: number; y: number }, viewport = VIEWPORT) {
  const layout = cameraLayout(cam, viewport);
  return {
    x: (screen.x - layout.originX) / layout.scale,
    y: (layout.originY - screen.y) / layout.scale,
  };
}

describe('cameraLayout', () => {
  it('puts the camera target at the centre of the viewport', () => {
    const layout = cameraLayout(camera({ x: 0.5, y: -0.25 }), VIEWPORT);
    expect(layout.originX + 0.5 * layout.scale).toBeCloseTo(400);
    expect(layout.originY - -0.25 * layout.scale).toBeCloseTo(300);
  });

  it('scales by zoom on top of the base scale', () => {
    expect(cameraLayout(camera({ zoom: 2 }), VIEWPORT).scale).toBe(600);
    expect(cameraLayout(camera({ zoom: 0.5 }), VIEWPORT).scale).toBe(150);
  });
});

describe('cameraFromLayout', () => {
  it('round-trips a fitted layout', () => {
    const fitted = { originX: 410, originY: 372, scale: 240 };
    const round = cameraLayout(cameraFromLayout(fitted, VIEWPORT), VIEWPORT);
    expect(round.originX).toBeCloseTo(fitted.originX);
    expect(round.originY).toBeCloseTo(fitted.originY);
    expect(round.scale).toBeCloseTo(fitted.scale);
  });
});

describe('clampCamera', () => {
  it('holds the view between the clouds and the bedrock', () => {
    const zoomed = camera({ baseScale: 600, zoom: 2 });
    const halfHeight = VIEWPORT.height / 2 / (600 * 2);

    expect(clampCamera({ ...zoomed, y: 99 }, VIEWPORT).y).toBeCloseTo(CLOUD_LEVEL_Y - halfHeight);
    expect(clampCamera({ ...zoomed, y: -99 }, VIEWPORT).y).toBeCloseTo(BEDROCK_Y + halfHeight);
  });

  it('holds the view within the horizontal span', () => {
    const zoomed = camera({ baseScale: 600, zoom: 2 });
    const halfWidth = VIEWPORT.width / 2 / (600 * 2);

    expect(clampCamera({ ...zoomed, x: 99 }, VIEWPORT).x).toBeCloseTo(HORIZONTAL_SPAN - halfWidth);
    expect(clampCamera({ ...zoomed, x: -99 }, VIEWPORT).x).toBeCloseTo(
      -HORIZONTAL_SPAN + halfWidth,
    );
  });

  it('centres instead of clamping when the world is smaller than the viewport', () => {
    // Zoomed out far enough that cloud-to-bedrock is shorter than the screen.
    const wide = camera({ baseScale: 60, zoom: MIN_ZOOM, x: 5, y: 5 });
    const clamped = clampCamera(wide, VIEWPORT);
    expect(clamped.y).toBeCloseTo((CLOUD_LEVEL_Y + BEDROCK_Y) / 2);
    expect(clamped.x).toBeCloseTo(0);
  });

  it('keeps zoom within its limits', () => {
    expect(clampCamera(camera({ zoom: 17 }), VIEWPORT).zoom).toBe(MAX_ZOOM);
    expect(clampCamera(camera({ zoom: 0.01 }), VIEWPORT).zoom).toBe(MIN_ZOOM);
  });
});

describe('panCamera', () => {
  it('moves the world with the finger', () => {
    const start = camera({ baseScale: 600, zoom: 2 });
    // Dragging down reveals what is above, so the target rises.
    expect(panCamera(start, 0, 60, VIEWPORT).y).toBeGreaterThan(start.y);
    expect(panCamera(start, 0, -60, VIEWPORT).y).toBeLessThan(start.y);
    // Dragging right pulls the world right, so the target moves left.
    expect(panCamera(start, 60, 0, VIEWPORT).x).toBeLessThan(start.x);
  });

  it('translates screen pixels through the current scale', () => {
    const start = camera({ baseScale: 600, zoom: 2 });
    // 120 screen px at 1200 px per unit is a tenth of a unit.
    expect(panCamera(start, 0, 120, VIEWPORT).y).toBeCloseTo(0.1);
  });

  it('cannot pan past the bedrock', () => {
    const deep = panCamera(camera({ baseScale: 600, zoom: 2 }), 0, 100000, VIEWPORT);
    expect(deep.y).toBeLessThanOrEqual(CLOUD_LEVEL_Y);
    expect(deep.y).toBeGreaterThanOrEqual(BEDROCK_Y);
  });
});

describe('scrollCamera', () => {
  it('scrolls the view the opposite way to a drag', () => {
    const start = camera({ baseScale: 600, zoom: 2 });
    expect(scrollCamera(start, 0, 60, VIEWPORT).y).toBeLessThan(start.y);
    expect(scrollCamera(start, 0, -60, VIEWPORT).y).toBeGreaterThan(start.y);
  });

  it('stays inside the world', () => {
    const scrolled = scrollCamera(camera({ baseScale: 600, zoom: 2 }), 0, 100000, VIEWPORT);
    expect(scrolled.y).toBeGreaterThanOrEqual(BEDROCK_Y);
  });
});

describe('zoomCameraAt', () => {
  it('holds the world point under the cursor still', () => {
    const start = camera({ baseScale: 300, zoom: 1 });
    const cursor = { x: 620, y: 140 };
    const before = worldAt(start, cursor);

    const zoomed = zoomCameraAt(start, cursor, 1.6, VIEWPORT);
    const after = worldAt(zoomed, cursor);

    expect(zoomed.zoom).toBeCloseTo(1.6);
    expect(after.x).toBeCloseTo(before.x, 6);
    expect(after.y).toBeCloseTo(before.y, 6);
  });

  it('is reversible', () => {
    const start = camera({ baseScale: 300, zoom: 1 });
    const cursor = { x: 200, y: 480 };
    const round = zoomCameraAt(
      zoomCameraAt(start, cursor, 1.5, VIEWPORT),
      cursor,
      1 / 1.5,
      VIEWPORT,
    );
    expect(round.zoom).toBeCloseTo(start.zoom);
    expect(round.x).toBeCloseTo(start.x, 6);
    expect(round.y).toBeCloseTo(start.y, 6);
  });

  it('refuses to zoom past its limits and leaves the camera untouched', () => {
    const maxed = camera({ zoom: MAX_ZOOM });
    expect(zoomCameraAt(maxed, { x: 10, y: 10 }, 4, VIEWPORT)).toBe(maxed);

    const floored = camera({ zoom: MIN_ZOOM });
    expect(zoomCameraAt(floored, { x: 10, y: 10 }, 0.1, VIEWPORT)).toBe(floored);
  });

  it('clamps a zoom-out that would push the view out of the world', () => {
    const low = zoomCameraAt(
      camera({ baseScale: 600, zoom: 2, y: CLOUD_LEVEL_Y - 0.5 }),
      { x: 400, y: 0 },
      0.5,
      VIEWPORT,
    );
    expect(low.y).toBeLessThanOrEqual(CLOUD_LEVEL_Y);
  });
});

describe('refitCamera', () => {
  it('keeps the zoom and the target while adopting a new base scale', () => {
    const before = camera({ baseScale: 300, zoom: 1.5, y: 0.4 });
    const after = refitCamera(before, 220, VIEWPORT);
    expect(after.baseScale).toBe(220);
    expect(after.zoom).toBe(1.5);
    expect(after.y).toBeCloseTo(0.4);
  });

  it('re-clamps when the new scale makes the old target illegal', () => {
    const before = camera({ baseScale: 600, zoom: 2, y: CLOUD_LEVEL_Y - 0.2 });
    const after = refitCamera(before, 120, VIEWPORT);
    expect(after.y).toBeLessThanOrEqual(CLOUD_LEVEL_Y);
    expect(after.y).toBeGreaterThanOrEqual(BEDROCK_Y);
  });
});
