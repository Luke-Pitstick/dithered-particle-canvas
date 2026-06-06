# API

`@dithered-particle-canvas/react` exports the React component, hook, handle type, and public configuration types for the V1 two-layer reveal.

```tsx
import {
  DitheredParticleCanvas,
  type DitheredCanvasHandle,
  type DitheredLayer,
  type DitheredParticleCanvasProps
} from "@dithered-particle-canvas/react";
```

## Component

```tsx
<DitheredParticleCanvas
  foreground="/foreground.png"
  background="/background.png"
  revealLayer="background"
/>
```

`DitheredParticleCanvas` renders a root `<div>` containing a `<canvas>`. Size the root and canvas with CSS; the `width` and `height` props set the canvas element attributes and default to `960` by `540`.

## Props

| Prop | Type | Default | Notes |
|---|---|---:|---|
| `foreground` | `LayerSource` | - | Simple foreground source. Ignored if `layers.foreground` is supplied. |
| `background` | `LayerSource` | - | Simple background source. Ignored if `layers.background` is supplied. |
| `revealLayer` | `"background" \| "foreground"` | - | Which layer is revealed through the pointer mask. Most Browserbase-style heroes use `"background"`. |
| `preset` | `"browserbase"` | - | Applies tuned fit/dither defaults for simple `foreground` and `background` usage. |
| `quality` | `QualityConfig` | `"auto"` behavior | Selects backend and internal resolution scale. |
| `motion` | `"auto" \| "reduced" \| "full"` | `"auto"` behavior | Controls pointer reveal animation. |
| `layers` | `{ background?: DitheredLayer; foreground?: DitheredLayer }` | - | Advanced per-layer configuration. |
| `width` | `number` | `960` | Canvas width attribute. |
| `height` | `number` | `540` | Canvas height attribute. |
| `className` | `string` | - | Applied to the root wrapper. |
| `style` | `CSSProperties` | - | Applied to the root wrapper. |
| `fallback` | `string` | `"Dithered particle canvas"` | Hidden text fallback for non-visual contexts. |
| `aria-label` | `string` | - | Applied to the canvas; also gives it `role="img"`. |
| `onReady` | `() => void` | - | Called after the renderer has decoded/applied layers and rendered. |
| `onError` | `(error: Error) => void` | - | Called for recoverable/developer-readable renderer failures. |
| `onStats` | `(stats: DitheredCanvasStats) => void` | - | Receives backend, frame count, and active/idle state snapshots. |

## Layer Sources

```ts
type LayerSource = string | HTMLImageElement | ImageBitmap | Blob;
```

Use same-origin URL strings for the most predictable path. Remote URLs can work, but they must be served with CORS headers that allow pixel reads. `Blob` and `ImageBitmap` sources are useful when your app already owns decoded or fetched image data.

GIF files are accepted as image sources, but V1 uses only the first decoded frame.

## Layers

```ts
type DitheredLayer = {
  src: LayerSource;
  visible?: boolean;
  fit?: "cover" | "contain" | "stretch" | "none";
  position?: "center" | { x: number; y: number };
  opacity?: number;
  dither?: DitherConfig | false;
  filters?: BuiltInFilterConfig[];
  reveal?: boolean | RevealInteractionConfig;
};
```

Layer notes:

- `visible: false` keeps a layer configured but hides it.
- `fit` controls how the source maps into the canvas.
- `position` is either centered or an `{ x, y }` offset.
- `opacity` is a layer-level opacity multiplier.
- `dither: false` disables ordered dithering for that layer.
- `filters` are built-in only in V1 and are applied in a fixed renderer order.
- `reveal` can be `true` for defaults or an object for pointer mask tuning.

Simple `foreground`/`background` props are converted to layers internally. Use `layers` when you need per-layer filters, dither settings, fit, or reveal tuning.

## Dither

```ts
type DitherConfig = {
  amount?: number;
  matrixSize?: 4 | 8;
  pixelSize?: number;
  palette?: string[] | "source" | "mono" | "browserbase";
};
```

`amount` controls dither strength. `matrixSize` selects ordered Bayer dither size. `pixelSize` is available for coarse pixel grouping. `palette` can keep source colors, use built-in palettes, or use a custom string array of CSS colors.

## Filters

```ts
type BuiltInFilterConfig =
  | { type: "brightness"; amount: number }
  | { type: "contrast"; amount: number }
  | { type: "paletteQuantize"; colors: string[]; amount?: number }
  | { type: "posterize"; levels: number }
  | { type: "tint"; color: string; amount: number }
  | { type: "opacity"; amount: number };
```

V1 supports only this built-in set. There is no public custom filter plugin API yet.

Use `paletteQuantize` when a layer should collapse to a small art-directed palette, such as the Browserbase-style 3-5 color mountain foreground:

```ts
filters: [
  {
    type: "paletteQuantize",
    colors: ["#080c0e", "#ff3a12", "#ffda18", "#77cb2d", "#f2efd6"]
  }
]
```

## Quality

```ts
type QualityConfig =
  | "auto"
  | "low"
  | "medium"
  | "high"
  | {
      resolutionScale?: number;
      maxTextureSize?: number;
      targetFps?: 30 | 60;
      backend?: "auto" | "webgl2" | "canvas2d";
    };
```

Quality guidance:

