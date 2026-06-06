import { describe, expect, it } from "vitest";
import {
  findNearestPaletteColor,
  parseColor,
  resolvePalette,
  serializeColor
} from "./color";

describe("color utilities", () => {
  it("parses compact and expanded hex colors", () => {
    expect(serializeColor(parseColor("#abc"))).toEqual([170, 187, 204, 255]);
    expect(serializeColor(parseColor("#11223380"))).toEqual([17, 34, 51, 128]);
  });

  it("rejects invalid colors with a useful error", () => {
    expect(() => parseColor("blue")).toThrow(/Invalid color/);
    expect(() => parseColor("#12")).toThrow(/Invalid color/);
  });

  it("maps colors to the nearest palette entry", () => {
    const palette = resolvePalette(["#000000", "#ffffff"]);

    expect(palette).not.toBe("source");

    if (palette !== "source") {
      expect(serializeColor(findNearestPaletteColor(parseColor("#eeeeee"), palette))).toEqual([
        255,
        255,
        255,
        255
      ]);
      expect(serializeColor(findNearestPaletteColor(parseColor("#101010"), palette))).toEqual([
        0,
        0,
        0,
        255
      ]);
    }
  });
});
