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

const SKY_REVEAL_POINT = { x: 0.68, y: 0.31 } as const;
const BROWSERBASE_RESOLUTION_SCALE = 0.42;

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

test("layer control sliders update live playground config", async ({ page }) => {
  await gotoReady(page);

  await page.getByTestId("layer-control-background").click();
  await expect(page.getByTestId("background-layer-popover")).toBeVisible();
  await setSliderValue(page, "background-contrast-slider", 1.22);
  await setSliderValue(page, "resolution-scale-slider", 0.5);
  await waitForCanvasResolutionScale(page, 0.5);

  await page.getByTestId("layer-control-background").click();
  await expect(page.getByTestId("background-layer-popover")).toBeHidden();

  await page.getByTestId("layer-control-foreground").click();
  await expect(page.getByTestId("foreground-layer-popover")).toBeVisible();
  await setSliderValue(page, "foreground-opacity-slider", 0.82);
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("foreground-layer-popover")).toBeHidden();

  const beforeMountains = await samplePageGrid(page, 0.2, 0.82, 0.08, 0.04, 7, 5);
  await page.getByTestId("layer-control-mountains").click();
  await expect(page.getByTestId("mountains-layer-popover")).toBeVisible();
  await expect(page.getByTestId("mountains-color-mode-control")).toBeVisible();
  await expect(page.getByTestId("mountains-color-mode-limited")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("mountains-color-mode-original")).toHaveAttribute("aria-pressed", "false");
  await setSliderValue(page, "mountains-colorCount-slider", 8);
  await setSliderValue(page, "mountains-hue-slider", 70);
  await setSliderValue(page, "mountains-saturation-slider", 0.35);
  await expect
    .poll(async () => {
      const afterMountains = await samplePageGrid(page, 0.2, 0.82, 0.08, 0.04, 7, 5);

      return Math.max(
        ...afterMountains.map((pixel, index) => colorDistance(pixel, beforeMountains[index]!))
      );
    })
    .toBeGreaterThan(20);
  const limitedMountains = await samplePageGrid(page, 0.2, 0.82, 0.08, 0.04, 7, 5);
  await page.getByTestId("mountains-color-mode-original").click();
  await expect(page.getByTestId("mountains-color-mode-limited")).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByTestId("mountains-color-mode-original")).toHaveAttribute("aria-pressed", "true");
  await expect
    .poll(async () => {
      const originalMountains = await samplePageGrid(page, 0.2, 0.82, 0.08, 0.04, 7, 5);

      return Math.max(
        ...originalMountains.map((pixel, index) => colorDistance(pixel, limitedMountains[index]!))
      );
    })
    .toBeGreaterThan(20);
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("mountains-layer-popover")).toBeHidden();

  await expect(page.getByRole("img", { name: "Browserbase style dithered reveal hero" })).toBeVisible();
  expect((await getDiagnostics(page)).stats?.frames ?? 0).toBeGreaterThan(0);

  const summary = await sampleCanvasSummary(page);

  expect(summary.nonTransparent).toBeGreaterThan(20);
});

test("pointer movement reveals background pixels while distant foreground stays stable", async ({ page }) => {
  await gotoReady(page);

  const canvas = page.locator("[data-dpc-canvas]");
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();

  const center = point(box!, SKY_REVEAL_POINT.x, SKY_REVEAL_POINT.y);
  const stableMountain = point(box!, 0.18, 0.84);
  const beforeReveal = await sampleCanvasPixel(page, SKY_REVEAL_POINT.x, SKY_REVEAL_POINT.y);
  const beforeStable = await sampleCanvasPixel(page, 0.18, 0.84);

  await page.mouse.move(center.x, center.y);
  await page.waitForTimeout(90);

  const duringReveal = await sampleCanvasPixel(page, SKY_REVEAL_POINT.x, SKY_REVEAL_POINT.y);
  const duringStable = await sampleCanvasPixel(page, 0.18, 0.84);

  expect(colorDistance(beforeReveal, duringReveal)).toBeGreaterThan(20);
  expect(colorDistance(beforeStable, duringStable)).toBeLessThan(8);

  await page.mouse.move(stableMountain.x, stableMountain.y);
});

test("pointer reveal does not introduce a second mountain silhouette", async ({ page }) => {
  await gotoReady(page);

  const canvas = page.locator("[data-dpc-canvas]");
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();

  const hiddenSilhouette = point(box!, 0.72, 0.5);

  await page.mouse.move(hiddenSilhouette.x, hiddenSilhouette.y);
  await page.waitForTimeout(90);

  const revealed = await samplePagePixel(page, 0.72, 0.5);
  const revealSky = await samplePageGrid(page, 0.22, 0.46, 0.12, 0.035, 17, 7);
  const darkArtifacts = revealSky.filter(isDarkArtifact);

  expect(revealed[3]).toBeGreaterThan(0);
  expect(isDarkArtifact(revealed)).toBe(false);
  expect(darkArtifacts).toHaveLength(0);
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
  const transitions = countGridTransitions(changed, 33);

  expect(changedCount).toBeGreaterThan(20);
  expect(changedCount).toBeLessThan(changed.length - 20);
  expect(transitions).toBeGreaterThan(18);
});

test("pixelated reveal edge flickers while the cursor is active", async ({ page }) => {
  await gotoReady(page);

  const canvas = page.locator("[data-dpc-canvas]");
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();

  const center = point(box!, 0.52, 0.34);

  await page.mouse.move(center.x, center.y);
  await page.waitForTimeout(90);

  const first = await sampleCanvasGrid(page, 0.52, 0.34, 0.11, 0.035, 33, 9);
  await page.waitForTimeout(180);
  const second = await sampleCanvasGrid(page, 0.52, 0.34, 0.11, 0.035, 33, 9);
  const changed = second.map((pixel, index) => colorDistance(pixel, first[index]!) > 18);

  expect(changed.filter(Boolean).length).toBeGreaterThan(8);
  expect(countGridTransitions(changed, 33)).toBeGreaterThan(12);
});

