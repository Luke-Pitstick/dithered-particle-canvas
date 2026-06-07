import { describe, expect, it } from "vitest";
import type { RevealInteractionConfig } from "../../types";
import type { PointerSnapshot } from "../renderer/types";
import {
  BROWSERBASE_REVEAL_PRESET,
  getDitherThreshold,
  getDustThreshold,
  getEdgeNoise,
  getRevealCompositeMaskAlpha,
  getRevealFade,
  getRevealMaskAlpha
} from "./reveal-mask";

const ACTIVE_POINTER: PointerSnapshot = {
  active: true,
  fade: 1,
  x: 10,
  y: 10
};

describe("reveal mask", () => {
  it("uses a radius cutoff and full-strength soft core", () => {
    const reveal = {
      ...BROWSERBASE_REVEAL_PRESET,
      edgeDither: 0,
      radius: 10,
      softness: 0.5
    };

    expect(getRevealMaskAlpha({ pointer: ACTIVE_POINTER, reveal, x: 10, y: 10 })).toBe(1);
    expect(getRevealMaskAlpha({ pointer: ACTIVE_POINTER, reveal, x: 14, y: 10 })).toBe(1);
    expect(getRevealMaskAlpha({ pointer: ACTIVE_POINTER, reveal, x: 20, y: 10 })).toBe(0);
    expect(getRevealMaskAlpha({ pointer: ACTIVE_POINTER, reveal, x: 21, y: 10 })).toBe(0);
  });

  it("falls off through the softness band", () => {
    const reveal = {
      ...BROWSERBASE_REVEAL_PRESET,
      edgeDither: 0,
      radius: 10,
      softness: 0.5
    };

    const alpha = getRevealMaskAlpha({ pointer: ACTIVE_POINTER, reveal, x: 17.5, y: 10 });

    expect(alpha).toBeGreaterThan(0);
    expect(alpha).toBeLessThan(1);
  });

  it("preserves circular softness when edge noise is disabled", () => {
    const reveal = {
      ...BROWSERBASE_REVEAL_PRESET,
      edgeDither: 0,
      edgeNoise: 0,
      radius: 10,
      softness: 0.5
    };
    const rightEdgeAlpha = getRevealMaskAlpha({ pointer: ACTIVE_POINTER, reveal, x: 19, y: 10 });
    const topEdgeAlpha = getRevealMaskAlpha({ pointer: ACTIVE_POINTER, reveal, x: 10, y: 1 });

    expect(rightEdgeAlpha).toBeCloseTo(topEdgeAlpha, 6);
    expect(rightEdgeAlpha).toBeGreaterThan(0);
    expect(rightEdgeAlpha).toBeLessThan(1);
  });

  it("applies deterministic clamped edge noise near the reveal edge", () => {
    const reveal = {
      ...BROWSERBASE_REVEAL_PRESET,
      edgeDither: 0,
      radius: 10,
      softness: 0.5
    };
    const sample = { pointer: ACTIVE_POINTER, reveal, x: 19, y: 10 };

    expect(getEdgeNoise(19, 10, ACTIVE_POINTER.x, ACTIVE_POINTER.y)).toBe(
      getEdgeNoise(19, 10, ACTIVE_POINTER.x, ACTIVE_POINTER.y)
    );
    expect(getEdgeNoise(19, 10, ACTIVE_POINTER.x, ACTIVE_POINTER.y)).toBeGreaterThanOrEqual(0);
    expect(getEdgeNoise(19, 10, ACTIVE_POINTER.x, ACTIVE_POINTER.y)).toBeLessThan(1);
    expect(
      getRevealMaskAlpha({ ...sample, reveal: { ...reveal, edgeNoise: -1 } })
    ).toBeCloseTo(getRevealMaskAlpha({ ...sample, reveal: { ...reveal, edgeNoise: 0 } }), 6);
    expect(
      getRevealMaskAlpha({ ...sample, reveal: { ...reveal, edgeNoise: 2 } })
    ).toBeCloseTo(getRevealMaskAlpha({ ...sample, reveal: { ...reveal, edgeNoise: 1 } }), 6);
  });

  it("lets same-radius near-edge points differ when edge noise is enabled", () => {
    const reveal = {
      ...BROWSERBASE_REVEAL_PRESET,
      edgeDither: 0,
      edgeNoise: 1,
      radius: 10,
      softness: 0.5
    };

    expect(getRevealMaskAlpha({ pointer: ACTIVE_POINTER, reveal, x: 19, y: 10 })).toBe(0);
    expect(getRevealMaskAlpha({ pointer: ACTIVE_POINTER, reveal, x: 1, y: 10 })).toBeGreaterThan(0);
  });

  it("keeps the reveal core full strength with strong edge noise", () => {
    const reveal = {
      ...BROWSERBASE_REVEAL_PRESET,
      edgeDither: 0,
      edgeNoise: 1,
      radius: 10,
      softness: 0.5
    };

    expect(getRevealMaskAlpha({ pointer: ACTIVE_POINTER, reveal, x: 10, y: 10 })).toBe(1);
    expect(getRevealMaskAlpha({ pointer: ACTIVE_POINTER, reveal, x: 14, y: 10 })).toBe(1);
  });

  it("breaks up the edge with deterministic dither thresholds", () => {
    const reveal = {
      ...BROWSERBASE_REVEAL_PRESET,
      edgeDither: 1,
      radius: 10,
      softness: 1
    };
    const lowThresholdAlpha = getRevealMaskAlpha({
      pointer: ACTIVE_POINTER,
      reveal,
      x: 10,
      y: 16
    });
    const highThresholdAlpha = getRevealMaskAlpha({
      pointer: ACTIVE_POINTER,
      reveal,
      x: 12,
      y: 15
    });

    expect(getDitherThreshold(10, 16)).toBeLessThan(getDitherThreshold(12, 15));
    expect(lowThresholdAlpha).toBe(0);
    expect(highThresholdAlpha).toBeGreaterThan(0);
  });

  it("multiplies mask alpha by pointer fade", () => {
    expect(
      getRevealMaskAlpha({
        pointer: { ...ACTIVE_POINTER, fade: 0.25 },
        reveal: { ...BROWSERBASE_REVEAL_PRESET, edgeDither: 0 },
        x: 10,
        y: 10
      })
    ).toBe(0.25);
  });

  it("turns aged trail points into dithered dust coverage", () => {
    const reveal = {
      ...BROWSERBASE_REVEAL_PRESET,
      edgeDither: 0,
      radius: 10,
      trail: {
        durationMs: 900,
        strength: 0.5
      }
    };
    const seed = 30 * 0.37 + 30 * 0.21;
    const kept = findNearbyDustPixel(seed, (threshold) => threshold <= 0.5);
    const dropped = findNearbyDustPixel(seed, (threshold) => threshold > 0.5);
    const keptAlpha = getRevealMaskAlpha({
      pointer: {
        active: false,
        fade: 0.5,
        x: 30,
        y: 30
      },
      reveal,
      x: kept.x,
      y: kept.y
    });

    expect(
      getRevealCompositeMaskAlpha({
        pointer: {
          ...ACTIVE_POINTER,
          trail: [{ fade: 0.5, x: 30, y: 30 }]
        },
        reveal,
        x: kept.x,
        y: kept.y
      })
    ).toBe(keptAlpha);
    expect(keptAlpha).toBeGreaterThan(0);
    expect(
      getRevealCompositeMaskAlpha({
        pointer: {
          ...ACTIVE_POINTER,
          trail: [{ fade: 0.5, x: 30, y: 30 }]
        },
        reveal,
        x: dropped.x,
        y: dropped.y
      })
    ).toBe(0);
  });

  it("uses trail dust size to group fading particles into larger cells", () => {
    const seed = 14;

    expect(getDustThreshold(8, 8, seed, 6)).toBe(getDustThreshold(11, 11, seed, 6));
    expect(getDustThreshold(8, 8, seed, 2)).not.toBe(getDustThreshold(11, 11, seed, 2));
    expect(getDustThreshold(8, 8, seed, 0)).toBe(getDustThreshold(8, 8, seed, 1));
  });

  it("uses reveal pixel size to group cursor edge samples into larger cells", () => {
    const reveal = {
      ...BROWSERBASE_REVEAL_PRESET,
      edgeDither: 0,
      pixelSize: 4,
      radius: 10,
      softness: 1
    };

    expect(getDitherThreshold(16, 8, 4)).toBe(getDitherThreshold(19, 11, 4));
    expect(getRevealMaskAlpha({ pointer: ACTIVE_POINTER, reveal, x: 17, y: 10 })).toBe(
      getRevealMaskAlpha({ pointer: ACTIVE_POINTER, reveal, x: 19, y: 11 })
    );
  });

  it("keeps pixelated reveal edge dropout stable by default but lets it fluctuate", () => {
    const stableReveal = {
      ...BROWSERBASE_REVEAL_PRESET,
      edgeDither: 1,
      edgeFlicker: 0,
      pixelSize: 4,
      radius: 12,
      softness: 1
    };
    const flickeringReveal = {
      ...stableReveal,
      edgeFlicker: 1
    };
    const flickeringPixel = findFlickeringRevealEdgePixel(flickeringReveal, 0, 96);
    const baseSample = {
      pointer: ACTIVE_POINTER,
      x: flickeringPixel.x,
      y: flickeringPixel.y
    };

    expect(
      getRevealMaskAlpha({
        ...baseSample,
        reveal: stableReveal,
        time: 0
      })
    ).toBe(
      getRevealMaskAlpha({
        ...baseSample,
        reveal: stableReveal,
        time: 960
      })
    );
    expect(
      getRevealMaskAlpha({
        ...baseSample,
        reveal: flickeringReveal,
        time: 0
      })
    ).not.toBe(
      getRevealMaskAlpha({
        ...baseSample,
        reveal: flickeringReveal,
        time: 96
      })
    );
  });

  it("keeps trail dust static by default but lets it fluctuate when configured", () => {
    const trailPoint = { fade: 0.5, x: 30, y: 30 };
    const stableReveal = {
      ...BROWSERBASE_REVEAL_PRESET,
      edgeDither: 0,
      radius: 10,
      trail: {
        dustFlicker: 0,
        durationMs: 900,
        strength: 0.5
      }
    };
    const flickeringReveal = {
      ...stableReveal,
      trail: {
        ...stableReveal.trail,
        dustFlicker: 1
      }
    };
    const flickeringPixel = findFlickeringDustPixel(flickeringReveal, trailPoint, 0, 96);
    const baseSample = {
      pointer: {
        ...ACTIVE_POINTER,
        trail: [trailPoint]
      },
      x: flickeringPixel.x,
      y: flickeringPixel.y
    };

    expect(
      getRevealCompositeMaskAlpha({
        ...baseSample,
        reveal: stableReveal,
        time: 0
      })
    ).toBe(
      getRevealCompositeMaskAlpha({
        ...baseSample,
        reveal: stableReveal,
        time: 960
      })
    );
    expect(
      getRevealCompositeMaskAlpha({
        ...baseSample,
        reveal: flickeringReveal,
        time: 0
      })
    ).not.toBe(
      getRevealCompositeMaskAlpha({
        ...baseSample,
        reveal: flickeringReveal,
        time: 96
      })
    );
  });

  it("fades out after pointer leave and clears immediately for reduced motion", () => {
    expect(getRevealFade({ active: true, elapsedSinceInactiveMs: 999 })).toBe(1);
    expect(getRevealFade({ active: false, elapsedSinceInactiveMs: 225, fadeMs: 450 })).toBe(0.5);
    expect(getRevealFade({ active: false, elapsedSinceInactiveMs: 500, fadeMs: 450 })).toBe(0);
    expect(getRevealFade({ active: false, elapsedSinceInactiveMs: 1, fadeMs: 0 })).toBe(0);
    expect(
      getRevealFade({
        active: false,
        elapsedSinceInactiveMs: 1,
        fadeMs: 450,
        reducedMotion: true
      })
    ).toBe(0);
  });
});

