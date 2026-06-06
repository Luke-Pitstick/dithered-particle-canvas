# Dithered Particle Canvas V1 Subtasks

Generated: 2026-06-06

## Goal

Implement the reviewed V1 technical plan for `dithered-particle-canvas`: a React package that renders a WebGL2-first, two-layer, dithered hero where pointer movement reveals a hidden background layer through a stable foreground layer.

## Goal Frame

- Desired outcome: ship an installable React package with a performant Browserbase-style reveal hero.
- Known constraints: WebGL2 primary runtime, Canvas2D fallback/oracle, one public React package, static images first, first-frame GIF fallback only.
- Users affected: React developers who want the effect without writing canvas/WebGL lifecycle code.
- Existing artifacts inspected: `docs/technical-implementation-plan.md`, superseded `docs/office-hours-design.md`, `AGENTS.md`, and the existing `agents/` folder.
- Assumption made: implementation agents will use the technical plan as source of truth and ignore stale Canvas2D-first wording in the superseded design doc.

## Assumptions

- `docs/technical-implementation-plan.md` is the implementation source of truth.
- `docs/office-hours-design.md` is superseded and should be treated as historical context only.
- V1 publishes one public npm package: `@dithered-particle-canvas/react`.
- Renderer core stays internal under `packages/react/src/internal/`.
- V1 does not include workers, full animated GIF decoding, custom filter plugins, WebGPU, video, more than two layers, or non-React public core exports.
- No package/test scaffold exists yet, so the first task must create the repo structure and CI baseline.

## Execution Shape

- Critical path: T1 -> T2 -> join(T3, T4, T5) -> T6 -> T7 -> T8
- Parallel lanes after T2: T3 WebGL2 runtime and T4 React wrapper can proceed in parallel if `packages/react/src/internal/renderer/types.ts` is stable.
- Integration point: T6 combines renderer, WebGL2, Canvas2D, React wrapper, and playground behavior into browser-visible E2E tests.
- Riskiest assumption: the WebGL2 processed-texture cache plus reveal-mask composite will hit 60 FPS at 1440p without continuous RAF.
- Minimum complete slice: scaffold + internal contracts + Canvas2D oracle + WebGL2 preprocessing/composite + React wrapper + one playground hero + Playwright pixel checks.

## Work Map

- Architecture: T1 sets workspace boundaries; T2 defines internal renderer contracts; T3 and T4 implement the two main sides of the boundary.
- Rendering/performance: T3 handles WebGL2 preprocessing/cache/composite; T5 handles reveal-mask behavior and dirty RAF scheduling.
- QA: T2 supplies deterministic CPU oracle tests; T6 proves browser-visible behavior and performance counters.
- Documentation/release: T7 explains usage and limitations; T8 verifies package installability and release workflow.
- Parallelization: T3, T4, and T5 can run in parallel after T2 if they coordinate on renderer types and scheduler hooks.
- Early risk reduction: T2 and T3 should prove Canvas2D/WebGL2 parity and texture cache behavior before UI polish.

## Subtasks

### T1: Scaffold the React Package Workspace

**Outcome:** Create the repo structure, package tooling, test harness, and CI baseline for a single public React package.

**Scope:** Include TypeScript, package manager config, `packages/react`, `playground`, Vitest, Playwright, lint/typecheck/build commands, package exports, and GitHub Actions. Exclude renderer implementation beyond placeholder modules.

**Context packet:**
- Read `docs/technical-implementation-plan.md`, especially `Confirmed V1 Scope`, `Architecture`, `Testing Plan`, and `Distribution Plan`.
- Respect `AGENTS.md`: agent files live in `agents/`, docs live in `docs/`.
- V1 package target is `@dithered-particle-canvas/react`; do not create a public `@dithered-particle-canvas/core` package.

**Agent instructions:** Set up the smallest Node/TypeScript workspace that can build a React package and run unit/browser tests. Create `packages/react/src/internal/` for renderer internals, `playground/` for the demo app, and CI commands that future tasks can rely on.

