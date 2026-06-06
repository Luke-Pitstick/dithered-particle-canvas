# Dithered Particle Canvas Technical Implementation Plan

Status: eng-reviewed V1 plan
Date: 2026-06-06
Repo: `dithered-particle-canvas`

## Plan Summary

Build an open source React component for one polished effect: a two-layer, dithered, canvas-backed hero where pointer movement reveals a hidden background layer through a stable foreground layer.

The public product is a React component. The renderer lives outside React so animation, pointer input, shader uniforms, and image processing do not trigger React re-renders.

V1 is WebGL2-first because performance and future interactivity are part of the product. Canvas2D stays in V1 as a fallback and deterministic test oracle, not as the primary runtime architecture.

```text
React API
  -> renderer lifecycle
  -> fixed foreground/background layer configs
  -> WebGL2 runtime backend
  -> Canvas2D fallback + golden-output oracle
  -> ordered dither only
  -> small built-in filter set
  -> one pointer reveal mode
  -> tests + playground
```

## Visual Reference Notes

Frames sampled from `Screen Recording 2026-06-05 at 10.15.48 PM.mov` show the Browserbase effect is not a repel field and not a clean circular spotlight.

Observed behavior:

- The default visible canvas is a pale, heavily dithered sky/surface plus a high-contrast dithered mountain band.
- Pointer movement temporarily reveals a hidden blue/white cloud layer behind the pale surface.
- The reveal has a soft circular core, but the edge is broken into dithered square/particle fragments.
- The reveal fades away after the pointer leaves. It does not persist as a painted trail.
- The foreground mountain band, nav, headline, copy, and buttons stay visually stable. The interaction changes the sky/reveal plane, not the UI or mountain foreground.
- The best V1 mental model is "scratch/reveal the background through a dithered mask," not "move pixels away from the cursor."

## Confirmed V1 Scope

V1 includes:

- Two fixed layers: `background` and `foreground`.
- Static images first.
- GIF-compatible `src` inputs with first-frame fallback only.
- WebGL2 renderer as the primary runtime backend.
- Canvas2D fallback for unsupported WebGL2 contexts and deterministic tests.
- Ordered dithering only.
- Small built-in filter set: brightness, contrast, posterize, tint, opacity.
- One pointer interaction mode first: `reveal`, matching the Browserbase-style background reveal.
- Dithered reveal-mask edge with fade-out after pointer leave.
- SSR-safe React wrapper.
- Playground example where pointer movement reveals the background layer under a stable foreground.
- npm-ready package structure and release workflow.

## NOT in Scope

- Full animated GIF frame processing. The source API remains compatible, but V1 only promises first-frame fallback.
- Worker preprocessing. Keep the renderer synchronous enough to debug, then add workers after the shader path is stable.
- Custom filter plugins. Built-in filters prove the pipeline first.
- WebGPU. WebGL2 is the boring GPU target for this release.
- Video input.
- More than two layers.
- Multiple interaction modes beyond `reveal`.
- General creative-coding DSL or no-code editor.
- CJS fallback unless package consumers force it. ESM-first is enough for V1.

## What Already Exists

The repo is currently a placeholder:

- `README.md`: project name and one-line placeholder.
- `AGENTS.md`: repo guidance.
- `docs/office-hours-design.md`: source design doc recommending a narrow two-layer hero.
- `docs/technical-implementation-plan.md`: this plan.

There is no package structure, React app, renderer code, build setup, test setup, playground, or release workflow yet. V1 should reuse browser platform APIs instead of inventing framework-level infrastructure:

- React effects and refs for lifecycle.
- WebGL2 for runtime rendering.
- Canvas2D and `ImageData` for fallback and golden output.
- `createImageBitmap` and `HTMLImageElement.decode()` for source normalization.
- `ResizeObserver` for canvas sizing.
- `requestAnimationFrame` for the render loop.
- Pointer events for interaction.

## Architecture

Package layout:

```text
packages/
  core/
  react/
    src/
      DitheredParticleCanvas.tsx
      useDitheredCanvas.ts
      types.ts
      internal/
        renderer/
          DitheredCanvasRenderer.ts
          types.ts
          render-loop.ts
        backends/
        webgl2/
          WebGL2Backend.ts
          shaders.ts
          programs.ts
          framebuffers.ts
          textures.ts
          canvas2d/
            Canvas2DBackend.ts
            ordered-dither.ts
        layers/
          normalize-source.ts
          layer-state.ts
        filters/
          builtin.ts
          pipeline.ts
        interaction/
          pointer-store.ts
          reveal-mask.ts
        utils/
          color.ts
          feature-detect.ts
          errors.ts
playground/
  src/
    App.tsx
    examples/
      TwoLayerHero.tsx
docs/
  api.md
  performance.md
```

