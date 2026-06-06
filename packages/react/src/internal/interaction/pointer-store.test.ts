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

  it("honors custom fade timing when trails are disabled", () => {
    const fastStore = new RevealPointerStore();

    fastStore.move(
      { clientX: 20, clientY: 30 },
      { height: 100, left: 0, top: 0, width: 100 },
      { height: 100, width: 100 },
      0
    );
    fastStore.leave(10);

    expect(fastStore.getSnapshot({ now: 70, reveal: { fadeMs: 120 } }).fade).toBe(0.5);
    expect(fastStore.getSnapshot({ now: 140, reveal: { fadeMs: 120 } }).fade).toBe(0);

    const slowStore = new RevealPointerStore();

    slowStore.move(
      { clientX: 20, clientY: 30 },
      { height: 100, left: 0, top: 0, width: 100 },
      { height: 100, width: 100 },
      0
    );
    slowStore.leave(10);

    expect(slowStore.getSnapshot({ now: 260, reveal: { fadeMs: 600 } }).fade).toBeGreaterThan(0.5);
  });

  it("uses trail duration for the lifetime of dust remnants", () => {
    const store = new RevealPointerStore();
    const reveal = {
      trail: {
        durationMs: 300,
        idleMs: 80,
        maxPoints: 4,
        spacing: 0
      }
    };

    store.move(
      { clientX: 40, clientY: 40 },
      { height: 100, left: 0, top: 0, width: 100 },
      { height: 100, width: 100 },
      0,
      { reveal }
    );
    store.leave(10, { reveal });

    expect(store.getSnapshot({ now: 150, reveal })).toMatchObject({
      active: false,
      fade: 0
    });
    expect(store.getSnapshot({ now: 150, reveal }).trail?.[0]?.fade).toBe(0.5);
    expect(store.getSnapshot({ now: 330, reveal }).trail).toBeUndefined();
    expect(store.isFadeActive({ now: 330, reveal })).toBe(false);
  });

  it("uses trail dust instead of solid fade after a trail-enabled leave", () => {
    const store = new RevealPointerStore();
    const reveal = {
      fadeMs: 600,
      trail: {
        durationMs: 300,
        idleMs: 80,
        maxPoints: 4,
        spacing: 0
      }
    };

    store.move(
      { clientX: 40, clientY: 40 },
      { height: 100, left: 0, top: 0, width: 100 },
      { height: 100, width: 100 },
      0,
      { reveal }
    );

    const snapshot = store.leave(10, { reveal });

    expect(snapshot.active).toBe(false);
    expect(snapshot.fade).toBe(0);
    expect(snapshot.trail).toHaveLength(1);
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

  it("keeps a bounded reveal trail that fades over time", () => {
    const store = new RevealPointerStore();
    const reveal = {
      trail: {
        durationMs: 100,
        maxPoints: 2,
        spacing: 10
      }
    };

    store.move(
      { clientX: 10, clientY: 10 },
      { height: 100, left: 0, top: 0, width: 100 },
      { height: 100, width: 100 },
      0,
      { reveal }
    );
    store.move(
      { clientX: 12, clientY: 12 },
      { height: 100, left: 0, top: 0, width: 100 },
      { height: 100, width: 100 },
      20,
      { reveal }
    );
    store.move(
      { clientX: 30, clientY: 10 },
      { height: 100, left: 0, top: 0, width: 100 },
      { height: 100, width: 100 },
      40,
      { reveal }
    );

    expect(store.getSnapshot({ now: 50, reveal }).trail).toEqual([
      { fade: 0.5, x: 10, y: 10 },
      { fade: 0.9, x: 30, y: 10 }
    ]);
    const remainingTrail = store.getSnapshot({ now: 101, reveal }).trail ?? [];

    expect(remainingTrail).toHaveLength(1);
    expect(remainingTrail[0]?.x).toBe(30);
    expect(remainingTrail[0]?.y).toBe(10);
    expect(remainingTrail[0]?.fade).toBeCloseTo(0.39);
    expect(store.isFadeActive({ now: 101, reveal })).toBe(true);
    expect(store.isFadeActive({ now: 200, reveal })).toBe(false);
  });

  it("dissolves an idle in-bounds pointer into trail dust", () => {
    const store = new RevealPointerStore();
    const reveal = {
      trail: {
        durationMs: 500,
        idleMs: 80,
        maxPoints: 4,
        spacing: 10
      }
    };

    store.move(
      { clientX: 40, clientY: 40 },
      { height: 100, left: 0, top: 0, width: 100 },
      { height: 100, width: 100 },
      0,
      { reveal }
    );

    expect(store.getSnapshot({ now: 60, reveal })).toMatchObject({
      active: true,
      fade: 1
    });
    expect(store.getSnapshot({ now: 80, reveal })).toMatchObject({
      active: true,
      fade: 1
    });
    expect(store.getSnapshot({ now: 100, reveal })).toMatchObject({
      active: false,
      fade: 0
    });
    expect(store.isFadeActive({ now: 100, reveal })).toBe(true);
  });
});
