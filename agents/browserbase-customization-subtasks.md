# Browserbase Customization Subtasks

Generated: 2026-06-06

## Goal

Add user-facing controls for matching the Browserbase reference more closely: lower apparent render resolution, a less round and more dissipated interactive reveal edge, and configurable reveal fade timing.

## Goal Frame

- Desired outcome: users can tune the Browserbase-style hero without editing renderer internals or playground constants.
- Known constraints: keep the V1 two-layer public API intact, preserve WebGL2 and Canvas2D parity, and avoid broad renderer redesign.
- Users affected: React developers using `DitheredParticleCanvas`, plus playground users evaluating the Browserbase preset.
- Existing artifacts inspected: `packages/react/src/types.ts`, `docs/api.md`, `docs/performance.md`, `packages/react/src/internal/interaction/reveal-mask.ts`, `packages/react/src/internal/interaction/pointer-store.ts`, `playground/src/examples/TwoLayerHero.tsx`, and existing `agents/` plans.
- Assumptions made: the request is for product/API-customizable knobs, not just hard-coded Browserbase playground values; existing `resolutionScale`, `pixelSize`, `softness`, `edgeDither`, `fadeMs`, `trail.durationMs`, and `trail.idleMs` should be reused where they already solve the job.

## Assumptions

- "Lower resolution" means the visible Browserbase-style coarse canvas/dither resolution, not only GPU memory reduction.
- "Less round and more dissipated around the edges" should be configurable on the reveal mask/trail shape and should work in both WebGL2 and Canvas2D.
- "How fast the revealed layer goes away" covers pointer-leave fade and trail/dust lifetime; if the implementation keeps both knobs, docs should explain the difference.
- These tasks may build on the current uncommitted dust-trail work; agents must inspect `git status` before editing and avoid reverting unrelated changes.

## Execution Shape

- Critical path: T1 -> T2 -> T3 for lowest merge risk, because all three touch public examples/docs and T2/T3 both touch reveal config.
- Parallel lanes: T1 can run independently from T2/T3 if the parent integrator handles docs/example merge conflicts.
- Integration point: the playground should expose or demonstrate all three controls together in `TwoLayerHero`.
- Riskiest assumption: current `quality.resolutionScale` may lower render workload without producing the exact Browserbase low-res visual, so T1 must decide whether to use `dither.pixelSize`, `resolutionScale`, or a new named visual-resolution option.
- Minimum complete slice: a user can configure coarser render/dither output, broken/dustier reveal edges, and fade-out speed through documented props, with unit and E2E coverage.

## Work Map

- API/design: define which existing props already cover each knob and where a new typed option is needed.
- Rendering: keep Canvas2D and WebGL2 behavior equivalent for any new reveal-edge or resolution parameter.
- Playground: surface the Browserbase-like defaults in `TwoLayerHero` so the effect is visible at `http://localhost:5173/`.
- QA: add focused tests around visual resolution, edge breakup, and fade timing rather than brittle full-page snapshots.
- Documentation: update `docs/api.md` and `docs/performance.md` so users know which knob changes visual style versus performance.

## Subtasks

### T1: Add A User-Facing Lower-Resolution Control

**Outcome:** Users can intentionally lower the apparent Browserbase hero resolution while preserving a stable layout and renderer performance.

**Scope:** Include an API/demo decision for visual coarseness, docs, tests, and playground defaults. Reuse `quality.resolutionScale` and `dither.pixelSize` if they are sufficient; add a small typed convenience only if existing knobs cannot produce the requested visible low-res look. Exclude unrelated palette/filter changes.

**Context packet:**

- Inspect `packages/react/src/types.ts` for `QualityConfig` and `DitherConfig`.
- Inspect `packages/react/src/internal/renderer/react-renderer.ts`, especially `getQualityScale`.
- Inspect `packages/react/src/internal/backends/canvas2d/ordered-dither.ts` for `pixelSize`.
- Inspect `docs/performance.md` and `docs/api.md` for current resolution guidance.
- Inspect `playground/src/examples/TwoLayerHero.tsx` for existing `quality.resolutionScale` and Browserbase `dither.pixelSize`.

