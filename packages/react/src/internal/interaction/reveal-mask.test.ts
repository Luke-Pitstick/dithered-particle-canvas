import { describe, expect, it } from "vitest";
import type { PointerSnapshot } from "../renderer/types";
import {
  BROWSERBASE_REVEAL_PRESET,
  getDitherThreshold,
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

  it("fades out after pointer leave and clears immediately for reduced motion", () => {
    expect(getRevealFade({ active: true, elapsedSinceInactiveMs: 999 })).toBe(1);
    expect(getRevealFade({ active: false, elapsedSinceInactiveMs: 225, fadeMs: 450 })).toBe(0.5);
    expect(getRevealFade({ active: false, elapsedSinceInactiveMs: 500, fadeMs: 450 })).toBe(0);
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
