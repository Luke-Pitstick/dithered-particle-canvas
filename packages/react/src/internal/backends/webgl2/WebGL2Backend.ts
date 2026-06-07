import {
  DEFAULT_REVEAL,
  RendererError,
  type LayerRole,
  type NormalizedLayer,
  type NormalizedLayers,
  type PointerSnapshot,
  type RenderBackend,
  type RenderFrame,
  type RenderSize
} from "../../renderer/types";
import { resolveRevealTrailConfig } from "../../interaction/reveal-mask";
import { createImageData } from "../../utils/image-data";
import { createFramebufferForTexture, deleteFramebuffer, type ManagedFramebuffer } from "./framebuffers";
import { preprocessLayerToImageData } from "./preprocess";
import { createProgramBundle, type WebGLProgramBundle } from "./programs";
import {
  COPY_FRAGMENT_SHADER,
  FULLSCREEN_VERTEX_SHADER,
  REVEAL_COMPOSITE_FRAGMENT_SHADER
} from "./shaders";
import {
  createEmptyTexture,
  createTextureFromImageData,
  deleteTexture,
  getSourceCacheKey,
  type ManagedTexture
} from "./textures";

const EMPTY_POINTER: PointerSnapshot = {
  active: false,
  x: 0,
  y: 0
};

const FULLSCREEN_TRIANGLE_STRIP = new Float32Array([
  -1, -1,
  1, -1,
  -1, 1,
  1, 1
]);
const MAX_REVEAL_TRAIL_POINTS = 32;

export type WebGL2BackendDebugCounters = {
  compositePasses: number;
  contextLost: number;
  contextRestored: number;
  framebuffersCreated: number;
  framebuffersDeleted: number;
  processedTextureRebuilds: number;
  programsCreated: number;
  programsDeleted: number;
  sourceTextureUploads: number;
  texturesCreated: number;
  texturesDeleted: number;
};

export type WebGL2BackendOptions = {
  contextFactory?: (canvas: HTMLCanvasElement) => WebGL2RenderingContext | null;
  onError?: (error: RendererError) => void;
};

type LayerTextureEntry = {
  framebuffer: ManagedFramebuffer;
  key: string;
  processedTexture: ManagedTexture;
  sourceTexture: ManagedTexture;
};

type Programs = {
  composite: WebGLProgramBundle;
  copy: WebGLProgramBundle;
};

export class WebGL2Backend implements RenderBackend {
  readonly name = "webgl2" as const;
  readonly debugCounters: WebGL2BackendDebugCounters = {
    compositePasses: 0,
    contextLost: 0,
    contextRestored: 0,
    framebuffersCreated: 0,
    framebuffersDeleted: 0,
    processedTextureRebuilds: 0,
    programsCreated: 0,
    programsDeleted: 0,
    sourceTextureUploads: 0,
    texturesCreated: 0,
    texturesDeleted: 0
  };

  #blankTexture: ManagedTexture | undefined;
  #canvas: HTMLCanvasElement | undefined;
  #contextFactory: WebGL2BackendOptions["contextFactory"];
  #gl: WebGL2RenderingContext | undefined;
  #layers: NormalizedLayers = {};
  #lost = false;
  #onError: WebGL2BackendOptions["onError"];
  #pointer: PointerSnapshot = EMPTY_POINTER;
  #programs: Programs | undefined;
  #quadBuffer: WebGLBuffer | undefined;
  #quadVao: WebGLVertexArrayObject | undefined;
  #restoreAttempted = false;
  #size: RenderSize = { height: 1, width: 1 };
  #textures = new Map<LayerRole, LayerTextureEntry>();

