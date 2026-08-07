import { describe, expect, it } from 'vitest';
import { CLICK_TOLERANCE_PX } from '../engine/clicker';
import { COMBO_FULL_STACKS } from '../engine/combo';
import { hitTestSegments, type Vec2 } from '../engine/geometry';
import { Simulation } from '../engine/simulation';
import { projectTree, treeBounds } from '../engine/tree';
import { TreeGraph } from '../engine/treeGraph';
import { EffectPool } from '../render/effects';
import { computeTreeLayout } from '../render/tree';
import {
  attachTreeInput,
  wheelZoomFactor,
  DRAG_THRESHOLD_PX,
  type PointerEventName,
  type PointerLikeEvent,
  type PointerListener,
  type PointerSurface,
  type WheelLikeEvent,
  type WheelListener,
} from './treeInput';

/**
 * Stand-in for the canvas element. Records listeners so tests can dispatch
 * synthetic pointer events in the node environment.
 */
class FakeSurface implements PointerSurface {
  private readonly listeners = new Map<PointerEventName, Set<PointerListener>>();
  private readonly wheelListeners = new Set<WheelListener>();
  left = 0;
  top = 0;
  preventedCount = 0;

  addEventListener(
    type: PointerEventName,
    listener: PointerListener,
    options?: { passive?: boolean },
  ): void;
  addEventListener(type: 'wheel', listener: WheelListener, options?: { passive?: boolean }): void;
  addEventListener(
    type: PointerEventName | 'wheel',
    listener: PointerListener | WheelListener,
  ): void {
    if (type === 'wheel') {
      this.wheelListeners.add(listener as WheelListener);
      return;
    }
    const set = this.listeners.get(type) ?? new Set<PointerListener>();
    set.add(listener as PointerListener);
    this.listeners.set(type, set);
  }

  removeEventListener(type: PointerEventName, listener: PointerListener): void;
  removeEventListener(type: 'wheel', listener: WheelListener): void;
  removeEventListener(
    type: PointerEventName | 'wheel',
    listener: PointerListener | WheelListener,
  ): void {
    if (type === 'wheel') {
      this.wheelListeners.delete(listener as WheelListener);
      return;
    }
    this.listeners.get(type)?.delete(listener as PointerListener);
  }

  getBoundingClientRect(): { readonly left: number; readonly top: number } {
    return { left: this.left, top: this.top };
  }

  get listenerCount(): number {
    let total = this.wheelListeners.size;
    for (const set of this.listeners.values()) total += set.size;
    return total;
  }

  dispatch(type: PointerEventName, event: Partial<PointerLikeEvent> = {}): void {
    const full: PointerLikeEvent = {
      clientX: 0,
      clientY: 0,
      pointerId: 1,
      preventDefault: () => {
        this.preventedCount += 1;
      },
      ...event,
    };
    // Copy: a handler may detach mid-dispatch.
    for (const listener of [...(this.listeners.get(type) ?? [])]) listener(full);
  }

  wheel(event: Partial<WheelLikeEvent> = {}): void {
    const full: WheelLikeEvent = {
      clientX: this.left,
      clientY: this.top,
      deltaX: 0,
      deltaY: 0,
      ctrlKey: false,
      metaKey: false,
      preventDefault: () => {
        this.preventedCount += 1;
      },
      ...event,
    };
    for (const listener of [...this.wheelListeners]) listener(full);
  }

  /** Press, move through a list of offsets, then release. */
  drag(from: Vec2, steps: readonly Vec2[], pointerId = 1): void {
    this.dispatch('pointerdown', {
      clientX: from.x + this.left,
      clientY: from.y + this.top,
      pointerId,
    });
    for (const step of steps) {
      this.dispatch('pointermove', {
        clientX: step.x + this.left,
        clientY: step.y + this.top,
        pointerId,
      });
    }
    const last = steps[steps.length - 1] ?? from;
    this.dispatch('pointerup', {
      clientX: last.x + this.left,
      clientY: last.y + this.top,
      pointerId,
    });
  }

