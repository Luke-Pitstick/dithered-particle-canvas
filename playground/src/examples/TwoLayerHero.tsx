import { useEffect, useMemo, useRef, useState } from "react";
import {
  DitheredParticleCanvas,
  type BuiltInFilterConfig,
  type DitheredCanvasHandle,
  type DitherConfig,
  type DitheredLayer,
  type DitheredParticleCanvasProps,
  type QualityConfig,
  type RevealInteractionConfig
} from "@dithered-particle-canvas/react";

const HERO_WIDTH = 1280;
const HERO_HEIGHT = 720;
const BROWSERBASE_LOW_RESOLUTION_SCALE = 0.42;
const BROWSERBASE_BACKGROUND_PIXEL_SIZE = 4;
const BROWSERBASE_FOREGROUND_PIXEL_SIZE = 6;
const BROWSERBASE_REVEAL_EDGE_NOISE = 0.56;
const BROWSERBASE_REVEAL_EDGE_DITHER = 0.94;
const BROWSERBASE_REVEAL_EDGE_FLICKER = 0.78;
const BROWSERBASE_REVEAL_FOREGROUND_BLEND = 0.32;
const BROWSERBASE_REVEAL_FADE_MS = 220;
const BROWSERBASE_TRAIL_DURATION_MS = 720;
const BROWSERBASE_TRAIL_DUST_FLICKER = 0.72;
const BROWSERBASE_TRAIL_DUST_SIZE = 6;
const BROWSERBASE_TRAIL_IDLE_MS = 120;
const BACKGROUND_REVEAL_SRC = "/background.jpg";
const FOREGROUND_MOUNTAINS_SRC = "/chautauqua-flatirons_fg.jpg";
const MOUNTAIN_PALETTE = {
  black: [8, 12, 14],
  green: [119, 203, 45],
  orange: [255, 58, 18],
  pale: [242, 239, 214],
  yellow: [255, 218, 24]
} as const;

type PlaygroundDiagnostics = {
  errors: Array<{ code?: string; message: string; name: string }>;
  exportFrame: () => Promise<{ message?: string; ok: boolean }>;
  ready: boolean;
  stats: DitheredCanvasStats | undefined;
};

type DitheredCanvasStats = Parameters<NonNullable<DitheredParticleCanvasProps["onStats"]>>[0];

declare global {
  interface Window {
    __dpcPlayground?: PlaygroundDiagnostics;
  }
}

type RuntimeMode = {
  backend: "auto" | "canvas2d" | "webgl2";
  invalid: boolean;
  tainted: boolean;
};

type DitherLayerId = "background" | "foreground";
type LayerId = DitherLayerId | "mountains";

type LayerControlValues = {
  brightness: number;
  contrast: number;
  ditherAmount: number;
  ditherMatrixSize: NonNullable<DitherConfig["matrixSize"]>;
  ditherPixelSize: number;
  opacity: number;
  revealEdgeDither: number;
  revealEdgeFlicker: number;
  revealEdgeNoise: number;
  revealFadeMs: number;
  revealPixelSize: number;
  revealRadius: number;
  revealSoftness: number;
  trailDustFlicker: number;
  trailDustSize: number;
  trailDurationMs: number;
  trailIdleMs: number;
  trailSpacing: number;
  trailStrength: number;
};

type MountainControlValues = {
  brightness: number;
  contrast: number;
  colorCount: number;
  hue: number;
  saturation: number;
  warmth: number;
};

type PlaygroundControls = Record<DitherLayerId, LayerControlValues> & {
  mountains: MountainControlValues;
  quality: {
    resolutionScale: number;
  };
};

type SliderDefinition = {
  group: string;
  key: keyof LayerControlValues;
  label: string;
  max: number;
  min: number;
  step: number;
  unit?: string;
};

type MountainSliderDefinition = {
  key: keyof MountainControlValues;
  label: string;
  max: number;
  min: number;
  step: number;
  unit?: string;
};

const DEFAULT_LAYER_CONTROLS: Record<DitherLayerId, LayerControlValues> = {
  background: {
    brightness: 1.02,
    contrast: 1.06,
    ditherAmount: 0.9,
    ditherMatrixSize: 8,
    ditherPixelSize: BROWSERBASE_BACKGROUND_PIXEL_SIZE,
    opacity: 1,
    revealEdgeDither: BROWSERBASE_REVEAL_EDGE_DITHER,
    revealEdgeFlicker: BROWSERBASE_REVEAL_EDGE_FLICKER,
    revealEdgeNoise: BROWSERBASE_REVEAL_EDGE_NOISE,
    revealFadeMs: BROWSERBASE_REVEAL_FADE_MS,
    revealPixelSize: BROWSERBASE_FOREGROUND_PIXEL_SIZE,
    revealRadius: 190,
    revealSoftness: 0.58,
    trailDustFlicker: BROWSERBASE_TRAIL_DUST_FLICKER,
    trailDustSize: BROWSERBASE_TRAIL_DUST_SIZE,
    trailDurationMs: BROWSERBASE_TRAIL_DURATION_MS,
    trailIdleMs: BROWSERBASE_TRAIL_IDLE_MS,
    trailSpacing: 16,
    trailStrength: 0.9
  },
  foreground: {
    brightness: 1,
    contrast: 1.02,
    ditherAmount: 0,
    ditherMatrixSize: 8,
    ditherPixelSize: BROWSERBASE_FOREGROUND_PIXEL_SIZE,
    opacity: 1,
    revealEdgeDither: BROWSERBASE_REVEAL_EDGE_DITHER,
    revealEdgeFlicker: BROWSERBASE_REVEAL_EDGE_FLICKER,
    revealEdgeNoise: BROWSERBASE_REVEAL_EDGE_NOISE,
    revealFadeMs: BROWSERBASE_REVEAL_FADE_MS,
    revealPixelSize: BROWSERBASE_FOREGROUND_PIXEL_SIZE,
    revealRadius: 190,
    revealSoftness: 0.58,
    trailDustFlicker: BROWSERBASE_TRAIL_DUST_FLICKER,
    trailDustSize: BROWSERBASE_TRAIL_DUST_SIZE,
    trailDurationMs: BROWSERBASE_TRAIL_DURATION_MS,
    trailIdleMs: BROWSERBASE_TRAIL_IDLE_MS,
    trailSpacing: 16,
    trailStrength: 0.9
  }
};

