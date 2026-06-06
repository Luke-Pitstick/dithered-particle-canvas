# @dithered-particle-canvas/react

React package for a two-layer dithered canvas hero with a pointer reveal. V1 is ESM-first, ships TypeScript declarations, and keeps renderer internals private.

## Install

```bash
npm install @dithered-particle-canvas/react
```

React is a peer dependency.

## Usage

```tsx
import { DitheredParticleCanvas } from "@dithered-particle-canvas/react";

export function Hero() {
  return (
    <DitheredParticleCanvas
      foreground="/foreground.png"
      background="/background.png"
      revealLayer="background"
      preset="browserbase"
      fallback="Dithered two-layer hero"
    />
  );
}
```

For advanced configuration, import the public types from the package root:

```tsx
import {
  DitheredParticleCanvas,
  type DitheredLayer,
  type DitheredParticleCanvasProps
} from "@dithered-particle-canvas/react";
```

V1 supports static images first. GIF inputs decode to the first frame only, and the package does not expose a public renderer core, worker API, custom filter plugin API, WebGPU backend, video input, or more than two layers.