  tap(x: number, y: number, pointerId = 1): void {
    this.dispatch('pointerdown', { clientX: x + this.left, clientY: y + this.top, pointerId });
    this.dispatch('pointerup', { clientX: x + this.left, clientY: y + this.top, pointerId });
  }
}

const CANVAS_W = 800;
const CANVAS_H = 600;
const TREE = TreeGraph.seedling().toSegments();
const SCREEN_TREE = projectTree(TREE, computeTreeLayout(CANVAS_W, CANVAS_H, treeBounds(TREE)));

/** A point that is definitely on the trunk, just above the ground line. */
const ON_TRUNK: Vec2 = { x: SCREEN_TREE[0].a.x, y: SCREEN_TREE[0].a.y - 10 };
/** A point in the empty soil, far from any wood. */
const OFF_TREE: Vec2 = { x: 8, y: CANVAS_H - 8 };

function setup() {
  const surface = new FakeSurface();
  const sim = new Simulation();
  const effects = new EffectPool();
  const hits: Vec2[] = [];
  const drags: Vec2[] = [];
  const scrolls: Vec2[] = [];
  const zooms: { factor: number; at: Vec2 }[] = [];
  let pointer: Vec2 | null = null;
  let clock = 0;

  const detach = attachTreeInput(surface, {
    hitTest: (point) => hitTestSegments(point, SCREEN_TREE, CLICK_TOLERANCE_PX) !== null,
    onHit: (point) => {
      hits.push(point);
      // Never crit, so payouts are exactly click power × combo.
      const result = sim.click(clock, () => 1);
      effects.spawnHit(point.x, point.y, `+${result.gain.toString()}`, result.crit, clock);
    },
    onPointerMove: (point) => {
      pointer = point;
    },
    onPointerLeave: () => {
      pointer = null;
    },
    onDrag: (dx, dy) => {
      drags.push({ x: dx, y: dy });
    },
    onScroll: (deltaX, deltaY) => {
      scrolls.push({ x: deltaX, y: deltaY });
    },
    onZoom: (factor, at) => {
      zooms.push({ factor, at });
    },
  });

  return {
    surface,
    sim,
    effects,
    hits,
    drags,
    scrolls,
    zooms,
    detach,
    advance: (ms: number) => {
      clock += ms;
    },
    get pointer() {
      return pointer;
    },
  };
}

describe('the hit-test fixtures are sane', () => {
  it('finds wood on the trunk and nothing in the empty soil', () => {
    expect(hitTestSegments(ON_TRUNK, SCREEN_TREE, CLICK_TOLERANCE_PX)).not.toBeNull();
    expect(hitTestSegments(OFF_TREE, SCREEN_TREE, CLICK_TOLERANCE_PX)).toBeNull();
  });
});

describe('zero missed inputs', () => {
  it('registers every one of 100 taps at 10 taps per second', () => {
    const t = setup();

    for (let i = 0; i < 100; i += 1) {
      t.surface.tap(ON_TRUNK.x, ON_TRUNK.y);
      t.advance(100); // 10 Hz
    }

    expect(t.hits).toHaveLength(100);
    expect(t.sim.state.clicks).toBe(100);
  });

  it('holds the combo at its cap through a sustained 10 Hz burst', () => {
    const t = setup();

    for (let i = 0; i < 100; i += 1) {
      t.surface.tap(ON_TRUNK.x, ON_TRUNK.y);
      t.advance(100);
    }

    // 100 ms between taps is well inside the 1500 ms window: nothing decays.
    expect(t.sim.state.combo.stacks).toBe(COMBO_FULL_STACKS);
    // First 50 taps ramp 1→50 stacks, the remaining 50 all pay the ×2 cap.
    const ramp = Array.from({ length: 50 }, (_, i) => 1 + (i + 1) * 0.02).reduce(
      (a, b) => a + b,
      0,
    );
    expect(t.sim.state.resources.amount('sap').toNumber()).toBeCloseTo(ramp + 50 * 2, 6);
  });

  it('does not coalesce taps that share a timestamp', () => {
    const t = setup();
    for (let i = 0; i < 10; i += 1) {
      t.surface.tap(ON_TRUNK.x, ON_TRUNK.y);
    }
    expect(t.sim.state.clicks).toBe(10);
    expect(t.sim.state.combo.stacks).toBe(10);
  });

  it('spawns one feedback burst per tap without unbounded growth', () => {
    const t = setup();
    for (let i = 0; i < 5; i += 1) {
      t.surface.tap(ON_TRUNK.x, ON_TRUNK.y);
    }
    expect(t.effects.activeFloats).toBe(5);
    expect(t.effects.activeRipples).toBe(5);
  });
});

