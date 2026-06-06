import type { BuiltInFilterConfig } from "../../types";
import { clamp01, mixColors, parseColor, toByte } from "../utils/color";
import { cloneImageData, createImageData, type ImageDataLike } from "../utils/image-data";

const FILTER_ORDER: BuiltInFilterConfig["type"][] = [
  "brightness",
  "contrast",
  "posterize",
  "tint",
  "opacity"
];

export function sortFiltersInFixedOrder(
  filters: readonly BuiltInFilterConfig[] = []
): BuiltInFilterConfig[] {
  return [...filters].sort((left, right) => {
    return FILTER_ORDER.indexOf(left.type) - FILTER_ORDER.indexOf(right.type);
  });
}

export function applyBuiltInFilters(
  imageData: ImageDataLike,
  filters: readonly BuiltInFilterConfig[] = []
): ImageData {
  const output = cloneImageData(imageData);

  for (const filter of sortFiltersInFixedOrder(filters)) {
    applyFilterInPlace(output, filter);
  }

  return output;
}

export function applyPreDitherFilters(
  imageData: ImageDataLike,
  filters: readonly BuiltInFilterConfig[] = []
): ImageData {
  return applyBuiltInFilters(
    imageData,
    filters.filter((filter) => filter.type !== "opacity")
  );
}

export function applyOpacityFilters(
  imageData: ImageDataLike,
  filters: readonly BuiltInFilterConfig[] = []
): ImageData {
  return applyBuiltInFilters(
    imageData,
    filters.filter((filter) => filter.type === "opacity")
  );
}

export function applyFilterToPixel(
  pixel: readonly [number, number, number, number],
  filter: BuiltInFilterConfig
): [number, number, number, number] {
  const scratch = createImageData(1, 1, new Uint8ClampedArray(pixel));
  applyFilterInPlace(scratch, filter);

  return [scratch.data[0], scratch.data[1], scratch.data[2], scratch.data[3]];
}

function applyFilterInPlace(imageData: ImageDataLike, filter: BuiltInFilterConfig): void {
  switch (filter.type) {
    case "brightness":
      mapRgb(imageData, (channel) => channel * filter.amount);
      return;
    case "contrast":
      mapRgb(imageData, (channel) => (channel - 128) * filter.amount + 128);
      return;
    case "posterize": {
      const levels = Math.max(2, Math.round(filter.levels));
      const step = 255 / (levels - 1);
      mapRgb(imageData, (channel) => Math.round(channel / step) * step);
      return;
    }
    case "tint": {
      const tint = parseColor(filter.color);
      const amount = clamp01(filter.amount);

      for (let index = 0; index < imageData.data.length; index += 4) {
        const mixed = mixColors(
          {
            a: imageData.data[index + 3] ?? 0,
            b: imageData.data[index + 2] ?? 0,
            g: imageData.data[index + 1] ?? 0,
            r: imageData.data[index] ?? 0
          },
          tint,
          amount
        );

        imageData.data[index] = toByte(mixed.r);
        imageData.data[index + 1] = toByte(mixed.g);
        imageData.data[index + 2] = toByte(mixed.b);
      }

      return;
    }
    case "opacity": {
      const amount = clamp01(filter.amount);

      for (let index = 3; index < imageData.data.length; index += 4) {
        imageData.data[index] = toByte((imageData.data[index] ?? 0) * amount);
      }
    }
  }
}

function mapRgb(imageData: ImageDataLike, map: (channel: number) => number): void {
  for (let index = 0; index < imageData.data.length; index += 4) {
    imageData.data[index] = toByte(map(imageData.data[index] ?? 0));
    imageData.data[index + 1] = toByte(map(imageData.data[index + 1] ?? 0));
    imageData.data[index + 2] = toByte(map(imageData.data[index + 2] ?? 0));
  }
}