Deliberately absent from V1 layout: public `@dithered-particle-canvas/core` exports, `workers/`, GIF decoder adapters, custom plugin registries, shader extension systems, and extra interaction modes.

Runtime dependency graph:

```text
React component
  -> useDitheredCanvas
    -> DitheredCanvasRenderer
      -> normalize layer sources
      -> choose backend
        -> WebGL2Backend     primary runtime
        -> Canvas2DBackend   fallback + test oracle
      -> pointer store
      -> render loop
```

Render-loop state:

```text
idle
  -> source loaded / prop changed / resized / pointer moved
  -> mark dirty
  -> schedule RAF burst
  -> render frame
  -> reveal fade still active?
       yes -> schedule next RAF
       no  -> return to idle
```

V1 should not run a continuous RAF just because the canvas is visible. Static images only need frames when pixels can change: source decode, prop diff, resize, pointer movement, reveal fade, context restore, export, or quality adjustment.

Backend contract:

```ts
export type RenderBackendName = "webgl2" | "canvas2d";

export interface RenderBackend {
  readonly name: RenderBackendName;
  init(canvas: HTMLCanvasElement, size: RenderSize): void;
  setLayers(layers: NormalizedLayers): void;
  setPointer(pointer: PointerSnapshot): void;
  resize(size: RenderSize): void;
  render(frame: RenderFrame): void;
  exportFrame?(type: "image/png" | "image/jpeg"): Promise<Blob>;
  dispose(): void;
}
```

The contract is intentionally small and internal for V1. WebGL2 owns shaders, uniforms, programs, textures, and context-loss recovery. Canvas2D owns CPU pixel output and should share pure color/dither/filter helpers where possible. V2 can publish this core boundary once the visual effect and fallback behavior are proven.

## Public React API

Primary API, optimized for the target use case:

```tsx
import { DitheredParticleCanvas } from "@dithered-particle-canvas/react";

export function Hero() {
  return (
    <DitheredParticleCanvas
      foreground="/headline-mask.png"
      background="/mountains.png"
      revealLayer="background"
      preset="browserbase"
      aria-label="Animated dithered mountain hero"
    />
  );
}
```

Advanced V1 API:

```tsx
<DitheredParticleCanvas
  layers={{
    background: {
      src: "/mountains.gif",
      fit: "cover",
      dither: { amount: 0.85, matrixSize: 8, palette: "browserbase" },
      filters: [
        { type: "posterize", levels: 5 },
        { type: "contrast", amount: 1.2 }
      ],
      reveal: { radius: 120, softness: 0.35, strength: 1 }
    },
    foreground: {
      src: "/headline-mask.png",
      fit: "contain",
      dither: { amount: 0.35 },
      filters: [{ type: "opacity", amount: 0.95 }]
    }
  }}
  quality="auto"
  motion="auto"
/>
```

Layer type:

```ts
type DitheredLayer = {
  src: string | HTMLImageElement | ImageBitmap | Blob;
  visible?: boolean;
  fit?: "cover" | "contain" | "stretch" | "none";
  position?: "center" | { x: number; y: number };
  opacity?: number;
  dither?: DitherConfig | false;
  filters?: BuiltInFilterConfig[];
  reveal?: boolean | RevealInteractionConfig;
};
```

V1 does not expose custom filters, arbitrary blend modes, or a generic imperative mutation API. The imperative handle stays tiny:

```ts
type DitheredCanvasHandle = {
  pause(): void;
  resume(): void;
  exportFrame(type?: "image/png" | "image/jpeg"): Promise<Blob>;
};
```

## Rendering Strategy

V1 backend selection:

```text
Can create WebGL2 context?
  yes -> WebGL2Backend
          -> shader ordered dither
          -> shader built-in filters
          -> pointer uniform for reveal mask
          -> composite foreground/background through reveal mask
  no  -> Canvas2DBackend
          -> CPU ordered dither
          -> CPU built-in filters
          -> CPU reveal mask over lower internal resolution
          -> composite foreground/background through reveal mask
```