  #handleContextLost = (event: Event): void => {
    this.handleContextLostForTest(event);
  };

  #handleContextRestored = (): void => {
    this.handleContextRestoredForTest();
  };

  constructor(options: WebGL2BackendOptions = {}) {
    this.#contextFactory = options.contextFactory;
    this.#onError = options.onError;
  }

  init(canvas: HTMLCanvasElement, size: RenderSize): void {
    this.#canvas = canvas;
    this.#size = size;
    canvas.width = size.width;
    canvas.height = size.height;
    canvas.addEventListener("webglcontextlost", this.#handleContextLost);
    canvas.addEventListener("webglcontextrestored", this.#handleContextRestored);
    this.#createContextAndResources();
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

    this.#clearLayerCache();
    this.#deleteManagedTexture(this.#blankTexture);
    this.#blankTexture = undefined;
    this.#gl?.viewport(0, 0, size.width, size.height);
  }

  render(frame: RenderFrame): void {
    if (this.#lost) {
      return;
    }

    const gl = this.#requireContext();
    const programs = this.#requirePrograms();
    const background = this.#ensureLayerTexture("background");
    const foreground = this.#ensureLayerTexture("foreground");

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.#size.width, this.#size.height);
    gl.useProgram(programs.composite.program);
    this.#bindTexture(0, background.texture);
    this.#bindTexture(1, foreground.texture);
    gl.uniform1i(programs.composite.uniforms.u_background, 0);
    gl.uniform1i(programs.composite.uniforms.u_foreground, 1);
    this.#setRevealUniforms(programs.composite, frame);
    this.#drawFullscreen();
    this.debugCounters.compositePasses += 1;
  }

  async exportFrame(type: "image/png" | "image/jpeg" = "image/png"): Promise<Blob> {
    if (!this.#canvas) {
      return new Blob([], { type });
    }

    return new Promise<Blob>((resolve, reject) => {
      this.#canvas?.toBlob((blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error("WebGL2 canvas frame export failed."));
        }
      }, type);
    });
  }

  dispose(): void {
    this.#canvas?.removeEventListener("webglcontextlost", this.#handleContextLost);
    this.#canvas?.removeEventListener("webglcontextrestored", this.#handleContextRestored);
    this.#disposeGpuResources();
    this.#canvas = undefined;
    this.#layers = {};
    this.#lost = false;
  }

  handleContextLostForTest(event?: Pick<Event, "preventDefault">): void {
    event?.preventDefault();
    this.#lost = true;
    this.debugCounters.contextLost += 1;
    this.#onError?.(
      new RendererError({
        code: "BACKEND_UNAVAILABLE",
        fix: "Rendering is paused while the browser restores the WebGL2 context.",
        problem: "The WebGL2 rendering context was lost."
      })
    );
  }

  handleContextRestoredForTest(): void {
    if (this.#restoreAttempted) {
      return;
    }

    this.#restoreAttempted = true;

    try {
      this.#disposeGpuResources();
      this.#createContextAndResources();
      this.#lost = false;
      this.#restoreAttempted = false;
      this.debugCounters.contextRestored += 1;
    } catch (cause) {
      this.#lost = true;
      this.#onError?.(
        new RendererError({
          cause,
          code: "WEBGL_CONTEXT_RESTORE_FAILED",
          fix: "Try reloading the page or force the Canvas2D backend for this environment.",
          problem: "The WebGL2 rendering context could not be restored."
        })
      );
    }
  }

  renderPreprocessedLayerForTest(layer: NormalizedLayer): ImageData {
    return preprocessLayerToImageData(layer, this.#size);
  }

  #createContextAndResources(): void {
    const canvas = this.#canvas;

    if (!canvas) {
      throw new RendererError({
        code: "CANVAS_UNAVAILABLE",
        fix: "Mount the renderer with a real canvas element before initializing WebGL2.",
        problem: "WebGL2 backend was initialized without a canvas."
      });
    }

    const gl =
      this.#contextFactory?.(canvas) ??
      canvas.getContext("webgl2", {
        alpha: true,
        premultipliedAlpha: false
      });

    if (!gl) {
      throw new RendererError({
        code: "BACKEND_UNAVAILABLE",
        fix: "Use the Canvas2D backend or enable WebGL2 in this browser.",
        problem: "WebGL2 is not available for this canvas."
      });
    }

    this.#gl = gl;
    this.#programs = {
      composite: createProgramBundle({
        attributes: ["a_position"],
        fragmentLabel: "reveal-composite-fragment",
        fragmentSource: REVEAL_COMPOSITE_FRAGMENT_SHADER,
        gl,
        uniforms: [
          "u_background",
          "u_edgeDither",
          "u_edgeFlicker",
          "u_edgeNoise",
          "u_foregroundBlend",
          "u_foreground",
          "u_pointer",
          "u_pointerActive",
          "u_pointerFade",
          "u_radius",
          "u_revealPixelSize",
          "u_revealLayer",
          "u_softness",
          "u_strength",
          "u_time",
          "u_trailCount",
          "u_trailDustFlicker",
          "u_trailDustSize",
          "u_trailPoints",
          "u_trailStrength"
        ],
        vertexLabel: "fullscreen-vertex",
        vertexSource: FULLSCREEN_VERTEX_SHADER
      }),
      copy: createProgramBundle({
        attributes: ["a_position"],
        fragmentLabel: "copy-fragment",
        fragmentSource: COPY_FRAGMENT_SHADER,
        gl,
        uniforms: ["u_texture"],
        vertexLabel: "fullscreen-vertex",
        vertexSource: FULLSCREEN_VERTEX_SHADER
      })
    };
    this.debugCounters.programsCreated += 2;
    this.#createFullscreenGeometry(gl);
    gl.viewport(0, 0, this.#size.width, this.#size.height);
  }

  #createFullscreenGeometry(gl: WebGL2RenderingContext): void {
    const buffer = gl.createBuffer();
    const vao = gl.createVertexArray();

    if (!buffer || !vao) {
      throw new RendererError({
        code: "BACKEND_UNAVAILABLE",
        fix: "Use the Canvas2D backend if this browser cannot allocate WebGL2 geometry.",
        problem: "WebGL2 fullscreen geometry could not be created."
      });
    }

    this.#quadBuffer = buffer;
    this.#quadVao = vao;
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, FULLSCREEN_TRIANGLE_STRIP, gl.STATIC_DRAW);

    const position = this.#programs?.copy.attributes.a_position ?? 0;
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
  }

  #ensureLayerTexture(role: LayerRole): ManagedTexture {
    const layer = this.#layers[role];

    if (!layer) {
      return this.#ensureBlankTexture();
    }

    const key = createProcessedLayerCacheKey(layer, this.#size);
    const cached = this.#textures.get(role);

    if (cached?.key === key) {
      return cached.processedTexture;
    }

    this.#disposeLayerEntry(cached);

    const gl = this.#requireContext();
    const sourceImage = layer.source.imageData ?? createImageData(layer.source.width, layer.source.height);
    const sourceTexture = createTextureFromImageData(gl, sourceImage);
    this.debugCounters.sourceTextureUploads += 1;
    this.debugCounters.texturesCreated += 1;

    const processedImage = preprocessLayerToImageData(layer, this.#size);
    const processedInput = createTextureFromImageData(gl, processedImage);
    const processedTexture = createEmptyTexture(gl, processedImage.width, processedImage.height);
    this.debugCounters.texturesCreated += 2;

    const framebuffer = createFramebufferForTexture(gl, processedTexture);
    this.debugCounters.framebuffersCreated += 1;
    this.#runCopyPass(processedInput, framebuffer);
    this.#deleteManagedTexture(processedInput);
    this.debugCounters.processedTextureRebuilds += 1;

    const entry: LayerTextureEntry = {
      framebuffer,
      key,
      processedTexture,
      sourceTexture
    };
    this.#textures.set(role, entry);

    return processedTexture;
  }

  #ensureBlankTexture(): ManagedTexture {
    if (this.#blankTexture) {
      return this.#blankTexture;
    }

    this.#blankTexture = createTextureFromImageData(
      this.#requireContext(),
      createImageData(this.#size.width, this.#size.height)
    );
    this.debugCounters.texturesCreated += 1;

    return this.#blankTexture;
  }

  #runCopyPass(source: ManagedTexture, target: ManagedFramebuffer): void {
    const gl = this.#requireContext();
    const programs = this.#requirePrograms();

    gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
    gl.viewport(0, 0, target.texture.width, target.texture.height);
    gl.useProgram(programs.copy.program);
    this.#bindTexture(0, source.texture);
    gl.uniform1i(programs.copy.uniforms.u_texture, 0);
    this.#drawFullscreen();
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  #setRevealUniforms(program: WebGLProgramBundle, frame: RenderFrame): void {
    const gl = this.#requireContext();
    const revealLayer = frame.revealLayer ?? "background";
    const revealOwner = revealLayer === "background" ? this.#layers.foreground : this.#layers.background;
    const reveal = { ...DEFAULT_REVEAL, ...(revealOwner?.reveal || {}) };
    const trail = resolveRevealTrailConfig(reveal.trail);
    const trailPoints = (this.#pointer.trail ?? []).slice(0, MAX_REVEAL_TRAIL_POINTS);
    const pointerActive =
      Boolean(revealOwner?.reveal) &&
      (this.#pointer.active || (this.#pointer.fade ?? 0) > 0);

    gl.uniform2f(program.uniforms.u_pointer, this.#pointer.x, this.#size.height - this.#pointer.y);
    gl.uniform1f(program.uniforms.u_pointerActive, pointerActive ? 1 : 0);
    gl.uniform1f(program.uniforms.u_pointerFade, this.#pointer.fade ?? 1);
    gl.uniform1f(program.uniforms.u_radius, reveal.radius);
    gl.uniform1f(program.uniforms.u_softness, reveal.softness);
    gl.uniform1f(program.uniforms.u_strength, reveal.strength);
    gl.uniform1f(program.uniforms.u_time, frame.time);
    gl.uniform1f(program.uniforms.u_edgeDither, reveal.edgeDither);
    gl.uniform1f(program.uniforms.u_edgeFlicker, Math.max(0, Math.min(1, reveal.edgeFlicker)));
    gl.uniform1f(program.uniforms.u_edgeNoise, reveal.edgeNoise);
    gl.uniform1f(program.uniforms.u_foregroundBlend, reveal.foregroundBlend);
    gl.uniform1f(program.uniforms.u_revealPixelSize, Math.max(1, Math.round(reveal.pixelSize)));
    gl.uniform1i(program.uniforms.u_revealLayer, revealLayer === "background" ? 0 : 1);
    gl.uniform1i(program.uniforms.u_trailCount, trail ? trailPoints.length : 0);
    gl.uniform1f(
      program.uniforms.u_trailDustFlicker,
      trail ? Math.max(0, Math.min(1, trail.dustFlicker)) : 0
    );
    gl.uniform1f(program.uniforms.u_trailDustSize, trail ? Math.max(1, trail.dustSize) : 1);
    gl.uniform1f(program.uniforms.u_trailStrength, trail ? trail.strength : 0);

    if (trail && trailPoints.length > 0) {
      const data = new Float32Array(MAX_REVEAL_TRAIL_POINTS * 4);

      for (let index = 0; index < trailPoints.length; index += 1) {
        const point = trailPoints[index]!;
        const offset = index * 4;
        data[offset] = point.x;
        data[offset + 1] = this.#size.height - point.y;
        data[offset + 2] = point.fade;
        data[offset + 3] = point.x * 0.37 + point.y * 0.21;
      }

      gl.uniform4fv(program.uniforms.u_trailPoints, data);
    }
  }

  #bindTexture(unit: number, texture: WebGLTexture): void {
    const gl = this.#requireContext();

    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, texture);
  }

  #drawFullscreen(): void {
    const gl = this.#requireContext();

    gl.bindVertexArray(this.#quadVao ?? null);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindVertexArray(null);
  }

  #requireContext(): WebGL2RenderingContext {
    if (!this.#gl) {
      throw new RendererError({
        code: "BACKEND_UNAVAILABLE",
        fix: "Initialize the backend with a WebGL2-capable canvas before rendering.",
        problem: "WebGL2 backend has no active context."
      });
    }

    return this.#gl;
  }

  #requirePrograms(): Programs {
    if (!this.#programs) {
      throw new RendererError({
        code: "BACKEND_UNAVAILABLE",
        fix: "Initialize WebGL2 programs before rendering.",
        problem: "WebGL2 backend has no active shader programs."
      });
    }

    return this.#programs;
  }

  #disposeGpuResources(): void {
    const gl = this.#gl;

    this.#clearLayerCache();
    this.#deleteManagedTexture(this.#blankTexture);
    this.#blankTexture = undefined;

    if (gl && this.#quadBuffer) {
      gl.deleteBuffer(this.#quadBuffer);
    }

    if (gl && this.#quadVao) {
      gl.deleteVertexArray(this.#quadVao);
    }

    if (gl && this.#programs) {
      gl.deleteProgram(this.#programs.copy.program);
      gl.deleteProgram(this.#programs.composite.program);
      this.debugCounters.programsDeleted += 2;
    }

    this.#quadBuffer = undefined;
    this.#quadVao = undefined;
    this.#programs = undefined;
    this.#gl = undefined;
  }

  #clearLayerCache(): void {
    for (const entry of this.#textures.values()) {
      this.#disposeLayerEntry(entry);
    }

    this.#textures.clear();
  }

  #disposeLayerEntry(entry: LayerTextureEntry | undefined): void {
    if (!entry) {
      return;
    }

    deleteFramebuffer(this.#gl, entry.framebuffer);
    this.debugCounters.framebuffersDeleted += 1;
    this.#deleteManagedTexture(entry.sourceTexture);
    this.#deleteManagedTexture(entry.processedTexture);
  }

  #deleteManagedTexture(texture: ManagedTexture | undefined): void {
    if (!texture) {
      return;
    }

    deleteTexture(this.#gl, texture);
    this.debugCounters.texturesDeleted += 1;
  }
}

export function createProcessedLayerCacheKey(
  layer: NormalizedLayer,
  size: RenderSize
): string {
  return stableStringify({
    dither: layer.dither,
    filters: layer.filters,
    fit: layer.fit,
    opacity: layer.opacity,
    output: {
      height: size.height,
      width: size.width
    },
    position: layer.position,
    role: layer.role,
    source: getSourceCacheKey(layer.source),
    sourceSize: {
      height: layer.source.height,
      width: layer.source.width
    },
    visible: layer.visible
  });
}

function stableStringify(value: unknown): string {
  if (!value || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }

  return `{${Object.entries(value)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, nested]) => `${JSON.stringify(key)}:${stableStringify(nested)}`)
    .join(",")}}`;
}
