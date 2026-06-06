import { describe, expect, it } from "vitest";
import { RendererError } from "../../renderer/types";
import { createProgramBundle } from "./programs";
import { COPY_FRAGMENT_SHADER, FULLSCREEN_VERTEX_SHADER } from "./shaders";
import { createMockWebGL2Context } from "./test-utils";

describe("WebGL2 program helpers", () => {
  it("wraps shader compile failures in typed renderer errors", () => {
    const gl = createMockWebGL2Context({ compileStatus: false });

    expect(() =>
      createProgramBundle({
        fragmentLabel: "bad-fragment",
        fragmentSource: COPY_FRAGMENT_SHADER,
        gl,
        vertexLabel: "fullscreen-vertex",
        vertexSource: FULLSCREEN_VERTEX_SHADER
      })
    ).toThrow(RendererError);

    try {
      createProgramBundle({
        fragmentLabel: "bad-fragment",
        fragmentSource: COPY_FRAGMENT_SHADER,
        gl,
        vertexLabel: "fullscreen-vertex",
        vertexSource: FULLSCREEN_VERTEX_SHADER
      });
    } catch (error) {
      expect(error).toBeInstanceOf(RendererError);
      expect((error as RendererError).code).toBe("WEBGL_SHADER_COMPILE_FAILED");
      expect((error as RendererError).problem).toContain("failed to compile");
      expect((error as RendererError).cause).toContain("mock shader compile log");
      expect((error as RendererError).fix).toContain("Canvas2D");
    }
  });

  it("wraps program link failures in typed renderer errors", () => {
    const gl = createMockWebGL2Context({ linkStatus: false });

    try {
      createProgramBundle({
        fragmentLabel: "bad-link",
        fragmentSource: COPY_FRAGMENT_SHADER,
        gl,
        vertexLabel: "fullscreen-vertex",
        vertexSource: FULLSCREEN_VERTEX_SHADER
      });
    } catch (error) {
      expect(error).toBeInstanceOf(RendererError);
      expect((error as RendererError).code).toBe("WEBGL_PROGRAM_LINK_FAILED");
      expect((error as RendererError).problem).toContain("failed to link");
      expect((error as RendererError).cause).toContain("mock program link log");
      expect((error as RendererError).fix).toContain("Canvas2D");
      return;
    }

    throw new Error("Expected program creation to throw.");
  });
});
