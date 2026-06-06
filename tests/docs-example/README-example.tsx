import { DitheredParticleCanvas, type DitheredParticleCanvasProps } from "@dithered-particle-canvas/react";

const heroProps: DitheredParticleCanvasProps = {
  foreground: "/foreground.png",
  background: "/background.png",
  revealLayer: "background",
  preset: "browserbase",
  motion: "auto",
  quality: { backend: "auto", resolutionScale: 0.75, targetFps: 60 },
  fallback: "A dithered two-layer hero with a pointer reveal."
};

export function ReadmeExample() {
  return <DitheredParticleCanvas {...heroProps} />;
}