WebGL2 path:

- One texture per layer.
- One processed texture cache per layer config.
- One preprocessing pass runs fit coordinates, built-in filters, ordered dither, and opacity when source/config changes.
- Pointer and fade frames run only the reveal-mask composite pass over the processed foreground/background textures.
- The final composite mixes foreground and background by reveal-mask alpha, rather than moving pixels around.
- Pointer state is passed as uniforms, not React state.
- Context loss emits `onError`, pauses rendering, and attempts one restore.
- Rendering is dirty-flag driven. WebGL2 schedules RAF bursts while the reveal mask is active, then sleeps.

Canvas2D path:

- Decodes images into canvas-readable sources.
- Applies the same fit math as WebGL2.
- Uses pure CPU helpers for ordered dither and filters.
- Runs at a lower internal resolution when `quality="auto"` requires it.
- Serves as the golden-output oracle for deterministic tests.
- Uses the same dirty/fade scheduler as WebGL2 so fallback does not repaint forever.

Pipeline:

```text
source
  -> normalize to bitmap-like source
  -> fit/crop coordinates
  -> built-in filters
  -> ordered dither
  -> cache processed layer texture until source/config changes
  -> reveal-mask composite for configured reveal layer
  -> opacity
  -> composite layers
```

WebGL2 frame shape:

```text
source/config changed?
  yes -> upload source texture
      -> process layer into cached framebuffer texture
      -> mark composite dirty
  no  -> reuse processed layer textures

pointer/fade changed?
  yes -> run reveal composite pass only
  no  -> stay idle
```

## Source Loading

Static images:

- Accept URL, `Blob`, `HTMLImageElement`, and `ImageBitmap`.
- Normalize to an internal `LayerSource`.
- Prefer `createImageBitmap` when supported.
- Fall back to `HTMLImageElement.decode()`.
- Cache decoded sources by URL or object identity plus relevant decode options.

GIFs:

- Accept GIF URLs and blobs in the public `src` type.
- V1 treats GIFs as still images by drawing or decoding the first available frame.
- Emit a development warning when animated GIF playback is requested in V1.
- Do not promise frame timing, disposal methods, loop counts, or transparency correctness until the GIF adapter lands.

Cross-origin images:

- Document that pixel reads and export require CORS-enabled images.
- Support `crossOrigin?: "anonymous" | "use-credentials"` on URL sources.
- Detect `SecurityError` from canvas reads/export and route it to `onError`.

## Dithering

V1 algorithm:

- `ordered` only.
- Matrix sizes: `4` and `8`.
- Default palette: `browserbase`.
- Palette alternatives: `mono`, `source`, or explicit color array.

```ts
type DitherConfig = {
  amount?: number;
  matrixSize?: 4 | 8;
  pixelSize?: number;
  palette?: string[] | "source" | "mono" | "browserbase";
};
```

Implementation rules:

- Keep threshold-matrix generation pure and shared by both backends.
- Keep palette parsing and nearest-color mapping pure and shared where practical.
- WebGL2 and Canvas2D may differ slightly, but golden fixtures define acceptable tolerance.
- Dither amount blends original color and quantized output.

## Filter System

V1 built-ins:

```ts
type BuiltInFilterConfig =
  | { type: "brightness"; amount: number }
  | { type: "contrast"; amount: number }
  | { type: "posterize"; levels: number }
  | { type: "tint"; color: string; amount: number }
  | { type: "opacity"; amount: number };
```

The order is fixed for V1:

```text
brightness
  -> contrast
  -> posterize
  -> tint
  -> dither
  -> opacity
```

This avoids a premature filter pipeline DSL. Users get enough control to make the hero look good, and the implementation keeps one deterministic path.

## Interaction Model

V1 ships `reveal` only.

The reveal interaction does not displace either image. It computes a soft circular mask around the pointer and uses that mask to reveal the configured background layer through the foreground layer. That is the Browserbase-like "peek behind the surface" effect and should be treated as the reference interaction for V1.

The mask is not a perfect radial gradient. V1 should apply dithered breakup at the mask edge so the reveal feels like the surrounding ordered-dither texture. In WebGL2 this is a threshold/noise term in the reveal shader. In Canvas2D this is a deterministic CPU mask so tests can compare output.

Reveal config:

```ts
type RevealInteractionConfig = {
  mode?: "reveal";
  radius?: number;
  strength?: number;
  softness?: number;
  edgeDither?: number;
  fadeMs?: number;
};
```