const DEFAULT_PLAYGROUND_CONTROLS: PlaygroundControls = {
  ...DEFAULT_LAYER_CONTROLS,
  mountains: {
    brightness: 1,
    contrast: 1,
    colorCount: 5,
    hue: 0,
    saturation: 1,
    warmth: 0
  },
  quality: {
    resolutionScale: BROWSERBASE_LOW_RESOLUTION_SCALE
  }
};

const LAYER_SLIDERS: SliderDefinition[] = [
  { group: "Filters", key: "brightness", label: "Brightness", max: 1.35, min: 0.65, step: 0.01 },
  { group: "Filters", key: "contrast", label: "Contrast", max: 1.6, min: 0.55, step: 0.01 },
  { group: "Filters", key: "opacity", label: "Opacity", max: 1, min: 0.2, step: 0.01 },
  { group: "Dither", key: "ditherAmount", label: "Amount", max: 1, min: 0, step: 0.01 },
  { group: "Dither", key: "ditherPixelSize", label: "Pixel size", max: 12, min: 1, step: 1, unit: "px" },
  { group: "Reveal shape", key: "revealRadius", label: "Radius", max: 360, min: 40, step: 1, unit: "px" },
  { group: "Reveal shape", key: "revealSoftness", label: "Softness", max: 0.92, min: 0.05, step: 0.01 },
  { group: "Reveal shape", key: "revealEdgeDither", label: "Edge dither", max: 1, min: 0, step: 0.01 },
  { group: "Reveal shape", key: "revealEdgeNoise", label: "Edge noise", max: 1, min: 0, step: 0.01 },
  { group: "Trail speed", key: "revealFadeMs", label: "Fade", max: 900, min: 0, step: 10, unit: "ms" },
  { group: "Trail speed", key: "trailDurationMs", label: "Trail life", max: 1600, min: 80, step: 10, unit: "ms" },
  { group: "Trail speed", key: "trailIdleMs", label: "Idle gap", max: 500, min: 0, step: 10, unit: "ms" },
  { group: "Trail speed", key: "trailSpacing", label: "Spacing", max: 42, min: 4, step: 1, unit: "px" },
  { group: "Trail speed", key: "trailDustSize", label: "Dust size", max: 18, min: 1, step: 1, unit: "px" },
  { group: "Trail speed", key: "trailStrength", label: "Trail strength", max: 1, min: 0, step: 0.01 }
];

const MOUNTAIN_SLIDERS: MountainSliderDefinition[] = [
  { key: "colorCount", label: "Color count", max: 12, min: 2, step: 1 },
  { key: "brightness", label: "Brightness", max: 1.45, min: 0.55, step: 0.01 },
  { key: "contrast", label: "Contrast", max: 1.75, min: 0.55, step: 0.01 },
  { key: "saturation", label: "Saturation", max: 2, min: 0, step: 0.01 },
  { key: "hue", label: "Hue shift", max: 90, min: -90, step: 1, unit: "deg" },
  { key: "warmth", label: "Warmth", max: 1, min: -1, step: 0.01 }
];

