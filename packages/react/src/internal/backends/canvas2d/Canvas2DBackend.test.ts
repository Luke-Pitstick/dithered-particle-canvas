import { describe, expect, it } from "vitest";
import { normalizeLayer } from "../../layers/layer-state";
import { createImageData } from "../../utils/image-data";
import { Canvas2DBackend } from "./Canvas2DBackend";

describe("Canvas2DBackend oracle", () => {
  it("applies the measured backing size during init", () => {
    const canvas = {
      getContext: () => null,
      height: 720,
      width: 1280
    } as unknown as HTMLCanvasElement;
    const backend = new Canvas2DBackend();

    backend.init(canvas, { dpr: 0.5, height: 360, width: 640 });

    expect(canvas.width).toBe(640);
    expect(canvas.height).toBe(360);
  });

  it("produces deterministic ImageData from fixed generated layer fixtures", () => {
    const backend = new Canvas2DBackend();
    backend.resize({ height: 1, width: 1 });

    const background = normalizeLayer(
      "background",
      {
        dither: false,
        fit: "stretch",
        src: "fixture-background"
      },
      {
        height: 1,
        imageData: createImageData(1, 1, new Uint8ClampedArray([255, 0, 0, 255])),
        kind: "image-data",
        width: 1
      }
    );
    const foreground = normalizeLayer(
      "foreground",
      {
        dither: false,
        fit: "stretch",
        src: "fixture-foreground"
      },
      {
        height: 1,
        imageData: createImageData(1, 1, new Uint8ClampedArray([0, 0, 255, 128])),
        kind: "image-data",
        width: 1
      }
    );

    const output = backend.renderToImageData({ background, foreground });

    expect([...output.data]).toEqual([127, 0, 128, 255]);
  });

  it("uses the same filter and dither pipeline as the CPU helpers", () => {
    const backend = new Canvas2DBackend();
    backend.resize({ height: 1, width: 2 });

    const foreground = normalizeLayer(
      "foreground",
      {
        dither: { amount: 1, matrixSize: 4, palette: "mono" },
        filters: [
          { type: "opacity", amount: 0.5 },
          { type: "brightness", amount: 2 }
        ],
        fit: "stretch",
        src: "fixture-foreground"
      },
      {
        height: 1,
        imageData: createImageData(
          2,
          1,
          new Uint8ClampedArray([40, 40, 40, 200, 200, 200, 200, 200])
        ),
        kind: "image-data",
        width: 2
      }
    );

    const output = backend.renderToImageData({ foreground });

    expect([...output.data]).toEqual([
      0, 0, 0, 100,
      255, 255, 255, 100
    ]);
  });
});