**Agent instructions:** Determine whether Browserbase-like lower resolution should be achieved by lower internal canvas resolution, larger dither pixel grouping, or both. Implement the smallest public-facing change that lets users choose it. If using existing props, update the playground and docs so the option is obvious. If adding an alias/preset, keep it narrow and backwards-compatible.

**Expansion path:** Compare screenshots at current settings, lower `resolutionScale`, and larger `pixelSize`. If these produce different visual outcomes, document them separately as "performance resolution" and "visual pixelation."

**Acceptance criteria:**

- A user can lower the visible resolution/coarseness through documented props.
- Browserbase playground uses the lower-resolution setting by default or exposes it clearly in example code.
- The canvas size remains responsive and does not shift layout when the setting changes.
- WebGL2 and Canvas2D fallback both honor the chosen setting.
- Docs distinguish visual coarseness from performance/memory scaling.

**Validation:** Run `npm run typecheck`, `npm test -- --run`, `npm run lint`, `npm run build`, and relevant Playwright checks. Include before/after screenshots or pixel-region notes showing the lower-resolution effect.

**Dependencies:** None.

**Downstream consumers:** T2 and T3 should preserve the selected resolution defaults when tuning reveal behavior.

**Handoff:** Return API decision, files changed, example usage, validation commands, and visual evidence.

### T2: Make Reveal Shape And Edge Dissipation Customizable

**Outcome:** Users can tune the interactive cursor reveal so it is less perfectly round and more dissipated/broken around the edge, matching the Browserbase feel.

**Scope:** Include reveal-mask config, Canvas2D/WebGL2 parity, tests, and docs. Reuse `radius`, `softness`, `edgeDither`, and trail dust controls where possible; add a small option only if current knobs cannot make the reveal less circular or sufficiently dissipated. Exclude fade-duration semantics except where trail dust interacts with edge appearance.

**Context packet:**

- Inspect `packages/react/src/types.ts` for `RevealInteractionConfig` and `RevealTrailConfig`.
- Inspect `packages/react/src/internal/interaction/reveal-mask.ts` for mask falloff, edge dither, and dust threshold.
- Inspect `packages/react/src/internal/backends/webgl2/shaders.ts` for matching GLSL mask logic.
- Inspect `packages/react/src/internal/backends/webgl2/WebGL2Backend.ts` for reveal uniforms/trail packing.
- Inspect `packages/react/src/internal/interaction/reveal-mask.test.ts` and `playground/e2e/two-layer-hero.spec.ts`.

**Agent instructions:** Add or clarify knobs that control reveal edge breakup and non-roundness. If existing `softness` plus `edgeDither` are enough for dissipated edges, improve docs/playground examples and tests. If less-round shape requires implementation, design a minimal deterministic mask variation, such as noise-warped radius or anisotropic/irregular edge breakup, and implement it in both CPU and shader paths.

**Expansion path:** Prototype three settings: subtle Browserbase default, strong dissipated edge, and almost-smooth edge. Keep the API numeric and bounded so it is easy to test. Add a fixture or pixel-grid test that proves the edge has mixed coverage and is not a smooth circle.

**Acceptance criteria:**

- Users can make the reveal edge less round and more dissipated through documented config.
- CPU and WebGL2 paths use equivalent math or a documented tolerance.
- The reveal core still feels responsive and does not collapse into random noise.
- Existing trail dust behavior continues to work after pointer idle/leave.
- Reduced motion remains static as before.

**Validation:** Run reveal-mask unit tests, WebGL2/browser E2E tests, `npm run typecheck`, `npm test -- --run`, `npm run lint`, and `npm run build`. Capture screenshots or pixel-grid summaries for smooth versus dissipated settings.

