import type { ManagedTexture } from "./textures";

export type ManagedFramebuffer = {
  framebuffer: WebGLFramebuffer;
  texture: ManagedTexture;
};

export function createFramebufferForTexture(
  gl: WebGL2RenderingContext,
  texture: ManagedTexture
): ManagedFramebuffer {
  const framebuffer = gl.createFramebuffer();

  if (!framebuffer) {
    throw new Error("WebGL2 framebuffer allocation failed.");
  }

  gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
  gl.framebufferTexture2D(
    gl.FRAMEBUFFER,
    gl.COLOR_ATTACHMENT0,
    gl.TEXTURE_2D,
    texture.texture,
    0
  );
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);

  return { framebuffer, texture };
}

export function deleteFramebuffer(
  gl: WebGL2RenderingContext | undefined,
  managed: ManagedFramebuffer | undefined
): void {
  if (gl && managed) {
    gl.deleteFramebuffer(managed.framebuffer);
  }
}
