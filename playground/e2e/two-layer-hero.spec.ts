import { expect, test, type Page } from "@playwright/test";
import { inflateSync } from "node:zlib";

type Rgba = [number, number, number, number];
type BrowserCounters = {
  createTexture: number;
  frames: number;
  rafCallbacks: number;
  rafRequests: number;
  texImage2D: number;
};

test.beforeEach(async ({ page }) => {
  await installBrowserCounters(page);
});

test("renders a nonblank V1 two-layer reveal hero", async ({ browser, page }) => {
  test.info().annotations.push({ type: "browser", description: browser.version() });
  await gotoReady(page);

  await expect(page.getByTestId("two-layer-hero")).toBeVisible();
  await expect(page.getByRole("img", { name: "Browserbase style dithered reveal hero" })).toBeVisible();

  const summary = await sampleCanvasSummary(page);

  expect(summary.nonTransparent).toBeGreaterThan(20);
  expect(summary.uniqueColors).toBeGreaterThan(8);
});

test("pointer movement reveals background pixels while distant foreground stays stable", async ({ page }) => {
  await gotoReady(page);

  const canvas = page.locator("[data-dpc-canvas]");
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();

  const center = point(box!, 0.52, 0.34);
  const stableMountain = point(box!, 0.18, 0.84);
  const beforeReveal = await sampleCanvasPixel(page, 0.52, 0.34);
  const beforeStable = await sampleCanvasPixel(page, 0.18, 0.84);

  await page.mouse.move(center.x, center.y);
  await page.waitForTimeout(90);

  const duringReveal = await sampleCanvasPixel(page, 0.52, 0.34);
  const duringStable = await sampleCanvasPixel(page, 0.18, 0.84);

  expect(colorDistance(beforeReveal, duringReveal)).toBeGreaterThan(35);
  expect(colorDistance(beforeStable, duringStable)).toBeLessThan(8);

  await page.mouse.move(stableMountain.x, stableMountain.y);
});

test("reveal edge contains dithered breakup instead of a smooth spotlight", async ({ page }) => {
  await gotoReady(page);

  const canvas = page.locator("[data-dpc-canvas]");
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();

  const before = await sampleCanvasGrid(page, 0.52, 0.34, 0.11, 0.035, 33, 9);
  const center = point(box!, 0.52, 0.34);

  await page.mouse.move(center.x, center.y);
  await page.waitForTimeout(90);

  const during = await sampleCanvasGrid(page, 0.52, 0.34, 0.11, 0.035, 33, 9);
  const changed = during.map((pixel, index) => colorDistance(pixel, before[index]!) > 24);
  const changedCount = changed.filter(Boolean).length;
  const transitions = countHorizontalTransitions(changed, 33);

  expect(changedCount).toBeGreaterThan(20);
  expect(changedCount).toBeLessThan(changed.length - 20);
  expect(transitions).toBeGreaterThan(18);
});

test("reveal fades after pointer leave", async ({ page }) => {
  await gotoReady(page);

  const canvas = page.locator("[data-dpc-canvas]");
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();

  const center = point(box!, 0.52, 0.34);
  const before = await sampleCanvasPixel(page, 0.52, 0.34);

  await page.mouse.move(center.x, center.y);
  await page.waitForTimeout(80);
  const during = await sampleCanvasPixel(page, 0.52, 0.34);

  await page.mouse.move(box!.x + box!.width + 24, box!.y + box!.height + 24);
  await page.waitForTimeout(700);
  const after = await sampleCanvasPixel(page, 0.52, 0.34);

  expect(colorDistance(before, during)).toBeGreaterThan(35);
  expect(colorDistance(before, after)).toBeLessThan(10);
});

test("reduced motion keeps the static hero and disables reveal animation", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await gotoReady(page);

  const canvas = page.locator("[data-dpc-canvas]");
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();

  const before = await sampleCanvasPixel(page, 0.52, 0.34);

  await page.mouse.move(...pointTuple(box!, 0.52, 0.34));
  await page.waitForTimeout(140);

  const after = await sampleCanvasPixel(page, 0.52, 0.34);
  const framesAfterPointer = (await getDiagnostics(page)).stats?.frames ?? 0;
  await page.waitForTimeout(350);
  const framesAfterIdle = (await getDiagnostics(page)).stats?.frames ?? 0;

  expect(colorDistance(before, after)).toBeLessThan(8);
  expect(framesAfterIdle).toBe(framesAfterPointer);
});

