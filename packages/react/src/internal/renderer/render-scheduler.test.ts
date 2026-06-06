import { describe, expect, it } from "vitest";
import type { RenderFrame } from "./types";
import { DirtyRenderLoop } from "./render-loop";

type ScheduledFrame = {
  callback: FrameRequestCallback;
  handle: number;
};

function createRafHarness() {
  const scheduled: ScheduledFrame[] = [];
  let nextHandle = 1;

  return {
    cancelAnimationFrame(handle: number) {
      const index = scheduled.findIndex((frame) => frame.handle === handle);

      if (index >= 0) {
        scheduled.splice(index, 1);
      }
    },
    flush(time: number) {
      const frame = scheduled.shift();

      if (!frame) {
        throw new Error("No RAF frame scheduled.");
      }

      frame.callback(time);
    },
    get scheduledCount() {
      return scheduled.length;
    },
    requestAnimationFrame(callback: FrameRequestCallback) {
      const handle = nextHandle;
      nextHandle += 1;
      scheduled.push({ callback, handle });

      return handle;
    }
  };
}

describe("DirtyRenderLoop", () => {
  it("renders one dirty frame and returns to idle for static content", () => {
    const raf = createRafHarness();
    const frames: RenderFrame[] = [];
    const loop = new DirtyRenderLoop({
      cancelAnimationFrame: raf.cancelAnimationFrame,
      render: (frame) => frames.push(frame),
      requestAnimationFrame: raf.requestAnimationFrame
    });

    loop.markDirty("source");

    expect(loop.getStatus().state).toBe("scheduled");
    expect(raf.scheduledCount).toBe(1);

    raf.flush(100);

    expect(frames).toHaveLength(1);
    expect(frames[0]).toMatchObject({ deltaTime: 0, dirty: true, time: 100 });
    expect(loop.getStatus()).toMatchObject({
      dirty: false,
      frameCount: 1,
      isActive: false,
      state: "idle"
    });
    expect(raf.scheduledCount).toBe(0);
  });

  it("continues RAF bursts during reveal fade and stops once fade is done", () => {
    const raf = createRafHarness();
    const frames: RenderFrame[] = [];
    const loop = new DirtyRenderLoop({
      cancelAnimationFrame: raf.cancelAnimationFrame,
      render: (frame) => frames.push(frame),
      requestAnimationFrame: raf.requestAnimationFrame,
      shouldContinue: (time) => time < 450
    });

    loop.markDirty("pointer");
    raf.flush(0);
    raf.flush(200);
    raf.flush(450);

    expect(frames.map((frame) => frame.time)).toEqual([0, 200, 450]);
    expect(frames.map((frame) => frame.dirty)).toEqual([true, false, false]);
    expect(loop.getStatus()).toMatchObject({
      frameCount: 3,
      isActive: false,
      state: "idle"
    });
    expect(raf.scheduledCount).toBe(0);
  });

  it("coalesces multiple dirty events into one scheduled frame", () => {
    const raf = createRafHarness();
    let renderCount = 0;
    const loop = new DirtyRenderLoop({
      cancelAnimationFrame: raf.cancelAnimationFrame,
      render: () => {
        renderCount += 1;
      },
      requestAnimationFrame: raf.requestAnimationFrame
    });

    loop.markDirty("resize");
    loop.markDirty("pointer");
    loop.markDirty("quality");

    expect(raf.scheduledCount).toBe(1);

    raf.flush(16);

    expect(renderCount).toBe(1);
    expect(loop.getStatus().state).toBe("idle");
  });

  it("cancels scheduled RAF on pause and resumes if work is still dirty", () => {
    const raf = createRafHarness();
    let renderCount = 0;
    const loop = new DirtyRenderLoop({
      cancelAnimationFrame: raf.cancelAnimationFrame,
      render: () => {
        renderCount += 1;
      },
      requestAnimationFrame: raf.requestAnimationFrame
    });

    loop.markDirty("manual");
    loop.pause();

    expect(loop.getStatus()).toMatchObject({
      dirty: true,
      isActive: false,
      state: "paused"
    });
    expect(raf.scheduledCount).toBe(0);

    loop.resume();
    raf.flush(32);

    expect(renderCount).toBe(1);
    expect(loop.getStatus().state).toBe("idle");
  });

  it("emits an active test signal when scheduling starts and stops", () => {
    const raf = createRafHarness();
    const activeChanges: boolean[] = [];
    const loop = new DirtyRenderLoop({
      cancelAnimationFrame: raf.cancelAnimationFrame,
      onActiveChange: (active) => activeChanges.push(active),
      render: () => undefined,
      requestAnimationFrame: raf.requestAnimationFrame
    });

    loop.markDirty("manual");
    raf.flush(1);

    expect(activeChanges).toEqual([true, false]);
  });
});
