import { Canvas2DBackend } from "../backends/canvas2d/Canvas2DBackend";
import { WebGL2Backend } from "../backends/webgl2/WebGL2Backend";
import { RevealPointerStore } from "../interaction/pointer-store";
import { normalizeLayer } from "../layers/layer-state";
import {
  normalizeSource,
  type InternalLayerSource,
  type NormalizeSourceOptions
} from "../layers/normalize-source";
import type {
  DitheredLayer,
  DitheredParticleCanvasProps,
  QualityConfig
} from "../../types";
import {
  DEFAULT_REVEAL,
  RendererError,
  type LayerRole,
  type NormalizedLayer,
  type NormalizedLayers,
  type NormalizedLayerSource,
  type PointerSnapshot,
  type RenderBackend,
  type RenderBackendName,
  type RenderSize
} from "./types";
import { DirtyRenderLoop, type RenderLoopDirtyReason } from "./render-loop";

type RafCallback = (time: number) => void;
type Raf = (callback: RafCallback) => number;
type Caf = (id: number) => void;

type ObserverLike = {
  disconnect(): void;
  observe(target: Element): void;
};

type ObserverConstructor = new (callback: () => void) => ObserverLike;
type IntersectionObserverConstructor = new (
  callback: (entries: Array<{ isIntersecting: boolean }>) => void
) => ObserverLike;

type RendererBackendFactory = (name: RenderBackendName) => RenderBackend;

export type DitheredCanvasRenderer = {
  update(props: DitheredParticleCanvasProps): void;
  pause(): void;
  resume(): void;
  exportFrame(type?: "image/png" | "image/jpeg"): Promise<Blob>;
  dispose(): void;
  getSnapshot(): DitheredCanvasRendererSnapshot;
};

export type DitheredCanvasRendererSnapshot = {
  active: boolean;
  backend: RenderBackendName;
  frames: number;
  layersSignature: string | undefined;
  size: RenderSize;
};

export type DitheredCanvasRendererFactory = (options: {
  canvas: HTMLCanvasElement;
  props: DitheredParticleCanvasProps;
}) => DitheredCanvasRenderer;

export type DitheredCanvasRendererOptions = {
  backendFactory?: RendererBackendFactory;
  cancelAnimationFrame?: Caf;
  createImageBitmap?: NormalizeSourceOptions["createImageBitmap"];
  devicePixelRatio?: number;
  IntersectionObserver?: IntersectionObserverConstructor;
  loadImage?: NormalizeSourceOptions["loadImage"];
  matchMedia?: (query: string) => { matches: boolean };
  now?: () => number;
  requestAnimationFrame?: Raf;
  ResizeObserver?: ObserverConstructor;
  warn?: (message: string) => void;
};

type LayerInput = Partial<Record<LayerRole, DitheredLayer>>;

const DEFAULT_SIZE: RenderSize = {
  dpr: 1,
  height: 1,
  width: 1
};

export function createDitheredCanvasRenderer(
  canvas: HTMLCanvasElement,
  props: DitheredParticleCanvasProps,
  options: DitheredCanvasRendererOptions = {}
): DitheredCanvasRenderer {
  return new ReactCanvasRenderer(canvas, props, options);
}

class ReactCanvasRenderer implements DitheredCanvasRenderer {
  #backend: RenderBackend;
  #backendFactory: RendererBackendFactory;
  #backendPreference: RenderBackendName;
  #canvas: HTMLCanvasElement;
  #cancelAnimationFrame: Caf;
  #disposed = false;
  #frameCount = 0;
  #generation = 0;
  #intersectionObserver: ObserverLike | undefined;
  #isPaused = false;
  #isVisible = true;
  #layers: NormalizedLayers = {};
  #layersSignature: string | undefined;
  #motionReduced = false;
  #now: () => number;
  #ownedSources = new Set<NormalizedLayerSource>();
  #pointerStore = new RevealPointerStore();
  #props: DitheredParticleCanvasProps;
  #requestAnimationFrame: Raf;
  #renderLoop: DirtyRenderLoop;
  #resizeObserver: ObserverLike | undefined;
  #size: RenderSize = DEFAULT_SIZE;
  #sourceIds = new WeakMap<object, number>();
  #sourceId = 0;