export function TwoLayerHero() {
  const mode = getRuntimeMode();
  const mountainCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const canvasHandle = useRef<DitheredCanvasHandle | null>(null);
  const diagnostics = useRef<PlaygroundDiagnostics>({
    errors: [],
    exportFrame: async () => {
      try {
        await canvasHandle.current?.exportFrame();

        return { ok: true };
      } catch (error) {
        return { message: error instanceof Error ? error.message : String(error), ok: false };
      }
    },
    ready: false,
    stats: undefined
  });
  window.__dpcPlayground = diagnostics.current;

  const [mountainBase, setMountainBase] = useState<ImageData | undefined>();
  const [revealBackground, setRevealBackground] = useState<ImageData | undefined>();
  const [status, setStatus] = useState("Preparing real assets");
  const [activeLayer, setActiveLayer] = useState<LayerId | undefined>();
  const [controls, setControls] = useState<PlaygroundControls>(DEFAULT_PLAYGROUND_CONTROLS);
  const idleLayer = useMemo(() => createIdleSurfaceImageData(HERO_WIDTH, HERO_HEIGHT), []);
  const layers = useMemo(
    () => createHeroLayers(mode.invalid, idleLayer, revealBackground, controls),
    [controls, idleLayer, mode.invalid, revealBackground]
  );
  const mountains = useMemo(
    () => (mountainBase ? applyMountainColorFilters(mountainBase, controls.mountains) : undefined),
    [controls.mountains, mountainBase]
  );
  const quality = useMemo<QualityConfig>(() => {
    if (mode.backend === "canvas2d") {
      return {
        backend: "canvas2d",
        resolutionScale: controls.quality.resolutionScale,
        targetFps: 30
      };
    }

    if (mode.backend === "webgl2") {
      return {
        backend: "webgl2",
        resolutionScale: controls.quality.resolutionScale,
        targetFps: 60
      };
    }

    return {
      backend: "auto",
      resolutionScale: controls.quality.resolutionScale,
      targetFps: 60
    };
  }, [controls.quality.resolutionScale, mode.backend]);

  useEffect(() => {
    if (!activeLayer) {
      return undefined;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setActiveLayer(undefined);
      }
    };

    window.addEventListener("keydown", onKeyDown);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [activeLayer]);

  useEffect(() => {
    if (!mode.tainted) {
      return undefined;
    }

    const originalToBlob = HTMLCanvasElement.prototype.toBlob;
    HTMLCanvasElement.prototype.toBlob = function toBlobWithSecurityError(...args) {
      if (this.hasAttribute("data-dpc-canvas")) {
        throw new DOMException("Canvas is tainted by cross-origin data.", "SecurityError");
      }

      return originalToBlob.apply(this, args);
    };

    return () => {
      HTMLCanvasElement.prototype.toBlob = originalToBlob;
    };
  }, [mode.tainted]);

  useEffect(() => {
    let cancelled = false;

    if (mode.invalid) {
      return undefined;
    }

    loadSkyRevealBackground(HERO_WIDTH, HERO_HEIGHT)
      .then((imageData) => {
        if (!cancelled) {
          setRevealBackground(imageData);
        }
      })
      .catch((error: unknown) => {
        diagnostics.current.errors.push({
          message: error instanceof Error ? error.message : String(error),
          name: error instanceof Error ? error.name : "Error"
        });
        setStatus("Fallback active");
      });

    return () => {
      cancelled = true;
    };
  }, [mode.invalid]);

  useEffect(() => {
    let cancelled = false;

    loadMattedMountainForeground(FOREGROUND_MOUNTAINS_SRC, HERO_WIDTH, HERO_HEIGHT)
      .then((imageData) => {
        if (!cancelled) {
          setMountainBase(imageData);
        }
      })
      .catch((error: unknown) => {
        diagnostics.current.errors.push({
          message: error instanceof Error ? error.message : String(error),
          name: error instanceof Error ? error.name : "Error"
        });
        setStatus("Fallback active");
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const canvas = mountainCanvasRef.current;

    if (!canvas || !mountains) {
      return;
    }

    canvas.width = mountains.width;
    canvas.height = mountains.height;
    canvas.getContext("2d")?.putImageData(mountains, 0, 0);
  }, [mountains]);

  return (
    <section className="hero" data-testid="two-layer-hero">
      <DitheredParticleCanvas
        ref={canvasHandle}
        aria-label="Browserbase style dithered reveal hero"
        className="hero-canvas"
        fallback="A dithered two-layer hero with a pointer reveal."
        height={HERO_HEIGHT}
        layers={layers}
        motion="auto"
        onError={(error) => {
          diagnostics.current.errors.push({
            code: "code" in error ? String(error.code) : undefined,
            message: error.message,
            name: error.name
          });
          setStatus("Fallback active");
        }}
        onReady={() => {
          diagnostics.current.ready = true;
          setStatus("Ready");
        }}
        onStats={(stats) => {
          diagnostics.current.stats = stats;
        }}
        preset="browserbase"
        quality={quality}
        revealLayer="background"
        width={HERO_WIDTH}
      />
      <canvas
        ref={mountainCanvasRef}
        aria-hidden="true"
        className="hero-mountains"
        height={HERO_HEIGHT}
        width={HERO_WIDTH}
      />
      <div className="hero-ui" aria-hidden="true">
        <nav className="hero-nav">
          <span className="brand-mark">DPC</span>
          <div className="nav-links">
            <span>Platform</span>
            <span>Research</span>
            <span>Studio</span>
          </div>
        </nav>
        <div className="hero-copy">
          <p>Reference playground</p>
          <h1>Dithered cloud reveal for static product heroes.</h1>
          <div className="hero-actions">
            <span>Explore canvas</span>
            <span>{status}</span>
          </div>
        </div>
      </div>
      <LayerControlPanel
        activeLayer={activeLayer}
        controls={controls}
        onClose={() => setActiveLayer(undefined)}
        onLayerControlChange={(layer, key, value) => {
          if (key === "ditherPixelSize") {
            setControls((current) => ({
              ...current,
              background: {
                ...current.background,
                ditherPixelSize: value
              },
              foreground: {
                ...current.foreground,
                ditherPixelSize: value
              }
            }));
            return;
          }

          setControls((current) => ({
            ...current,
            [layer]: {
              ...current[layer],
              [key]: value
            }
          }));
        }}
        onMountainControlChange={(key, value) => {
          setControls((current) => ({
            ...current,
            mountains: {
              ...current.mountains,
              [key]: value
            }
          }));
        }}
        onMatrixSizeChange={(layer, ditherMatrixSize) => {
          setControls((current) => ({
            ...current,
            [layer]: {
              ...current[layer],
              ditherMatrixSize
            }
          }));
        }}
        onResolutionChange={(resolutionScale) => {
          setControls((current) => ({
            ...current,
            quality: {
              ...current.quality,
              resolutionScale
            }
          }));
        }}
        onSelectLayer={(layer) => {
          setActiveLayer((current) => (current === layer ? undefined : layer));
        }}
      />
    </section>
  );
}

function LayerControlPanel({
  activeLayer,
  controls,
  onClose,
  onLayerControlChange,
  onMountainControlChange,
  onMatrixSizeChange,
  onResolutionChange,
  onSelectLayer
}: {
  activeLayer: LayerId | undefined;
  controls: PlaygroundControls;
  onClose: () => void;
  onLayerControlChange: (layer: DitherLayerId, key: keyof LayerControlValues, value: number) => void;
  onMountainControlChange: (key: keyof MountainControlValues, value: number) => void;
  onMatrixSizeChange: (layer: DitherLayerId, value: NonNullable<DitherConfig["matrixSize"]>) => void;
  onResolutionChange: (value: number) => void;
  onSelectLayer: (layer: LayerId) => void;
}) {
  const selectedControls =
    activeLayer === "background" || activeLayer === "foreground" ? controls[activeLayer] : undefined;
  const sliderGroups = LAYER_SLIDERS.reduce<Record<string, SliderDefinition[]>>((groups, slider) => {
    groups[slider.group] = [...(groups[slider.group] ?? []), slider];

    return groups;
  }, {});

  return (
    <aside className="layer-controls" aria-label="Layer controls">
      <div className="layer-selector" role="group" aria-label="Choose a layer to tune">
        {(["background", "foreground", "mountains"] as const).map((layer) => (
          <button
            key={layer}
            type="button"
            aria-controls="layer-control-popover"
            aria-expanded={activeLayer === layer}
            aria-pressed={activeLayer === layer}
            className={activeLayer === layer ? "layer-chip is-active" : "layer-chip"}
            data-testid={`layer-control-${layer}`}
            onClick={() => onSelectLayer(layer)}
          >
            <span>{getLayerLabel(layer)}</span>
            <strong>{getLayerChipValue(layer, controls)}</strong>
          </button>
        ))}
      </div>

      {activeLayer ? (
        <div
          className="layer-popover"
          data-testid={`${activeLayer}-layer-popover`}
          id="layer-control-popover"
          role="dialog"
          aria-label={`${getLayerLabel(activeLayer)} layer settings`}
        >
          <div className="layer-popover-header">
            <div>
              <p>Layer</p>
              <h2>{getLayerLabel(activeLayer)}</h2>
            </div>
            <button
              type="button"
              className="layer-close"
              aria-label="Close layer controls"
              onClick={onClose}
            >
              Close
            </button>
          </div>

          {activeLayer === "mountains" ? (
            <fieldset className="control-group">
              <legend>Mountain color</legend>
              {MOUNTAIN_SLIDERS.map((slider) => (
                <MountainSliderControl
                  key={slider.key}
                  slider={slider}
                  value={controls.mountains[slider.key]}
                  onChange={onMountainControlChange}
                />
              ))}
            </fieldset>
          ) : selectedControls ? (
            Object.entries(sliderGroups).map(([group, sliders]) => (
              <fieldset key={group} className="control-group">
                <legend>{group}</legend>
                {group === "Dither" ? (
                  <div className="matrix-control">
                    <span>Dither matrix</span>
                    <div className="matrix-buttons" role="group" aria-label="Dither matrix size">
                      {([4, 8] as const).map((matrixSize) => (
                        <button
                          key={matrixSize}
                          type="button"
                          aria-pressed={selectedControls.ditherMatrixSize === matrixSize}
                          className={
                            selectedControls.ditherMatrixSize === matrixSize
                              ? "matrix-button is-active"
                              : "matrix-button"
                          }
                          onClick={() => onMatrixSizeChange(activeLayer, matrixSize)}
                        >
                          {matrixSize}x{matrixSize}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
                {sliders.map((slider) => (
                  <SliderControl
                    key={slider.key}
                    layer={activeLayer}
                    slider={slider}
                    value={selectedControls[slider.key]}
                    onChange={onLayerControlChange}
                  />
                ))}
              </fieldset>
            ))
          ) : null}

          <fieldset className="control-group">
            <legend>Quality</legend>
            <div className="slider-row">
              <label htmlFor="layer-quality-resolution">Resolution</label>
              <span>{formatControlValue(controls.quality.resolutionScale, 0.01)}</span>
              <input
                id="layer-quality-resolution"
                type="range"
                min={0.2}
                max={1}
                step={0.01}
                value={controls.quality.resolutionScale}
                data-testid="resolution-scale-slider"
                onChange={(event) => onResolutionChange(Number(event.currentTarget.value))}
              />
            </div>
          </fieldset>
        </div>
      ) : null}
    </aside>
  );
}

function SliderControl({
  layer,
  onChange,
  slider,
  value
}: {
  layer: DitherLayerId;
  onChange: (layer: DitherLayerId, key: keyof LayerControlValues, value: number) => void;
  slider: SliderDefinition;
  value: number;
}) {
  const id = `${layer}-${slider.key}-control`;

  return (
    <div className="slider-row">
      <label htmlFor={id}>{slider.label}</label>
      <span>{formatControlValue(value, slider.step, slider.unit)}</span>
      <input
        id={id}
        type="range"
        min={slider.min}
        max={slider.max}
        step={slider.step}
        value={value}
        data-testid={`${layer}-${slider.key}-slider`}
        onChange={(event) => onChange(layer, slider.key, Number(event.currentTarget.value))}
      />
    </div>
  );
}

function MountainSliderControl({
  onChange,
  slider,
  value
}: {
  onChange: (key: keyof MountainControlValues, value: number) => void;
  slider: MountainSliderDefinition;
  value: number;
}) {
  const id = `mountains-${slider.key}-control`;

  return (
    <div className="slider-row">
      <label htmlFor={id}>{slider.label}</label>
      <span>{formatControlValue(value, slider.step, slider.unit)}</span>
      <input
        id={id}
        type="range"
        min={slider.min}
        max={slider.max}
        step={slider.step}
        value={value}
        data-testid={`mountains-${slider.key}-slider`}
        onChange={(event) => onChange(slider.key, Number(event.currentTarget.value))}
      />
    </div>
  );
}

function getLayerLabel(layer: LayerId): string {
  if (layer === "foreground") {
    return "Canvas FG";
  }

  return layer[0].toUpperCase() + layer.slice(1);
}

function getLayerChipValue(layer: LayerId, controls: PlaygroundControls): string {
  if (layer === "mountains") {
    return formatControlValue(controls.mountains.saturation, 0.01);
  }

  return formatControlValue(controls[layer].opacity, 0.01);
}

function formatControlValue(value: number, step: number, unit = ""): string {
  const digits = step >= 1 ? 0 : 2;

  return `${value.toFixed(digits)}${unit}`;
}

function getRuntimeMode(): RuntimeMode {
  const params = new URLSearchParams(window.location.search);
  const backend = params.get("backend");

  return {
    backend: backend === "canvas2d" || backend === "webgl2" ? backend : "auto",
    invalid: params.get("fixture") === "invalid",
    tainted: params.get("fixture") === "tainted"
  };
}

function createHeroLayers(
  invalid: boolean,
  idleLayer: ImageData,
  revealBackground: ImageData | undefined,
  controls: PlaygroundControls
): { background: DitheredLayer; foreground: DitheredLayer } {
  return {
    background: {
      dither: buildDitherConfig(controls.background),
      fit: invalid ? "cover" : "stretch",
      filters: buildFilters(controls.background),
      opacity: controls.background.opacity,
      reveal: buildRevealConfig(controls.background),
      src: invalid
        ? "/fixtures/missing-background.png"
        : ((revealBackground ?? idleLayer) as unknown as DitheredLayer["src"])
    },
    foreground: {
      dither: buildDitherConfig(controls.foreground),
      fit: "stretch",
      filters: buildFilters(controls.foreground),
      opacity: controls.foreground.opacity,
      reveal: buildRevealConfig(controls.foreground),
      src: idleLayer as unknown as DitheredLayer["src"]
    }
  };
}

function buildFilters(controls: LayerControlValues): BuiltInFilterConfig[] {
  const filters: BuiltInFilterConfig[] = [];

  if (controls.contrast !== 1) {
    filters.push({ type: "contrast", amount: controls.contrast });
  }

  if (controls.brightness !== 1) {
    filters.push({ type: "brightness", amount: controls.brightness });
  }

  return filters;
}

function buildDitherConfig(controls: LayerControlValues): DitherConfig | false {
  if (controls.ditherAmount <= 0) {
    return false;
  }

  return {
    amount: controls.ditherAmount,
    matrixSize: controls.ditherMatrixSize,
    palette: "browserbase",
    pixelSize: controls.ditherPixelSize
  };
}

function buildRevealConfig(controls: LayerControlValues): RevealInteractionConfig {
  return {
    edgeDither: controls.revealEdgeDither,
    edgeFlicker: controls.revealEdgeFlicker,
    edgeNoise: controls.revealEdgeNoise,
    fadeMs: controls.revealFadeMs,
    foregroundBlend: BROWSERBASE_REVEAL_FOREGROUND_BLEND,
    pixelSize: controls.revealPixelSize,
    radius: controls.revealRadius,
    softness: controls.revealSoftness,
    strength: 1,
    trail: {
      dustFlicker: controls.trailDustFlicker,
      dustSize: controls.trailDustSize,
      durationMs: controls.trailDurationMs,
      idleMs: controls.trailIdleMs,
      maxPoints: 32,
      spacing: controls.trailSpacing,
      strength: controls.trailStrength
    }
  };
}

function applyMountainColorFilters(source: ImageData, controls: MountainControlValues): ImageData {
  const output = new ImageData(new Uint8ClampedArray(source.data), source.width, source.height);
  const hueShift = controls.hue / 360;

  applyMountainPalette(output, controls.colorCount);

  for (let index = 0; index < output.data.length; index += 4) {
    const alpha = output.data[index + 3] ?? 0;

    if (alpha === 0) {
      continue;
    }

    let r = adjustContrast(output.data[index] ?? 0, controls.contrast);
    let g = adjustContrast(output.data[index + 1] ?? 0, controls.contrast);
    let b = adjustContrast(output.data[index + 2] ?? 0, controls.contrast);

    r = r * controls.brightness + controls.warmth * 26;
    g = g * controls.brightness + controls.warmth * 6;
    b = b * controls.brightness - controls.warmth * 24;

    const hsl = rgbToHsl(r, g, b);
    const shifted = hslToRgb(
      moduloFloat(hsl.h + hueShift, 1),
      clamp01(hsl.s * controls.saturation),
      hsl.l
    );

    output.data[index] = clampByte(shifted.r);
    output.data[index + 1] = clampByte(shifted.g);
    output.data[index + 2] = clampByte(shifted.b);
  }

  return output;
}

function adjustContrast(value: number, contrast: number): number {
  return (value - 128) * contrast + 128;
}

type HslColor = {
  h: number;
  l: number;
  s: number;
};

function rgbToHsl(r: number, g: number, b: number): HslColor {
  const red = clamp01(r / 255);
  const green = clamp01(g / 255);
  const blue = clamp01(b / 255);
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const l = (max + min) / 2;

  if (max === min) {
    return { h: 0, l, s: 0 };
  }

  const delta = max - min;
  const s = l > 0.5 ? delta / (2 - max - min) : delta / (max + min);
  const h =
    max === red
      ? (green - blue) / delta + (green < blue ? 6 : 0)
      : max === green
        ? (blue - red) / delta + 2
        : (red - green) / delta + 4;

  return { h: h / 6, l, s };
}

function hslToRgb(h: number, s: number, l: number): RgbColor {
  if (s === 0) {
    const value = l * 255;

    return { b: value, g: value, r: value };
  }

  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;

  return {
    b: hueToRgb(p, q, h - 1 / 3) * 255,
    g: hueToRgb(p, q, h) * 255,
    r: hueToRgb(p, q, h + 1 / 3) * 255
  };
}

function hueToRgb(p: number, q: number, t: number): number {
  const hue = moduloFloat(t, 1);

  if (hue < 1 / 6) {
    return p + (q - p) * 6 * hue;
  }

  if (hue < 1 / 2) {
    return q;
  }

  if (hue < 2 / 3) {
    return p + (q - p) * (2 / 3 - hue) * 6;
  }

  return p;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function moduloFloat(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor;
}

async function loadSkyRevealBackground(width: number, height: number): Promise<ImageData> {
  const image = new Image();
  image.crossOrigin = "anonymous";
  image.decoding = "async";
  image.src = BACKGROUND_REVEAL_SRC;
  await image.decode();

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });

  if (!context) {
    throw new Error("Canvas2D is unavailable for background image loading.");
  }

  context.drawImage(image, 0, 0, width, height);

  return context.getImageData(0, 0, width, height);
}

function createIdleSurfaceImageData(width: number, height: number): ImageData {
  const image = new ImageData(width, height);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      const vertical = y / height;
      const grain = (((x * 17 + y * 31) % 19) - 9) * 0.8;
      const paper = Math.sin(x / 120) * 3 + Math.cos((x + y) / 180) * 4 + grain;

      image.data[index] = clampByte(228 + vertical * 12 + paper);
      image.data[index + 1] = clampByte(232 + vertical * 8 + paper);
      image.data[index + 2] = clampByte(220 + vertical * 5 + paper);
      image.data[index + 3] = 255;
    }
  }

  return image;
}

async function loadMattedMountainForeground(
  src: string,
  width: number,
  height: number
): Promise<ImageData> {
  const image = new Image();
  image.crossOrigin = "anonymous";
  image.decoding = "async";
  image.src = src;
  await image.decode();

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });

  if (!context) {
    throw new Error("Canvas2D is unavailable for foreground matte generation.");
  }

  const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight);
  const drawnWidth = image.naturalWidth * scale;
  const drawnHeight = image.naturalHeight * scale;
  const x = (width - drawnWidth) / 2;
  const y = (height - drawnHeight) / 2 + height * 0.12;

  context.drawImage(image, x, y, drawnWidth, drawnHeight);

  const imageData = context.getImageData(0, 0, width, height);

  applyConnectedSkyMatte(imageData);
  pixelateOpaqueForeground(imageData, BROWSERBASE_FOREGROUND_PIXEL_SIZE);

  return imageData;
}

function applyConnectedSkyMatte(image: ImageData): void {
  const skyColor = estimateSkyColor(image);
  const visited = new Uint8Array(image.width * image.height);
  const queue: number[] = [];

  for (let x = 0; x < image.width; x += 1) {
    seedSkyPixel(image, visited, queue, skyColor, x, 0);
  }

  for (let y = 1; y < image.height; y += 1) {
    seedSkyPixel(image, visited, queue, skyColor, 0, y);
    seedSkyPixel(image, visited, queue, skyColor, image.width - 1, y);
  }

  for (let head = 0; head < queue.length; head += 1) {
    const current = queue[head];
    const x = current % image.width;
    const y = Math.floor(current / image.width);
    const neighbors = [
      [x + 1, y],
      [x - 1, y],
      [x, y + 1],
      [x, y - 1]
    ] as const;

    for (const [nextX, nextY] of neighbors) {
      seedSkyPixel(image, visited, queue, skyColor, nextX, nextY);
    }
  }

  const originalAlpha = new Uint8Array(visited);

  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      const offset = y * image.width + x;
      const alphaIndex = offset * 4 + 3;

      if (originalAlpha[offset] === 1) {
        image.data[alphaIndex] = 0;
        continue;
      }

      const touchesSky =
        isVisited(originalAlpha, image.width, image.height, x + 1, y) ||
        isVisited(originalAlpha, image.width, image.height, x - 1, y) ||
        isVisited(originalAlpha, image.width, image.height, x, y + 1) ||
        isVisited(originalAlpha, image.width, image.height, x, y - 1);

      if (touchesSky && isSkyColorPixel(image, skyColor, x, y, 132, 90)) {
        image.data[alphaIndex] = 160;
      }
    }
  }
}