test("Canvas2D fallback mode still renders the hero", async ({ page }) => {
  await gotoReady(page, "/?backend=canvas2d");

  const diagnostics = await getDiagnostics(page);
  const summary = await sampleCanvasSummary(page);

  expect(diagnostics.stats?.backend).toBe("canvas2d");
  expect(summary.nonTransparent).toBeGreaterThan(20);
  expect(summary.uniqueColors).toBeGreaterThan(2);
});

test("render loop and GPU uploads stay idle after initial render", async ({ page }) => {
  await gotoReady(page);
  await page.waitForTimeout(700);

  const diagnostics = await getDiagnostics(page);

  if (diagnostics.stats?.backend !== "webgl2") {
    test.info().annotations.push({
      type: "skip-detail",
      description: "Processed texture upload counters are WebGL2-only."
    });
    return;
  }

  const idleStart = await getCounters(page);
  await page.waitForTimeout(450);
  const idleEnd = await getCounters(page);

  expect(idleEnd.frames).toBe(idleStart.frames);
  expect(idleEnd.rafCallbacks).toBe(idleStart.rafCallbacks);

  const canvas = page.locator("[data-dpc-canvas]");
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();

  const beforePointer = await getCounters(page);

  for (let index = 0; index < 8; index += 1) {
    await page.mouse.move(box!.x + box!.width * (0.35 + index * 0.035), box!.y + box!.height * 0.34);
    await page.waitForTimeout(24);
  }

  await page.mouse.move(box!.x + box!.width + 24, box!.y + box!.height + 24);
  await page.waitForTimeout(650);

  const afterPointer = await getCounters(page);

  expect(afterPointer.frames).toBeGreaterThan(beforePointer.frames);
  expect(afterPointer.texImage2D).toBe(beforePointer.texImage2D);
  expect(afterPointer.createTexture).toBe(beforePointer.createTexture);
});

async function installBrowserCounters(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const counters = {
      createTexture: 0,
      rafCallbacks: 0,
      rafRequests: 0,
      texImage2D: 0
    };

    Reflect.set(window, "__dpcBrowserCounters", counters);
    Reflect.set(window, "__dpcReadCanvasPixel", (xRatio: number, yRatio: number): Rgba => {
      const canvas = document.querySelector("[data-dpc-canvas]") as HTMLCanvasElement | null;

      if (!canvas) {
        throw new Error("Dithered canvas was not found.");
      }

      const probe = document.createElement("canvas");
      probe.width = canvas.width;
      probe.height = canvas.height;

      const context = probe.getContext("2d", { willReadFrequently: true });

      if (!context) {
        throw new Error("2D probe context was not available.");
      }

      context.drawImage(canvas, 0, 0, probe.width, probe.height);

      const x = Math.max(0, Math.min(probe.width - 1, Math.round(xRatio * (probe.width - 1))));
      const y = Math.max(0, Math.min(probe.height - 1, Math.round(yRatio * (probe.height - 1))));
      const pixel = context.getImageData(x, y, 1, 1).data;

      return [pixel[0] ?? 0, pixel[1] ?? 0, pixel[2] ?? 0, pixel[3] ?? 0];
    });
    Reflect.set(window, "__dpcReadCanvasPixels", (columns: number, rows: number): Rgba[] => {
      const readPixel = Reflect.get(window, "__dpcReadCanvasPixel") as (x: number, y: number) => Rgba;
      const pixels: Rgba[] = [];

      for (let row = 0; row < rows; row += 1) {
        for (let column = 0; column < columns; column += 1) {
          pixels.push(readPixel((column + 0.5) / columns, (row + 0.5) / rows));
        }
      }

      return pixels;
    });

    const originalRaf = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (callback) => {
      counters.rafRequests += 1;

      return originalRaf((time) => {
        counters.rafCallbacks += 1;
        callback(time);
      });
    };

    const patchWebGL = () => {
      const WebGL2 = window.WebGL2RenderingContext;

      if (!WebGL2) {
        return;
      }

      const originalCreateTexture = WebGL2.prototype.createTexture;
      WebGL2.prototype.createTexture = function patchedCreateTexture(this: WebGL2RenderingContext) {
        counters.createTexture += 1;

        return originalCreateTexture.call(this);
      };

      const originalTexImage2D = WebGL2.prototype.texImage2D;
      WebGL2.prototype.texImage2D = function patchedTexImage2D(
        this: WebGL2RenderingContext,
        ...args
      ) {
        counters.texImage2D += 1;

        return Reflect.apply(originalTexImage2D, this, args);
      } as WebGL2RenderingContext["texImage2D"];
    };

    patchWebGL();
  });
}