  constructor(
    canvas: HTMLCanvasElement,
    props: DitheredParticleCanvasProps,
    options: DitheredCanvasRendererOptions
  ) {
    this.#canvas = canvas;
    this.#props = props;
    this.#backendFactory =
      options.backendFactory ??
      ((name) =>
        name === "webgl2"
          ? new WebGL2Backend({ onError: (error) => this.#props.onError?.(error) })
          : new Canvas2DBackend());
    this.#backendPreference = getBackendPreference(props.quality);
    this.#requestAnimationFrame = options.requestAnimationFrame ?? getDefaultRaf();
    this.#cancelAnimationFrame = options.cancelAnimationFrame ?? getDefaultCaf();
    this.#now = options.now ?? (() => performanceNow());

    this.#size = measureCanvas(canvas, props.quality, options.devicePixelRatio);
    this.#backend = this.#createInitializedBackend(this.#backendPreference);
    this.#renderLoop = new DirtyRenderLoop({
      cancelAnimationFrame: this.#cancelAnimationFrame,
      now: this.#now,
      render: (frame) => this.#renderFrame(frame),
      requestAnimationFrame: this.#requestAnimationFrame,
      shouldContinue: (time) => this.#shouldContinueRendering(time)
    });
    this.#installPointerListeners();
    this.#installResizeObserver(options.ResizeObserver);
    this.#installIntersectionObserver(options.IntersectionObserver);
    this.update(props, options);
  }

  update(
    props: DitheredParticleCanvasProps,
    options: DitheredCanvasRendererOptions = {}
  ): void {
    if (this.#disposed) {
      return;
    }

    this.#props = props;
    this.#resizeIfNeeded(options.devicePixelRatio);

    const nextBackendPreference = getBackendPreference(props.quality);

    if (nextBackendPreference !== this.#backendPreference) {
      this.#backendPreference = nextBackendPreference;
      this.#recreateBackend(nextBackendPreference);
    }

    const motionReduced = isReducedMotion(props, options.matchMedia);
    this.#motionReduced = motionReduced;
    const layerInput = resolveLayerInput(props, motionReduced);
    const nextSignature = this.#getLayersSignature(layerInput);

    if (nextSignature === this.#layersSignature) {
      this.#markRenderDirty("manual");
      return;
    }

    this.#layersSignature = nextSignature;
    void this.#normalizeAndApplyLayers(layerInput, options);
  }

  pause(): void {
    this.#isPaused = true;
    this.#renderLoop.pause();
  }

  resume(): void {
    this.#isPaused = false;

    if (this.#isVisible) {
      this.#renderLoop.resume();
      this.#markRenderDirty("manual");
    }
  }