type RgbColor = {
  b: number;
  g: number;
  r: number;
};

function estimateSkyColor(image: ImageData): RgbColor {
  let topImageY = 0;

  while (topImageY < image.height && !rowHasOpaquePixel(image, topImageY)) {
    topImageY += 1;
  }

  let r = 0;
  let g = 0;
  let b = 0;
  let count = 0;
  const sampleHeight = Math.min(image.height, topImageY + 24);

  for (let y = topImageY; y < sampleHeight; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      const pixel = getOpaquePixel(image, x, y);

      if (!pixel || getBrightness(pixel) < 150) {
        continue;
      }

      r += pixel.r;
      g += pixel.g;
      b += pixel.b;
      count += 1;
    }
  }

  if (count === 0) {
    return { b: 235, g: 235, r: 235 };
  }

  return {
    b: b / count,
    g: g / count,
    r: r / count
  };
}

function rowHasOpaquePixel(image: ImageData, y: number): boolean {
  for (let x = 0; x < image.width; x += 1) {
    const index = (y * image.width + x) * 4;

    if ((image.data[index + 3] ?? 0) > 0) {
      return true;
    }
  }

  return false;
}

function seedSkyPixel(
  image: ImageData,
  visited: Uint8Array,
  queue: number[],
  skyColor: RgbColor,
  x: number,
  y: number
): void {
  if (x < 0 || x >= image.width || y < 0 || y >= image.height) {
    return;
  }

  const offset = y * image.width + x;

  if (visited[offset] === 1 || !isSkyColorPixel(image, skyColor, x, y, 150, 74)) {
    return;
  }

  visited[offset] = 1;
  queue.push(offset);
}

