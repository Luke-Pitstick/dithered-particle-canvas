import { forwardRef } from "react";
import { useDitheredCanvas } from "./useDitheredCanvas";
import type { DitheredCanvasHandle, DitheredParticleCanvasProps } from "./types";

export const DitheredParticleCanvas = forwardRef<
  DitheredCanvasHandle,
  DitheredParticleCanvasProps
>(function DitheredParticleCanvas(
  {
    className,
    style,
    fallback = "Dithered particle canvas",
    width = 960,
    height = 540,
    "aria-label": ariaLabel,
    ...rendererProps
  },
  ref
) {
  const { canvasRef } = useDitheredCanvas(ref, {
    ...rendererProps,
    height,
    width
  });

  return (
    <div className={className} data-dpc-root="" style={style}>
      <canvas
        ref={canvasRef}
        aria-label={ariaLabel}
        data-dpc-canvas=""
        height={height}
        role={ariaLabel ? "img" : undefined}
        width={width}
      />
      <span hidden>{fallback}</span>
    </div>
  );
});
