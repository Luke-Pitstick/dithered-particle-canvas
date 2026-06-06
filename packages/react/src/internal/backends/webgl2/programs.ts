import { RendererError } from "../../renderer/types";

export type WebGLProgramBundle = {
  attributes: Record<string, number>;
  program: WebGLProgram;
  uniforms: Record<string, WebGLUniformLocation | null>;
};

export function compileShader(
  gl: WebGL2RenderingContext,
  type: GLenum,
  source: string,
  label: string
): WebGLShader {
  const shader = gl.createShader(type);

  if (!shader) {
    throw new RendererError({
      code: "WEBGL_SHADER_COMPILE_FAILED",
      fix: "Check browser WebGL2 support and try the Canvas2D backend if shader allocation keeps failing.",
      problem: `WebGL2 shader "${label}" could not be created.`
    });
  }

  gl.shaderSource(shader, source);
  gl.compileShader(shader);

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const info = gl.getShaderInfoLog(shader) ?? "No shader compiler log was returned.";
    gl.deleteShader(shader);
    throw new RendererError({
      cause: info,
      code: "WEBGL_SHADER_COMPILE_FAILED",
      fix: "Inspect the shader source and browser GPU support; the renderer can fall back to Canvas2D.",
      problem: `WebGL2 shader "${label}" failed to compile.`
    });
  }

  return shader;
}

export function createProgramBundle({
  attributes = [],
  fragmentLabel,
  fragmentSource,
  gl,
  uniforms = [],
  vertexLabel,
  vertexSource
}: {
  attributes?: readonly string[];
  fragmentLabel: string;
  fragmentSource: string;
  gl: WebGL2RenderingContext;
  uniforms?: readonly string[];
  vertexLabel: string;
  vertexSource: string;
}): WebGLProgramBundle {
  const vertex = compileShader(gl, gl.VERTEX_SHADER, vertexSource, vertexLabel);
  const fragment = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource, fragmentLabel);
  const program = gl.createProgram();

  if (!program) {
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
    throw new RendererError({
      code: "WEBGL_PROGRAM_LINK_FAILED",
      fix: "Check browser WebGL2 support and try the Canvas2D backend if program allocation keeps failing.",
      problem: `WebGL2 program "${fragmentLabel}" could not be created.`
    });
  }

  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  attributes.forEach((name, index) => {
    gl.bindAttribLocation(program, index, name);
  });
  gl.linkProgram(program);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const info = gl.getProgramInfoLog(program) ?? "No program linker log was returned.";
    gl.deleteProgram(program);
    throw new RendererError({
      cause: info,
      code: "WEBGL_PROGRAM_LINK_FAILED",
      fix: "Inspect shader varyings, uniforms, and browser GPU support; the renderer can fall back to Canvas2D.",
      problem: `WebGL2 program "${fragmentLabel}" failed to link.`
    });
  }

  return {
    attributes: Object.fromEntries(attributes.map((name) => [name, gl.getAttribLocation(program, name)])),
    program,
    uniforms: Object.fromEntries(uniforms.map((name) => [name, gl.getUniformLocation(program, name)]))
  };
}
