import { describe, expect, it } from "vitest";
import { normalizeLayer } from "../../layers/layer-state";
import { createImageData } from "../../utils/image-data";
import { Canvas2DBackend } from "../canvas2d/Canvas2DBackend";
import { WebGL2Backend } from "./WebGL2Backend";
import { createMockCanvas, createMockWebGL2Context } from "./test-utils";

const WEBGL2_CANVAS2D_PREPROCESS_TOLERANCE = 0;

describe("WebGL2 preprocessing parity", () => {
  it("matches the Canvas2D oracle for filter and ordered-dither fixtures", () => {
    const size = { height: 2, width: 2 };
    const layer = normalizeLayer(
      "foreground",
      {
        dither: { amount: 1, matrixSize: 4, palette: "mono" },
        filters: [
          { type: "opacity", amount: 0.5 },
          { type: "brightness", amount: 1.4 },
          { type: "contrast", amount: 1.1 },
          { type: "posterize", levels: 3 }
        ],
        fit: "stretch",
        opacity: 0.75,
        src: "fixture"
      },
      {
        height: 2,
        imageData: createImageData(
          2,
          2,
          new Uint8ClampedArray([
            20, 40, 80, 255,
            90, 120, 150, 255,
            170, 190, 210, 255,
            240, 240, 220, 255
          ])
        ),
        kind: "image-data",
        width: 2
      }
    );

    const canvasBackend = new Canvas2DBackend();
    canvasBackend.resize(size);
    const oracle = canvasBackend.renderToImageData({ foreground: layer });

    const webglBackend = new WebGL2Backend();
    webglBackend.init(createMockCanvas(createMockWebGL2Context()), size);
    const output = webglBackend.renderPreprocessedLayerForTest(layer);

    expect(maxChannelDelta(output, oracle)).toBeLessThanOrEqual(
      WEBGL2_CANVAS2D_PREPROCESS_TOLERANCE
    );
  });
});

function maxChannelDelta(left: ImageData, right: ImageData): number {
  let max = 0;

  for (let index = 0; index < left.data.length; index += 1) {
    max = Math.max(max, Math.abs((left.data[index] ?? 0) - (right.data[index] ?? 0)));
  }

  return max;
}