function isVisited(
  visited: Uint8Array,
  width: number,
  height: number,
  x: number,
  y: number
): boolean {
  return x >= 0 && x < width && y >= 0 && y < height && visited[y * width + x] === 1;
}

function isSkyColorPixel(
  image: ImageData,
  skyColor: RgbColor,
  x: number,
  y: number,
  minimumBrightness: number,
  maximumDistance: number
): boolean {
  const pixel = getOpaquePixel(image, x, y);

  if (!pixel) {
    return false;
  }

  const brightness = getBrightness(pixel);
  const distance = getColorDistance(pixel, skyColor);

  return brightness >= minimumBrightness && distance <= maximumDistance;
}

function getOpaquePixel(image: ImageData, x: number, y: number): RgbColor | undefined {
  const index = (y * image.width + x) * 4;
  const alpha = image.data[index + 3] ?? 0;

  if (alpha === 0) {
    return undefined;
  }

  return {
    b: image.data[index + 2] ?? 0,
    g: image.data[index + 1] ?? 0,
    r: image.data[index] ?? 0
  };
}

function getBrightness(color: RgbColor): number {
  return (color.r + color.g + color.b) / 3;
}

function getColorDistance(from: RgbColor, to: RgbColor): number {
  const r = from.r - to.r;
  const g = from.g - to.g;
  const b = from.b - to.b;

  return Math.sqrt(r * r + g * g + b * b);
}

