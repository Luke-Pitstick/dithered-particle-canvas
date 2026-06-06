import type {
  BuiltInFilterConfig,
  DitherConfig,
  DitheredLayer,
  QualityConfig,
  RevealInteractionConfig
} from "../../types";

export type RenderBackendName = "webgl2" | "canvas2d";

export type RenderSize = {
  width: number;
  height: number;
  dpr?: number;
};

export type PointerSnapshot = {
  x: number;
  y: number;
  active: boolean;
  pressure?: number;
  fade?: number;
};

export type RenderFrame = {
  time: number;
  deltaTime: number;
  dirty?: boolean;
  revealLayer?: LayerRole;
};

export type LayerRole = "background" | "foreground";

export type LayerFit = NonNullable<DitheredLayer["fit"]>;

export type LayerPosition = NonNullable<DitheredLayer["position"]>;

export type NormalizedSourceKind =
  | "image-data"
  | "image-bitmap"
  | "html-image"
  | "url"
  | "blob";

export type NormalizedLayerSource = {
  kind: NormalizedSourceKind;
  width: number;
  height: number;
  imageData?: ImageData;
  bitmap?: ImageBitmap;
  element?: HTMLImageElement;
  url?: string;
  blob?: Blob;
  firstFrameOnly?: boolean;
};

export type NormalizedLayer = {
  role: LayerRole;
  source: NormalizedLayerSource;
  visible: boolean;
  fit: LayerFit;
  position: LayerPosition;
  opacity: number;
  dither: DitherConfig | false;
  filters: BuiltInFilterConfig[];
  reveal: RevealInteractionConfig | false;
};

export type NormalizedLayers = Partial<Record<LayerRole, NormalizedLayer>>;

export type RendererIssueCode =
  | "SOURCE_DECODE_FAILED"
  | "INVALID_COLOR"
  | "CANVAS_UNAVAILABLE"
  | "BACKEND_UNAVAILABLE"
  | "WEBGL_SHADER_COMPILE_FAILED"
  | "WEBGL_PROGRAM_LINK_FAILED"
  | "WEBGL_CONTEXT_RESTORE_FAILED";

export class RendererError extends Error {
  readonly code: RendererIssueCode;
  readonly cause?: unknown;
  readonly fix?: string;
  readonly problem: string;

  constructor({
    cause,
    code,
    fix,
    problem
  }: {
    cause?: unknown;
    code: RendererIssueCode;
    fix?: string;
    problem: string;
  }) {
    super(problem);
    this.name = "RendererError";
    this.code = code;
    this.cause = cause;
    this.fix = fix;
    this.problem = problem;
  }
}

export type RenderBackend = {
  readonly name: RenderBackendName;
  init(canvas: HTMLCanvasElement, size: RenderSize): void;
  setLayers(layers: NormalizedLayers): void;
  setPointer(pointer: PointerSnapshot): void;
  resize(size: RenderSize): void;
  render(frame: RenderFrame): void;
  exportFrame?(type: "image/png" | "image/jpeg"): Promise<Blob>;
  dispose(): void;
};

export type RendererQuality = QualityConfig;

export const DEFAULT_REVEAL: Required<RevealInteractionConfig> = {
  edgeDither: 0.55,
  fadeMs: 450,
  mode: "reveal",
  radius: 150,
  softness: 0.35,
  strength: 1
};
