import { describe, expect, it } from 'vitest';
import { distanceToSegment, hitTestSegments, nearestSegment, type Segment } from './geometry';

const vertical: Segment = { a: { x: 0, y: 0 }, b: { x: 0, y: 100 } };

describe('distanceToSegment', () => {
  it('measures perpendicular distance to a point beside the segment', () => {
    expect(distanceToSegment({ x: 12, y: 50 }, vertical)).toBe(12);
  });

  it('is zero on the segment itself', () => {
    expect(distanceToSegment({ x: 0, y: 33 }, vertical)).toBe(0);
  });

  it('clamps past the endpoints instead of using the infinite line', () => {
    // 40 above the top end: the infinite line would report 0.
    expect(distanceToSegment({ x: 0, y: 140 }, vertical)).toBe(40);
    expect(distanceToSegment({ x: 3, y: -4 }, vertical)).toBe(5);
  });

  it('handles a degenerate zero-length segment as a point', () => {
    const point: Segment = { a: { x: 5, y: 5 }, b: { x: 5, y: 5 } };
    expect(distanceToSegment({ x: 8, y: 9 }, point)).toBe(5);
  });

  it('works on diagonals', () => {
    const diagonal: Segment = { a: { x: 0, y: 0 }, b: { x: 10, y: 10 } };
    expect(distanceToSegment({ x: 0, y: 10 }, diagonal)).toBeCloseTo(Math.sqrt(50), 10);
  });
});

describe('nearestSegment', () => {
  it('returns null for an empty set', () => {
    expect(nearestSegment({ x: 0, y: 0 }, [])).toBeNull();
  });

  it('picks the closest segment', () => {
    const far: Segment = { a: { x: 200, y: 0 }, b: { x: 200, y: 100 } };
    const result = nearestSegment({ x: 20, y: 50 }, [far, vertical]);
    expect(result?.segment).toBe(vertical);
    expect(result?.distance).toBe(20);
  });
});

describe('hitTestSegments', () => {
  const trunk = { ...vertical, id: 'trunk', width: 20 };
  const twig = { a: { x: 100, y: 0 }, b: { x: 100, y: 60 }, id: 'twig', width: 2 };

  it('hits within the tolerance', () => {
    // 16px to the side of a 2px-wide twig: inside the 16 + 1 = 17px reach.
    expect(hitTestSegments({ x: 116, y: 30 }, [twig], 16)?.id).toBe('twig');
  });

  it('misses beyond the tolerance', () => {
    expect(hitTestSegments({ x: 40, y: 50 }, [twig], 16)).toBeNull();
  });

  it('counts a segment’s own half-width on top of the tolerance', () => {
    // 16px tolerance + half of the trunk's 20px width = 26px reach.
    expect(hitTestSegments({ x: 26, y: 50 }, [trunk], 16)?.id).toBe('trunk');
    expect(hitTestSegments({ x: 27, y: 50 }, [trunk], 16)).toBeNull();
  });

  it('returns the nearest of several segments in range', () => {
    const near = { a: { x: 4, y: 0 }, b: { x: 4, y: 100 }, id: 'near', width: 0 };
    const alsoNear = { a: { x: 10, y: 0 }, b: { x: 10, y: 100 }, id: 'far', width: 0 };
    expect(hitTestSegments({ x: 5, y: 50 }, [alsoNear, near], 16)?.id).toBe('near');
  });

  it('returns null when nothing is in range', () => {
    expect(hitTestSegments({ x: 500, y: 500 }, [trunk, twig], 16)).toBeNull();
  });

  it('treats a missing width as zero', () => {
    const widthless: Segment & { id: string } = { ...vertical, id: 'bare' };
    expect(hitTestSegments({ x: 16, y: 10 }, [widthless], 16)?.id).toBe('bare');
    expect(hitTestSegments({ x: 17, y: 10 }, [widthless], 16)).toBeNull();
  });
});
