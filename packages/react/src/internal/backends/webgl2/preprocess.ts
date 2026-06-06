import {
  applyOpacityFilters,
  applyPreDitherFilters
} from "../../filters/builtin";
import type { NormalizedLayer, RenderSize } from "../../renderer/types";
import { clamp01, toByte } from "../../utils/color";
import { cloneImageData, createImageData, getPixel, setPixel } from "../../utils/image-data";
import { applyOrderedDither } from "../canvas2d/ordered-dither";

export function preprocessLayerToImageData(
  layer: NormalizedLayer,
  size: RenderSize
): ImageData {
  if (!layer.visible) {
    return createImageData(size.width, size.height);
  }

  const fitted = fitImageData(layer.source.imageData, size, layer);
  const filtered = applyPreDitherFilters(fitted, layer.filters);
  const dithered = applyOrderedDither(filtered, layer.dither);
  const opacityFiltered = applyOpacityFilters(dithered, layer.filters);

  if (layer.opacity === 1) {
    return opacityFiltered;
  }

  const output = cloneImageData(opacityFiltered);
  const opacity = clamp01(layer.opacity);

  for (let index = 3; index < output.data.length; index += 4) {
    output.data[index] = toByte(output.data[index] * opacity);
  }

  return output;
}

function fitImageData(
  source: ImageData | undefined,
  size: RenderSize,
  layer: NormalizedLayer
): ImageData {
  if (!source) {
    return createImageData(size.width, size.height);
  }

  if (
    source.width === size.width &&
    source.height === size.height &&
    layer.fit === "stretch"
  ) {
    return cloneImageData(source);
  }

  const output = createImageData(size.width, size.height);
  const scale = getFitScale(source, size, layer.fit);
  const drawnWidth = source.width * scale.x;
  const drawnHeight = source.height * scale.y;
  const offset = getFitOffset(size, drawnWidth, drawnHeight, layer.position);

  for (let y = 0; y < size.height; y += 1) {
    for (let x = 0; x < size.width; x += 1) {
      const sourceX = Math.floor((x - offset.x) / scale.x);
      const sourceY = Math.floor((y - offset.y) / scale.y);

      if (
        sourceX >= 0 &&
        sourceX < source.width &&
        sourceY >= 0 &&
        sourceY < source.height
      ) {
        setPixel(output, x, y, getPixel(source, sourceX, sourceY));
      }
    }
  }

  return output;
}

function getFitScale(
  source: ImageData,
  size: RenderSize,
  fit: NormalizedLayer["fit"]
): { x: number; y: number } {
  if (fit === "none") {
    return { x: 1, y: 1 };
  }

  const scaleX = size.width / source.width;
  const scaleY = size.height / source.height;

  if (fit === "contain") {
    const scale = Math.min(scaleX, scaleY);

    return { x: scale, y: scale };
  }

  if (fit === "cover") {
    const scale = Math.max(scaleX, scaleY);

    return { x: scale, y: scale };
  }

  return { x: scaleX, y: scaleY };
}

function getFitOffset(
  size: RenderSize,
  drawnWidth: number,
  drawnHeight: number,
  position: NormalizedLayer["position"]
): { x: number; y: number } {
  if (position === "center") {
    return {
      x: (size.width - drawnWidth) / 2,
      y: (size.height - drawnHeight) / 2
    };
  }

  return {
    x: (size.width - drawnWidth) * position.x,
    y: (size.height - drawnHeight) * position.y
  };
}
