import { describe, expect, it } from 'vitest';
import { Camera, DEFAULT_LIMITS } from './camera';
import { normaliseWheel } from './cameraController';
import { WORLD, ZOOM } from './palette';

function makeCamera(width = 800, height = 600): Camera {
  const camera = new Camera();
  camera.setViewport(width, height);
  return camera;
}

describe('Camera', () => {
  it('maps the world origin to the viewport centre when centred on it', () => {
    const camera = makeCamera();
    camera.setCenter(0, 0);
    expect(camera.worldToScreen(0, 0)).toEqual({ x: 400, y: 300 });
  });

  it('flips the y axis: higher world y is nearer the top of the screen', () => {
    const camera = makeCamera();
    camera.setCenter(0, 0);
    expect(camera.worldToScreen(0, 100).y).toBeLessThan(camera.worldToScreen(0, -100).y);
  });

  it('round-trips screen ↔ world at any zoom', () => {
    const camera = makeCamera();
    for (const zoom of [0.5, 1, 1.75, 2]) {
      camera.setZoom(zoom);
      const world = camera.screenToWorld(123, 456);
      const screen = camera.worldToScreen(world.x, world.y);
      expect(screen.x).toBeCloseTo(123);
      expect(screen.y).toBeCloseTo(456);
    }
  });

  it('pans with the drag: dragging down reveals what is above', () => {
    const camera = makeCamera();
    camera.setCenter(0, 200);
    camera.panByScreen(0, 50);
    expect(camera.center.y).toBe(250);

    camera.panByScreen(30, 0);
    expect(camera.center.x).toBe(-30);
  });

  it('pans one-to-one with the pointer regardless of zoom', () => {
    const camera = makeCamera();
    camera.setZoom(2);
    camera.setCenter(0, 200);
    const before = camera.worldToScreen(0, 200);
    camera.panByScreen(0, 40);
    const after = camera.worldToScreen(0, 200);
    // The world point followed the drag exactly 40 CSS pixels down the screen.
    expect(after.y - before.y).toBeCloseTo(40);
  });

  it('clamps zoom to the configured range', () => {
    const camera = makeCamera();
    camera.setZoom(50);
    expect(camera.zoom).toBe(ZOOM.max);
    camera.setZoom(0.01);
    expect(camera.zoom).toBe(ZOOM.min);
  });

  it('keeps the point under the cursor anchored while zooming', () => {
    const camera = makeCamera();
    camera.setCenter(0, 150);
    const anchor = camera.screenToWorld(200, 100);

    camera.zoomAt(200, 100, 1.5);

    expect(camera.zoom).toBeCloseTo(1.5);
    const screen = camera.worldToScreen(anchor.x, anchor.y);
    expect(screen.x).toBeCloseTo(200);
    expect(screen.y).toBeCloseTo(100);
  });

  it('does not move the view when a zoom step is already at the limit', () => {
    const camera = makeCamera();
    camera.setZoom(ZOOM.max);
    const before = camera.center;
    camera.zoomAt(10, 10, 1.5);
    expect(camera.center).toEqual(before);
    expect(camera.zoom).toBe(ZOOM.max);
  });

  it('clamps panning between cloud level and bedrock', () => {
    const camera = makeCamera();

    camera.setCenter(0, 100000);
    expect(camera.visibleWorldRect().maxY).toBeCloseTo(WORLD.cloudY);

    camera.setCenter(0, -100000);
    expect(camera.visibleWorldRect().minY).toBeCloseTo(WORLD.bedrockY);
  });

  it('clamps horizontal travel around the trunk', () => {
    const camera = makeCamera();
    camera.setCenter(100000, 0);
    expect(camera.center.x).toBe(WORLD.halfWidth);
    camera.setCenter(-100000, 0);
    expect(camera.center.x).toBe(-WORLD.halfWidth);
  });

  it('centres on the world span when the viewport is taller than it', () => {
    // A very tall viewport at minimum zoom sees more than cloud-to-bedrock.
    const camera = makeCamera(400, 4000);
    camera.setZoom(ZOOM.min);
    camera.setCenter(0, 800);
    expect(camera.center.y).toBeCloseTo((WORLD.cloudY + WORLD.bedrockY) / 2);
  });

  it('reports a visible rect that grows as it zooms out', () => {
    const camera = makeCamera();
    camera.setCenter(0, 0);
    camera.setZoom(1);
    const at1x = camera.visibleWorldRect();
    expect(at1x.maxX - at1x.minX).toBeCloseTo(800);

    camera.setZoom(0.5);
    const at05x = camera.visibleWorldRect();
    expect(at05x.maxX - at05x.minX).toBeCloseTo(1600);
  });

  it('adds the requested pixel margin to the visible rect', () => {
    const camera = makeCamera();
    camera.setZoom(2);
    const plain = camera.visibleWorldRect();
    const padded = camera.visibleWorldRect(48);
    // A pixel margin is worth fewer world units the further you are zoomed in.
    expect(plain.minX - padded.minX).toBeCloseTo(24);
  });

  it('re-clamps when the viewport changes size', () => {
    const camera = makeCamera(800, 600);
    camera.setCenter(0, DEFAULT_LIMITS.topY - 300);
    expect(camera.center.y).toBeCloseTo(DEFAULT_LIMITS.topY - 300);

    // A taller viewport shows more sky, so the centre has to come down.
    camera.setViewport(800, 1200);
    expect(camera.center.y).toBeCloseTo(DEFAULT_LIMITS.topY - 600);
  });
});

describe('normaliseWheel', () => {
  it('passes pixel deltas through unchanged', () => {
    expect(normaliseWheel({ deltaX: 3, deltaY: -12, deltaMode: 0 }, 600)).toEqual({
      deltaX: 3,
      deltaY: -12,
    });
  });

  it('converts line and page deltas to pixels', () => {
    expect(normaliseWheel({ deltaX: 0, deltaY: 2, deltaMode: 1 }, 600).deltaY).toBe(32);
    expect(normaliseWheel({ deltaX: 0, deltaY: 1, deltaMode: 2 }, 600).deltaY).toBe(600);
  });
});
