import type { DitherConfig } from "../../../types";
import {
  clamp01,
  findNearestPaletteColor,
  mixColors,
  resolvePalette,
  toByte,
  type RgbaColor
} from "../../utils/color";
import { cloneImageData, type ImageDataLike } from "../../utils/image-data";

export const BAYER_4: readonly (readonly number[])[] = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5]
];

export const BAYER_8: readonly (readonly number[])[] = [
  [0, 48, 12, 60, 3, 51, 15, 63],
  [32, 16, 44, 28, 35, 19, 47, 31],
  [8, 56, 4, 52, 11, 59, 7, 55],
  [40, 24, 36, 20, 43, 27, 39, 23],
  [2, 50, 14, 62, 1, 49, 13, 61],
  [34, 18, 46, 30, 33, 17, 45, 29],
  [10, 58, 6, 54, 9, 57, 5, 53],
  [42, 26, 38, 22, 41, 25, 37, 21]
];

export function getOrderedDitherMatrix(size: 4 | 8): readonly (readonly number[])[] {
  return size === 4 ? BAYER_4 : BAYER_8;
}

export function applyOrderedDither(
  imageData: ImageDataLike,
  config: DitherConfig | false | undefined
): ImageData {
  if (config === false) {
    return cloneImageData(imageData);
  }

  const amount = clamp01(config?.amount ?? 1);
  const palette = resolvePalette(config?.palette);

  if (amount === 0 || palette === "source") {
    return cloneImageData(imageData);
  }

  const matrixSize = config?.matrixSize ?? 4;
  const matrix = getOrderedDitherMatrix(matrixSize);
  const output = cloneImageData(imageData);
  const pixelSize = Math.max(1, Math.round(config?.pixelSize ?? 1));
  const matrixDivisor = matrixSize * matrixSize;

  for (let y = 0; y < output.height; y += 1) {
    for (let x = 0; x < output.width; x += 1) {
      const index = (y * output.width + x) * 4;
      const threshold =
        ((matrix[Math.floor(y / pixelSize) % matrixSize]?.[
          Math.floor(x / pixelSize) % matrixSize
        ] ?? 0) + 0.5) /
          matrixDivisor -
        0.5;
      const bias = threshold * 96 * amount;
      const original: RgbaColor = {
        a: output.data[index + 3] ?? 0,
        b: output.data[index + 2] ?? 0,
        g: output.data[index + 1] ?? 0,
        r: output.data[index] ?? 0
      };
      const biased: RgbaColor = {
        ...original,
        b: toByte(original.b + bias),
        g: toByte(original.g + bias),
        r: toByte(original.r + bias)
      };
      const nearest = findNearestPaletteColor(biased, palette);
      const mixed = mixColors(original, { ...nearest, a: original.a }, amount);

      output.data[index] = toByte(mixed.r);
      output.data[index + 1] = toByte(mixed.g);
      output.data[index + 2] = toByte(mixed.b);
      output.data[index + 3] = toByte(mixed.a);
    }
  }

  return output;
}
