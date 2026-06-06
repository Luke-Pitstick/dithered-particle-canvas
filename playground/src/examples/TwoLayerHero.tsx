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
const BROWSERBASE_LOW_RESOLUTION_SCALE = 0.5;
const BROWSERBASE_DITHER_PIXEL_SIZE = 3;
const FOREGROUND_MOUNTAINS_SRC = "/dithereffecttest_fg.jpg";
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

  const [mountains, setMountains] = useState<ImageData | undefined>();
  const [revealBackground, setRevealBackground] = useState<ImageData | undefined>();
  const [status, setStatus] = useState("Preparing real assets");
  const idleLayer = useMemo(() => createIdleSurfaceImageData(HERO_WIDTH, HERO_HEIGHT), []);
  const layers = useMemo(
    () => createHeroLayers(mode.invalid, idleLayer, revealBackground),
    [idleLayer, mode.invalid, revealBackground]
  );
  const quality = useMemo<QualityConfig>(() => {
    if (mode.backend === "canvas2d") {
      return {
        backend: "canvas2d",
        resolutionScale: BROWSERBASE_LOW_RESOLUTION_SCALE,
        targetFps: 30
      };
    }

    if (mode.backend === "webgl2") {
      return {
        backend: "webgl2",
        resolutionScale: BROWSERBASE_LOW_RESOLUTION_SCALE,
        targetFps: 60
      };
    }

    return {
      backend: "auto",
      resolutionScale: BROWSERBASE_LOW_RESOLUTION_SCALE,
      targetFps: 60
    };
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
          setMountains(imageData);
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

function createHeroLayers(
  invalid: boolean,
  idleLayer: ImageData,
  revealBackground: ImageData | undefined
): { background: DitheredLayer; foreground: DitheredLayer } {
  return {
    background: {
      dither: {
        amount: 0.9,
        matrixSize: 8,
        palette: "browserbase",
        pixelSize: BROWSERBASE_DITHER_PIXEL_SIZE
      },
      fit: invalid ? "cover" : "stretch",
      filters: [
        { type: "contrast", amount: 1.06 },
        { type: "brightness", amount: 1.02 }
      ],
      reveal: {
        edgeDither: 0.82,
        edgeNoise: 0.28,
        fadeMs: 520,
        radius: 190,
        softness: 0.5,
        strength: 1,
        trail: {
          durationMs: 1600,
          idleMs: 360,
          maxPoints: 32,
          spacing: 16,
          strength: 0.9
        }
      },
      src: invalid
        ? "/fixtures/missing-background.png"
        : ((revealBackground ?? idleLayer) as unknown as DitheredLayer["src"])
    },
    foreground: {
      dither: false,
      fit: "stretch",
      filters: [{ type: "contrast", amount: 1.02 }],
      reveal: {
        edgeDither: 0.82,
        edgeNoise: 0.28,
        fadeMs: 520,
        radius: 190,
        softness: 0.5,
        strength: 1,
        trail: {
          durationMs: 1600,
          idleMs: 360,
          maxPoints: 32,
          spacing: 16,
          strength: 0.9
        }
      },
      src: idleLayer as unknown as DitheredLayer["src"]
    }
  };
}

async function loadSkyRevealBackground(width: number, height: number): Promise<ImageData> {
  return createSkyRevealImageData(width, height);
}

function createSkyRevealImageData(width: number, height: number): ImageData {
  const image = new ImageData(width, height);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      const u = x / width;
      const v = y / height;
      const cloud =
        softCloud(u, v, 0.24, 0.36, 0.27, 0.2, 0.7) +
        softCloud(u, v, 0.42, 0.3, 0.24, 0.18, 0.52) +
        softCloud(u, v, 0.59, 0.42, 0.34, 0.22, 0.38);
      const ripple = Math.sin(x / 54 + y / 83) * 0.04 + Math.cos((x - y) / 137) * 0.035;
      const cloudMix = clamp01Value(cloud + ripple);
      const grain = (((x * 13 + y * 29) % 23) - 11) * 0.55;
      const sky = [
        86 + v * 38 + grain,
        145 + v * 40 + grain,
        215 + v * 22 + grain
      ] as const;
      const cloudColor = [
        223 + v * 14 + grain,
        232 + v * 10 + grain,
        235 + v * 6 + grain
      ] as const;

      image.data[index] = clampByte(mixNumber(sky[0], cloudColor[0], cloudMix));
      image.data[index + 1] = clampByte(mixNumber(sky[1], cloudColor[1], cloudMix));
      image.data[index + 2] = clampByte(mixNumber(sky[2], cloudColor[2], cloudMix));
      image.data[index + 3] = 255;
    }
  }

  return image;
}

function softCloud(
  x: number,
  y: number,
  centerX: number,
  centerY: number,
  radiusX: number,
  radiusY: number,
  strength: number
): number {
  const dx = (x - centerX) / radiusX;
  const dy = (y - centerY) / radiusY;
  const distance = dx * dx + dy * dy;

  return Math.max(0, 1 - distance) * strength;
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
  pixelateOpaqueForeground(imageData, 4);
  applyMountainPalette(imageData);

  return imageData;
}

function applyConnectedSkyMatte(image: ImageData): void {
  const visited = new Uint8Array(image.width * image.height);
  const queue: number[] = [];

  for (let x = 0; x < image.width; x += 1) {
    seedSkyPixel(image, visited, queue, x, 0);
  }

  for (let y = 1; y < image.height; y += 1) {
    seedSkyPixel(image, visited, queue, 0, y);
    seedSkyPixel(image, visited, queue, image.width - 1, y);
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
      seedSkyPixel(image, visited, queue, nextX, nextY);
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

      if (touchesSky && isPaleSkyPixel(image, x, y, 136)) {
        image.data[alphaIndex] = 160;
      }
    }
  }
}

function seedSkyPixel(
  image: ImageData,
  visited: Uint8Array,
  queue: number[],
  x: number,
  y: number
): void {
  if (x < 0 || x >= image.width || y < 0 || y >= image.height) {
    return;
  }

  const offset = y * image.width + x;

  if (visited[offset] === 1 || !isPaleSkyPixel(image, x, y, 168)) {
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

function isPaleSkyPixel(image: ImageData, x: number, y: number, minimumBrightness: number): boolean {
  const index = (y * image.width + x) * 4;
  const r = image.data[index] ?? 0;
  const g = image.data[index + 1] ?? 0;
  const b = image.data[index + 2] ?? 0;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const brightness = (r + g + b) / 3;
  const chroma = max - min;

  return brightness >= minimumBrightness && chroma <= 58;
}


function clampByte(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function clamp01Value(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function mixNumber(from: number, to: number, amount: number): number {
  return from * (1 - amount) + to * amount;
}

function applyMountainPalette(image: ImageData): void {
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
      const color =
        shade < 70
          ? MOUNTAIN_PALETTE.black
          : greenBias > 14 && shade < 190
            ? MOUNTAIN_PALETTE.green
            : shade < 128
              ? MOUNTAIN_PALETTE.orange
              : shade < 198
                ? MOUNTAIN_PALETTE.yellow
                : MOUNTAIN_PALETTE.pale;

      image.data[index] = color[0];
      image.data[index + 1] = color[1];
      image.data[index + 2] = color[2];
      image.data[index + 3] = alpha > 80 ? 255 : alpha;
    }
  }
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
