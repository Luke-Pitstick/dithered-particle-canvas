import type { RenderFrame } from "./types";

export type RenderLoopState = "idle" | "scheduled" | "rendering" | "paused" | "disposed";

export type RenderLoopDirtyReason =
  | "context-restored"
  | "export"
  | "manual"
  | "pointer"
  | "quality"
  | "resize"
  | "source";

export type RenderLoopStatus = {
  dirty: boolean;
  frameCount: number;
  isActive: boolean;
  state: RenderLoopState;
};

export type RenderLoopOptions = {
  cancelAnimationFrame?: (handle: number) => void;
  now?: () => number;
  onActiveChange?: (active: boolean) => void;
  render: (frame: RenderFrame) => void;
  requestAnimationFrame?: (callback: FrameRequestCallback) => number;
  shouldContinue?: (time: number) => boolean;
};

const defaultNow = (): number => performance.now();
const defaultRequestAnimationFrame = (callback: FrameRequestCallback): number => {
  if (typeof globalThis.requestAnimationFrame === "function") {
    return globalThis.requestAnimationFrame(callback);
  }

  return globalThis.setTimeout(() => callback(defaultNow()), 16) as unknown as number;
};
const defaultCancelAnimationFrame = (handle: number): void => {
  if (typeof globalThis.cancelAnimationFrame === "function") {
    globalThis.cancelAnimationFrame(handle);
    return;
  }

  globalThis.clearTimeout(handle);
};

export class DirtyRenderLoop {
  #cancelAnimationFrame: (handle: number) => void;
  #dirty = false;
  #frameCount = 0;
  #lastTime: number | undefined;
  #now: () => number;
  #onActiveChange: ((active: boolean) => void) | undefined;
  #rafHandle: number | undefined;
  #render: (frame: RenderFrame) => void;
  #requestAnimationFrame: (callback: FrameRequestCallback) => number;
  #shouldContinue: (time: number) => boolean;
  #state: RenderLoopState = "idle";

  constructor({
    cancelAnimationFrame = defaultCancelAnimationFrame,
    now = defaultNow,
    onActiveChange,
    render,
    requestAnimationFrame = defaultRequestAnimationFrame,
    shouldContinue = () => false
  }: RenderLoopOptions) {
    this.#cancelAnimationFrame = cancelAnimationFrame;
    this.#now = now;
    this.#onActiveChange = onActiveChange;
    this.#render = render;
    this.#requestAnimationFrame = requestAnimationFrame;
    this.#shouldContinue = shouldContinue;
  }

  getStatus(): RenderLoopStatus {
    return {
      dirty: this.#dirty,
      frameCount: this.#frameCount,
      isActive: this.#state === "scheduled" || this.#state === "rendering",
      state: this.#state
    };
  }

  markDirty(reason: RenderLoopDirtyReason = "manual"): void {
    void reason;

    if (this.#state === "disposed") {
      return;
    }

    this.#dirty = true;
    this.#schedule();
  }

  pause(): void {
    if (this.#isStopped()) {
      return;
    }

    this.#cancelScheduledFrame();
    this.#setState("paused");
  }

  resume(): void {
    if (this.#state !== "paused") {
      return;
    }

    this.#setState("idle");

    if (this.#dirty || this.#shouldContinue(this.#now())) {
      this.#schedule();
    }
  }

  dispose(): void {
    if (this.#state === "disposed") {
      return;
    }

    this.#cancelScheduledFrame();
    this.#dirty = false;
    this.#setState("disposed");
  }

  #schedule(): void {
    if (
      this.#rafHandle !== undefined ||
      this.#state === "disposed" ||
      this.#state === "paused"
    ) {
      return;
    }

    this.#rafHandle = this.#requestAnimationFrame((time) => {
      this.#tick(time);
    });
    this.#setState("scheduled");
  }

  #tick(time: number): void {
    this.#rafHandle = undefined;

    if (this.#isStopped()) {
      return;
    }

    const wasDirty = this.#dirty;
    const deltaTime = this.#lastTime === undefined ? 0 : Math.max(0, time - this.#lastTime);
    this.#dirty = false;
    this.#setState("rendering");
    this.#render({
      deltaTime,
      dirty: wasDirty,
      time
    });
    this.#frameCount += 1;
    this.#lastTime = time;

    if (this.#isStopped()) {
      return;
    }

    this.#setState("idle");

    if (this.#dirty || this.#shouldContinue(time)) {
      this.#schedule();
    }
  }

  #cancelScheduledFrame(): void {
    if (this.#rafHandle === undefined) {
      return;
    }

    this.#cancelAnimationFrame(this.#rafHandle);
    this.#rafHandle = undefined;
  }

  #isStopped(): boolean {
    return this.#state === "disposed" || this.#state === "paused";
  }

  #setState(state: RenderLoopState): void {
    const wasActive = this.getStatus().isActive;
    this.#state = state;
    const isActive = this.getStatus().isActive;

    if (wasActive !== isActive) {
      this.#onActiveChange?.(isActive);
    }
  }
}
