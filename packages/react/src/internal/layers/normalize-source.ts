import type { LayerSource } from "../../types";
import { RendererError, type NormalizedLayerSource } from "../renderer/types";

export type InternalLayerSource = LayerSource | ImageData;

export type NormalizeSourceOptions = {
  createImageBitmap?: (source: Blob | HTMLImageElement) => Promise<ImageBitmap>;
  loadImage?: (url: string) => Promise<HTMLImageElement>;
  warn?: (message: string) => void;
};

export async function normalizeSource(
  source: InternalLayerSource,
  options: NormalizeSourceOptions = {}
): Promise<NormalizedLayerSource> {
  const firstFrameOnly = isGifSource(source);

  if (firstFrameOnly) {
    options.warn?.("Animated GIF playback is not available in V1; using the first frame.");
  }

  if (isImageData(source)) {
    return {
      firstFrameOnly,
      height: source.height,
      imageData: source,
      kind: "image-data",
      width: source.width
    };
  }

  if (isImageBitmap(source)) {
    return {
      bitmap: source,
      firstFrameOnly,
      height: source.height,
      imageData: rasterizeToImageData(source, source.width, source.height),
      kind: "image-bitmap",
      width: source.width
    };
  }

  if (isBlob(source)) {
    try {
      const bitmap = await getCreateImageBitmap(options)(source);

      return {
        bitmap,
        blob: source,
        firstFrameOnly,
        height: bitmap.height,
        imageData: rasterizeToImageData(bitmap, bitmap.width, bitmap.height),
        kind: "blob",
        width: bitmap.width
      };
    } catch (cause) {
      throw decodeError(cause);
    }
  }

  if (isHtmlImageElement(source)) {
    try {
      if (typeof source.decode === "function") {
        await source.decode();
      }

      return {
        element: source,
        firstFrameOnly,
        height: source.naturalHeight || source.height,
        imageData: rasterizeToImageData(
          source,
          source.naturalWidth || source.width,
          source.naturalHeight || source.height
        ),
        kind: "html-image",
        width: source.naturalWidth || source.width
      };
    } catch (cause) {
      throw decodeError(cause);
    }
  }

  try {
    const image = await getLoadImage(options)(source);

    return {
      element: image,
      firstFrameOnly,
      height: image.naturalHeight || image.height,
      imageData: rasterizeToImageData(
        image,
        image.naturalWidth || image.width,
        image.naturalHeight || image.height
      ),
      kind: "url",
      url: source,
      width: image.naturalWidth || image.width
    };
  } catch (cause) {
    throw decodeError(cause);
  }
}

function getCreateImageBitmap(
  options: NormalizeSourceOptions
): (source: Blob | HTMLImageElement) => Promise<ImageBitmap> {
  const createBitmap = options.createImageBitmap ?? globalThis.createImageBitmap;

  if (!createBitmap) {
    throw new RendererError({
      code: "SOURCE_DECODE_FAILED",
      fix: "Run in a browser with createImageBitmap support or provide a decoder.",
      problem: "Image source decoding is unavailable."
    });
  }

  return createBitmap.bind(globalThis) as (source: Blob | HTMLImageElement) => Promise<ImageBitmap>;
}

function getLoadImage(options: NormalizeSourceOptions): (url: string) => Promise<HTMLImageElement> {
  if (options.loadImage) {
    return options.loadImage;
  }

  if (typeof Image === "undefined") {
    throw new RendererError({
      code: "SOURCE_DECODE_FAILED",
      fix: "Provide a loadImage implementation when normalizing URL sources outside the browser.",
      problem: "URL image decoding is unavailable."
    });
  }

  return async (url: string) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.decoding = "async";
    image.src = url;
    await image.decode();

    return image;
  };
}

function decodeError(cause: unknown): RendererError {
  if (cause instanceof RendererError) {
    return cause;
  }

  return new RendererError({
    cause,
    code: "SOURCE_DECODE_FAILED",
    fix: "Check that the image URL, blob, or bitmap is readable and CORS-enabled for pixel access.",
    problem: "Image source could not be decoded."
  });
}

function rasterizeToImageData(
  source: CanvasImageSource,
  width: number,
  height: number
): ImageData | undefined {
  const canvas = createRasterCanvas(width, height);

  if (!canvas) {
    return undefined;
  }

  const context = canvas.getContext("2d", { willReadFrequently: true });

  if (!context) {
    throw new RendererError({
      code: "CANVAS_UNAVAILABLE",
      fix: "Run in a browser with Canvas2D support or provide ImageData sources.",
      problem: "Image source pixels could not be read."
    });
  }

  context.drawImage(source, 0, 0, width, height);

  return context.getImageData(0, 0, width, height);
}

function createRasterCanvas(
  width: number,
  height: number
): HTMLCanvasElement | OffscreenCanvas | undefined {
  if (typeof OffscreenCanvas !== "undefined") {
    return new OffscreenCanvas(width, height);
  }

  if (typeof document === "undefined") {
    return undefined;
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  return canvas;
}

function isGifSource(source: InternalLayerSource): boolean {
  if (typeof source === "string") {
    return /\.gif(?:[?#].*)?$/iu.test(source);
  }

  return isBlob(source) && source.type.toLowerCase() === "image/gif";
}

function isImageData(source: InternalLayerSource): source is ImageData {
  return (
    typeof source === "object" &&
    source !== null &&
    "data" in source &&
    "width" in source &&
    "height" in source
  );
}

function isImageBitmap(source: InternalLayerSource): source is ImageBitmap {
  return (
    typeof source === "object" &&
    source !== null &&
    "width" in source &&
    "height" in source &&
    "close" in source &&
    !("data" in source)
  );
}

function isBlob(source: InternalLayerSource): source is Blob {
  return typeof Blob !== "undefined" && source instanceof Blob;
}

function isHtmlImageElement(source: InternalLayerSource): source is HTMLImageElement {
  return (
    typeof HTMLImageElement !== "undefined" &&
    source instanceof HTMLImageElement
  );
}
