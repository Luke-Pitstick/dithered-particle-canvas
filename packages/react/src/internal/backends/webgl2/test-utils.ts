export type MockWebGL2RenderingContext = WebGL2RenderingContext & {
  calls: Record<string, number>;
  compileStatus: boolean;
  linkStatus: boolean;
};

export type MockCanvas = HTMLCanvasElement & {
  dispatch(type: string, event?: Event): void;
  listeners: Map<string, Set<EventListener>>;
};

export function createMockCanvas(gl: WebGL2RenderingContext | null): MockCanvas {
  const listeners = new Map<string, Set<EventListener>>();

  return {
    addEventListener(type: string, listener: EventListener): void {
      const existing = listeners.get(type) ?? new Set<EventListener>();
      existing.add(listener);
      listeners.set(type, existing);
    },
    dispatch(type: string, event = new Event(type)): void {
      for (const listener of listeners.get(type) ?? []) {
        listener(event);
      }
    },
    getContext(type: string): WebGL2RenderingContext | null {
      return type === "webgl2" ? gl : null;
    },
    height: 0,
    listeners,
    removeEventListener(type: string, listener: EventListener): void {
      listeners.get(type)?.delete(listener);
    },
    toBlob(callback: BlobCallback, type?: string): void {
      callback(new Blob([], { type }));
    },
    width: 0
  } as MockCanvas;
}

export function createMockWebGL2Context({
  compileStatus = true,
  linkStatus = true
}: {
  compileStatus?: boolean;
  linkStatus?: boolean;
} = {}): MockWebGL2RenderingContext {
  let id = 1;
  const calls: Record<string, number> = {};
  const count = (name: string): void => {
    calls[name] = (calls[name] ?? 0) + 1;
  };
  const handle = <T extends object>(kind: string): T => ({ id: id++, kind }) as T;
  const gl = {
    ARRAY_BUFFER: 0x8892,
    CLAMP_TO_EDGE: 0x812f,
    COLOR_ATTACHMENT0: 0x8ce0,
    COMPILE_STATUS: 0x8b81,
    FLOAT: 0x1406,
    FRAGMENT_SHADER: 0x8b30,
    FRAMEBUFFER: 0x8d40,
    LINK_STATUS: 0x8b82,
    NEAREST: 0x2600,
    RGBA: 0x1908,
    STATIC_DRAW: 0x88e4,
    TEXTURE0: 0x84c0,
    TEXTURE_2D: 0x0de1,
    TEXTURE_MAG_FILTER: 0x2800,
    TEXTURE_MIN_FILTER: 0x2801,
    TEXTURE_WRAP_S: 0x2802,
    TEXTURE_WRAP_T: 0x2803,
    TRIANGLE_STRIP: 0x0005,
    UNPACK_FLIP_Y_WEBGL: 0x9240,
    UNSIGNED_BYTE: 0x1401,
    VERTEX_SHADER: 0x8b31,
    activeTexture: () => count("activeTexture"),
    attachShader: () => count("attachShader"),
    bindAttribLocation: () => count("bindAttribLocation"),
    bindBuffer: () => count("bindBuffer"),
    bindFramebuffer: () => count("bindFramebuffer"),
    bindTexture: () => count("bindTexture"),
    bindVertexArray: () => count("bindVertexArray"),
    bufferData: () => count("bufferData"),
    calls,
    compileShader: () => count("compileShader"),
    compileStatus,
    createBuffer: () => {
      count("createBuffer");
      return handle<WebGLBuffer>("buffer");
    },
    createFramebuffer: () => {
      count("createFramebuffer");
      return handle<WebGLFramebuffer>("framebuffer");
    },
    createProgram: () => {
      count("createProgram");
      return handle<WebGLProgram>("program");
    },
    createShader: () => {
      count("createShader");
      return handle<WebGLShader>("shader");
    },
    createTexture: () => {
      count("createTexture");
      return handle<WebGLTexture>("texture");
    },
    createVertexArray: () => {
      count("createVertexArray");
      return handle<WebGLVertexArrayObject>("vertex-array");
    },
    deleteBuffer: () => count("deleteBuffer"),
    deleteFramebuffer: () => count("deleteFramebuffer"),
    deleteProgram: () => count("deleteProgram"),
    deleteShader: () => count("deleteShader"),
    deleteTexture: () => count("deleteTexture"),
    deleteVertexArray: () => count("deleteVertexArray"),
    drawArrays: () => count("drawArrays"),
    enableVertexAttribArray: () => count("enableVertexAttribArray"),
    framebufferTexture2D: () => count("framebufferTexture2D"),
    getAttribLocation: () => 0,
    getProgramInfoLog: () => "mock program link log",
    getProgramParameter: () => linkStatus,
    getShaderInfoLog: () => "mock shader compile log",
    getShaderParameter: () => compileStatus,
    getUniformLocation: (_program: WebGLProgram, name: string) => handle<WebGLUniformLocation>(`uniform:${name}`),
    linkProgram: () => count("linkProgram"),
    pixelStorei: () => count("pixelStorei"),
    shaderSource: () => count("shaderSource"),
    texImage2D: () => count("texImage2D"),
    texParameteri: () => count("texParameteri"),
    uniform1f: () => count("uniform1f"),
    uniform1i: () => count("uniform1i"),
    uniform2f: () => count("uniform2f"),
    useProgram: () => count("useProgram"),
    vertexAttribPointer: () => count("vertexAttribPointer"),
    viewport: () => count("viewport")
  };

  return gl as unknown as MockWebGL2RenderingContext;
}