  async exportFrame(type: "image/png" | "image/jpeg" = "image/png"): Promise<Blob> {
    if (this.#backend.exportFrame) {
      return this.#backend.exportFrame(type);
    }

    return canvasToBlob(this.#canvas, type);
  }

  dispose(): void {
    if (this.#disposed) {
      return;
    }

    this.#disposed = true;
    this.#generation += 1;
    this.#renderLoop.dispose();
    this.#canvas.removeEventListener("pointermove", this.#handlePointerMove);
    this.#canvas.removeEventListener("pointerleave", this.#handlePointerLeave);
    this.#resizeObserver?.disconnect();
    this.#intersectionObserver?.disconnect();
    this.#releaseOwnedSources();
    this.#backend.dispose();
  }

  getSnapshot(): DitheredCanvasRendererSnapshot {
    return {
      active: !this.#disposed && !this.#isPaused && this.#isVisible,
      backend: this.#backend.name,
      frames: this.#frameCount,
      layersSignature: this.#layersSignature,
      size: this.#size
    };
  }

  async #normalizeAndApplyLayers(
    input: LayerInput,
    options: DitheredCanvasRendererOptions
  ): Promise<void> {
    const generation = this.#generation + 1;
    this.#generation = generation;

    try {
      const layers: NormalizedLayers = {};
      const ownedSources = new Set<NormalizedLayerSource>();

      for (const role of ["background", "foreground"] as const) {
        const layer = input[role];

        if (!layer) {
          continue;
        }

        const source = await normalizeSource(layer.src as InternalLayerSource, {
          createImageBitmap: options.createImageBitmap,
          loadImage: options.loadImage,
          warn: options.warn
        });

        if (source.kind === "blob") {
          ownedSources.add(source);
        }

        layers[role] = normalizeLayer(role, layer, source);
      }

      if (this.#disposed || generation !== this.#generation) {
        releaseSources(ownedSources);
        return;
      }

      this.#releaseOwnedSources();
      this.#ownedSources = ownedSources;
      this.#layers = layers;
      this.#backend.setLayers(layers);
      this.#markRenderDirty("source");
      this.#props.onReady?.();
    } catch (error) {
      if (!this.#disposed && generation === this.#generation) {
        this.#props.onError?.(toError(error));
      }
    }
  }

