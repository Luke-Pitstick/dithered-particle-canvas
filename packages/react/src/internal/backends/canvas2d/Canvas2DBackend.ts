import {
  applyOpacityFilters,
  applyPreDitherFilters
} from "../../filters/builtin";
import { getRevealCompositeMaskAlpha } from "../../interaction/reveal-mask";
import {
  type LayerRole,
  type NormalizedLayer,
  type NormalizedLayers,
  type PointerSnapshot,
  type RenderBackend,
  type RenderFrame,
  type RenderSize
} from "../../renderer/types";
import { clamp01, toByte } from "../../utils/color";
import { cloneImageData, createImageData, getPixel, setPixel } from "../../utils/image-data";
import { applyOrderedDither } from "./ordered-dither";

const EMPTY_POINTER: PointerSnapshot = {
  active: false,
  x: 0,
  y: 0
};

export class Canvas2DBackend implements RenderBackend {
  readonly name = "canvas2d" as const;

  #canvas: HTMLCanvasElement | undefined;
  #context: CanvasRenderingContext2D | undefined;
  #layers: NormalizedLayers = {};
  #lastFrame: ImageData | undefined;
  #pointer: PointerSnapshot = EMPTY_POINTER;
  #size: RenderSize = { height: 1, width: 1 };

  init(canvas: HTMLCanvasElement, size: RenderSize): void {
    this.#canvas = canvas;
    this.#context = canvas.getContext("2d") ?? undefined;
    this.resize(size);
  }

  setLayers(layers: NormalizedLayers): void {
    this.#layers = layers;
  }

  setPointer(pointer: PointerSnapshot): void {
    this.#pointer = pointer;
  }

  resize(size: RenderSize): void {
    this.#size = size;

    if (this.#canvas) {
      this.#canvas.width = size.width;
      this.#canvas.height = size.height;
    }
  }

  render(frame: RenderFrame): void {
    const imageData = this.renderToImageData(this.#layers, frame);
    this.#lastFrame = imageData;
    this.#context?.putImageData(imageData, 0, 0);
  }

  renderToImageData(
    layers: NormalizedLayers = this.#layers,
    frame: RenderFrame = { deltaTime: 0, time: 0 }
  ): ImageData {
    const background = layers.background
      ? this.#processLayer(layers.background)
      : createImageData(this.#size.width, this.#size.height);
    const foreground = layers.foreground
      ? this.#processLayer(layers.foreground)
      : undefined;

    if (!foreground) {
      return background;
    }

    const base = sourceOver(background, foreground);
    const revealLayer = frame.revealLayer ?? "background";
    const pointer = this.#pointer;
    const reveal = revealLayer === "background" ? layers.foreground?.reveal : layers.background?.reveal;

    if (!reveal || (!pointer.active && (pointer.fade ?? 0) <= 0)) {
      return base;
    }

    return mixReveal({
      background,
      base,
      foreground,
      pointer,
      revealLayer,
      reveal
    });
  }

  async exportFrame(type: "image/png" | "image/jpeg" = "image/png"): Promise<Blob> {
    if (this.#canvas) {
      return new Promise<Blob>((resolve, reject) => {
        this.#canvas?.toBlob((blob) => {
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error("Canvas frame export failed."));
          }
        }, type);
      });
    }

    return new Blob([this.#lastFrame?.data ?? new Uint8ClampedArray()], { type });
  }

  dispose(): void {
    this.#canvas = undefined;
    this.#context = undefined;
    this.#layers = {};
    this.#lastFrame = undefined;
  }

  #processLayer(layer: NormalizedLayer): ImageData {
    if (!layer.visible) {
      return createImageData(this.#size.width, this.#size.height);
    }

    const fitted = fitImageData(layer.source.imageData, this.#size, layer);
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

function sourceOver(destination: ImageData, source: ImageData): ImageData {
  const output = cloneImageData(destination);

  for (let index = 0; index < output.data.length; index += 4) {
    const sourceAlpha = (source.data[index + 3] ?? 0) / 255;
    const destinationAlpha = (destination.data[index + 3] ?? 0) / 255;
    const outputAlpha = sourceAlpha + destinationAlpha * (1 - sourceAlpha);

    if (outputAlpha === 0) {
      output.data[index] = 0;
      output.data[index + 1] = 0;
      output.data[index + 2] = 0;
      output.data[index + 3] = 0;
      continue;
    }

    for (let channel = 0; channel < 3; channel += 1) {
      output.data[index + channel] = toByte(
        ((source.data[index + channel] ?? 0) * sourceAlpha +
          (destination.data[index + channel] ?? 0) *
            destinationAlpha *
            (1 - sourceAlpha)) /
          outputAlpha
      );
    }

    output.data[index + 3] = toByte(outputAlpha * 255);
  }

  return output;
}

function mixReveal({
  background,
  base,
  foreground,
  pointer,
  reveal,
  revealLayer
}: {
  background: ImageData;
  base: ImageData;
  foreground: ImageData;
  pointer: PointerSnapshot;
  reveal: Exclude<NormalizedLayer["reveal"], false>;
  revealLayer: LayerRole;
}): ImageData {
  const output = cloneImageData(base);
  const revealSource = revealLayer === "background" ? background : foreground;

  for (let y = 0; y < output.height; y += 1) {
    for (let x = 0; x < output.width; x += 1) {
      const mask = getRevealCompositeMaskAlpha({ pointer, reveal, x, y });

      if (mask === 0) {
        continue;
      }

      const index = (y * output.width + x) * 4;

      for (let channel = 0; channel < 4; channel += 1) {
        output.data[index + channel] = toByte(
          (base.data[index + channel] ?? 0) * (1 - mask) +
            (revealSource.data[index + channel] ?? 0) * mask
        );
      }
    }
  }

  return output;
}
