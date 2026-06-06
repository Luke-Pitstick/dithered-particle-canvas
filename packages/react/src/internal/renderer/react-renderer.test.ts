import { describe, expect, it, vi } from "vitest";
import type { DitheredParticleCanvasProps } from "../../types";
import type {
  NormalizedLayers,
  PointerSnapshot,
  RenderBackend,
  RenderBackendName
} from "./types";
import { createDitheredCanvasRenderer } from "./react-renderer";

describe("React renderer lifecycle seam", () => {
  it("creates one backend and updates non-critical prop changes imperatively", async () => {
    const backend = new FakeBackend();
    const backendFactory = vi.fn((): RenderBackend => backend);
    const raf = createManualRaf();
    const canvas = createFakeCanvas();

    const renderer = createDitheredCanvasRenderer(
      canvas,
      props({ background: "/a.png", foreground: "/b.png" }),
      {
        backendFactory,
        loadImage: loadImage,
        requestAnimationFrame: raf.request,
        cancelAnimationFrame: raf.cancel
      }
    );

    await flushPromises();
    renderer.update(
      props({
        "aria-label": "updated",
        background: "/a.png",
        foreground: "/b.png"
      })
    );
    await flushPromises();

    expect(backendFactory).toHaveBeenCalledTimes(1);
    expect(backend.setLayersCalls).toBe(1);
    expect(backend.disposeCalls).toBe(0);

    renderer.dispose();
  });

  it("recreates only the backend when backend-critical quality changes", async () => {
    const first = new FakeBackend("canvas2d");
    const second = new FakeBackend("webgl2");
    const backendFactory = vi
      .fn((): RenderBackend => first)
      .mockReturnValueOnce(first)
      .mockReturnValueOnce(second);
    const renderer = createDitheredCanvasRenderer(
      createFakeCanvas(),
      props({
        background: "/a.png",
        foreground: "/b.png",
        quality: { backend: "canvas2d" }
      }),
      {
        backendFactory,
        loadImage
      }
    );

    await flushPromises();
    renderer.update(
      props({
        background: "/a.png",
        foreground: "/b.png",
        quality: { backend: "webgl2" }
      })
    );
    await flushPromises();

    expect(backendFactory).toHaveBeenCalledTimes(2);
    expect(first.disposeCalls).toBe(1);
    expect(second.initCalls).toBe(1);

    renderer.dispose();
  });

  it("falls back to Canvas2D when WebGL2 is unavailable", async () => {
    const onError = vi.fn();
    const renderer = createDitheredCanvasRenderer(
      createFakeCanvas(),
      props({ background: "/a.png", foreground: "/b.png", onError }),
      {
        loadImage
      }
    );

    await flushPromises();

    expect(renderer.getSnapshot().backend).toBe("canvas2d");
    expect(onError).toHaveBeenCalled();
    renderer.dispose();
  });

  it("cancels RAF, removes listeners, disconnects observers, releases bitmaps, and disposes on unmount", async () => {
    const backend = new FakeBackend();
    const raf = createManualRaf();
    const resizeObserver = createObserverConstructor();
    const intersectionObserver = createIntersectionObserverConstructor();
    const bitmap = createBitmap();
    const canvas = createFakeCanvas();
    const renderer = createDitheredCanvasRenderer(
      canvas,
      props({ background: blobSource(), foreground: "/b.png" }),
      {
        IntersectionObserver: intersectionObserver.Constructor,
        ResizeObserver: resizeObserver.Constructor,
        backendFactory: () => backend,
        cancelAnimationFrame: raf.cancel,
        createImageBitmap: async () => bitmap,
        loadImage,
        requestAnimationFrame: raf.request
      }
    );

    await flushPromises();
    renderer.dispose();

    expect(raf.cancelled).toHaveLength(1);
    expect(canvas.listeners.pointermove).toHaveLength(0);
    expect(canvas.listeners.pointerleave).toHaveLength(0);
    expect(resizeObserver.disconnects).toBe(1);
    expect(intersectionObserver.disconnects).toBe(1);
    expect(bitmap.close).toHaveBeenCalledTimes(1);
    expect(backend.disposeCalls).toBe(1);
  });

  it("normalizes reduced motion by disabling reveal configs", async () => {
    const backend = new FakeBackend();
    const renderer = createDitheredCanvasRenderer(
      createFakeCanvas(),
      props({
        background: "/a.png",
        foreground: "/b.png",
        motion: "reduced",
        revealLayer: "background"
      }),
      {
        backendFactory: () => backend,
        loadImage
      }
    );

    await flushPromises();

    expect(backend.layers.foreground?.reveal).toBe(false);
    renderer.dispose();
  });

  it("copies public reveal config onto the internal mask layer", async () => {
    const backend = new FakeBackend();
    const renderer = createDitheredCanvasRenderer(
      createFakeCanvas(),
      props({
        layers: {
          background: {
            reveal: { radius: 120, softness: 0.25 },
            src: "/a.png"
          },
          foreground: {
            src: "/b.png"
          }
        },
        revealLayer: "background"
      }),
      {
        backendFactory: () => backend,
        loadImage
      }
    );

    await flushPromises();

    expect(backend.layers.background?.reveal).toMatchObject({ radius: 120 });
    expect(backend.layers.foreground?.reveal).toMatchObject({ radius: 120 });
    renderer.dispose();
  });

  it("keeps pointer position outside React state and forwards it to the backend", async () => {
    const backend = new FakeBackend();
    const canvas = createFakeCanvas();
    const renderer = createDitheredCanvasRenderer(
      canvas,
      props({ background: "/a.png", foreground: "/b.png" }),
      {
        backendFactory: () => backend,
        loadImage
      }
    );

    await flushPromises();
    canvas.dispatch("pointermove", {
      clientX: 50,
      clientY: 25,
      pressure: 0.5
    } as PointerEvent);

    expect(backend.pointer).toMatchObject({
      active: true,
      pressure: 0.5,
      x: 50,
      y: 25
    });

    renderer.dispose();
  });
});