  #recreateBackend(nextBackendKey: RenderBackendName): void {
    const previousBackend = this.#backend;
    previousBackend.dispose();
    this.#backend = this.#createInitializedBackend(nextBackendKey);
    this.#backend.setLayers(this.#layers);
    this.#backend.setPointer(this.#pointerStore.getSnapshot());
    this.#markRenderDirty("quality");
  }

  #createInitializedBackend(preference: RenderBackendName): RenderBackend {
    const backend = this.#backendFactory(preference);

    try {
      backend.init(this.#canvas, this.#size);
      return backend;
    } catch (error) {
      if (preference === "canvas2d") {
        throw error;
      }

      this.#props.onError?.(toError(error));
      const fallback = this.#backendFactory("canvas2d");
      fallback.init(this.#canvas, this.#size);
      return fallback;
    }
  }

  #resizeIfNeeded(dprOverride?: number): void {
    const nextSize = measureCanvas(this.#canvas, this.#props.quality, dprOverride);

    if (
      nextSize.width === this.#size.width &&
      nextSize.height === this.#size.height &&
      nextSize.dpr === this.#size.dpr
    ) {
      return;
    }

    this.#size = nextSize;
    this.#backend.resize(nextSize);
    this.#markRenderDirty("resize");
  }

  #markRenderDirty(reason: RenderLoopDirtyReason): void {
    if (this.#disposed) {
      return;
    }

    this.#renderLoop.markDirty(reason);
  }

  #renderFrame(frame: { deltaTime: number; dirty?: boolean; time: number }): void {
    if (this.#disposed || this.#isPaused || !this.#isVisible) {
      return;
    }

    this.#backend.setPointer(this.#getPointerSnapshot(frame.time));
    this.#backend.render({
      ...frame,
      revealLayer: this.#props.revealLayer ?? "background"
    });
    this.#frameCount += 1;
    this.#props.onStats?.({
      active: this.#renderLoop.getStatus().isActive,
      backend: this.#backend.name,
      frames: this.#frameCount
    });
  }

  #shouldContinueRendering(time: number): boolean {
    if (this.#disposed || this.#isPaused || !this.#isVisible) {
      return false;
    }

    return this.#pointerStore.isFadeActive({
      now: time,
      reducedMotion: this.#motionReduced,
      reveal: this.#getRevealConfig()
    });
  }

  #getPointerSnapshot(time = this.#now()): PointerSnapshot {
    return this.#pointerStore.getSnapshot({
      now: time,
      reducedMotion: this.#motionReduced,
      reveal: this.#getRevealConfig()
    });
  }

  #getRevealConfig(): NormalizedLayer["reveal"] | undefined {
    return this.#props.revealLayer === "foreground"
      ? this.#layers.background?.reveal
      : this.#layers.foreground?.reveal;
  }

  #releaseOwnedSources(): void {
    releaseSources(this.#ownedSources);
    this.#ownedSources = new Set();
  }

  #installPointerListeners(): void {
    this.#canvas.addEventListener("pointermove", this.#handlePointerMove);
    this.#canvas.addEventListener("pointerleave", this.#handlePointerLeave);
  }

  #installResizeObserver(ResizeObserverImpl?: ObserverConstructor): void {
    const Observer = ResizeObserverImpl ?? getResizeObserver();

    if (!Observer) {
      return;
    }

    this.#resizeObserver = new Observer(() => {
      this.#resizeIfNeeded();
    });
    this.#resizeObserver.observe(this.#canvas);
  }

  #installIntersectionObserver(IntersectionObserverImpl?: IntersectionObserverConstructor): void {
    const Observer = IntersectionObserverImpl ?? getIntersectionObserver();

    if (!Observer) {
      return;
    }

    this.#intersectionObserver = new Observer((entries) => {
      const [entry] = entries;
      this.#isVisible = entry?.isIntersecting ?? true;

      if (!this.#isVisible) {
        this.#renderLoop.pause();
      } else if (!this.#isPaused) {
        this.#renderLoop.resume();
        this.#markRenderDirty("manual");
      }
    });
    this.#intersectionObserver.observe(this.#canvas);
  }

  #handlePointerMove = (event: PointerEvent): void => {
    const rect = this.#canvas.getBoundingClientRect();
    const pointer = this.#pointerStore.move(
      event,
      rect,
      this.#size,
      this.#now(),
      {
        reducedMotion: this.#motionReduced,
        reveal: this.#getRevealConfig()
      }
    );

    this.#backend.setPointer(pointer);
    this.#markRenderDirty("pointer");
  };

  #handlePointerLeave = (): void => {
    const pointer = this.#pointerStore.leave(this.#now(), {
      reducedMotion: this.#motionReduced,
      reveal: this.#getRevealConfig()
    });

    this.#backend.setPointer(pointer);
    this.#markRenderDirty("pointer");
  };

  #getLayersSignature(input: LayerInput): string {
    return JSON.stringify({
      background: input.background ? this.#serializeLayer(input.background) : null,
      foreground: input.foreground ? this.#serializeLayer(input.foreground) : null
    });
  }

  #serializeLayer(layer: DitheredLayer): unknown {
    return {
      ...layer,
      src: getSourceKey(layer.src, this.#sourceIds, () => {
        this.#sourceId += 1;
        return this.#sourceId;
      })
    };
  }
}

function resolveLayerInput(
  props: DitheredParticleCanvasProps,
  motionReduced: boolean
): LayerInput {
  let background = props.layers?.background ??
    (props.background ? createPresetLayer(props.background, props.preset) : undefined);
  let foreground = props.layers?.foreground ??
    (props.foreground ? createPresetLayer(props.foreground, props.preset) : undefined);
  const revealLayer = props.revealLayer ?? "background";

  if (motionReduced) {
    background = background ? { ...background, reveal: false } : undefined;
    foreground = foreground ? { ...foreground, reveal: false } : undefined;
  } else if (revealLayer === "background") {
    foreground = applyMaskRevealConfig(foreground, background?.reveal);
  } else {
    background = applyMaskRevealConfig(background, foreground?.reveal);
  }

  return {
    background,
    foreground
  };
}

function createPresetLayer(
  src: DitheredLayer["src"],
  preset: DitheredParticleCanvasProps["preset"]
): DitheredLayer {
  if (preset === "browserbase") {
    return {
      dither: { amount: 0.85, matrixSize: 8, palette: "browserbase" },
      fit: "cover",
      src
    };
  }

  return { src };
}

