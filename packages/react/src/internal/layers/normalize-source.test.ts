import { describe, expect, it, vi } from "vitest";
import { RendererError } from "../renderer/types";
import { createImageData } from "../utils/image-data";
import { normalizeSource } from "./normalize-source";

describe("normalizeSource", () => {
  it("accepts generated ImageData fixtures", async () => {
    const imageData = createImageData(2, 3);
    const normalized = await normalizeSource(imageData);

    expect(normalized.kind).toBe("image-data");
    expect(normalized.width).toBe(2);
    expect(normalized.height).toBe(3);
    expect(normalized.imageData).toBe(imageData);
  });

  it("wraps source decode failures in a typed renderer error", async () => {
    await expect(
      normalizeSource("/missing.png", {
        loadImage: async () => {
          throw new Error("not found");
        }
      })
    ).rejects.toMatchObject({
      code: "SOURCE_DECODE_FAILED",
      name: "RendererError"
    } satisfies Partial<RendererError>);
  });

  it("rasterizes decoded URL sources into readable image data when canvas is available", async () => {
    const imageData = createImageData(
      2,
      1,
      new Uint8ClampedArray([
        255, 0, 0, 255,
        0, 0, 255, 255
      ])
    );
    const drawImage = vi.fn();

    vi.stubGlobal("document", {
      createElement: () => ({
        height: 0,
        width: 0,
        getContext: () => ({
          drawImage,
          getImageData: () => imageData
        })
      })
    });

    try {
      const normalized = await normalizeSource("/hero.png", {
        loadImage: async () =>
          ({
            height: 1,
            naturalHeight: 1,
            naturalWidth: 2,
            width: 2
          }) as HTMLImageElement
      });

      expect(normalized.kind).toBe("url");
      expect(normalized.imageData).toBe(imageData);
      expect(drawImage).toHaveBeenCalledOnce();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("marks GIF URLs as first-frame-only and emits a warning", async () => {
    const warn = vi.fn();
    const normalized = await normalizeSource("/loop.gif", {
      loadImage: async () =>
        ({
          height: 4,
          naturalHeight: 4,
          naturalWidth: 5,
          width: 5
        }) as HTMLImageElement,
      warn
    });

    expect(normalized.firstFrameOnly).toBe(true);
    expect(normalized.kind).toBe("url");
    expect(normalized.width).toBe(5);
    expect(normalized.height).toBe(4);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("using the first frame"));
  });

  it("marks GIF blobs as first-frame-only when using createImageBitmap fallback", async () => {
    const warn = vi.fn();
    const blob = new Blob(["gif89a"], { type: "image/gif" });
    const normalized = await normalizeSource(blob, {
      createImageBitmap: async () =>
        ({
          close: vi.fn(),
          height: 7,
          width: 6
        }) as unknown as ImageBitmap,
      warn
    });

    expect(normalized.firstFrameOnly).toBe(true);
    expect(normalized.kind).toBe("blob");
    expect(normalized.width).toBe(6);
    expect(normalized.height).toBe(7);
    expect(warn).toHaveBeenCalledOnce();
  });
});