**Expansion path:** If tool choice is not already implied by the repo, choose boring defaults: TypeScript, Vite for playground, Vitest for unit tests, Playwright for browser tests, and a package manager lockfile.

**Acceptance criteria:**
- `packages/react/package.json` exists and exposes the React package.
- `packages/react/src/DitheredParticleCanvas.tsx`, `useDitheredCanvas.ts`, and `types.ts` exist as stubs.
- `packages/react/src/internal/` exists with placeholder directories matching the plan.
- `playground/` can start/build with a placeholder route.
- CI workflow runs install, typecheck, lint if configured, unit tests, Playwright, and build.
- No public `packages/core/package.json` or `@dithered-particle-canvas/core` export exists.

**Validation:** Run install, typecheck, unit test command, Playwright install/check if needed, and package build. Report exact commands and outputs.

**Dependencies:** None.

**Downstream consumers:** T2 through T8.

**Handoff:** Summary of package manager, commands, created files, and any CI caveats.

### T2: Define Internal Renderer Contracts and Canvas2D Oracle

**Outcome:** Build the internal type contracts, pure pixel helpers, and deterministic Canvas2D oracle used to validate WebGL2 output.

**Scope:** Include layer config types, normalized source/layer state, render backend contract, color parsing, palette mapping, ordered dither, built-in filter CPU implementation, Canvas2D backend enough for golden tests. Exclude WebGL2 implementation and React lifecycle wiring beyond shared types.

**Context packet:**
- Plan sections: `Backend contract`, `Dithering`, `Filter System`, `Canvas2D path`, `Testing Plan`.
- Key files to create under `packages/react/src/internal/`: `renderer/types.ts`, `layers/normalize-source.ts`, `utils/color.ts`, `filters/builtin.ts`, `backends/canvas2d/ordered-dither.ts`, `backends/canvas2d/Canvas2DBackend.ts`.
- Required tests named in the plan: color, Canvas2D ordered dither, filters, normalize source, backend selection groundwork.

**Agent instructions:** Implement pure, deterministic CPU paths first. Keep helpers shareable by WebGL2 tests. Canvas2D is not the primary runtime, but it must be a trustworthy oracle for dither/filter/reveal fixture comparisons.

**Expansion path:** Add small fixture images or generated `ImageData` fixtures. Split source loading into URL/Blob/ImageBitmap branches only if tests make the branches clear.

**Acceptance criteria:**
- Internal `RenderBackend` and layer/source/filter/dither types compile.
- Ordered dither supports matrix sizes `4` and `8`.
- Built-in filters cover brightness, contrast, posterize, tint, opacity in fixed order.
- Canvas2D oracle can produce deterministic `ImageData` from fixed input.
- Tests cover invalid colors, palette lookup, filter order, dither golden output, source decode failure, and GIF first-frame fallback behavior.

**Validation:** Run Vitest for internal utilities and Canvas2D backend. Include fixture update instructions if golden output changes.

**Dependencies:** T1.

**Downstream consumers:** T3, T4, T5, T6.

**Handoff:** Internal API summary, fixture format, test commands, and known tolerance rules.

### T3: Implement WebGL2 Backend With Processed Texture Cache

**Outcome:** Build the WebGL2 primary runtime backend with static layer preprocessing, processed texture caching, reveal-mask compositing, and context-loss recovery.

**Scope:** Include WebGL2 context creation, shader/program helpers, texture upload/disposal, framebuffer processing pass, processed texture cache keyed by source/config, reveal composite shader, shader compile/link errors, context loss/restore. Exclude React wrapper and playground integration except test stubs.

**Context packet:**
- Plan sections: `WebGL2 path`, `WebGL2 frame shape`, `Performance Budget`, `Failure Modes Registry`, `Performance Review Plan`.
- Internal paths: `packages/react/src/internal/backends/webgl2/WebGL2Backend.ts`, `shaders.ts`, `programs.ts`, `framebuffers.ts`, `textures.ts`, `layer-cache.test.ts`, `parity.test.ts`.
- Performance rule: pointer/fade frames must run only the reveal composite pass unless source/config changed.