Default preset:

```ts
const browserbaseRevealPreset = {
  radius: 150,
  strength: 1,
  softness: 0.35,
  edgeDither: 0.55,
  fadeMs: 450
};
```

Pointer flow:

```text
pointermove on canvas
  -> normalize CSS pixels to backing-store pixels
  -> store pointer snapshot in renderer
  -> WebGL2 uniforms or Canvas2D CPU mask
  -> compute soft reveal mask with dithered edge breakup
  -> mix foreground/background by mask alpha
  -> fade mask toward zero after pointer leaves
  -> stop RAF when mask alpha reaches zero
```

Accessibility and motion:

- Respect `prefers-reduced-motion` by default.
- `motion="auto"` disables reveal fade/relaxation animation when reduced motion is requested.
- Canvas accepts `aria-label`.
- Component renders fallback DOM text for SSR and non-canvas contexts.
- Canvas never traps keyboard focus in V1.

## React Integration

Lifecycle:

```text
mount
  -> render SSR-safe wrapper
  -> create canvas ref
  -> create renderer in effect
  -> load layer sources
  -> render first frame when ready

prop change
  -> normalize props
  -> diff layer and quality config
  -> update renderer imperatively
  -> mark dirty and schedule one RAF burst
  -> recreate backend only when backend-critical settings change

unmount
  -> cancel RAF
  -> remove observers/listeners
  -> release ImageBitmaps/textures
  -> dispose backend
```

React state rules:

- Do not put pointer position, frame count, textures, particle fields, or per-frame stats in React state.
- React receives coarse callbacks only: `onReady`, `onError`, and optional low-frequency `onStats`.
- If live stats become public, expose them via `useSyncExternalStore`; do not wire them into the hero render path.
- The renderer must expose an idle/active signal for tests so V1 can prove it stops scheduling RAF after reveal fade-out.

## Performance Budget

V1 targets:

- 60 FPS on modern desktop at 1440p with two static image layers using WebGL2.
- 30 FPS minimum on mid-range mobile with `quality="auto"`.
- Initial image decode and first render under 300 ms after network load for common hero-size assets.
- No React re-render per animation frame.
- Memory target under 128 MB for two 1440p RGBA layers plus working buffers.

Quality config:

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

Performance tactics:

- Avoid new typed-array allocation per frame.
- Cache decoded sources and texture uploads until source/config changes.
- Cache processed WebGL2 layer textures after fit/filter/dither/opacity.
- Re-run expensive shader preprocessing only when source, dither, filter, fit, opacity, or quality config changes.
- During pointer/fade frames, run only reveal-mask composite over processed textures.
- Use a single dirty-flag RAF scheduler owned by the renderer.
- Render on demand: source load, prop diff, resize, pointer movement, reveal fade, context restore, export, or quality adjustment.
- Stop scheduling RAF when the reveal mask reaches zero alpha and no work is dirty.
- Use `ResizeObserver` and coalesce resize work into the next frame.
- Use `IntersectionObserver` to pause offscreen rendering.
- Use quality auto-scaling when frames miss budget.
- Keep Canvas2D fallback lower-resolution by default on mobile.

## Compatibility Plan

Browser targets:

- Current evergreen Chrome, Edge, Firefox, and Safari.
- React 18 and 19.
- SSR-safe ESM imports.

Feature detection:

```text
window/document available?
  no -> render fallback wrapper only
  yes -> continue

canvas.getContext("webgl2") succeeds?
  yes -> WebGL2Backend
  no -> Canvas2DBackend

createImageBitmap available?
  yes -> use for supported source types
  no -> HTMLImageElement.decode fallback
```

WebGL2 context loss:

- Listen for `webglcontextlost` and `webglcontextrestored`.
- Prevent default loss handling when appropriate.
- Pause rendering while lost.
- Recreate programs/textures on restore.
- Surface one clear `onError` event if restore fails.

## Developer Experience

Install target:

```bash
npm install @dithered-particle-canvas/react
```

Minimum hello world:

```tsx
<DitheredParticleCanvas
  foreground="/foreground.png"
  background="/background.png"
  revealLayer="background"
/>
```

Docs for V1:

- `README.md`: install, hello world, two-layer hero example.
- `docs/api.md`: props and layer config.
- `docs/performance.md`: quality settings, CORS notes, fallback behavior.
- Playground: one reference example and one reduced-motion example.

