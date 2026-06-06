# dithered-particle-canvas

A React component for a two-layer, dithered canvas hero. V1 is built for static foreground/background images with a Browserbase-style pointer reveal: the foreground stays stable while the pointer briefly reveals the background through a dithered mask.

## Install

```bash
npm install @dithered-particle-canvas/react
```

React is a peer dependency. The package is ESM-first and ships TypeScript declarations.

## Hello World

```tsx
import { DitheredParticleCanvas } from "@dithered-particle-canvas/react";

<DitheredParticleCanvas
  foreground="/foreground.png"
  background="/background.png"
  revealLayer="background"
/>
```

Use same-origin image paths when you can. If you pass CDN or remote URLs, configure CORS so the renderer can read pixels and export frames.

## Browserbase-Style Reveal

```tsx
import { DitheredParticleCanvas } from "@dithered-particle-canvas/react";

export function HeroReveal() {
  return (
    <DitheredParticleCanvas
      aria-label="Dithered product hero"
      className="heroCanvas"
      foreground="/images/foreground.png"
      background="/images/clouds.png"
      revealLayer="background"
      preset="browserbase"
      motion="auto"
      quality={{ backend: "auto", resolutionScale: 0.75, targetFps: 60 }}
      fallback="A dithered two-layer hero with a pointer reveal."
    />
  );
}
```

```css
.heroCanvas {
  width: min(100%, 1280px);
  aspect-ratio: 16 / 9;
}

.heroCanvas canvas {
  display: block;
  width: 100%;
  height: 100%;
}
```

The component renders a canvas only; place navigation, headings, and buttons in regular DOM over or around it. The playground uses this pattern so text and controls remain crisp while the canvas handles only the visual effect.

## Layer Control

For custom dither, filters, fit, opacity, or reveal behavior, use `layers`:

```tsx
<DitheredParticleCanvas
  revealLayer="background"
  preset="browserbase"
  layers={{
    background: {
      src: "/images/clouds.png",
      fit: "cover",
      filters: [{ type: "contrast", amount: 1.08 }],
      dither: { amount: 0.72, matrixSize: 8, palette: "browserbase" }
    },
    foreground: {
      src: "/images/ridge.png",
      reveal: { radius: 170, softness: 0.42, edgeDither: 0.7, fadeMs: 450 }
    }
  }}
/>
```

## Playground

Run the local playground to see the V1 reference behavior:

```bash
npm install
npm run dev
```

Useful playground URLs:

- `http://localhost:5173/` renders the WebGL2-first auto backend.
- `http://localhost:5173/?backend=canvas2d` forces the fallback backend.
- `http://localhost:5173/?fixture=invalid` exercises decode errors.
- `http://localhost:5173/?fixture=tainted` exercises export/CORS failure handling.

The playground creates deterministic `ImageData` fixtures for E2E tests. Public examples should prefer normal URL, `HTMLImageElement`, `ImageBitmap`, or `Blob` sources.

## Runtime Behavior

- WebGL2 is the primary runtime backend.
- Canvas2D is used when WebGL2 is unavailable or when forced with `quality={{ backend: "canvas2d" }}`.
- Rendering uses on-demand `requestAnimationFrame` bursts, then sleeps while the static hero is idle.
- WebGL2 caches processed layer textures so pointer movement does not re-upload unchanged images every frame.
- `motion="auto"` respects `prefers-reduced-motion`; use `motion="full"` to force pointer reveal or `motion="reduced"` to keep the static hero.

See [API](./docs/api.md) and [Performance](./docs/performance.md) for the full prop reference, performance notes, CORS/export guidance, troubleshooting, and V1 limitations.

## V1 Limitations

- Static images are the primary supported source.
- GIF inputs use the first frame only; V1 does not animate GIFs.
- No worker preprocessing.
- No custom filter plugin API.
- No public core package; only `@dithered-particle-canvas/react` is public in V1.
- No WebGPU, video input, more than two layers, or interaction modes beyond `reveal`.
