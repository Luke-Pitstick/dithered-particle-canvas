export type ImageDataLike = Pick<ImageData, "data" | "height" | "width">;

export function createImageData(
  width: number,
  height: number,
  data?: Uint8ClampedArray
): ImageData {
  const pixels = data ?? new Uint8ClampedArray(width * height * 4);

  if (pixels.length !== width * height * 4) {
    throw new Error(
      `ImageData length mismatch: expected ${width * height * 4}, received ${pixels.length}.`
    );
  }

  if (typeof ImageData !== "undefined") {
    return new ImageData(pixels as unknown as ImageDataArray, width, height);
  }

  return { data: pixels, height, width } as ImageData;
}

export function cloneImageData(imageData: ImageDataLike): ImageData {
  return createImageData(
    imageData.width,
    imageData.height,
    new Uint8ClampedArray(imageData.data)
  );
}

export function getPixel(imageData: ImageDataLike, x: number, y: number): [number, number, number, number] {
  const index = (y * imageData.width + x) * 4;

  return [
    imageData.data[index] ?? 0,
    imageData.data[index + 1] ?? 0,
    imageData.data[index + 2] ?? 0,
    imageData.data[index + 3] ?? 0
  ];
}

export function setPixel(
  imageData: ImageDataLike,
  x: number,
  y: number,
  pixel: readonly [number, number, number, number]
): void {
  const index = (y * imageData.width + x) * 4;

  imageData.data[index] = pixel[0];
  imageData.data[index + 1] = pixel[1];
  imageData.data[index + 2] = pixel[2];
  imageData.data[index + 3] = pixel[3];
}
