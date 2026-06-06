import type { CSSProperties } from "react";

export type LayerSource = string | HTMLImageElement | ImageBitmap | Blob;

export type DitherConfig = {
  amount?: number;
  matrixSize?: 4 | 8;
  pixelSize?: number;
  palette?: string[] | "source" | "mono" | "browserbase";
};

export type BuiltInFilterConfig =
  | { type: "brightness"; amount: number }
  | { type: "contrast"; amount: number }
  | { type: "paletteQuantize"; colors: string[]; amount?: number }
  | { type: "posterize"; levels: number }
  | { type: "tint"; color: string; amount: number }
  | { type: "opacity"; amount: number };

export type RevealTrailConfig = {
  durationMs?: number;
  idleMs?: number;
  maxPoints?: number;
  spacing?: number;
  strength?: number;
};

export type RevealInteractionConfig = {
  mode?: "reveal";
  radius?: number;
  strength?: number;
  softness?: number;
  edgeDither?: number;
  edgeNoise?: number;
  fadeMs?: number;
  trail?: boolean | RevealTrailConfig;
};

export type DitheredLayer = {
  src: LayerSource;
  visible?: boolean;
  fit?: "cover" | "contain" | "stretch" | "none";
  position?: "center" | { x: number; y: number };
  opacity?: number;
  dither?: DitherConfig | false;
  filters?: BuiltInFilterConfig[];
  reveal?: boolean | RevealInteractionConfig;
};

export type QualityConfig =
  | "auto"
  | "low"
  | "medium"
  | "high"
  | {
      resolutionScale?: number;
      maxTextureSize?: number;
      targetFps?: 30 | 60;
      backend?: "auto" | "webgl2" | "canvas2d";
    };

export type DitheredCanvasHandle = {
  pause(): void;
  resume(): void;
  exportFrame(type?: "image/png" | "image/jpeg"): Promise<Blob>;
};

export type DitheredCanvasStats = {
  backend: "webgl2" | "canvas2d";
  frames: number;
  active: boolean;
};

export type DitheredParticleCanvasProps = {
  foreground?: LayerSource;
  background?: LayerSource;
  revealLayer?: "background" | "foreground";
  preset?: "browserbase";
  quality?: QualityConfig;
  motion?: "auto" | "reduced" | "full";
  layers?: {
    background?: DitheredLayer;
    foreground?: DitheredLayer;
  };
  width?: number;
  height?: number;
  className?: string;
  style?: CSSProperties;
  fallback?: string;
  "aria-label"?: string;
  onReady?: () => void;
  onError?: (error: Error) => void;
  onStats?: (stats: DitheredCanvasStats) => void;
};