test("reveal clears after pointer leave and dust duration expires", async ({ page }) => {
  await gotoReady(page);

  const canvas = page.locator("[data-dpc-canvas]");
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();

  const center = point(box!, SKY_REVEAL_POINT.x, SKY_REVEAL_POINT.y);
  const before = await sampleCanvasGrid(page, SKY_REVEAL_POINT.x, SKY_REVEAL_POINT.y, 0.055, 0.035, 21, 9);

  await page.mouse.move(center.x, center.y);
  await page.waitForTimeout(80);
  const during = await sampleCanvasGrid(page, SKY_REVEAL_POINT.x, SKY_REVEAL_POINT.y, 0.055, 0.035, 21, 9);

  await page.mouse.move(box!.x + box!.width + 24, box!.y + box!.height + 24);
  await page.waitForTimeout(1000);
  const after = await sampleCanvasGrid(page, SKY_REVEAL_POINT.x, SKY_REVEAL_POINT.y, 0.055, 0.035, 21, 9);
  const revealed = during.map((pixel, index) => colorDistance(pixel, before[index]!) > 18);
  const remaining = after.map((pixel, index) => colorDistance(pixel, before[index]!) > 12);

  expect(revealed.filter(Boolean).length).toBeGreaterThan(12);
  expect(remaining.filter(Boolean).length).toBeLessThan(6);
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

test("lower-resolution Browserbase setting keeps layout size stable in WebGL2 mode", async ({ page }) => {
  await gotoReady(page, "/?backend=webgl2");

  const diagnostics = await getDiagnostics(page);

  if (diagnostics.stats?.backend !== "webgl2") {
    test.info().annotations.push({
      type: "skip-detail",
      description: "WebGL2 was unavailable, so auto fallback handled this browser."
    });
    return;
  }

  await expectLowResolutionCanvas(page, BROWSERBASE_RESOLUTION_SCALE);
});

test("lower-resolution Browserbase setting keeps layout size stable in Canvas2D mode", async ({ page }) => {
  await gotoReady(page, "/?backend=canvas2d");

  const diagnostics = await getDiagnostics(page);

  expect(diagnostics.stats?.backend).toBe("canvas2d");
  await expectLowResolutionCanvas(page, BROWSERBASE_RESOLUTION_SCALE);
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

async function setSliderValue(page: Page, testId: string, value: number): Promise<void> {
  await page.getByTestId(testId).evaluate((element, nextValue) => {
    const input = element as HTMLInputElement;
    const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;

    valueSetter?.call(input, String(nextValue));
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }, value);
}

async function waitForCanvasResolutionScale(page: Page, scale: number): Promise<void> {
  await expect
    .poll(async () => {
      const metrics = await page.locator("[data-dpc-canvas]").evaluate((canvas, scaleValue) => {
        const element = canvas as HTMLCanvasElement;
        const rect = element.getBoundingClientRect();

        return {
          attrHeight: element.height,
          attrWidth: element.width,
          expectedHeight: Math.round(rect.height * window.devicePixelRatio * scaleValue),
          expectedWidth: Math.round(rect.width * window.devicePixelRatio * scaleValue)
        };
      }, scale);

      return metrics.attrWidth === metrics.expectedWidth && metrics.attrHeight === metrics.expectedHeight;
    })
    .toBe(true);
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

async function samplePagePixel(page: Page, xRatio: number, yRatio: number): Promise<Rgba> {
  const image = decodePng(await page.screenshot({ fullPage: true }));

  return readDecodedPixel(image, xRatio, yRatio);
}

async function samplePageGrid(
  page: Page,
  centerX: number,
  centerY: number,
  halfWidth: number,
  halfHeight: number,
  columns: number,
  rows: number
): Promise<Rgba[]> {
  const image = decodePng(await page.screenshot({ fullPage: true }));
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

async function expectLowResolutionCanvas(page: Page, scale: number): Promise<void> {
  const metrics = await page.locator("[data-dpc-canvas]").evaluate((canvas) => {
    const element = canvas as HTMLCanvasElement;
    const rect = element.getBoundingClientRect();

    return {
      attrHeight: element.height,
      attrWidth: element.width,
      cssHeight: rect.height,
      cssWidth: rect.width,
      dpr: window.devicePixelRatio
    };
  });

  expect(metrics.cssWidth).toBeGreaterThan(600);
  expect(metrics.cssHeight).toBeGreaterThan(300);
  expect(metrics.attrWidth).toBe(Math.round(metrics.cssWidth * metrics.dpr * scale));
  expect(metrics.attrHeight).toBe(Math.round(metrics.cssHeight * metrics.dpr * scale));
}

function colorDistance(left: Rgba, right: Rgba): number {
  return Math.hypot(left[0] - right[0], left[1] - right[1], left[2] - right[2], left[3] - right[3]);
}

function isDarkArtifact(pixel: Rgba): boolean {
  const brightness = (pixel[0] + pixel[1] + pixel[2]) / 3;

  return pixel[3] > 0 && brightness < 82;
}

function countGridTransitions(values: boolean[], columns: number): number {
  let transitions = 0;

  for (let index = 1; index < values.length; index += 1) {
    if (index % columns !== 0 && values[index] !== values[index - 1]) {
      transitions += 1;
    }
  }

  for (let index = columns; index < values.length; index += 1) {
    if (values[index] !== values[index - columns]) {
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