function findNearbyDustPixel(
  seed: number,
  matches: (threshold: number) => boolean
): { x: number; y: number } {
  for (let y = 24; y <= 36; y += 1) {
    for (let x = 24; x <= 36; x += 1) {
      if (Math.hypot(x - 30, y - 30) < 10 && matches(getDustThreshold(x, y, seed))) {
        return { x, y };
      }
    }
  }

  throw new Error("Expected to find a nearby dust pixel for the test threshold.");
}

function findFlickeringDustPixel(
  reveal: RevealInteractionConfig,
  trailPoint: { fade: number; x: number; y: number },
  timeA: number,
  timeB: number
): { x: number; y: number } {
  const pointer = {
    ...ACTIVE_POINTER,
    trail: [trailPoint]
  };

  for (let y = 24; y <= 36; y += 1) {
    for (let x = 24; x <= 36; x += 1) {
      if (Math.hypot(x - trailPoint.x, y - trailPoint.y) >= 10) {
        continue;
      }

      const first = getRevealCompositeMaskAlpha({ pointer, reveal, time: timeA, x, y });
      const second = getRevealCompositeMaskAlpha({ pointer, reveal, time: timeB, x, y });

      if (first !== second) {
        return { x, y };
      }
    }
  }

  throw new Error("Expected to find a nearby dust pixel whose mask fluctuates over time.");
}

function findFlickeringRevealEdgePixel(
  reveal: RevealInteractionConfig,
  timeA: number,
  timeB: number
): { x: number; y: number } {
  for (let y = 0; y <= 22; y += 1) {
    for (let x = 0; x <= 22; x += 1) {
      const first = getRevealMaskAlpha({ pointer: ACTIVE_POINTER, reveal, time: timeA, x, y });
      const second = getRevealMaskAlpha({ pointer: ACTIVE_POINTER, reveal, time: timeB, x, y });

      if (first !== second) {
        return { x, y };
      }
    }
  }

  throw new Error("Expected to find a reveal edge pixel whose dither mask fluctuates over time.");
}