**Agent instructions:** Implement WebGL2 as two stages: preprocess static layers into cached textures, then run cheap reveal-mask composite during pointer/fade frames. Make disposal explicit. Context loss should pause rendering, recreate GPU resources on restore, and call `onError` if restore fails.

**Expansion path:** Add counters or debug hooks for tests: source texture uploads, processed texture rebuilds, composite pass count, context lost/restored. If parity is hard in headless WebGL, define a documented tolerance and isolate browser-dependent tests.

**Acceptance criteria:**
- WebGL2 backend initializes and disposes without leaks.
- Shader compile/link failures produce typed errors with problem/cause/fix.
- Source/config changes rebuild processed textures.
- Pointer-only and fade-only frames reuse processed textures.
- Context loss/restore path is covered by tests or browser simulation.
- WebGL2 preprocessing output matches Canvas2D oracle within documented tolerance.

**Validation:** Run WebGL2 unit tests, layer-cache tests, shader failure tests, context-loss tests, parity tests, and any browser-required WebGL checks.

**Dependencies:** T1, T2.

**Downstream consumers:** T5, T6, T7.

**Handoff:** Backend behavior summary, shader inputs/uniforms, cache key definition, performance counters, and test results.

### T4: Implement SSR-Safe React Wrapper and Lifecycle

**Outcome:** Build the public React API and lifecycle glue around the internal renderer without causing per-frame React renders.

**Scope:** Include `DitheredParticleCanvas`, `useDitheredCanvas`, public prop types, SSR fallback wrapper, canvas ref lifecycle, prop normalization/diffing, callbacks, imperative handle, cleanup. Exclude WebGL2 shader internals and visual playground polish.

**Context packet:**
- Plan sections: `Public React API`, `React Integration`, `Developer Experience`, `Failure Modes Registry`.
- Public API must include `foreground`, `background`, `revealLayer`, `preset`, `quality`, `motion`, `aria-label`, advanced `layers`, and tiny handle with `pause`, `resume`, `exportFrame`.
- Do not expose custom filters, blend modes, or public core API in V1.

**Agent instructions:** Make React own lifecycle and props only. Renderer owns pointer state, textures, frame state, and cleanup. SSR import must not touch `window` or `document`; renderer creation belongs inside an effect.

**Expansion path:** If prop diffing gets complex, create explicit normalization and diff helpers with tests rather than hiding logic in the component. Add an idle/active renderer signal only for tests/debug, not normal React rendering.

**Acceptance criteria:**
- SSR import does not access browser globals.
- Mount creates renderer once.
- Prop changes update renderer imperatively and only recreate backend for backend-critical settings.
- Unmount cancels RAF, removes listeners/observers, releases ImageBitmaps/textures, and disposes backend.
- Pointer position/frame count never enter React state.
- Public TypeScript types match README-scale examples.

**Validation:** Run React/Vitest tests for SSR import, mount, prop diff, unmount cleanup, reduced motion, and public type examples.

**Dependencies:** T1, T2.

**Downstream consumers:** T5, T6, T7, T8.

**Handoff:** Public API notes, lifecycle diagram if changed, tests run, and any API caveats.

### T5: Implement Reveal Interaction and Dirty RAF Scheduler

**Outcome:** Implement Browserbase-style reveal-mask interaction with dithered edge breakup, fade-out, and on-demand RAF bursts that stop when idle.

**Scope:** Include pointer store, coordinate normalization, reveal mask math, dithered edge breakup, fade timing, reduced motion behavior, dirty-flag scheduler, idle/active test signal. Exclude WebGL2 preprocessing internals beyond integration hooks.

**Context packet:**
- Plan sections: `Visual Reference Notes`, `Interaction Model`, `Render-loop state`, `Performance tactics`, `Failure Modes Registry`.
- Reference behavior: temporary blue/white background reveal through pale surface, soft core, broken dithered edge, fade-out, foreground/mountains/UI stable.
- Required files: `packages/react/src/internal/interaction/pointer-store.ts`, `reveal-mask.ts`, `packages/react/src/internal/renderer/render-loop.ts`, `render-scheduler.test.ts`.