describe('multi-touch', () => {
  it('pays out every simultaneous contact', () => {
    const t = setup();
    // Three fingers land together, then all lift.
    for (const id of [1, 2, 3]) {
      t.surface.dispatch('pointerdown', {
        clientX: ON_TRUNK.x,
        clientY: ON_TRUNK.y,
        pointerId: id,
      });
    }
    expect(t.sim.state.clicks).toBe(3);
    expect(t.hits).toHaveLength(3);
  });

  it('keeps the combo meter visible until the last finger lifts', () => {
    const t = setup();
    t.surface.dispatch('pointerdown', { clientX: ON_TRUNK.x, clientY: ON_TRUNK.y, pointerId: 1 });
    t.surface.dispatch('pointerdown', { clientX: ON_TRUNK.x, clientY: ON_TRUNK.y, pointerId: 2 });

    t.surface.dispatch('pointerup', { pointerId: 1 });
    t.surface.dispatch('pointerleave', { pointerId: 1 });
    expect(t.pointer).not.toBeNull();

    t.surface.dispatch('pointerup', { pointerId: 2 });
    t.surface.dispatch('pointerleave', { pointerId: 2 });
    expect(t.pointer).toBeNull();
  });
});

describe('hit filtering and coordinates', () => {
  it('ignores taps that miss the wood', () => {
    const t = setup();
    t.surface.tap(OFF_TREE.x, OFF_TREE.y);
    expect(t.hits).toHaveLength(0);
    expect(t.sim.state.clicks).toBe(0);
    expect(t.sim.state.resources.amount('sap').toNumber()).toBe(0);
  });

  it('still tracks the pointer on a miss, so the meter follows the cursor', () => {
    const t = setup();
    t.surface.dispatch('pointermove', { clientX: OFF_TREE.x, clientY: OFF_TREE.y });
    expect(t.pointer).toEqual(OFF_TREE);
  });

  it('converts client coordinates into canvas-local ones', () => {
    const t = setup();
    t.surface.left = 120;
    t.surface.top = 40;
    t.surface.tap(ON_TRUNK.x, ON_TRUNK.y); // tap() adds the offset back on
    expect(t.hits[0]).toEqual(ON_TRUNK);
  });

  it('suppresses the browser default on pointerdown', () => {
    const t = setup();
    t.surface.tap(ON_TRUNK.x, ON_TRUNK.y);
    expect(t.surface.preventedCount).toBe(1);
  });
});

describe('detach', () => {
  it('removes every listener it added', () => {
    const t = setup();
    // Five pointer events plus the wheel.
    expect(t.surface.listenerCount).toBe(6);

    t.detach();
    expect(t.surface.listenerCount).toBe(0);

    t.surface.tap(ON_TRUNK.x, ON_TRUNK.y);
    expect(t.sim.state.clicks).toBe(0);
  });
});

