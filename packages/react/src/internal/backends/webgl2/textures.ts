import type { NormalizedLayerSource } from "../../renderer/types";

let nextSourceId = 1;
const objectSourceIds = new WeakMap<object, number>();

export type ManagedTexture = {
  height: number;
  texture: WebGLTexture;
  width: number;
};

export function getSourceCacheKey(source: NormalizedLayerSource): string {
  if (source.url) {
    return `url:${source.url}`;
  }

  if (source.blob) {
    return `blob:${getObjectSourceId(source.blob)}`;
  }

  if (source.bitmap) {
    return `bitmap:${getObjectSourceId(source.bitmap)}`;
  }

  if (source.element) {
    const elementSource = source.element.currentSrc || source.element.src;
    return elementSource ? `image:${elementSource}` : `image:${getObjectSourceId(source.element)}`;
  }

  if (source.imageData) {
    return `image-data:${getObjectSourceId(source.imageData)}:${source.width}x${source.height}`;
  }

  return `${source.kind}:${source.width}x${source.height}`;
}

export function createTextureFromImageData(
  gl: WebGL2RenderingContext,
  imageData: ImageData
): ManagedTexture {
  const texture = gl.createTexture();

  if (!texture) {
    throw new Error("WebGL2 texture allocation failed.");
  }

  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA,
    imageData.width,
    imageData.height,
    0,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    imageData.data
  );
  gl.bindTexture(gl.TEXTURE_2D, null);

  return { height: imageData.height, texture, width: imageData.width };
}

export function createEmptyTexture(
  gl: WebGL2RenderingContext,
  width: number,
  height: number
): ManagedTexture {
  const texture = gl.createTexture();

  if (!texture) {
    throw new Error("WebGL2 texture allocation failed.");
  }

  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA,
    width,
    height,
    0,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    null
  );
  gl.bindTexture(gl.TEXTURE_2D, null);

  return { height, texture, width };
}

export function deleteTexture(
  gl: WebGL2RenderingContext | undefined,
  managed: ManagedTexture | undefined
): void {
  if (gl && managed) {
    gl.deleteTexture(managed.texture);
  }
}

function getObjectSourceId(object: object): number {
  const existing = objectSourceIds.get(object);

  if (existing) {
    return existing;
  }

  const id = nextSourceId;
  nextSourceId += 1;
  objectSourceIds.set(object, id);

  return id;
}
