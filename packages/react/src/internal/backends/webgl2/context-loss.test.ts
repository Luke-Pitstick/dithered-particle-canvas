import { describe, expect, it } from "vitest";
import { RendererError } from "../../renderer/types";
import { createImageData } from "../../utils/image-data";
import { normalizeLayer } from "../../layers/layer-state";
import { WebGL2Backend } from "./WebGL2Backend";
import { createMockCanvas, createMockWebGL2Context } from "./test-utils";

describe("WebGL2 context loss and restore", () => {
  it("pauses rendering on context loss and rebuilds resources after restore", () => {
    const errors: RendererError[] = [];
    const gl = createMockWebGL2Context();
    const canvas = createMockCanvas(gl);
    const backend = new WebGL2Backend({
      onError: (error) => errors.push(error)
    });
    backend.init(canvas, { height: 1, width: 1 });
    backend.setLayers({ background: makeLayer() });
    backend.render({ deltaTime: 0, time: 0 });

    const beforeLossComposites = backend.debugCounters.compositePasses;
    const event = new Event("webglcontextlost");
    let prevented = false;
    Object.defineProperty(event, "preventDefault", {
      value: () => {
        prevented = true;
      }
    });
    canvas.dispatch("webglcontextlost", event);
    backend.render({ deltaTime: 16, time: 16 });

    expect(prevented).toBe(true);
    expect(backend.debugCounters.contextLost).toBe(1);
    expect(backend.debugCounters.compositePasses).toBe(beforeLossComposites);
    expect(errors[0]?.code).toBe("BACKEND_UNAVAILABLE");

    canvas.dispatch("webglcontextrestored");
    backend.render({ deltaTime: 16, time: 32 });

    expect(backend.debugCounters.contextRestored).toBe(1);
    expect(backend.debugCounters.programsCreated).toBe(4);
    expect(backend.debugCounters.processedTextureRebuilds).toBe(2);
    expect(backend.debugCounters.compositePasses).toBe(beforeLossComposites + 1);
  });

  it("reports a typed error when restore cannot recreate WebGL2 resources", () => {
    const errors: RendererError[] = [];
    const gl = createMockWebGL2Context();
    let createCount = 0;
    const backend = new WebGL2Backend({
      contextFactory: () => {
        createCount += 1;
        return createCount === 1 ? gl : null;
      },
      onError: (error) => errors.push(error)
    });
    backend.init(createMockCanvas(null), { height: 1, width: 1 });
    backend.handleContextLostForTest();
    backend.handleContextRestoredForTest();

    expect(errors.at(-1)?.code).toBe("WEBGL_CONTEXT_RESTORE_FAILED");
    expect(errors.at(-1)?.problem).toContain("could not be restored");
  });
});

function makeLayer() {
  return normalizeLayer(
    "background",
    {
      dither: false,
      fit: "stretch",
      src: "fixture"
    },
    {
      height: 1,
      imageData: createImageData(1, 1, new Uint8ClampedArray([255, 0, 0, 255])),
      kind: "image-data",
      width: 1
    }
  );
}