function applyMaskRevealConfig(
  layer: DitheredLayer | undefined,
  publicRevealConfig: DitheredLayer["reveal"]
): DitheredLayer | undefined {
  if (!layer || layer.reveal !== undefined) {
    return layer;
  }

  return {
    ...layer,
    reveal: publicRevealConfig ?? DEFAULT_REVEAL
  };
}

function isReducedMotion(
  props: DitheredParticleCanvasProps,
  matchMedia?: (query: string) => { matches: boolean }
): boolean {
  if (props.motion === "full") {
    return false;
  }

  if (props.motion === "reduced") {
    return true;
  }

  const media = matchMedia ?? getMatchMedia();

  return media?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

function getBackendPreference(quality: QualityConfig | undefined): RenderBackendName {
  if (typeof quality === "object" && quality.backend === "canvas2d") {
    return "canvas2d";
  }

  return "webgl2";
}

function measureCanvas(
  canvas: HTMLCanvasElement,
  quality: QualityConfig | undefined,
  dprOverride?: number
): RenderSize {
  const rect = canvas.getBoundingClientRect();
  const dpr = getQualityScale(quality) * (dprOverride ?? getDevicePixelRatio());
  const width = Math.max(1, Math.round((rect.width || canvas.width || 1) * dpr));
  const height = Math.max(1, Math.round((rect.height || canvas.height || 1) * dpr));

  return {
    dpr,
    height,
    width
  };
}

function getQualityScale(quality: QualityConfig | undefined): number {
  if (typeof quality === "object" && quality.resolutionScale) {
    return Math.max(0.1, quality.resolutionScale);
  }

  if (quality === "low") {
    return 0.5;
  }

  if (quality === "medium") {
    return 0.75;
  }

  return 1;
}

function getSourceKey(
  source: DitheredLayer["src"],
  sourceIds: WeakMap<object, number>,
  nextId: () => number
): string {
  if (typeof source === "string") {
    return `url:${source}`;
  }

  if (!sourceIds.has(source)) {
    sourceIds.set(source, nextId());
  }

  return `object:${sourceIds.get(source)}`;
}

function releaseSources(sources: Set<NormalizedLayerSource>): void {
  for (const source of sources) {
    source.bitmap?.close();
  }

  sources.clear();
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: "image/png" | "image/jpeg"
): Promise<Blob> {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
      } else {
        reject(
          new RendererError({
            code: "CANVAS_UNAVAILABLE",
            fix: "Make sure the canvas is mounted and readable before exporting.",
            problem: "Canvas frame export failed."
          })
        );
      }
    }, type);
  });
}

function getDefaultRaf(): Raf {
  if (typeof globalThis.requestAnimationFrame === "function") {
    return globalThis.requestAnimationFrame.bind(globalThis);
  }

  return (callback) =>
    globalThis.setTimeout(() => callback(performanceNow()), 16) as unknown as number;
}

function getDefaultCaf(): Caf {
  if (typeof globalThis.cancelAnimationFrame === "function") {
    return globalThis.cancelAnimationFrame.bind(globalThis);
  }

  return (id) => globalThis.clearTimeout(id);
}

function getResizeObserver(): ObserverConstructor | undefined {
  return typeof globalThis.ResizeObserver === "function"
    ? globalThis.ResizeObserver
    : undefined;
}

function getIntersectionObserver(): IntersectionObserverConstructor | undefined {
  return typeof globalThis.IntersectionObserver === "function"
    ? globalThis.IntersectionObserver
    : undefined;
}

function getMatchMedia(): ((query: string) => { matches: boolean }) | undefined {
  return typeof globalThis.matchMedia === "function"
    ? globalThis.matchMedia.bind(globalThis)
    : undefined;
}

function getDevicePixelRatio(): number {
  return typeof globalThis.devicePixelRatio === "number"
    ? globalThis.devicePixelRatio
    : 1;
}

function performanceNow(): number {
  return typeof globalThis.performance?.now === "function"
    ? globalThis.performance.now()
    : Date.now();
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}
