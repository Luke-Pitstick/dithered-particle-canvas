# Mountain Color Mode Toggle

Generated: 2026-06-06
Source prompt: Add a mountain control with `Color mode: Limited / Original`; Limited runs `applyMountainPalette(..., colorCount)`, Original skips palette limiting and applies brightness/contrast/saturation/hue/warmth directly to matted image pixels.

## Narrow Scope

Add a playground-only Mountain color mode control that toggles the visible mountain overlay between palette-limited colors and original matted image colors while preserving the existing mountain color sliders.

## Grand-Scheme Fit

- User value: Users can recover the source image colors when the reduced palette is too stylized, without losing the matte, pixelation, or live tuning controls.
- App area: Local playground hero controls in `playground/src/examples/TwoLayerHero.tsx`, styling in `playground/src/styles.css`, and Playwright coverage in `playground/e2e/two-layer-hero.spec.ts`.
- Strategic fit: The playground is becoming the visual tuning surface for the effect; a clear Limited/Original mode makes the color-count slider understandable and keeps experimentation reversible.
- Non-goal: Do not change the public React package API, renderer internals, reveal shader behavior, or the source image/matte loading pipeline outside the mountain overlay repaint path.

## Current Context

- Relevant files or directories inspected:
  - `playground/src/examples/TwoLayerHero.tsx`: Contains the current layer selector, `mountains` layer state, `MountainControlValues`, `MOUNTAIN_SLIDERS`, `applyMountainColorFilters`, `applyMountainPalette`, and matted mountain image generation.
  - `playground/src/styles.css`: Styles the layer selector, popover, sliders, and mobile/desktop bounds for the control surface.
  - `playground/e2e/two-layer-hero.spec.ts`: Has an interaction test that opens the Mountains popover, moves mountain sliders including color count, and verifies visible mountain pixels change.
  - `agents/layer-control-sliders.md`: Prior brief for the playground layer-control system.
- Existing patterns to preserve:
  - Keep mountain controls playground-only; do not alter package exports or renderer types for this toggle.
  - Keep crisp controls in DOM overlays; keep mountain pixels rendered through the existing `hero-mountains` canvas.
  - Preserve the current default look by making `Limited` the default color mode with `colorCount: 5`.
  - Preserve existing query fixture behavior and existing Playwright pixel checks.
  - Work with the dirty worktree carefully. There are unrelated changes in docs/package internals; do not revert or stage them.
- Assumptions:
  - "Original" means the matted and pixelated mountain image keeps its source-photo colors, then receives brightness/contrast/saturation/hue/warmth slider adjustments.
  - "Original" does not mean restoring the sky background around the mountain, removing the matte, or removing pixelation.
  - The existing `Color count` slider should remain visible but only materially affect the `Limited` mode. It may remain in the panel while Original is active, or be visually de-emphasized if that can be done cleanly.

## Technical Implementation Plan

1. Inspect `playground/src/examples/TwoLayerHero.tsx` around `MountainControlValues`, `DEFAULT_PLAYGROUND_CONTROLS`, `MOUNTAIN_SLIDERS`, `LayerControlPanel`, `applyMountainColorFilters`, `loadMattedMountainForeground`, and `applyMountainPalette`.
2. Add a mountain color mode field, e.g. `colorMode: "limited" | "original"`, defaulting to `"limited"`.
3. Add a compact segmented/toggle control in the Mountains popover labeled `Limited` and `Original`, using real buttons with `aria-pressed` and `data-testid` hooks.
4. Update `applyMountainColorFilters` so:
   - `limited` mode runs `applyMountainPalette(output, controls.colorCount)` before the existing brightness/contrast/saturation/hue/warmth pass.
   - `original` mode skips `applyMountainPalette` and applies the existing color filter pass directly to the matted/pixelated source pixels.
5. Keep `loadMattedMountainForeground` returning the matted/pixelated base image before palette reduction, so the mode switch can choose palette reduction live.
6. Add or update Playwright coverage to switch Mountains to Original mode and assert visible mountain pixels differ from Limited mode while the hero remains visible. Keep the existing color-count slider test meaningful for Limited mode.
7. Update CSS only if needed for the segmented mode control, following the current `.matrix-button`/selector visual language and mobile bounds.

## Delegate Agent Instructions

You may edit files within the scoped implementation area. Do not broaden scope without recording a follow-up task.

Owned scope:
- `playground/src/examples/TwoLayerHero.tsx`
- `playground/src/styles.css`
- `playground/e2e/two-layer-hero.spec.ts`

Instructions:
1. Reconstruct context from the files listed above.
2. Implement only the Mountain color mode toggle.
3. Preserve the current default Limited/5-color visual behavior.
4. Do not modify package internals, docs, or unrelated dirty files.
5. Add validation for the mode switch and run the commands listed below.
6. Do not commit unless the parent prompt explicitly grants commit permission.

## Acceptance Criteria

- [ ] The Mountains popover includes a clear `Color mode` control with `Limited` and `Original` options.
- [ ] `Limited` mode uses `applyMountainPalette(..., colorCount)` and preserves the current default 5-color look.
- [ ] `Original` mode skips palette limiting and applies mountain brightness/contrast/saturation/hue/warmth directly to the matted/pixelated source image.
- [ ] Changing the mode updates the visible mountain overlay live without reloading the page.
- [ ] Existing layer controls, query fixtures, pointer reveal behavior, and responsive popover layout still work.
- [ ] Playwright coverage proves the mode switch changes visible mountain pixels.

## Validation Plan

- Automated: `npm run typecheck`
- Automated: `npm run test`
- Automated: `npm run test:e2e`
- Manual: `npm run dev`, open the playground, choose Mountains, switch between Limited and Original, adjust color count and color sliders, and verify the mountain overlay updates live.
- Review gate: `$design-review` is useful because this adds a visible control to an already dense popover.

## Out of Scope

- Removing mountain pixelation.
- Restoring sky pixels around the mountain foreground.
- Adding URL persistence, saved presets, or reset buttons.
- Changing package types, renderer behavior, WebGL shaders, or Canvas2D backend internals.
- Reworking the whole control panel layout.

## Follow-Up Task Ideas

- Add a Reset button for the Mountains controls.
- Disable or annotate `Color count` while Original mode is active.
- Add URL serialization for layer-control presets.
