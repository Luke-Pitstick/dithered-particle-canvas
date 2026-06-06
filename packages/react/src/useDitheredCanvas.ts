import { useEffect, useImperativeHandle, useRef } from "react";
import type { ForwardedRef, RefObject } from "react";
import type { DitheredCanvasHandle, DitheredParticleCanvasProps } from "./types";
import {
  createDitheredCanvasRenderer,
  type DitheredCanvasRenderer,
  type DitheredCanvasRendererFactory
} from "./internal/renderer/react-renderer";

export type UseDitheredCanvasResult = {
  canvasRef: RefObject<HTMLCanvasElement | null>;
};

let rendererFactory: DitheredCanvasRendererFactory = ({ canvas, props }) =>
  createDitheredCanvasRenderer(canvas, props);

export function useDitheredCanvas(
  forwardedRef?: ForwardedRef<DitheredCanvasHandle>,
  props?: DitheredParticleCanvasProps
): UseDitheredCanvasResult {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rendererRef = useRef<DitheredCanvasRenderer | null>(null);
  const propsRef = useRef<DitheredParticleCanvasProps>(props ?? {});
  propsRef.current = props ?? {};

  useEffect(() => {
    const canvas = canvasRef.current;

    if (!canvas) {
      return undefined;
    }

    const renderer = rendererFactory({
      canvas,
      props: propsRef.current
    });
    rendererRef.current = renderer;

    return () => {
      rendererRef.current = null;
      renderer.dispose();
    };
  }, []);

  useEffect(() => {
    rendererRef.current?.update(propsRef.current);
  });

  useImperativeHandle(
    forwardedRef,
    () => ({
      pause: () => {
        rendererRef.current?.pause();
      },
      resume: () => {
        rendererRef.current?.resume();
      },
      exportFrame: async (type = "image/png") => {
        if (rendererRef.current) {
          return rendererRef.current.exportFrame(type);
        }

        const canvas = canvasRef.current;

        if (!canvas) {
          return new Blob([], { type });
        }

        return new Promise<Blob>((resolve, reject) => {
          canvas.toBlob((blob) => {
            if (blob) {
              resolve(blob);
            } else {
              reject(new Error("Canvas frame export failed."));
            }
          }, type);
        });
      }
    }),
    []
  );

  return { canvasRef };
}

/** @internal */
export function __setDitheredCanvasRendererFactoryForTests(
  factory: DitheredCanvasRendererFactory | undefined
): void {
  rendererFactory = factory ?? (({ canvas, props }) => createDitheredCanvasRenderer(canvas, props));
}