Error message style:

```text
Layer "background" could not read pixels from "/hero.png".
Cause: the image was loaded without CORS headers, so the canvas is tainted.
Fix: serve the image with Access-Control-Allow-Origin or pass a same-origin asset.
```

TTHW target:

- Under 5 minutes from install to interactive local hero.
- Under 10 lines for the first useful example.

## Testing Plan

Detected framework: none yet. V1 should add Vitest for unit tests and Playwright for browser/canvas tests.

Code path and user-flow coverage target:

```text
CODE PATHS                                           USER FLOWS
[+] React wrapper                                    [+] Install + first hero
  ├── [GAP] SSR import avoids window access            ├── [GAP] [->E2E] Vite example renders canvas
  ├── [GAP] mount creates renderer once                ├── [GAP] foreground static over background static
  ├── [GAP] prop diff updates layers                   └── [GAP] reduced-motion disables reveal animation
  └── [GAP] unmount disposes backend/listeners/RAF

[+] Backend selection                                [+] Pointer interaction
  ├── [GAP] WebGL2 available -> WebGL2Backend          ├── [GAP] [->E2E] pointer reveals background layer
  ├── [GAP] WebGL2 unavailable -> Canvas2DBackend      ├── [GAP] foreground remains pixel-stable
  └── [GAP] context lost -> pause/restore/error        └── [GAP] pointer leaves canvas and reveal mask fades safely

[+] Source loading                                   [+] Failure states
  ├── [GAP] URL image decode success                   ├── [GAP] invalid URL shows clear error
  ├── [GAP] Blob/ImageBitmap source success            ├── [GAP] tainted canvas export reports CORS fix
  ├── [GAP] GIF input -> first-frame fallback          └── [GAP] WebGL2 unavailable still shows hero
  └── [GAP] decode failure -> onError

[+] WebGL2 rendering
  ├── [GAP] two textures composite in layer order
  ├── [GAP] preprocessing pass caches processed layer textures
  ├── [GAP] ordered dither shader output within tolerance
  ├── [GAP] built-in filters in fixed order
  ├── [GAP] reveal uniforms expose only the configured background layer
  ├── [GAP] reveal edge uses dithered breakup, not a smooth spotlight
  ├── [GAP] reveal frames skip preprocessing when source/config unchanged
  └── [GAP] dirty scheduler sleeps after reveal fade-out

[+] Canvas2D fallback
  ├── [GAP] CPU ordered dither golden snapshot
  ├── [GAP] CPU filters golden snapshot
  └── [GAP] Canvas2D/WebGL2 output parity within tolerance

COVERAGE: 0/29 paths tested (0%)
QUALITY: ★★★:0 ★★:0 ★:0 | GAPS: 29 (5 E2E)
Legend: ★★★ behavior + edge + error | ★★ happy path | ★ smoke check
[->E2E] = needs browser/integration test
```

Required V1 tests:

- `packages/react/src/internal/utils/color.test.ts`: parse hex colors, invalid colors, palette lookup.
- `packages/react/src/internal/backends/canvas2d/ordered-dither.test.ts`: fixed `ImageData` input to golden output.
- `packages/react/src/internal/filters/builtin.test.ts`: brightness, contrast, posterize, tint, opacity, and fixed order.
- `packages/react/src/internal/layers/normalize-source.test.ts`: URL, Blob, `ImageBitmap`, decode failure, GIF first-frame fallback behavior.
- `packages/react/src/internal/renderer/backend-selection.test.ts`: WebGL2 success, WebGL2 failure, forced Canvas2D.
- `packages/react/src/internal/renderer/render-scheduler.test.ts`: dirty flags, RAF burst scheduling, reveal fade continuation, idle stop.
- `packages/react/src/internal/interaction/reveal-mask.test.ts`: coordinate normalization, radius cutoff, softness falloff, dithered edge breakup, mask fade.
- `packages/react/src/DitheredParticleCanvas.test.tsx`: SSR-safe import, mount once, prop diff, unmount cleanup.
- `playground/e2e/two-layer-hero.spec.ts`: nonblank canvas, pointer reveals background, foreground stability, reduced motion, Canvas2D fallback.
- `playground/e2e/failure-states.spec.ts`: invalid image, tainted export, WebGL2 unavailable fallback.
- `packages/react/src/internal/backends/webgl2/layer-cache.test.ts`: source/config changes rebuild processed textures, pointer/fade frames reuse them.
- `packages/react/src/internal/backends/webgl2/parity.test.ts`: compare shader preprocessing output to Canvas2D oracle within tolerance for dither/filter fixtures.