function props(
  overrides: Partial<DitheredParticleCanvasProps>
): DitheredParticleCanvasProps {
  return {
    ...overrides
  };
}

class FakeBackend implements RenderBackend {
  readonly name: RenderBackendName;
  disposeCalls = 0;
  initCalls = 0;
  layers: NormalizedLayers = {};
  pointer: PointerSnapshot | undefined;
  renderCalls = 0;
  resizeCalls = 0;
  setLayersCalls = 0;

  constructor(name: RenderBackendName = "canvas2d") {
    this.name = name;
  }

  init(): void {
    this.initCalls += 1;
  }

  setLayers(layers: NormalizedLayers): void {
    this.layers = layers;
    this.setLayersCalls += 1;
  }

  setPointer(pointer: PointerSnapshot): void {
    this.pointer = pointer;
  }

  resize(): void {
    this.resizeCalls += 1;
  }

  render(): void {
    this.renderCalls += 1;
  }

  async exportFrame(type: "image/png" | "image/jpeg" = "image/png"): Promise<Blob> {
    return new Blob([], { type });
  }

  dispose(): void {
    this.disposeCalls += 1;
  }
}

function createFakeCanvas(): HTMLCanvasElement & {
  dispatch(type: string, event: Event): void;
  listeners: Record<string, EventListener[]>;
} {
  const listeners: Record<string, EventListener[]> = {
    pointerleave: [],
    pointermove: []
  };

  return ({
    addEventListener(type: string, listener: EventListener): void {
      listeners[type] ??= [];
      listeners[type].push(listener);
    },
    dispatch(type: string, event: Event): void {
      for (const listener of listeners[type] ?? []) {
        listener(event);
      }
    },
    getBoundingClientRect: () =>
      ({
        bottom: 100,
        height: 100,
        left: 0,
        right: 100,
        top: 0,
        width: 100,
        x: 0,
        y: 0
      }) as DOMRect,
    height: 100,
    getContext: () => null,
    listeners,
    removeEventListener(type: string, listener: EventListener): void {
      listeners[type] = (listeners[type] ?? []).filter((entry) => entry !== listener);
    },
    toBlob(callback: BlobCallback, type?: string): void {
      callback(new Blob([], { type }));
    },
    width: 100
  } as unknown) as HTMLCanvasElement & {
    dispatch(type: string, event: Event): void;
    listeners: Record<string, EventListener[]>;
  };
}

async function loadImage(): Promise<HTMLImageElement> {
  return {
    decode: async () => undefined,
    height: 10,
    naturalHeight: 10,
    naturalWidth: 10,
    width: 10
  } as HTMLImageElement;
}

function createManualRaf(): {
  cancel: (id: number) => void;
  cancelled: number[];
  request: (callback: (time: number) => void) => number;
} {
  let id = 0;
  const cancelled: number[] = [];

  return {
    cancel: (rafId: number) => {
      cancelled.push(rafId);
    },
    cancelled,
    request: () => {
      id += 1;
      return id;
    }
  };
}

function createObserverConstructor(): {
  Constructor: new (callback: () => void) => { disconnect(): void; observe(target: Element): void };
  disconnects: number;
} {
  const state = { disconnects: 0 };

  return {
    Constructor: class {
      constructor() {}

      disconnect(): void {
        state.disconnects += 1;
      }

      observe(): void {}
    },
    get disconnects() {
      return state.disconnects;
    }
  };
}

function createIntersectionObserverConstructor(): {
  Constructor: new (
    callback: (entries: Array<{ isIntersecting: boolean }>) => void
  ) => { disconnect(): void; observe(target: Element): void };
  disconnects: number;
} {
  const state = { disconnects: 0 };

  return {
    Constructor: class {
      constructor() {}

      disconnect(): void {
        state.disconnects += 1;
      }

      observe(): void {}
    },
    get disconnects() {
      return state.disconnects;
    }
  };
}

function createBitmap(): ImageBitmap {
  return {
    close: vi.fn(),
    height: 10,
    width: 10
  } as unknown as ImageBitmap;
}

function blobSource(): Blob {
  return new Blob(["image"], { type: "image/png" });
}

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}
