import type { RevealInteractionConfig, RevealTrailConfig } from "../../types";
import type { PointerSnapshot } from "../renderer/types";
import { DEFAULT_REVEAL } from "../renderer/types";
import { clamp01 } from "../utils/color";

export const BROWSERBASE_REVEAL_PRESET = DEFAULT_REVEAL;

export const DEFAULT_REVEAL_TRAIL: Required<RevealTrailConfig> = {
  durationMs: 900,
  idleMs: 160,
  maxPoints: 24,
  spacing: 18,
  strength: 0.72
};

const DUST_CELL_SIZE = 2;

export const REVEAL_DITHER_MATRIX = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5]
] as const;

export type ResolvedRevealConfig = Required<RevealInteractionConfig>;
export type ResolvedRevealTrailConfig = Required<RevealTrailConfig>;

export type RevealMaskSample = {
  x: number;
  y: number;
  pointer: PointerSnapshot;
  reveal?: RevealInteractionConfig | false;
};

export type RevealFadeInput = {
  active: boolean;
  elapsedSinceInactiveMs?: number;
  fadeMs?: number;
  reducedMotion?: boolean;
};

export function resolveRevealConfig(
  reveal: RevealInteractionConfig | false | undefined
): ResolvedRevealConfig {
  return {
    ...BROWSERBASE_REVEAL_PRESET,
    ...(reveal || {})
  };
}

export function resolveRevealTrailConfig(
  trail: RevealInteractionConfig["trail"]
): ResolvedRevealTrailConfig | false {
  if (!trail) {
    return false;
  }

  if (trail === true) {
    return DEFAULT_REVEAL_TRAIL;
  }

  return {
    ...DEFAULT_REVEAL_TRAIL,
    ...trail
  };
}

export function getRevealFade({
  active,
  elapsedSinceInactiveMs = 0,
  fadeMs = BROWSERBASE_REVEAL_PRESET.fadeMs,
  reducedMotion = false
}: RevealFadeInput): number {
  if (active) {
    return 1;
  }

  if (reducedMotion || fadeMs <= 0) {
    return 0;
  }

  return clamp01(1 - Math.max(0, elapsedSinceInactiveMs) / fadeMs);
}

export function isRevealFadeActive(pointer: PointerSnapshot): boolean {
  return !pointer.active && clamp01(pointer.fade ?? 0) > 0;
}

export function getRevealMaskAlpha({
  pointer,
  reveal,
  x,
  y
}: RevealMaskSample): number {
  if (!reveal) {
    return 0;
  }

  const config = resolveRevealConfig(reveal);
  const radius = Math.max(0, config.radius);

  if (radius === 0) {
    return 0;
  }

  const distance = Math.hypot(x - pointer.x, y - pointer.y);

  if (distance >= radius) {
    return 0;
  }

  const softness = clamp01(config.softness);
  const softStart = radius * (1 - softness);
  const radialAlpha =
    distance <= softStart
      ? 1
      : 1 - smoothstep(softStart, radius, distance);

  if (radialAlpha <= 0) {
    return 0;
  }

  const edgeDither = clamp01(config.edgeDither);
  const edgeAmount = 1 - radialAlpha;

  if (edgeDither > 0 && edgeAmount > 0 && getDitherThreshold(x, y) < edgeAmount * edgeDither) {
    return 0;
  }

  return clamp01(radialAlpha * clamp01(config.strength) * clamp01(pointer.fade ?? 1));
}

export function getRevealCompositeMaskAlpha(sample: RevealMaskSample): number {
  const baseAlpha = getRevealMaskAlpha(sample);
  const config = resolveRevealConfig(sample.reveal);
  const trailConfig = resolveRevealTrailConfig(config.trail);

  if (!trailConfig) {
    return baseAlpha;
  }

  let trailAlpha = 0;

  for (const point of sample.pointer.trail ?? []) {
    const fade = clamp01(point.fade);
    const seed = point.x * 0.37 + point.y * 0.21;

    if (fade <= 0 || getDustThreshold(sample.x, sample.y, seed) > fade) {
      continue;
    }

    trailAlpha = Math.max(
      trailAlpha,
      getRevealMaskAlpha({
        ...sample,
        pointer: {
          active: false,
          fade: clamp01(trailConfig.strength),
          x: point.x,
          y: point.y
        }
      })
    );
  }

  return Math.max(baseAlpha, trailAlpha);
}

export function getDitherThreshold(x: number, y: number): number {
  const row = modulo(Math.floor(y), REVEAL_DITHER_MATRIX.length);
  const column = modulo(Math.floor(x), REVEAL_DITHER_MATRIX[row].length);

  return (REVEAL_DITHER_MATRIX[row][column] + 0.5) / 16;
}

export function getDustThreshold(x: number, y: number, seed = 0): number {
  const cellX = Math.floor(x / DUST_CELL_SIZE);
  const cellY = Math.floor(y / DUST_CELL_SIZE);
  const value =
    Math.sin(cellX * 12.9898 + cellY * 78.233 + seed * 0.037719) * 43758.5453;

  return value - Math.floor(value);
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  if (edge0 === edge1) {
    return value < edge1 ? 0 : 1;
  }

  const t = clamp01((value - edge0) / (edge1 - edge0));

  return t * t * (3 - 2 * t);
}

function modulo(value: number, size: number): number {
  return ((value % size) + size) % size;
}