describe('camera gestures', () => {
  it('ignores a press that never travels', () => {
    const { surface, drags } = setup();
    surface.drag(OFF_TREE, [OFF_TREE, { x: OFF_TREE.x + 2, y: OFF_TREE.y + 1 }]);
    expect(drags).toEqual([]);
  });

  it('starts panning once the press passes the drag threshold', () => {
    const { surface, drags } = setup();
    const start = { x: 400, y: 300 };
    surface.drag(start, [
      { x: start.x, y: start.y + DRAG_THRESHOLD_PX - 1 },
      { x: start.x, y: start.y + 40 },
      { x: start.x, y: start.y + 70 },
    ]);

    // The sub-threshold move is swallowed; the rest report deltas since the
    // previous position, not since the press.
    expect(drags).toEqual([
      { x: 0, y: 40 - (DRAG_THRESHOLD_PX - 1) },
      { x: 0, y: 30 },
    ]);
  });

  it('still pays out the tap that started the drag', () => {
    const { surface, sim, hits } = setup();
    surface.drag(ON_TRUNK, [
      { x: ON_TRUNK.x + 60, y: ON_TRUNK.y + 60 },
      { x: ON_TRUNK.x + 120, y: ON_TRUNK.y + 120 },
    ]);
    // Taps resolve on pointerdown and are never taken back by a later drag.
    expect(hits).toHaveLength(1);
    expect(sim.state.clicks).toBe(1);
  });

  it('stands down while a second finger is on the glass', () => {
    const { surface, drags } = setup();
    surface.dispatch('pointerdown', { clientX: 100, clientY: 100, pointerId: 1 });
    surface.dispatch('pointerdown', { clientX: 300, clientY: 300, pointerId: 2 });
    surface.dispatch('pointermove', { clientX: 100, clientY: 200, pointerId: 1 });
    expect(drags).toEqual([]);

    // Once the second finger lifts, the first can pan again.
    surface.dispatch('pointerup', { clientX: 300, clientY: 300, pointerId: 2 });
    surface.dispatch('pointermove', { clientX: 100, clientY: 260, pointerId: 1 });
    expect(drags).toHaveLength(1);
  });

  it('forgets a drag once the pointer lifts', () => {
    const { surface, drags } = setup();
    surface.drag({ x: 400, y: 300 }, [{ x: 400, y: 380 }]);
    drags.length = 0;
    // A fresh press starts below threshold again rather than resuming.
    surface.dispatch('pointerdown', { clientX: 400, clientY: 380, pointerId: 1 });
    surface.dispatch('pointermove', { clientX: 402, clientY: 381, pointerId: 1 });
    expect(drags).toEqual([]);
  });

  it('routes a plain wheel to scrolling', () => {
    const { surface, scrolls, zooms } = setup();
    surface.wheel({ deltaX: 5, deltaY: -120 });
    expect(scrolls).toEqual([{ x: 5, y: -120 }]);
    expect(zooms).toEqual([]);
  });

  it('routes a pinch (ctrl+wheel) to zooming, about the cursor', () => {
    const { surface, scrolls, zooms } = setup();
    surface.wheel({ deltaY: -100, ctrlKey: true, clientX: 250, clientY: 120 });
    expect(scrolls).toEqual([]);
    expect(zooms).toHaveLength(1);
    expect(zooms[0].at).toEqual({ x: 250, y: 120 });
    expect(zooms[0].factor).toBeGreaterThan(1);
  });

  it('always swallows the wheel so the page behind cannot scroll', () => {
    const { surface } = setup();
    const before = surface.preventedCount;
    surface.wheel({ deltaY: 40 });
    expect(surface.preventedCount).toBe(before + 1);
  });

  it('detaches its wheel listener too', () => {
    const { surface, detach, scrolls } = setup();
    detach();
    expect(surface.listenerCount).toBe(0);
    surface.wheel({ deltaY: 40 });
    expect(scrolls).toEqual([]);
  });
});

describe('wheelZoomFactor', () => {
  it('zooms in when scrolling up and out when scrolling down', () => {
    expect(wheelZoomFactor(-100)).toBeGreaterThan(1);
    expect(wheelZoomFactor(100)).toBeLessThan(1);
  });

  it('does nothing for no movement', () => {
    expect(wheelZoomFactor(0)).toBe(1);
  });

  it('is symmetric, so a pinch in and back out returns to where it started', () => {
    expect(wheelZoomFactor(-80) * wheelZoomFactor(80)).toBeCloseTo(1);
  });
});