**Agent instructions:** Treat reveal as a mask/composite problem, not pixel displacement. Schedule RAF only while there is dirty work: source/config updates, pointer movement, reveal fade, resize, context restore, export, or quality adjustment.

**Expansion path:** If reveal visuals need tuning, expose preset constants and fixture tests for `radius`, `softness`, `edgeDither`, and `fadeMs`. If scheduler state grows, model it as an explicit state machine.

**Acceptance criteria:**
- Pointer coordinates normalize correctly under device-pixel-ratio scaling.
- Reveal mask has radius cutoff, softness falloff, deterministic edge dither, and fade-out.
- Reduced motion disables reveal fade/relaxation animation as planned.
- RAF continues during reveal fade and stops once mask alpha reaches zero.
- Scheduler does not run continuous RAF for static idle V1 content.

**Validation:** Run reveal-mask unit tests, scheduler unit tests, and any browser render-count test available from T6.

**Dependencies:** T1, T2. Integrates with T3 and T4 when available.

**Downstream consumers:** T6, T7.

**Handoff:** Reveal preset constants, scheduler state diagram, test results, and any visual tuning notes.

### T6: Build Playground and Browser E2E Coverage

**Outcome:** Create the reference playground experience and browser tests that prove the effect renders, reveals correctly, falls back, and stays performant enough.

**Scope:** Include Vite playground page, `TwoLayerHero` example, sample/static assets or generated fixtures, Playwright canvas-pixel tests, failure-state tests, render-count/performance checks. Exclude package release automation and docs beyond test instructions.

**Context packet:**
- Plan sections: `Visual Reference Notes`, `Testing Plan`, `Failure Modes Registry`, `Performance Review Plan`.
- QA artifact: `/Users/lukepitstick/.gstack/projects/Luke-Pitstick-dithered-particle-canvas/lukepitstick-main-eng-review-test-plan-20260605-225310.md`.
- E2E must check nonblank canvas, pointer reveals background, foreground stability, reduced motion, Canvas2D fallback, invalid image, tainted export, WebGL2 unavailable fallback, idle RAF stop, and processed texture reuse.

**Agent instructions:** Build the demo as a real usage example, not a test harness disguised as an app. Use Playwright screenshots/canvas pixel reads to verify visible behavior. Where exact screenshots are brittle, check pixel deltas in defined regions and maintain stable fixtures.

**Expansion path:** Add browser flags/mocks for WebGL2 unavailable and reduced motion. Add debug counters from T3/T5 if direct GPU introspection is not practical.

**Acceptance criteria:**
- Playground renders the V1 two-layer reveal hero.
- Playwright confirms canvas is nonblank.
- Pointer movement reveals background pixels in the reveal region.
- Foreground region remains stable during reveal.
- Reveal edge is not a smooth spotlight, using screenshot/pixel checks or approved fixture comparison.
- Reveal fades after pointer leave.
- Canvas2D fallback still shows the hero.
- Render/preprocess counters prove no continuous RAF and no processed texture rebuild on pointer-only frames.

**Validation:** Run Playwright E2E suite and capture screenshot artifacts for failures. Report browser versions and any skipped WebGL tests.

**Dependencies:** T1, T3, T4, T5.

**Downstream consumers:** T7, T8.

**Handoff:** E2E results, screenshots or traces, fixture assets, and remaining visual tuning suggestions.

### T7: Write Docs, Examples, and Performance Guidance

**Outcome:** Produce user-facing docs for install, first use, API, performance behavior, CORS, fallback behavior, and V1 limitations.

**Scope:** Include README, `docs/api.md`, `docs/performance.md`, playground usage notes, V1 limitations, and troubleshooting errors. Exclude publishing automation except documenting commands from T8.

**Context packet:**
- Plan sections: `Developer Experience`, `Distribution Plan`, `NOT in Scope`, `Error message style`.
- Public package is `@dithered-particle-canvas/react`.
- V1 limitations must clearly state first-frame GIF fallback, no full GIF animation, no workers, no custom filter plugins, no public core package, no WebGPU/video/more-than-two-layers.

