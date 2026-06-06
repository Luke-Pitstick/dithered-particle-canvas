import { describe, expect, it } from "vitest";
import { applyBuiltInFilters, applyFilterToPixel } from "./builtin";
import { createImageData } from "../utils/image-data";

describe("built-in CPU filters", () => {
  it("applies brightness, contrast, posterize, tint, and opacity", () => {
    expect(applyFilterToPixel([100, 120, 140, 200], { type: "brightness", amount: 1.2 })).toEqual([
      120,
      144,
      168,
      200
    ]);
    expect(applyFilterToPixel([100, 120, 140, 200], { type: "contrast", amount: 1.5 })).toEqual([
      86,
      116,
      146,
      200
    ]);
    expect(applyFilterToPixel([80, 140, 220, 200], { type: "posterize", levels: 3 })).toEqual([
      128,
      128,
      255,
      200
    ]);
    expect(applyFilterToPixel([100, 100, 200, 200], { type: "tint", color: "#ff0000", amount: 0.5 })).toEqual([
      178,
      50,
      100,
      200
    ]);
    expect(applyFilterToPixel([100, 120, 140, 200], { type: "opacity", amount: 0.25 })).toEqual([
      100,
      120,
      140,
      50
    ]);
  });

  it("uses the fixed V1 order regardless of input order", () => {
    const imageData = createImageData(
      1,
      1,
      new Uint8ClampedArray([80, 80, 80, 200])
    );
    const output = applyBuiltInFilters(imageData, [
      { type: "opacity", amount: 0.5 },
      { type: "tint", color: "#0000ff", amount: 0.5 },
      { type: "posterize", levels: 2 },
      { type: "contrast", amount: 2 },
      { type: "brightness", amount: 2 }
    ]);

    expect([...output.data]).toEqual([128, 128, 255, 100]);
  });
});
