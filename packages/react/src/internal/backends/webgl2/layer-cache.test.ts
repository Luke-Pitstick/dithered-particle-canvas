import { describe, expect, it } from "vitest";
import { normalizeLayer } from "../../layers/layer-state";
import { createImageData } from "../../utils/image-data";
import { createProcessedLayerCacheKey, WebGL2Backend } from "./WebGL2Backend";
import { createMockCanvas, createMockWebGL2Context } from "./test-utils";

describe("WebGL2 processed texture cache", () => {
  it("reuses processed textures for pointer-only and fade-only frames", () => {
    const gl = createMockWebGL2Context();
    const backend = new WebGL2Backend();
    backend.init(createMockCanvas(gl), { height: 2, width: 2 });
    backend.setLayers({
      background: makeLayer("background", [240, 240, 220, 255]),
      foreground: makeLayer("foreground", [20, 40, 80, 255], {
        reveal: true
      })
    });

    backend.render({ deltaTime: 0, revealLayer: "background", time: 0 });
    expect(backend.debugCounters.processedTextureRebuilds).toBe(2);
    expect(backend.debugCounters.sourceTextureUploads).toBe(2);
    expect(backend.debugCounters.compositePasses).toBe(1);

    backend.setPointer({ active: true, fade: 1, x: 1, y: 1 });
    backend.render({ deltaTime: 16, revealLayer: "background", time: 16 });
    backend.setPointer({ active: false, fade: 0.5, x: 1, y: 1 });
    backend.render({ deltaTime: 16, revealLayer: "background", time: 32 });

    expect(backend.debugCounters.processedTextureRebuilds).toBe(2);
    expect(backend.debugCounters.sourceTextureUploads).toBe(2);
    expect(backend.debugCounters.compositePasses).toBe(3);
  });

  it("rebuilds processed textures when source/config changes", () => {
    const gl = createMockWebGL2Context();
    const backend = new WebGL2Backend();
    backend.init(createMockCanvas(gl), { height: 2, width: 2 });
    backend.setLayers({
      background: makeLayer("background", [240, 240, 220, 255])
    });
    backend.render({ deltaTime: 0, time: 0 });

    expect(backend.debugCounters.processedTextureRebuilds).toBe(1);

    backend.setLayers({
      background: makeLayer("background", [240, 240, 220, 255], {
        filters: [{ type: "brightness", amount: 0.75 }]
      })
    });
    backend.render({ deltaTime: 16, time: 16 });

    expect(backend.debugCounters.processedTextureRebuilds).toBe(2);
    expect(backend.debugCounters.texturesDeleted).toBeGreaterThan(0);
    expect(backend.debugCounters.framebuffersDeleted).toBeGreaterThan(0);
  });

  it("includes source identity and static config in the cache key", () => {
    const layer = makeLayer("foreground", [20, 40, 80, 255], {
      filters: [{ type: "posterize", levels: 3 }],
      opacity: 0.8
    });

    expect(createProcessedLayerCacheKey(layer, { height: 2, width: 2 })).toContain(
      '"opacity":0.8'
    );
    expect(createProcessedLayerCacheKey(layer, { height: 2, width: 2 })).toContain(
      '"sourceSize":{"height":2,"width":2}'
    );
  });

  it("deletes cached GPU resources on dispose", () => {
    const gl = createMockWebGL2Context();
    const backend = new WebGL2Backend();
    backend.init(createMockCanvas(gl), { height: 2, width: 2 });
    backend.setLayers({
      background: makeLayer("background", [240, 240, 220, 255]),
      foreground: makeLayer("foreground", [20, 40, 80, 255])
    });
    backend.render({ deltaTime: 0, time: 0 });
    backend.dispose();

    expect(backend.debugCounters.texturesDeleted).toBe(
      backend.debugCounters.texturesCreated
    );
    expect(backend.debugCounters.programsDeleted).toBe(
      backend.debugCounters.programsCreated
    );
    expect(gl.calls.deleteBuffer).toBe(1);
    expect(gl.calls.deleteVertexArray).toBe(1);
  });
});

function makeLayer(
  role: "background" | "foreground",
  rgba: readonly [number, number, number, number],
  overrides: {
    filters?: Parameters<typeof normalizeLayer>[1]["filters"];
    opacity?: number;
    reveal?: Parameters<typeof normalizeLayer>[1]["reveal"];
  } = {}
) {
  return normalizeLayer(
    role,
    {
      dither: false,
      fit: "stretch",
      filters: overrides.filters,
      opacity: overrides.opacity,
      reveal: overrides.reveal,
      src: `${role}-fixture`
    },
    {
      height: 2,
      imageData: createImageData(
        2,
        2,
        new Uint8ClampedArray([
          ...rgba,
          ...rgba,
          ...rgba,
          ...rgba
        ])
      ),
      kind: "image-data",
      width: 2
    }
  );
}