**Agent instructions:** Make the first example under 10 lines and centered on `foreground`, `background`, and `revealLayer`. Explain performance choices plainly: WebGL2-first, Canvas2D fallback, on-demand RAF bursts, processed texture cache. Keep docs honest about CORS and GIF fallback.

**Expansion path:** If docs need visual examples, reference the playground output rather than inventing a marketing page. Add a troubleshooting table for developer errors.

**Acceptance criteria:**
- README has install, hello world, and Browserbase-style reveal example.
- API docs cover props, layers, quality, motion, reveal config, callbacks, and handle.
- Performance docs explain WebGL2 fallback, idle RAF behavior, texture caching, memory caps, and CORS constraints.
- V1 limitations are explicit and match the technical plan.
- README examples are typechecked or tested in CI.

**Validation:** Run docs/example typecheck if available, markdown lint if configured, and package build.

**Dependencies:** T4, T6 for final behavior/examples. Can draft after T1.

**Downstream consumers:** T8 and users.

**Handoff:** Docs summary, commands verified, and any example assets added.

### T8: Prepare Release and Package Verification

**Outcome:** Make V1 installable as an npm-ready React package with CI verification and publish dry-run.

**Scope:** Include package metadata, exports, type declarations, peer dependencies, build output, CI publish dry-run, smoke install test, and release workflow. Exclude actual npm publish unless explicitly requested.

**Context packet:**
- Plan sections: `Distribution Plan`, `Developer Experience`, `Implementation Tasks`.
- V1 creates one package: `@dithered-particle-canvas/react`.
- React is a peer dependency. ESM-first. CJS fallback is out of scope unless package consumers force it.

**Agent instructions:** Configure package output so a React app can install and import the component without SSR hazards. Add a smoke test that installs/builds a tiny consumer or validates package tarball contents.

**Expansion path:** If package publishing needs secrets or registry setup, stop at dry-run and document the missing external setup. Do not invent credentials or publish automatically.

**Acceptance criteria:**
- Package build emits ESM and TypeScript declarations.
- `package.json` exports are SSR-safe and do not expose internal renderer modules as public API.
- React is a peer dependency.
- CI runs build/test/browser/docs-example checks.
- Publish workflow exists but actual publish is gated/manual.
- Dry-run package artifact contains expected files and no accidental internal-only docs/artifacts.

**Validation:** Run package build, type declarations check, `npm pack --dry-run` or equivalent, and smoke install/build.

**Dependencies:** T1, T4, T6, T7.

**Downstream consumers:** First public release.

**Handoff:** Release checklist, dry-run output, artifact contents, and any manual publish steps.

## Coordination Notes

- Do not assign T3 and T5 to agents that both edit `render-loop.ts` without agreeing on scheduler hooks first.
- T3 and T4 can run in parallel after T2, but `packages/react/src/internal/renderer/types.ts` must remain stable.
- T6 should wait for T3, T4, and T5 because it validates integrated behavior.
- T7 can draft early, but final examples should wait for T6.
- T8 should wait for T7 and final package/API shape.
- Keep `docs/office-hours-design.md` marked superseded. Do not revive `interactiveLayer`, Canvas2D-first V1, or public `@dithered-particle-canvas/core` from that file.
- Any agent that changes the visual behavior must preserve: pale dithered surface, blue/white reveal layer, dithered broken reveal edge, fade-out, stable foreground/mountains/UI.

## Suggested Next Dispatch

Start with T1.

Prompt:

```text
Implement T1 from agents/subtasks.md. Set up the package workspace for the reviewed Dithered Particle Canvas V1 plan. Read docs/technical-implementation-plan.md first. Create the React package scaffold, internal renderer directories, playground scaffold, Vitest/Playwright/test/build commands, and CI baseline. Do not create a public @dithered-particle-canvas/core package. Return commands run, files changed, and any setup caveats.
```