## Implementation Phases

Phase 1: Project scaffold

- Add package manager, TypeScript, build tooling, linting, Vitest, Playwright.
- Create `packages/react` and `playground`.
- Add CI for typecheck, lint, unit tests, browser tests, and build.

Phase 2: Core contracts and Canvas2D oracle

- Define layer, backend, filter, dither, quality, and error types.
- Implement color parsing, palette mapping, ordered dither matrix helpers.
- Implement Canvas2D backend enough to produce deterministic fixtures.
- Add golden tests before WebGL2 shader work.

Phase 3: WebGL2 V1 runtime

- Implement WebGL2 context creation, program compilation, texture upload, and disposal.
- Add preprocessing framebuffer pass for fit, built-in filters, ordered dither, and opacity.
- Add processed layer texture cache keyed by source/config.
- Add reveal-mask composite shader over processed foreground/background textures.
- Add context loss/restore handling.
- Add WebGL2 vs Canvas2D parity tests.

Phase 4: React wrapper and lifecycle

- Add `DitheredParticleCanvas` and `useDitheredCanvas`.
- Add SSR-safe wrapper behavior.
- Add prop normalization and renderer diffing.
- Add cleanup tests for RAF, listeners, observers, textures, and image bitmaps.
- Add dirty-flag render scheduling tests.

Phase 5: Interaction and playground

- Add pointer store and `reveal` interaction.
- Add stable foreground over pointer-revealed background playground example.
- Add Playwright canvas-pixel checks.
- Add reduced-motion behavior.

Phase 6: Release readiness

- Add README, API docs, performance/CORS docs.
- Add package metadata and exports.
- Add GitHub Actions release workflow for npm publish.
- Add smoke-test package install in CI.

## Failure Modes Registry

| Failure mode | User impact | Test coverage required | Error handling required |
|---|---|---|---|
| WebGL2 unavailable | Hero fails on older/locked-down browsers | Backend-selection unit test + Playwright fallback test | Fall back to Canvas2D and emit optional warning |
| WebGL2 context lost | Canvas freezes or blanks | Unit/integration test with mocked context-loss events | Pause, restore once, recreate GPU resources, call `onError` if restore fails |
| Shader compile/link failure | Blank canvas with cryptic console error | Unit test around program creation failure | Throw typed developer error with shader/program name |
| Processed texture cache misses every frame | Pointer reveal stutters and wastes GPU work | Layer-cache unit test and benchmark counter | Key cache by source/config and skip preprocessing during reveal-only frames |
| Processed texture cache is not disposed | GPU memory grows across prop changes or unmount | Texture disposal unit test | Track processed textures and delete them on config replacement/dispose/context loss |
| Cross-origin image taints canvas | Export/parity reads fail | Playwright tainted-export test | Catch `SecurityError`, explain CORS fix |
| GIF animation expected in V1 | User expects animation but sees still frame | Source-loader test for GIF fallback warning | Warn clearly that V1 uses first frame only |
| High-DPI canvas exceeds memory budget | Mobile tab reloads or stalls | Browser test for auto resolution cap | Clamp internal size under `quality="auto"` |
| React prop update recreates renderer | Flicker and dropped frames | React prop-diff test | Diff props and update backend imperatively |
| RAF not cancelled on unmount | Memory leak and background CPU use | React unmount cleanup test | Store RAF id as nullable and cancel on dispose |
| Continuous RAF runs while static | Idle pages burn GPU and battery with no visible change | Scheduler unit test and browser render-count check | Render on dirty events and stop after reveal fade-out |
| Pointer coordinate mismatch under DPR | Reveal mask appears offset | Unit test for coordinate normalization | Normalize CSS to backing-store coordinates |
| Reveal mask applies to the wrong layer | Foreground changes or the wrong image appears under the pointer | Playwright pixel stability test | Backend mixes only the configured reveal layer through the mask |
| Reveal edge is too smooth | Effect looks like a generic flashlight instead of the Browserbase texture | Golden mask test and Playwright screenshot comparison | Apply deterministic dither/noise threshold to the mask edge |
| Reveal does not fade out | Canvas keeps a stale blue patch after pointer leaves | Unit test for `fadeMs` and browser test after pointer leave | Decay mask alpha to zero when pointer is inactive |