async function gotoReady(page: Page, url = "/"): Promise<void> {
  await page.goto(url);
  await page.waitForFunction(() => window.__dpcPlayground?.ready === true);
  await page.waitForFunction(() => (window.__dpcPlayground?.stats?.frames ?? 0) > 0);
}

async function sampleCanvasSummary(page: Page): Promise<{ nonTransparent: number; uniqueColors: number }> {
  const image = decodePng(await page.locator("[data-dpc-canvas]").screenshot());
  const colors = new Set<string>();
  let nonTransparent = 0;

  for (let row = 0; row < 8; row += 1) {
    for (let column = 0; column < 12; column += 1) {
      const pixel = readDecodedPixel(image, (column + 0.5) / 12, (row + 0.5) / 8);

      if (pixel[3] > 0) {
        nonTransparent += 1;
      }

      colors.add(pixel.join(","));
    }
  }

  return { nonTransparent, uniqueColors: colors.size };
}

async function sampleCanvasPixel(page: Page, xRatio: number, yRatio: number): Promise<Rgba> {
  const image = decodePng(await page.locator("[data-dpc-canvas]").screenshot());

  return readDecodedPixel(image, xRatio, yRatio);
}

async function sampleCanvasGrid(
  page: Page,
  centerX: number,
  centerY: number,
  halfWidth: number,
  halfHeight: number,
  columns: number,
  rows: number
): Promise<Rgba[]> {
  const image = decodePng(await page.locator("[data-dpc-canvas]").screenshot());
  const pixels: Rgba[] = [];

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const xRatio = centerX - halfWidth + (halfWidth * 2 * column) / (columns - 1);
      const yRatio = centerY - halfHeight + (halfHeight * 2 * row) / (rows - 1);
      pixels.push(readDecodedPixel(image, xRatio, yRatio));
    }
  }

  return pixels;
}

async function getDiagnostics(page: Page) {
  return page.evaluate(() => ({
    errors: window.__dpcPlayground?.errors ?? [],
    ready: window.__dpcPlayground?.ready ?? false,
    stats: window.__dpcPlayground?.stats
  }));
}

async function getCounters(page: Page): Promise<BrowserCounters> {
  return page.evaluate(() => ({
    ...((Reflect.get(window, "__dpcBrowserCounters") as Record<string, number>) ?? {}),
    frames: window.__dpcPlayground?.stats?.frames ?? 0
  })) as Promise<BrowserCounters>;
}

function colorDistance(left: Rgba, right: Rgba): number {
  return Math.hypot(left[0] - right[0], left[1] - right[1], left[2] - right[2], left[3] - right[3]);
}

function countHorizontalTransitions(values: boolean[], columns: number): number {
  let transitions = 0;

  for (let index = 1; index < values.length; index += 1) {
    if (index % columns !== 0 && values[index] !== values[index - 1]) {
      transitions += 1;
    }
  }

  return transitions;
}

function point(box: { height: number; width: number; x: number; y: number }, xRatio: number, yRatio: number) {
  return {
    x: box.x + box.width * xRatio,
    y: box.y + box.height * yRatio
  };
}

function pointTuple(
  box: { height: number; width: number; x: number; y: number },
  xRatio: number,
  yRatio: number
): [number, number] {
  const coordinates = point(box, xRatio, yRatio);

  return [coordinates.x, coordinates.y];
}