**Dependencies:** None, but coordinate with T3 if both edit `RevealInteractionConfig` docs/tests.

**Downstream consumers:** T3 should preserve the new edge settings while tuning fade timing.

**Handoff:** Return final option names/ranges, CPU/shader implementation notes, visual examples, and test results.

### T3: Expose Reveal Disappearance Speed Controls

**Outcome:** Users can control how quickly the revealed layer goes away after pointer leave and how long dust/trail remnants remain after cursor movement stops.

**Scope:** Include public docs, defaults, playground examples, and tests for fade timing. Use existing `fadeMs`, `trail.durationMs`, and `trail.idleMs` if they cover the behavior; add no new timing field unless there is a clear gap. Exclude changing reveal shape or resolution except for preserving defaults introduced by T1/T2.

**Context packet:**

- Inspect `packages/react/src/internal/interaction/pointer-store.ts` for active/idle/leave behavior.
- Inspect `packages/react/src/internal/interaction/reveal-mask.ts` for `getRevealFade`, `DEFAULT_REVEAL_TRAIL`, and `resolveRevealTrailConfig`.
- Inspect `packages/react/src/internal/interaction/pointer-store.test.ts` and `reveal-mask.test.ts`.
- Inspect `docs/api.md` reveal config section.
- Inspect `playground/src/examples/TwoLayerHero.tsx` for Browserbase default `fadeMs`, `trail.durationMs`, and `trail.idleMs`.

**Agent instructions:** Make the timing controls clear and reliable. Verify whether `fadeMs` controls pointer-leave fade, `trail.durationMs` controls dust lifetime, and `trail.idleMs` controls how fast a stopped in-bounds cursor becomes dust. Update defaults only if the Browserbase reference needs it, and document exact semantics so users can tune fast snap-away versus lingering dust.

**Expansion path:** Add tests for three timing profiles: fast disappear, Browserbase default, and slow linger. If the current pointer store conflates pointer-leave fade with trail dust fade, split tests first and only change implementation if behavior is ambiguous or wrong.

**Acceptance criteria:**

- Public docs explain how to customize reveal disappearance speed.
- Example code shows at least one fast and one lingering configuration, or the playground default is named clearly.
- Unit tests prove `fadeMs`, `trail.durationMs`, and `trail.idleMs` affect the intended phases.
- Browser E2E confirms the reveal disappears within the configured time window after pointer leave.
- No continuous RAF remains after all fade/trail activity ends.

**Validation:** Run `npm run typecheck`, `npm test -- --run`, `npm run lint`, `npm run build`, and the fade-related Playwright test. Report measured timing windows used in tests.

**Dependencies:** None, but coordinate with T2 on reveal config documentation.

**Downstream consumers:** Parent integrator combines T1, T2, and T3 into one Browserbase customization pass.

**Handoff:** Return timing semantics, defaults chosen, docs/example changes, tests added, and validation results.

## Coordination Notes

- Prefer serial integration if one agent will implement all three; the tasks intentionally touch nearby config/docs.
- If dispatched to parallel agents, assign T1 first or in isolation, then have T2 and T3 return patches for parent integration rather than both landing docs blindly.
- Keep `agents/subtasks.md` intact; it is the broader V1 implementation plan. This file is the focused Browserbase customization plan.
- Do not revert existing uncommitted Browserbase trail, dust, or playground changes unless the parent explicitly asks.
- Add new public options only after proving existing `quality`, `dither`, `reveal`, and `trail` fields are insufficient.

## Suggested Next Dispatch

Start with T1 if you want the most visible Browserbase similarity improvement first.

```text
Implement T1 from agents/browserbase-customization-subtasks.md. Add or document a user-facing way to lower the apparent Browserbase hero resolution, inspect the existing `quality.resolutionScale` and `dither.pixelSize` paths first, keep WebGL2/Canvas2D behavior aligned, update the playground example and docs, and return validation commands plus visual evidence.
```
