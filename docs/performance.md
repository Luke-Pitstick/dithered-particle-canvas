# Performance, CORS, and Limitations

V1 is designed for one effect: two static layers, ordered dithering, built-in filters, and a pointer reveal mask. The renderer keeps this narrow so the default hero can be smooth without asking React to animate every frame.

## Runtime Model

The component is WebGL2-first. When WebGL2 is available, source images are decoded, processed into layer textures, and composited on the GPU. Canvas2D remains in the package for unsupported WebGL2 contexts, forced fallback mode, and deterministic test coverage.

```tsx
<DitheredParticleCanvas
  foreground="/foreground.png"
  background="/background.png"
  revealLayer="background"
  quality={{ backend: "auto", resolutionScale: 0.75 }}
/>
```

Use `quality={{ backend: "canvas2d" }}` to force the fallback path when you know a browser/device class has unreliable GPU support.

## On-Demand Rendering

The renderer does not run a permanent animation loop for static content. It schedules `requestAnimationFrame` bursts when something is dirty:

- layers decode or change;
- the canvas is resized;
- quality/backend settings change;
- pointer movement updates the reveal mask;
- the reveal fade needs a few more frames after pointer leave;
- the renderer is resumed or a WebGL context is restored.

After the reveal fade completes and nothing else changed, the loop returns to idle. This is why the playground E2E checks expect RAF callbacks and frame counts to stop changing after idle.

## Processed Texture Cache

In the WebGL2 path, each layer is preprocessed into a texture keyed by source and layer config. Pointer movement changes reveal uniforms, not source pixels, so unchanged layer textures are reused across pointer-only and fade-only frames.

Practical implications:

- Changing `src`, dither, filters, fit, position, or opacity rebuilds processed layer data.
- Moving the pointer should not re-upload the same image every frame.
- Unmounting, source replacement, backend replacement, and context loss dispose owned resources.

## Canvas2D Fallback

Canvas2D fallback keeps the hero visible when WebGL2 is unavailable or deliberately disabled. It is also useful for tests because CPU image output is easier to compare deterministically.

Canvas2D is not the primary performance target. For large, full-width heroes, reduce internal resolution:

```tsx
<DitheredParticleCanvas
  foreground="/foreground.png"
  background="/background.png"
  revealLayer="background"
  quality={{ backend: "canvas2d", resolutionScale: 0.6, targetFps: 30 }}
/>
```

## Quality and Memory Caps

The main V1 memory control is internal resolution:

- `quality="low"` uses `0.5` scale.
- `quality="medium"` uses `0.75` scale.
- `quality="high"` and `"auto"` currently use full scale.
- `quality={{ resolutionScale: 0.75 }}` gives explicit control.

Backing pixels are roughly:

```text
cssWidth * cssHeight * devicePixelRatio^2 * resolutionScale^2
```

Each RGBA texture or canvas buffer costs about four bytes per pixel, and the WebGL2 path can hold source, processed, and framebuffer textures while rendering. A 1280 by 720 hero at DPR 2 and scale 1 is about 3.7 million pixels per texture, or roughly 14 MB per RGBA buffer before extra GPU bookkeeping.

Guidance:

- Prefer `resolutionScale: 0.75` for large desktop heroes.
- Prefer `resolutionScale: 0.5` or `0.6` for mobile or forced Canvas2D.
- Keep source images close to the displayed aspect ratio.
- Avoid swapping layer config every React render; memoize layer objects when possible.
- `maxTextureSize` exists in the public quality type for release compatibility, but current hard runtime control is `resolutionScale`.

## Visual Coarseness vs Internal Resolution

Browserbase-style low-resolution art direction uses two independent controls:

- `quality.resolutionScale` lowers backing canvas and texture dimensions. This can reduce memory and fill-rate work, but the component still fills the same CSS layout box.
- `dither.pixelSize` makes ordered dither thresholds advance in larger visual blocks. This changes the look and is honored by both WebGL2 preprocessing and the Canvas2D fallback.

Use them together when the intended result is visibly lower resolution:

```tsx
<DitheredParticleCanvas
  layers={{
    background: {
      src: "/background.png",
      dither: { amount: 0.9, matrixSize: 8, palette: "browserbase", pixelSize: 3 }
    },
    foreground: {
      src: "/foreground.png",
      dither: false
    }
  }}
  quality={{ backend: "auto", resolutionScale: 0.5, targetFps: 60 }}
  revealLayer="background"
/>
```