type DecodedPng = {
  data: Uint8Array;
  height: number;
  width: number;
};

function decodePng(buffer: Buffer): DecodedPng {
  const signature = buffer.subarray(0, 8).toString("hex");

  if (signature !== "89504e470d0a1a0a") {
    throw new Error("Screenshot was not a PNG.");
  }

  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  const chunks: Buffer[] = [];

  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.subarray(offset + 4, offset + 8).toString("ascii");
    const data = buffer.subarray(offset + 8, offset + 8 + length);

    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8] ?? 0;
      colorType = data[9] ?? 0;
    } else if (type === "IDAT") {
      chunks.push(data);
    } else if (type === "IEND") {
      break;
    }

    offset += 12 + length;
  }

  if (bitDepth !== 8 || (colorType !== 2 && colorType !== 6)) {
    throw new Error(`Unsupported PNG format: bitDepth=${bitDepth}, colorType=${colorType}.`);
  }

  const channels = colorType === 6 ? 4 : 3;
  const stride = width * channels;
  const inflated = inflateSync(Buffer.concat(chunks));
  const rgba = new Uint8Array(width * height * 4);
  const previous = new Uint8Array(stride);
  const current = new Uint8Array(stride);
  let sourceOffset = 0;

  for (let y = 0; y < height; y += 1) {
    const filter = inflated[sourceOffset] ?? 0;
    sourceOffset += 1;
    current.set(inflated.subarray(sourceOffset, sourceOffset + stride));
    sourceOffset += stride;
    unfilterScanline(current, previous, filter, channels);

    for (let x = 0; x < width; x += 1) {
      const sourceIndex = x * channels;
      const targetIndex = (y * width + x) * 4;
      rgba[targetIndex] = current[sourceIndex] ?? 0;
      rgba[targetIndex + 1] = current[sourceIndex + 1] ?? 0;
      rgba[targetIndex + 2] = current[sourceIndex + 2] ?? 0;
      rgba[targetIndex + 3] = channels === 4 ? current[sourceIndex + 3] ?? 0 : 255;
    }

    previous.set(current);
  }

  return { data: rgba, height, width };
}

function unfilterScanline(
  scanline: Uint8Array,
  previous: Uint8Array,
  filter: number,
  bytesPerPixel: number
): void {
  for (let index = 0; index < scanline.length; index += 1) {
    const left = index >= bytesPerPixel ? scanline[index - bytesPerPixel] ?? 0 : 0;
    const up = previous[index] ?? 0;
    const upLeft = index >= bytesPerPixel ? previous[index - bytesPerPixel] ?? 0 : 0;
    let value = scanline[index] ?? 0;

    if (filter === 1) {
      value += left;
    } else if (filter === 2) {
      value += up;
    } else if (filter === 3) {
      value += Math.floor((left + up) / 2);
    } else if (filter === 4) {
      value += paeth(left, up, upLeft);
    } else if (filter !== 0) {
      throw new Error(`Unsupported PNG filter: ${filter}.`);
    }

    scanline[index] = value & 255;
  }
}

function paeth(left: number, up: number, upLeft: number): number {
  const estimate = left + up - upLeft;
  const leftDistance = Math.abs(estimate - left);
  const upDistance = Math.abs(estimate - up);
  const upLeftDistance = Math.abs(estimate - upLeft);

  if (leftDistance <= upDistance && leftDistance <= upLeftDistance) {
    return left;
  }

  return upDistance <= upLeftDistance ? up : upLeft;
}

function readDecodedPixel(image: DecodedPng, xRatio: number, yRatio: number): Rgba {
  const x = Math.max(0, Math.min(image.width - 1, Math.round(xRatio * (image.width - 1))));
  const y = Math.max(0, Math.min(image.height - 1, Math.round(yRatio * (image.height - 1))));
  const index = (y * image.width + x) * 4;

  return [
    image.data[index] ?? 0,
    image.data[index + 1] ?? 0,
    image.data[index + 2] ?? 0,
    image.data[index + 3] ?? 0
  ];
}