function clampByte(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function applyMountainPalette(image: ImageData, colorCount = 5): void {
  const palette = createMountainPalette(colorCount);

  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      const index = (y * image.width + x) * 4;
      const alpha = image.data[index + 3] ?? 0;

      if (alpha === 0) {
        continue;
      }

      const r = image.data[index] ?? 0;
      const g = image.data[index + 1] ?? 0;
      const b = image.data[index + 2] ?? 0;
      const luma = r * 0.299 + g * 0.587 + b * 0.114;
      const threshold = (getMountainDitherThreshold(x, y) - 0.5) * 58;
      const shade = luma + threshold;
      const greenBias = g - Math.max(r, b);
      const color = getMountainPaletteColor(shade, greenBias, palette, colorCount);

      image.data[index] = color[0];
      image.data[index + 1] = color[1];
      image.data[index + 2] = color[2];
      image.data[index + 3] = alpha > 80 ? 255 : alpha;
    }
  }
}

type PaletteColor = readonly [number, number, number];

function createMountainPalette(colorCount: number): PaletteColor[] {
  const count = Math.max(2, Math.min(12, Math.round(colorCount)));
  const anchors: PaletteColor[] = [
    MOUNTAIN_PALETTE.black,
    MOUNTAIN_PALETTE.orange,
    MOUNTAIN_PALETTE.yellow,
    MOUNTAIN_PALETTE.green,
    MOUNTAIN_PALETTE.pale
  ];

  if (count === 5) {
    return [
      MOUNTAIN_PALETTE.black,
      MOUNTAIN_PALETTE.orange,
      MOUNTAIN_PALETTE.yellow,
      MOUNTAIN_PALETTE.green,
      MOUNTAIN_PALETTE.pale
    ];
  }

  return Array.from({ length: count }, (_, index) => {
    const position = count === 1 ? 0 : index / (count - 1);
    const scaled = position * (anchors.length - 1);
    const leftIndex = Math.min(anchors.length - 2, Math.floor(scaled));
    const rightIndex = leftIndex + 1;
    const mix = scaled - leftIndex;
    const left = anchors[leftIndex];
    const right = anchors[rightIndex];

    return [
      Math.round(lerp(left[0], right[0], mix)),
      Math.round(lerp(left[1], right[1], mix)),
      Math.round(lerp(left[2], right[2], mix))
    ] as const;
  });
}