For fallback-heavy environments, keep the same visual `pixelSize` and force Canvas2D with a lower frame target:

```tsx
quality={{ backend: "canvas2d", resolutionScale: 0.5, targetFps: 30 }}
```

## CORS and Export Constraints

The renderer needs readable pixels. Browser image display rules are more permissive than canvas pixel-read rules, so an image can appear loadable while still tainting the canvas.

Use one of these paths:

- same-origin assets, such as `/images/hero.png`;
- remote assets served with `Access-Control-Allow-Origin`;
- app-owned `Blob` or `ImageBitmap` sources created from readable fetches.

When a canvas is tainted, `exportFrame()` may reject with a browser security error. The fix is to change how the image is served or loaded; client code cannot untaint a canvas after cross-origin pixels have been drawn.

Example error style:

```text
Layer "background" could not read pixels from "/hero.png".
Cause: the image was loaded without CORS headers, so the canvas is tainted.
Fix: serve the image with Access-Control-Allow-Origin or pass a same-origin asset.
```

## GIF Behavior

GIF files are accepted as sources so the API can stay compatible with future animation support. V1 decodes and renders the first frame only. There is no animated GIF playback, no per-frame GIF processing, and no GIF timeline control in V1.

Use static PNG, JPEG, WebP, or AVIF assets for the most predictable result.

## Fallback Behavior

Fallbacks are layered:

- If WebGL2 is unavailable in auto mode, the renderer falls back to Canvas2D and reports backend stats as `"canvas2d"`.
- If reduced motion is requested and `motion="auto"`, the hero stays static and reveal animation is disabled.
- If source decode fails, `onError` receives a readable error and the playground shows a fallback status.
- If export is blocked by CORS/taint, `exportFrame()` rejects instead of silently returning a bad blob.

## Troubleshooting Table

| Problem | Why it happens | Fix |
|---|---|---|
| `SOURCE_DECODE_FAILED` | Source URL, blob, or bitmap could not be decoded or read. | Check path, file format, server response, and CORS headers. |
| `BACKEND_UNAVAILABLE` | WebGL2 was unavailable or failed initialization. | Use auto fallback or force `quality={{ backend: "canvas2d" }}`. |
| `WEBGL_SHADER_COMPILE_FAILED` or `WEBGL_PROGRAM_LINK_FAILED` | Browser/GPU rejected shader/program setup. | Try Canvas2D fallback and collect browser/GPU details. |
| `WEBGL_CONTEXT_RESTORE_FAILED` | Browser lost the GPU context and could not restore resources. | Reload, lower resolution scale, or force Canvas2D. |
| Export says the canvas is tainted | A cross-origin image was drawn without readable CORS. | Serve same-origin or add `Access-Control-Allow-Origin`. |
| Reveal edge looks too smooth | `edgeDither` is too low or custom layer config disabled dither. | Increase `edgeDither` and use the `browserbase` palette/preset. |
| Idle CPU/GPU usage stays high | Props are changing every render or pointer/fade never settles. | Memoize `layers`, avoid changing object identity unnecessarily, and check pointer events. |

## Playground Performance Checks

The playground includes E2E coverage for:

- nonblank two-layer rendering;
- pointer reveal of the background while distant foreground stays stable;
- dithered reveal edge breakup;
- fade after pointer leave;
- reduced-motion static behavior;
- Canvas2D fallback rendering;
- idle RAF and GPU upload behavior after the initial render.

Run it locally with:

```bash
npm run dev
npm run test:e2e
```

The playground fixture generates image data for deterministic pixel checks. That fixture is not the recommended public usage pattern.

## V1 Limitations

These are explicit V1 boundaries:

- Static images first.
- GIF first-frame fallback only.
- No full GIF animation.
- No worker preprocessing.
- No custom filter plugins.
- No public core package; the only public package is `@dithered-particle-canvas/react`.
- No WebGPU.
- No video input.
- No more than two layers.
- No interaction modes beyond `reveal`.

These constraints keep the first release focused and leave room for V2 without committing to unstable renderer internals.
