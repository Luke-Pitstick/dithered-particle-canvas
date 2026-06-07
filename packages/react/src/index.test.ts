import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { DitheredParticleCanvas, useDitheredCanvas } from "./index";
import type {
  DitheredCanvasHandle,
  DitheredParticleCanvasProps,
  RevealTrailConfig
} from "./index";

describe("public React package scaffold", () => {
  it("exports the component and hook stubs", () => {
    expect(DitheredParticleCanvas).toBeTypeOf("object");
    expect(useDitheredCanvas).toBeTypeOf("function");
  });

  it("renders on the server without browser globals", async () => {
    const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      get() {
        throw new Error("window should not be read during SSR");
      }
    });

    try {
      const html = renderToString(
        createElement(DitheredParticleCanvas, {
          background: "/background.png",
          fallback: "Static fallback",
          foreground: "/foreground.png",
          revealLayer: "background",
          "aria-label": "Dithered hero"
        })
      );

      expect(html).toContain("data-dpc-root");
      expect(html).toContain("Static fallback");
      expect(html).toContain("Dithered hero");
    } finally {
      if (previousWindow) {
        Object.defineProperty(globalThis, "window", previousWindow);
      } else {
        delete (globalThis as { window?: unknown }).window;
      }
    }
  });

  it("keeps README-scale public examples type-safe", () => {
    const helloWorld = {
      background: "/background.png",
      foreground: "/foreground.png",
      revealLayer: "background"
    } satisfies DitheredParticleCanvasProps;

    const advanced = {
      layers: {
        background: {
          dither: { amount: 0.85, matrixSize: 8, palette: "browserbase" },
          filters: [
            { type: "posterize", levels: 5 },
            { type: "contrast", amount: 1.2 }
          ],
          fit: "cover",
          reveal: { radius: 120, softness: 0.35, strength: 1 },
          src: "/mountains.gif"
        },
        foreground: {
          dither: { amount: 0.35 },
          filters: [{ type: "opacity", amount: 0.95 }],
          fit: "contain",
          src: "/headline-mask.png"
        }
      },
      motion: "auto",
      quality: "auto"
    } satisfies DitheredParticleCanvasProps;
    const handle: DitheredCanvasHandle = {
      exportFrame: async () => new Blob(),
      pause: () => undefined,
      resume: () => undefined
    };
    const trail = {
      dustFlicker: 0.4,
      dustSize: 6,
      durationMs: 900
    } satisfies RevealTrailConfig;

    expect(helloWorld.revealLayer).toBe("background");
    expect(advanced.layers.background.src).toBe("/mountains.gif");
    expect(trail.dustSize).toBe(6);
    expect(handle).toHaveProperty("exportFrame");
  });
});