Critical silent gaps before implementation: WebGL2 context loss, shader compile failure, CORS taint, and cleanup leaks. Each must have tests and typed errors in V1.

## Performance Review Plan

Benchmarks required before public release:

- WebGL2 frame time at 800x600, 1440x900, and 1920x1080 with two static layers.
- Canvas2D fallback frame time at 800x600 and 1440x900.
- Texture upload time for common hero assets.
- Processed texture rebuild count during 10 seconds of pointer movement.
- Memory allocation over 60 seconds with pointer movement.
- React render count during 10 seconds of animation.
- RAF/render count during 10 seconds idle after reveal fade-out.

Performance gates:

- No per-frame React renders.
- No continuous RAF while static V1 content is idle.
- No per-frame texture re-upload unless source changes.
- No processed layer texture rebuild on pointer-only or fade-only frames.
- No per-frame typed-array allocation in WebGL2 path.
- Average WebGL2 frame time under 16.7 ms at 1440x900 on modern desktop.
- Average Canvas2D fallback frame time under 33.3 ms at reduced internal resolution.

## Distribution Plan

V1 creates one npm package users can install:

- `@dithered-particle-canvas/react`

The renderer core remains internal under `packages/react/src/internal/` for V1. Do not publish `@dithered-particle-canvas/core` until V2, when non-React usage and backend contracts are stable enough to support as public API.

Release requirements:

- ESM package exports.
- React peer dependency.
- TypeScript declarations.
- README examples verified by CI.
- GitHub Actions workflow for build, test, and npm publish.
- Playground build artifact for manual QA.

## Worktree Parallelization Strategy

The work has independent lanes after core contracts land.

| Step | Modules touched | Depends on |
|---|---|---|
| Project scaffold | repo root, packages/, playground/ | - |
| Core contracts + Canvas2D oracle | packages/react/src/internal/ | Project scaffold |
| WebGL2 runtime | packages/react/src/internal/backends/webgl2/ | Core contracts + Canvas2D oracle |
| React wrapper | packages/react/ | Core contracts + Canvas2D oracle |
| Playground + E2E | playground/ | WebGL2 runtime, React wrapper |
| Docs + release | docs/, repo root | React wrapper, Playground + E2E |

Parallel lanes:

- Lane A: Project scaffold -> Core contracts + Canvas2D oracle.
- Lane B: WebGL2 runtime after Lane A.
- Lane C: React wrapper after Lane A.
- Lane D: Playground + E2E after Lanes B and C.
- Lane E: Docs + release after Lane D.

Execution order: launch Lane B and Lane C in parallel worktrees after Lane A merges. Then merge both and run Lane D. Lane E finishes the release surface.

Conflict flags: Lane B and Lane C both depend on shared internal core types. Keep `packages/react/src/internal/renderer/types.ts` stable before parallelizing.

## Implementation Tasks

Synthesized from this review's findings. Each task derives from a specific finding above. Run with Claude Code or Codex; checkbox as you ship.

- [ ] **T1 (P1, human: ~2h / CC: ~15min)** — Scope — Keep V1 WebGL2-first but narrow
  - Surfaced by: Step 0 scope challenge — previous plan mixed Canvas2D-first launch with WebGL2/worker/GIF/plugin future scope.
  - Files: `docs/technical-implementation-plan.md`
  - Verify: plan lists WebGL2 primary runtime, Canvas2D fallback/test oracle, one public React package, and excludes workers/full GIF/plugins/public core from V1.
- [ ] **T2 (P1, human: ~4h / CC: ~30min)** — Core — Add backend contract and Canvas2D oracle before shaders
  - Surfaced by: Architecture review — WebGL2-first needs deterministic CPU output to prevent shader-only visual drift.
  - Files: `packages/react/src/internal/renderer/`, `packages/react/src/internal/backends/canvas2d/`
  - Verify: Vitest golden tests pass for ordered dither and filters.
- [ ] **T3 (P1, human: ~1d / CC: ~1h)** — WebGL2 — Implement V1 runtime with context-loss handling
  - Surfaced by: Architecture/performance review — runtime performance and future interactivity depend on GPU-first rendering.
  - Files: `packages/react/src/internal/backends/webgl2/`
  - Verify: WebGL2 unit tests, layer-cache tests, shader compile failure tests, context-loss tests, and parity tests pass.
