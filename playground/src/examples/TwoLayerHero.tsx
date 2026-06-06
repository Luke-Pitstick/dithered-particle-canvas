import { useEffect, useMemo, useRef, useState } from "react";
import {
  DitheredParticleCanvas,
  type DitheredCanvasHandle,
  type DitheredLayer,
  type DitheredParticleCanvasProps,
  type QualityConfig
} from "@dithered-particle-canvas/react";

const HERO_WIDTH = 1280;
const HERO_HEIGHT = 720;

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

export function TwoLayerHero() {
  const mode = getRuntimeMode();
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

  const [status, setStatus] = useState("Preparing layers");
  const layers = useMemo(() => createHeroLayers(mode.invalid), [mode.invalid]);
  const quality = useMemo<QualityConfig>(() => {
    if (mode.backend === "canvas2d") {
      return { backend: "canvas2d", resolutionScale: 0.6, targetFps: 30 };
    }

    if (mode.backend === "webgl2") {
      return { backend: "webgl2", resolutionScale: 0.75, targetFps: 60 };
    }

    return { backend: "auto", resolutionScale: 0.75, targetFps: 60 };
  }, [mode.backend]);

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
    </section>
  );
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

function createHeroLayers(invalid: boolean): { background: DitheredLayer; foreground: DitheredLayer } {
  const backgroundSource = invalid
    ? "/fixtures/missing-background.png"
    : createBackgroundImageData(HERO_WIDTH, HERO_HEIGHT);

  return {
    background: {
      dither: { amount: 0.72, matrixSize: 8, palette: "browserbase", pixelSize: 1 },
      fit: "stretch",
      filters: [
        { type: "contrast", amount: 1.08 },
        { type: "brightness", amount: 1.03 }
      ],
      src: backgroundSource as unknown as DitheredLayer["src"]
    },
    foreground: {
      dither: { amount: 0.9, matrixSize: 8, palette: "browserbase", pixelSize: 1 },
      fit: "stretch",
      filters: [
        { type: "posterize", levels: 7 },
        { type: "contrast", amount: 1.12 }
      ],
      reveal: {
        edgeDither: 0.7,
        fadeMs: 450,
        radius: 170,
        softness: 0.42,
        strength: 1
      },
      src: createForegroundImageData(HERO_WIDTH, HERO_HEIGHT) as unknown as DitheredLayer["src"]
    }
  };
}

function createBackgroundImageData(width: number, height: number): ImageData {
  const image = new ImageData(width, height);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      const horizon = y / height;
      const cloud =
        Math.sin(x / 42) * 0.45 +
        Math.cos((x + y) / 76) * 0.35 +
        Math.sin((x - y) / 118) * 0.2;
      const cloudBand = cloud > 0.2 && y < height * 0.63 ? 1 : 0;

      image.data[index] = cloudBand ? 236 : 66 + horizon * 22;
      image.data[index + 1] = cloudBand ? 246 : 140 + horizon * 40;
      image.data[index + 2] = cloudBand ? 255 : 224 + horizon * 20;
      image.data[index + 3] = 255;
    }
  }

  return image;
}

function createForegroundImageData(width: number, height: number): ImageData {
  const image = new ImageData(width, height);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      const skyTexture = ((x >> 3) + (y >> 3)) % 2 === 0 ? 8 : -5;
      const ridge =
        height * 0.64 +
        Math.sin(x / 72) * 38 +
        Math.sin(x / 27) * 16 +
        Math.cos(x / 153) * 46;
      const rearRidge = height * 0.72 + Math.sin(x / 96) * 24 + Math.cos(x / 43) * 18;
      const inMountain = y > ridge;
      const inRearMountain = y > rearRidge;

      if (inMountain) {
        image.data[index] = 30;
        image.data[index + 1] = 40;
        image.data[index + 2] = 50;
      } else if (inRearMountain) {
        image.data[index] = 89;
        image.data[index + 1] = 101;
        image.data[index + 2] = 94;
      } else {
        image.data[index] = 232 + skyTexture;
        image.data[index + 1] = 229 + skyTexture;
        image.data[index + 2] = 212 + skyTexture;
      }

      image.data[index + 3] = 255;
    }
  }

  return image;
}
