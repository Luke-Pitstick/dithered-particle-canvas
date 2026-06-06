# Playground Layer Control Sliders

Generated: 2026-06-06
Source prompt: Add playground sliders for adjusting filters, size, shape, speed of the interactive cursor, resolution, and related settings. The sliders should appear in a box when clicking a layer.

## Narrow Scope

Add playground-only layer controls that let a user click the background or foreground layer selector and adjust existing dither, filter, reveal, trail, and quality values through a floating slider popover.

## Grand-Scheme Fit

- User value: Users can tune the dithered reveal effect live instead of editing constants in `TwoLayerHero.tsx`.
- App area: The local Vite playground at `playground/src/examples/TwoLayerHero.tsx` and its styling in `playground/src/styles.css`.
- Strategic fit: The package is a visual effect component; an interactive playground makes the public API easier to understand, test, and refine before broader documentation or presets are added.
- Non-goal: Do not expand the public React package API or add new renderer capabilities beyond values already accepted by `DitheredLayer`, `RevealInteractionConfig`, `RevealTrailConfig`, `BuiltInFilterConfig`, and `QualityConfig`.

## Current Context

- Relevant files or directories inspected:
  - `README.md`: Documents the playground, `layers` prop, `quality.resolutionScale`, and Browserbase-style reveal configuration.
  - `packages/react/src/types.ts`: Defines the layer, filter, reveal, trail, and quality fields the controls should mutate.
  - `playground/src/App.tsx`: Mounts `TwoLayerHero` as the single playground experience.
  - `playground/src/examples/TwoLayerHero.tsx`: Owns current hard-coded layer constants, `layers` memoization, quality config, diagnostics, and hero DOM.
  - `playground/src/styles.css`: Owns the full-screen hero layout, overlay UI, and responsive styling.
  - `playground/e2e/two-layer-hero.spec.ts`: Existing Playwright coverage for hero rendering, pointer reveal behavior, resolution scale, and render-loop idleness.
  - `playground/e2e/failure-states.spec.ts`: Existing fixture/error coverage that should continue to pass.
  - `package.json` and `playground/package.json`: Identify validation commands: `npm run typecheck`, `npm run test`, `npm run test:e2e`, and playground build scripts.
- Existing patterns to preserve:
  - Keep canvas visuals in `DitheredParticleCanvas`; put crisp controls in normal DOM overlays.
  - Keep pointer/frame internals out of React state; only user-selected config belongs in playground React state.
  - Preserve query fixtures for `?backend=canvas2d`, `?backend=webgl2`, `?fixture=invalid`, and `?fixture=tainted`.
  - Use typed React state and existing exported package types rather than ad hoc untyped config objects.
- Assumptions:
  - "Shape" means tuning the existing reveal footprint and edge character, such as radius, softness, edge dither, edge noise, trail spacing, and trail dust size. It does not require a new cursor geometry API.
  - "Speed" means existing temporal reveal/trail controls, such as fade duration, trail duration, trail idle time, and trail spacing. It does not require changing pointer event sampling or renderer scheduling.
  - Because the foreground and background are composited into canvas/image layers, the first useful version can expose clickable layer chips or rows in the playground UI; literal pixel-level layer picking can be a follow-up.

## Technical Implementation Plan

1. Inspect `playground/src/examples/TwoLayerHero.tsx` and extract the hard-coded configurable values into a small typed playground config state, keeping image loading, diagnostics, and runtime mode behavior intact.
2. Update `createHeroLayers` to accept the playground config and apply per-layer slider values to:
   - background and foreground `filters` amounts
   - background `dither.amount`, `dither.pixelSize`, and matrix size if represented as a segmented control
   - each layer's `reveal.radius`, `softness`, `edgeDither`, `edgeNoise`, `fadeMs`, and trail fields
   - per-layer opacity if useful and supported by `DitheredLayer`
3. Update the `quality` memo so the shared playground control state can adjust `resolutionScale` while still respecting the selected backend query param.
4. Add a compact overlay layer selector with `background` and `foreground` controls. Clicking a layer opens a floating popover box anchored near the selector. The popover contains labeled sliders for the selected layer and a small global section for resolution.
5. Keep controls accessible and deterministic: use real `button`, `input type="range"`, and associated labels; support closing the popover via Escape and by selecting the active layer again or clicking a close button.
6. Style the controls in `playground/src/styles.css` so they sit above the hero without blocking pointer-reveal testing except where the control box itself is visible. Ensure mobile layout does not overlap the hero copy in an incoherent way.
7. Add focused Playwright coverage that opens each layer popover, moves at least one slider, and verifies the rendered canvas remains visible and diagnostics still report frames. Extend existing resolution-scale expectations if the new resolution slider has a stable default.

## Delegate Agent Instructions

You may edit files within the scoped playground implementation area. Do not broaden scope without recording a follow-up task.

Owned scope:
- `playground/src/examples/TwoLayerHero.tsx`
- `playground/src/styles.css`
- `playground/e2e/two-layer-hero.spec.ts`
- Additional small playground-only helper/component files under `playground/src/` if this keeps `TwoLayerHero.tsx` readable

Instructions:
1. Reconstruct context from the files listed above.
2. Implement only playground controls for values already supported by the package types.
3. Preserve the current default visual output as closely as possible when sliders are untouched.
4. Avoid adding dependencies unless there is a strong local reason.
5. Add validation appropriate to the change, especially typecheck and at least one e2e interaction path.
6. Do not commit unless the parent prompt explicitly grants commit permission.

## Acceptance Criteria

- [ ] The playground shows a clear layer selector for background and foreground over the hero.
- [ ] Clicking a layer opens a floating control box with sliders for filter, dither/reveal size, reveal edge/shape character, trail/speed timing, and resolution where applicable.
- [ ] Slider changes update the live `DitheredParticleCanvas` configuration without a page reload.
- [ ] Untouched default slider values preserve the current Browserbase-style hero behavior closely enough for existing e2e tests to remain meaningful.
- [ ] The popover is usable by keyboard and does not permanently block pointer reveal testing when closed.
- [ ] The implementation keeps package internals untouched unless a small type import path adjustment is required.
- [ ] Existing failure fixtures and backend query params still work.

## Validation Plan

- Automated: `npm run typecheck`
- Automated: `npm run test`
- Automated: `npm run test:e2e`
- Manual: `npm run dev`, open `http://localhost:5173/`, click both layer controls, move sliders, verify the hero changes live, close the popover, and verify pointer reveal still works.
- Review gate: `$design-review` is useful because this is an interactive overlay on a visual playground.

## Out of Scope

- New public API fields for cursor geometry, new filter plugins, blend modes, more than two layers, or non-reveal interaction modes.
- Persisting slider settings to local storage, URL params, presets, exports, or docs.
- Replacing the current hero composition or asset-loading pipeline.
- Literal visual layer hit-testing inside the canvas.
- A full control-panel redesign for every package prop.

## Follow-Up Task Ideas

- Add URL serialization for playground slider state so tuned looks can be shared.
- Add preset save/reset controls for common Browserbase-style looks.
- Add a docs example that explains the controls and maps them to `DitheredParticleCanvas` props.
- Add literal layer picking if future playground layers become spatially distinct enough to justify hit-testing.
