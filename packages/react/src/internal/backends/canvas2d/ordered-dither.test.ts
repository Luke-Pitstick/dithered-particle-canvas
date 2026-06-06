import { describe, expect, it } from "vitest";
import { applyOrderedDither, getOrderedDitherMatrix } from "./ordered-dither";
import { createImageData } from "../../utils/image-data";

describe("ordered dither", () => {
  it("supports 4x4 and 8x8 Bayer matrices", () => {
    expect(getOrderedDitherMatrix(4)).toHaveLength(4);
    expect(getOrderedDitherMatrix(4)[0]).toHaveLength(4);
    expect(getOrderedDitherMatrix(8)).toHaveLength(8);
    expect(getOrderedDitherMatrix(8)[0]).toHaveLength(8);
  });

  it("matches the generated mono golden fixture for a fixed 2x2 image", () => {
    const input = createImageData(
      2,
      2,
      new Uint8ClampedArray([
        20, 20, 20, 255,
        80, 80, 80, 255,
        160, 160, 160, 255,
        230, 230, 230, 255
      ])
    );
    const output = applyOrderedDither(input, {
      amount: 1,
      matrixSize: 4,
      palette: "mono"
    });

    expect([...output.data]).toEqual([
      0, 0, 0, 255,
      0, 0, 0, 255,
      255, 255, 255, 255,
      255, 255, 255, 255
    ]);
  });

  it("uses pixelSize to group ordered dither thresholds into visibly coarser blocks", () => {
    const input = createImageData(
      4,
      1,
      new Uint8ClampedArray([
        128, 128, 128, 255,
        128, 128, 128, 255,
        128, 128, 128, 255,
        128, 128, 128, 255
      ])
    );
    const output = applyOrderedDither(input, {
      amount: 1,
      matrixSize: 4,
      palette: "mono",
      pixelSize: 2
    });

    expect([...output.data]).toEqual([
      0, 0, 0, 255,
      0, 0, 0, 255,
      255, 255, 255, 255,
      255, 255, 255, 255
    ]);
  });
});
