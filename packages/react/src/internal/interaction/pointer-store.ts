import type { RevealInteractionConfig } from "../../types";
import type { PointerSnapshot, RenderSize } from "../renderer/types";
import { clamp01 } from "../utils/color";
import { getRevealFade, resolveRevealConfig } from "./reveal-mask";

export type PointerClientPosition = {
  clientX: number;
  clientY: number;
  pressure?: number;
};

export type PointerBounds = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export type NormalizedPointerPosition = {
  x: number;
  y: number;
  pressure?: number;
};

export type RevealPointerSnapshotOptions = {
  now?: number;
  reducedMotion?: boolean;
  reveal?: RevealInteractionConfig | false;
};

const EMPTY_POINTER: PointerSnapshot = {
  active: false,
  fade: 0,
  x: 0,
  y: 0
};

export function normalizePointerPosition(
  pointer: PointerClientPosition,
  bounds: PointerBounds,
  size: RenderSize
): NormalizedPointerPosition {
  const scaleX = bounds.width > 0 ? size.width / bounds.width : 1;
  const scaleY = bounds.height > 0 ? size.height / bounds.height : 1;

  return {
    pressure: pointer.pressure,
    x: (pointer.clientX - bounds.left) * scaleX,
    y: (pointer.clientY - bounds.top) * scaleY
  };
}

export class RevealPointerStore {
  #hasPosition = false;
  #inactiveSince = 0;
  #snapshot: PointerSnapshot = { ...EMPTY_POINTER };

  getSnapshot({
    now = 0,
    reducedMotion = false,
    reveal
  }: RevealPointerSnapshotOptions = {}): PointerSnapshot {
    if (!this.#hasPosition) {
      return { ...this.#snapshot };
    }

    const fadeMs = resolveRevealConfig(reveal).fadeMs;
    const fade = getRevealFade({
      active: this.#snapshot.active,
      elapsedSinceInactiveMs: now - this.#inactiveSince,
      fadeMs,
      reducedMotion
    });

    this.#snapshot = {
      ...this.#snapshot,
      fade
    };

    return { ...this.#snapshot };
  }

  isFadeActive(options: RevealPointerSnapshotOptions = {}): boolean {
    const snapshot = this.getSnapshot(options);

    return !snapshot.active && clamp01(snapshot.fade ?? 0) > 0;
  }

  move(
    pointer: PointerClientPosition,
    bounds: PointerBounds,
    size: RenderSize,
    now = 0
  ): PointerSnapshot {
    const normalized = normalizePointerPosition(pointer, bounds, size);
    this.#hasPosition = true;
    this.#inactiveSince = now;
    this.#snapshot = {
      active: true,
      fade: 1,
      pressure: normalized.pressure,
      x: normalized.x,
      y: normalized.y
    };

    return { ...this.#snapshot };
  }

  leave(now = 0): PointerSnapshot {
    if (!this.#hasPosition) {
      return { ...this.#snapshot };
    }

    this.#inactiveSince = now;
    this.#snapshot = {
      ...this.#snapshot,
      active: false,
      fade: 1
    };

    return { ...this.#snapshot };
  }

  clear(): PointerSnapshot {
    this.#hasPosition = false;
    this.#inactiveSince = 0;
    this.#snapshot = { ...EMPTY_POINTER };

    return { ...this.#snapshot };
  }
}
