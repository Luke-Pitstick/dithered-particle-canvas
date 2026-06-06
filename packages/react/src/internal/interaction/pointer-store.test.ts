import { describe, expect, it } from "vitest";
import { RevealPointerStore, normalizePointerPosition } from "./pointer-store";

describe("pointer store", () => {
  it("normalizes CSS pointer coordinates into backing-store pixels", () => {
    expect(
      normalizePointerPosition(
        { clientX: 150, clientY: 90 },
        { height: 100, left: 50, top: 40, width: 200 },
        { dpr: 2, height: 200, width: 400 }
      )
    ).toEqual({ pressure: undefined, x: 200, y: 100 });
  });

  it("keeps the last position while fade decays after leave", () => {
    const store = new RevealPointerStore();

    store.move(
      { clientX: 20, clientY: 30, pressure: 0.5 },
      { height: 100, left: 0, top: 0, width: 100 },
      { height: 200, width: 200 },
      100
    );
    store.leave(200);

    expect(store.getSnapshot({ now: 425, reveal: { fadeMs: 450 } })).toEqual({
      active: false,
      fade: 0.5,
      pressure: 0.5,
      x: 40,
      y: 60
    });
  });

  it("disables inactive fade animation for reduced motion", () => {
    const store = new RevealPointerStore();

    store.move(
      { clientX: 10, clientY: 10 },
      { height: 100, left: 0, top: 0, width: 100 },
      { height: 100, width: 100 },
      0
    );
    store.leave(10);

    expect(store.getSnapshot({ now: 11, reducedMotion: true }).fade).toBe(0);
    expect(store.isFadeActive({ now: 11, reducedMotion: true })).toBe(false);
  });
});