function getMountainPaletteColor(
  shade: number,
  greenBias: number,
  palette: PaletteColor[],
  colorCount: number
): PaletteColor {
  if (Math.round(colorCount) === 5) {
    return shade < 70
      ? MOUNTAIN_PALETTE.black
      : greenBias > 14 && shade < 190
        ? MOUNTAIN_PALETTE.green
        : shade < 128
          ? MOUNTAIN_PALETTE.orange
          : shade < 198
            ? MOUNTAIN_PALETTE.yellow
            : MOUNTAIN_PALETTE.pale;
  }

  const shadeRatio = clamp01(shade / 235);
  const index = Math.max(0, Math.min(palette.length - 1, Math.round(shadeRatio * (palette.length - 1))));

  return palette[index] ?? palette[palette.length - 1]!;
}

function lerp(from: number, to: number, amount: number): number {
  return from + (to - from) * amount;
}

function pixelateOpaqueForeground(image: ImageData, blockSize: number): void {
  for (let blockY = 0; blockY < image.height; blockY += blockSize) {
    for (let blockX = 0; blockX < image.width; blockX += blockSize) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      let count = 0;

      for (let y = blockY; y < Math.min(blockY + blockSize, image.height); y += 1) {
        for (let x = blockX; x < Math.min(blockX + blockSize, image.width); x += 1) {
          const index = (y * image.width + x) * 4;
          const alpha = image.data[index + 3] ?? 0;

          if (alpha === 0) {
            continue;
          }

          r += image.data[index] ?? 0;
          g += image.data[index + 1] ?? 0;
          b += image.data[index + 2] ?? 0;
          a += alpha;
          count += 1;
        }
      }

      if (count === 0) {
        continue;
      }

      const average = [
        clampByte(r / count),
        clampByte(g / count),
        clampByte(b / count),
        clampByte(a / count)
      ] as const;

      for (let y = blockY; y < Math.min(blockY + blockSize, image.height); y += 1) {
        for (let x = blockX; x < Math.min(blockX + blockSize, image.width); x += 1) {
          const index = (y * image.width + x) * 4;

          if ((image.data[index + 3] ?? 0) === 0) {
            continue;
          }

          image.data[index] = average[0];
          image.data[index + 1] = average[1];
          image.data[index + 2] = average[2];
          image.data[index + 3] = average[3];
        }
      }
    }
  }
}

function getMountainDitherThreshold(x: number, y: number): number {
  const matrix = [
    [0, 32, 8, 40, 2, 34, 10, 42],
    [48, 16, 56, 24, 50, 18, 58, 26],
    [12, 44, 4, 36, 14, 46, 6, 38],
    [60, 28, 52, 20, 62, 30, 54, 22],
    [3, 35, 11, 43, 1, 33, 9, 41],
    [51, 19, 59, 27, 49, 17, 57, 25],
    [15, 47, 7, 39, 13, 45, 5, 37],
    [63, 31, 55, 23, 61, 29, 53, 21]
  ] as const;
  const row = ((Math.floor(y) % matrix.length) + matrix.length) % matrix.length;
  const column = ((Math.floor(x) % matrix[row].length) + matrix[row].length) % matrix[row].length;

  return (matrix[row][column] + 0.5) / 64;
}
