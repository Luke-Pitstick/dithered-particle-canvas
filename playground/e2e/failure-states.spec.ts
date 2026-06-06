import { expect, test, type Page } from "@playwright/test";

test("invalid image source reports a decode error", async ({ page }) => {
  await page.goto("/?fixture=invalid");

  await page.waitForFunction(() => (window.__dpcPlayground?.errors.length ?? 0) > 0);

  const errors = await page.evaluate(() => window.__dpcPlayground?.errors ?? []);

  expect(errors[0]?.code).toBe("SOURCE_DECODE_FAILED");
  expect(errors[0]?.message).toContain("Image source could not be decoded");
});

test("tainted export rejects with a CORS-readable error path", async ({ page }) => {
  await gotoReady(page, "/?fixture=tainted");

  const result = await page.evaluate(() => window.__dpcPlayground?.exportFrame());

  expect(result?.ok).toBe(false);
  expect(result?.message).toContain("tainted");
});

test("WebGL2 unavailable falls back to Canvas2D and still shows the hero", async ({ page }) => {
  await page.addInitScript(() => {
    const originalGetContext = HTMLCanvasElement.prototype.getContext;

    HTMLCanvasElement.prototype.getContext = function patchedGetContext(
      this: HTMLCanvasElement,
      contextId: string,
      options?: CanvasRenderingContext2DSettings | WebGLContextAttributes
    ) {
      if (contextId === "webgl2") {
        return null;
      }

      return originalGetContext.call(this, contextId, options);
    } as HTMLCanvasElement["getContext"];
  });

  await gotoReady(page);

  const diagnostics = await page.evaluate(() => window.__dpcPlayground);
  const pixel = await page.evaluate(() => {
    const canvas = document.querySelector("[data-dpc-canvas]") as HTMLCanvasElement | null;

    if (!canvas) {
      throw new Error("Dithered canvas was not found.");
    }

    const context = canvas.getContext("2d", { willReadFrequently: true });

    if (!context) {
      throw new Error("Canvas2D fallback context was not available.");
    }

    return Array.from(context.getImageData(Math.round(canvas.width * 0.5), Math.round(canvas.height * 0.34), 1, 1).data);
  });

  expect(diagnostics?.stats?.backend).toBe("canvas2d");
  expect(diagnostics?.errors[0]?.code).toBe("BACKEND_UNAVAILABLE");
  expect(pixel[3]).toBe(255);
  expect(pixel[0] + pixel[1] + pixel[2]).toBeGreaterThan(80);
});

async function gotoReady(page: Page, url = "/"): Promise<void> {
  await page.goto(url);
  await page.waitForFunction(() => window.__dpcPlayground?.ready === true);
  await page.waitForFunction(() => (window.__dpcPlayground?.stats?.frames ?? 0) > 0);
}