- [ ] **T4 (P1, human: ~3h / CC: ~25min)** — React — Add SSR-safe wrapper and cleanup tests
  - Surfaced by: Code quality/test review - renderer lifecycle must not leak RAF, listeners, observers, textures, or bitmaps.
  - Files: `packages/react/src/`
  - Verify: React tests pass for SSR import, mount, prop diff, and unmount cleanup.
- [ ] **T5 (P1, human: ~2h / CC: ~20min)** — Renderer — Add dirty-flag RAF burst scheduler
  - Surfaced by: Performance review - static-image V1 should not repaint forever after reveal fade-out.
  - Files: `packages/react/src/internal/renderer/render-loop.ts`, `packages/react/src/internal/renderer/render-scheduler.test.ts`
  - Verify: scheduler tests prove RAF continues during reveal fade and stops when idle.
- [ ] **T6 (P1, human: ~3h / CC: ~25min)** — WebGL2 — Cache processed static layer textures
  - Surfaced by: Performance review - static images should not rerun fit/filter/dither work on pointer-only frames.
  - Files: `packages/react/src/internal/backends/webgl2/framebuffers.ts`, `packages/react/src/internal/backends/webgl2/textures.ts`, `packages/react/src/internal/backends/webgl2/layer-cache.test.ts`
  - Verify: tests prove source/config changes rebuild processed textures and pointer/fade frames reuse them.
- [ ] **T7 (P1, human: ~3h / CC: ~25min)** — QA — Add Playwright canvas-pixel E2E tests
  - Surfaced by: Test review - visual success, foreground stability, reveal-mask behavior, and fallback behavior cannot be proven by unit tests alone.
  - Files: `playground/e2e/`, `playground/src/`
  - Verify: Playwright confirms nonblank canvas, pointer reveal, foreground stability, reduced motion, and Canvas2D fallback.
- [ ] **T8 (P2, human: ~2h / CC: ~15min)** — Release — Add npm package and CI release path
  - Surfaced by: Distribution check — code without packaging is not usable by React developers.
  - Files: `package.json`, `packages/react/package.json`, `.github/workflows/`
  - Verify: CI builds the React package, emits declarations, and dry-runs publish artifacts.

## Review Completion Summary

- Step 0: Scope Challenge — scope reduced per recommendation, then updated by user preference to WebGL2-first V1 with Canvas2D fallback.
- Architecture Review: 2 issues found and resolved in plan: Canvas2D-first conflicted with performance/future-interactivity goals; public core package was deferred to V2.
- Code Quality Review: 2 issues found and resolved in plan: launch layout included future worker/GIF/plugin modules; superseded design doc was marked historical so it cannot override the current plan.
- Test Review: diagram produced, 29 gaps identified because no implementation/tests exist yet.
- Performance Review: 3 issues found and resolved in plan: runtime path now protects 60 FPS target with WebGL2; RAF now sleeps when static V1 content is idle; static layer processing is cached outside pointer/fade frames.
- NOT in scope: written.
- What already exists: written.
- TODOS.md updates: 0 items proposed; no `TODOS.md` exists and all current review work is build-plan scope.
- Failure modes: 4 critical silent gaps flagged.
- Outside voice: skipped.
- Parallelization: 5 lanes, 2 parallel after core contracts.
- Lake Score: 7/7 recommendations chose complete option.

## Sources Checked

- React `useSyncExternalStore`: https://react.dev/reference/react/useSyncExternalStore
- MDN `OffscreenCanvas`: https://developer.mozilla.org/docs/Web/API/OffscreenCanvas
- MDN `requestAnimationFrame`: https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame
- MDN `createImageBitmap`: https://developer.mozilla.org/en-US/docs/Web/API/Window/createImageBitmap
- MDN cross-origin canvas images: https://developer.mozilla.org/en-US/docs/Web/HTML/How_to/CORS_enabled_image

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | - | Not run |
| Codex Review | `/codex review` | Independent 2nd opinion | 0 | - | Not run |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 2 | CLEAR | 7 plan issues resolved, 29 test gaps captured, 4 critical silent gaps captured as V1 requirements |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | - | Not run |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | - | Not run |

- **UNRESOLVED:** 0.
- **VERDICT:** ENG CLEARED — ready to implement the WebGL2-first V1 plan.
