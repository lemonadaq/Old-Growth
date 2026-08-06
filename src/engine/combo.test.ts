import { describe, expect, it } from 'vitest';
import {
  COMBO_BONUS_PER_STACK,
  COMBO_DECAY_MS,
  COMBO_FULL_STACKS,
  COMBO_WINDOW_MS,
  comboDecayFactor,
  comboFill,
  comboMultiplier,
  comboStacksAt,
  createComboState,
  registerComboClick,
} from './combo';

const CAP = COMBO_FULL_STACKS;

describe('combo accumulation', () => {
  it('starts empty and fully decayed', () => {
    const state = createComboState();
    expect(state.stacks).toBe(0);
    expect(comboStacksAt(state, 0)).toBe(0);
    expect(comboFill(state, 0, CAP)).toBe(0);
  });

  it('gains one stack per click inside the window', () => {
    const state = createComboState();
    for (let i = 0; i < 10; i += 1) {
      expect(registerComboClick(state, i * 100, CAP)).toBe(i + 1);
    }
    expect(comboStacksAt(state, 900)).toBe(10);
  });

  it('keeps building while clicks stay just inside the window', () => {
    const state = createComboState();
    let now = 0;
    for (let i = 0; i < 20; i += 1) {
      registerComboClick(state, now, CAP);
      now += COMBO_WINDOW_MS; // exactly on the boundary still counts
    }
    expect(state.stacks).toBe(20);
  });

  it('clamps at the cap no matter how long the chain runs', () => {
    const state = createComboState();
    for (let i = 0; i < CAP + 25; i += 1) {
      registerComboClick(state, i * 100, CAP);
    }
    expect(state.stacks).toBe(CAP);
  });

  it('respects a raised cap from upgrades', () => {
    const state = createComboState();
    for (let i = 0; i < 80; i += 1) {
      registerComboClick(state, i * 100, 60);
    }
    expect(state.stacks).toBe(60);
  });
});

describe('combo decay', () => {
  it('holds full value for the whole click window', () => {
    expect(comboDecayFactor(0)).toBe(1);
    expect(comboDecayFactor(COMBO_WINDOW_MS / 2)).toBe(1);
    expect(comboDecayFactor(COMBO_WINDOW_MS)).toBe(1);
  });

  it('drains linearly between the window and full decay', () => {
    const midpoint = (COMBO_WINDOW_MS + COMBO_DECAY_MS) / 2;
    expect(comboDecayFactor(midpoint)).toBeCloseTo(0.5, 10);
    expect(
      comboDecayFactor(COMBO_WINDOW_MS + (COMBO_DECAY_MS - COMBO_WINDOW_MS) * 0.25),
    ).toBeCloseTo(0.75, 10);
  });

  it('is fully decayed after 3s idle and stays there', () => {
    expect(comboDecayFactor(COMBO_DECAY_MS)).toBe(0);
    expect(comboDecayFactor(COMBO_DECAY_MS + 5000)).toBe(0);

    const state = createComboState();
    for (let i = 0; i < 20; i += 1) registerComboClick(state, i * 100, CAP);
    expect(comboStacksAt(state, 1900 + COMBO_DECAY_MS)).toBe(0);
  });

  it('restarts from a single stack once the meter has fully drained', () => {
    const state = createComboState();
    for (let i = 0; i < 20; i += 1) registerComboClick(state, i * 100, CAP);
    const lastClick = 1900;

    expect(registerComboClick(state, lastClick + COMBO_DECAY_MS, CAP)).toBe(1);
  });

  it('adds to whatever is left when a click lands mid-drain', () => {
    const state = createComboState();
    for (let i = 0; i < 10; i += 1) registerComboClick(state, i * 100, CAP);
    const lastClick = 900; // 10 stacks banked here

    // Half-way through the drain: 10 → 5, plus the new click.
    const midDrain = lastClick + (COMBO_WINDOW_MS + COMBO_DECAY_MS) / 2;
    expect(registerComboClick(state, midDrain, CAP)).toBeCloseTo(6, 10);
  });
});

describe('combo multiplier', () => {
  it('is neutral with no stacks', () => {
    expect(comboMultiplier(0, CAP)).toBe(1);
  });

  it('grants +100% click power at 50 stacks', () => {
    expect(comboMultiplier(COMBO_FULL_STACKS, CAP)).toBeCloseTo(2, 10);
    expect(COMBO_BONUS_PER_STACK).toBeCloseTo(0.02, 10);
  });

  it('scales linearly between empty and full', () => {
    expect(comboMultiplier(25, CAP)).toBeCloseTo(1.5, 10);
    expect(comboMultiplier(10, CAP)).toBeCloseTo(1.2, 10);
  });

  it('keeps paying out past 50 stacks when the cap is raised', () => {
    expect(comboMultiplier(60, 60)).toBeCloseTo(2.2, 10);
  });

  it('never counts stacks above the cap', () => {
    expect(comboMultiplier(999, CAP)).toBeCloseTo(2, 10);
    expect(comboMultiplier(-5, CAP)).toBe(1);
  });
});

describe('combo fill', () => {
  it('reports meter fullness against the current cap', () => {
    const state = createComboState();
    for (let i = 0; i < 25; i += 1) registerComboClick(state, i * 100, CAP);
    expect(comboFill(state, 2400, CAP)).toBeCloseTo(0.5, 10);
    expect(comboFill(state, 2400, 25)).toBe(1);
  });
});