- `"low"` uses a smaller internal resolution scale.
- `"medium"` is a balanced fallback-friendly setting.
- `"high"` and `"auto"` currently use full internal scale.
- `resolutionScale` multiplies device pixel ratio and is the main V1 memory/performance knob.
- `backend: "auto"` and `backend: "webgl2"` prefer WebGL2, then fall back to Canvas2D if needed.
- `backend: "canvas2d"` forces the fallback backend.
- `maxTextureSize` and `targetFps` are part of the public config shape for release compatibility; use `resolutionScale` for the current hard limit.

## Motion

```ts
motion?: "auto" | "reduced" | "full";
```

- `"auto"` respects `prefers-reduced-motion: reduce`.
- `"reduced"` renders the static hero without reveal animation.
- `"full"` enables reveal animation regardless of the media query.

## Reveal Config

```ts
type RevealInteractionConfig = {
  mode?: "reveal";
  radius?: number;
  strength?: number;
  softness?: number;
  edgeDither?: number;
  fadeMs?: number;
  trail?: boolean | {
    durationMs?: number;
    maxPoints?: number;
    spacing?: number;
    strength?: number;
  };
};
```

Defaults are tuned for a soft reveal with a dithered, broken-up edge. `radius` controls the reveal size, `strength` controls blend intensity, `softness` controls falloff, `edgeDither` controls the fragmented edge, and `fadeMs` controls how long the reveal takes to disappear after pointer leave.

Set `trail` to leave a bounded afterimage behind pointer movement. `durationMs` controls how long each stamp remains, `maxPoints` caps the work per frame, `spacing` avoids oversampling tiny pointer moves, and `strength` controls how intense old stamps are.

## Callbacks

`onReady` fires after the first successful render with applied layers.

`onStats` receives:

```ts
type DitheredCanvasStats = {
  backend: "webgl2" | "canvas2d";
  frames: number;
  active: boolean;
};
```

`onError` receives normal `Error` objects. Renderer-originated errors may also include `code`, `problem`, and `fix` fields. Common codes are:

| Code | Meaning | Typical fix |
|---|---|---|
| `SOURCE_DECODE_FAILED` | An image URL, blob, or bitmap could not be decoded/read. | Check the source path, file type, and CORS headers. |
| `INVALID_COLOR` | A palette or tint color could not be parsed. | Use valid CSS hex/rgb/named colors supported by the renderer. |
| `CANVAS_UNAVAILABLE` | The canvas could not be read or exported. | Ensure the component is mounted and the canvas is not tainted. |
| `BACKEND_UNAVAILABLE` | WebGL2 was requested but unavailable. | Allow Canvas2D fallback or force `backend: "canvas2d"`. |
| `WEBGL_SHADER_COMPILE_FAILED` | A WebGL2 shader failed to compile. | Try Canvas2D fallback and inspect browser/GPU support. |
| `WEBGL_PROGRAM_LINK_FAILED` | A WebGL2 program failed to link. | Try Canvas2D fallback and inspect browser/GPU support. |
| `WEBGL_CONTEXT_RESTORE_FAILED` | The browser lost WebGL2 context and restore failed. | Reload or force Canvas2D in that environment. |

## Imperative Handle

```tsx
import { useRef } from "react";
import { DitheredParticleCanvas, type DitheredCanvasHandle } from "@dithered-particle-canvas/react";

export function ExportableHero() {
  const canvas = useRef<DitheredCanvasHandle | null>(null);

  return (
    <>
      <DitheredParticleCanvas ref={canvas} foreground="/fg.png" background="/bg.png" revealLayer="background" />
      <button onClick={() => canvas.current?.pause()}>Pause</button>
      <button onClick={() => canvas.current?.resume()}>Resume</button>
      <button onClick={async () => console.log(await canvas.current?.exportFrame("image/png"))}>Export</button>
    </>
  );
}
```

```ts
type DitheredCanvasHandle = {
  pause(): void;
  resume(): void;
  exportFrame(type?: "image/png" | "image/jpeg"): Promise<Blob>;
};
```

`exportFrame` can reject if the browser refuses to read the canvas, most commonly because a cross-origin image tainted it.

## Hook

`useDitheredCanvas(ref, props)` is exported for custom wrappers that want to own their own `<canvas>` element. It returns:

```ts
type UseDitheredCanvasResult = {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
};
```

Most apps should use `DitheredParticleCanvas` directly.

## Troubleshooting

| Symptom | Likely cause | What to try |
|---|---|---|
| Canvas stays blank | Source failed to decode or both layers are missing/hidden. | Check `onError`, image paths, and network requests. |
| Export rejects with a security or tainted-canvas message | A cross-origin image was drawn without readable CORS headers. | Serve images same-origin or with `Access-Control-Allow-Origin`. |
| Works locally but not from CDN assets | CDN headers allow display but not pixel reads. | Add CORS headers and set up assets so they can be fetched/decoded readably. |
| Reveal does not animate | `motion="reduced"` or OS reduced-motion preference with `motion="auto"`. | Use `motion="full"` only when animation is appropriate. |
| WebGL2 error appears in `onError` | Browser/GPU/context cannot run the WebGL2 backend. | Use `quality={{ backend: "canvas2d", resolutionScale: 0.6 }}`. |
| Large hero feels slow | Internal resolution is too high for the device. | Lower `resolutionScale`, try `quality="medium"`, or force Canvas2D for constrained environments. |

## Playground Notes

The playground reference lives in `playground/src/examples/TwoLayerHero.tsx` and is covered by Playwright tests in `playground/e2e`. It intentionally uses generated `ImageData` fixtures for deterministic pixel checks. Treat it as a behavior reference; use ordinary image assets in public examples and production apps.
