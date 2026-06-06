import type { RevealInteractionConfig } from "../../types";
import type { PointerSnapshot, RenderSize, RevealTrailPoint } from "../renderer/types";
import { clamp01 } from "../utils/color";
import { getRevealFade, resolveRevealConfig, resolveRevealTrailConfig } from "./reveal-mask";

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

type InternalTrailPoint = {
  time: number;
  x: number;
  y: number;
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
  #trail: InternalTrailPoint[] = [];

  getSnapshot({
    now = 0,
    reducedMotion = false,
    reveal
  }: RevealPointerSnapshotOptions = {}): PointerSnapshot {
    if (!this.#hasPosition) {
      return { ...this.#snapshot };
    }

    const revealConfig = resolveRevealConfig(reveal);
    const fadeMs = revealConfig.fadeMs;
    const fade = getRevealFade({
      active: this.#snapshot.active,
      elapsedSinceInactiveMs: now - this.#inactiveSince,
      fadeMs,
      reducedMotion
    });
    const trail = this.#getTrailSnapshot(now, revealConfig, reducedMotion);

    this.#snapshot = {
      ...this.#snapshot,
      fade,
      trail
    };

    return { ...this.#snapshot };
  }

  isFadeActive(options: RevealPointerSnapshotOptions = {}): boolean {
    const snapshot = this.getSnapshot(options);

    return (
      (!snapshot.active && clamp01(snapshot.fade ?? 0) > 0) ||
      (snapshot.trail?.length ?? 0) > 0
    );
  }

  move(
    pointer: PointerClientPosition,
    bounds: PointerBounds,
    size: RenderSize,
    now = 0,
    options: Omit<RevealPointerSnapshotOptions, "now"> = {}
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
    this.#appendTrailPoint(normalized, now, options);

    return this.getSnapshot({ ...options, now });
  }

  leave(
    now = 0,
    options: Omit<RevealPointerSnapshotOptions, "now"> = {}
  ): PointerSnapshot {
    if (!this.#hasPosition) {
      return { ...this.#snapshot };
    }

    this.#inactiveSince = now;
    this.#snapshot = {
      ...this.#snapshot,
      active: false,
      fade: 1
    };

    return this.getSnapshot({ ...options, now });
  }

  clear(): PointerSnapshot {
    this.#hasPosition = false;
    this.#inactiveSince = 0;
    this.#snapshot = { ...EMPTY_POINTER };
    this.#trail = [];

    return { ...this.#snapshot };
  }

  #appendTrailPoint(
    point: NormalizedPointerPosition,
    now: number,
    { reducedMotion = false, reveal }: Omit<RevealPointerSnapshotOptions, "now">
  ): void {
    const trailConfig = resolveRevealTrailConfig(resolveRevealConfig(reveal).trail);

    if (reducedMotion || !trailConfig || trailConfig.durationMs <= 0 || trailConfig.maxPoints <= 0) {
      this.#trail = [];
      return;
    }

    this.#pruneTrail(now, trailConfig.durationMs);

    const last = this.#trail.at(-1);
    const spacing = Math.max(0, trailConfig.spacing);

    if (
      last &&
      Math.hypot(point.x - last.x, point.y - last.y) < spacing &&
      now - last.time < 80
    ) {
      return;
    }

    this.#trail.push({
      time: now,
      x: point.x,
      y: point.y
    });

    if (this.#trail.length > trailConfig.maxPoints) {
      this.#trail.splice(0, this.#trail.length - trailConfig.maxPoints);
    }
  }

  #getTrailSnapshot(
    now: number,
    reveal: ReturnType<typeof resolveRevealConfig>,
    reducedMotion: boolean
  ): RevealTrailPoint[] | undefined {
    const trailConfig = resolveRevealTrailConfig(reveal.trail);

    if (reducedMotion || !trailConfig || trailConfig.durationMs <= 0) {
      this.#trail = [];
      return undefined;
    }

    this.#pruneTrail(now, trailConfig.durationMs);

    if (this.#trail.length === 0) {
      return undefined;
    }

    return this.#trail
      .map((point) => ({
        fade: clamp01(1 - Math.max(0, now - point.time) / trailConfig.durationMs),
        x: point.x,
        y: point.y
      }))
      .filter((point) => point.fade > 0);
  }

  #pruneTrail(now: number, durationMs: number): void {
    this.#trail = this.#trail.filter((point) => now - point.time < durationMs);
  }
}
