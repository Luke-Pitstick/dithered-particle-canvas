# Browserbase Real-Asset Playground Subtasks

Generated: 2026-06-06

## Goal

Update the playground and component behavior so the real supplied images produce a Browserbase-like reveal:

- Use `playground/public/dithereffecttest_fg.jpg` as the stable mountain foreground.
- Use `playground/public/dithereffecttest_bg.jpg` as the interactive background reveal layer.
- Support the user's intended visual stack: real background/base surface, stable foreground mountains, and an initial overlay/background surface that is visible before interaction.
- Make success browser-visible, not just unit-test green: the page should look close to the Browserbase reference, with mountains stable and the sky/reveal appearing through pointer interaction.

## Assumptions

- The two new assets are the canonical fixtures for this task:
  - `dithereffecttest_fg.jpg`: 1500x994 mountain foreground photo.
  - `dithereffecttest_bg.jpg`: 1500x994 blue sky/reveal image.
- "Technically 3 layer" means V1 should still keep the public API simple, but runtime/playground behavior needs three visual planes:
  - base/idle surface shown before interaction,
  - stable mountain foreground,
  - revealed background layer shown through the pointer mask.
- It is acceptable for the implementer to add a narrowly scoped internal/playground helper or a small public prop only if the existing two-layer API cannot express the effect cleanly.
- Existing QA artifacts under `.gstack/` and `.playwright-mcp/` are local evidence folders and should not be treated as product source.

## Execution Shape

- Critical path: T1 implementation/bug-fix -> T2 browser QA/test.
- Parallel lanes: none. T2 should test the integrated result after T1, not race it.
- Integration point: T2 validates the playground visually and with E2E tests using the real images.
- Riskiest assumption: the current two-layer `background`/`foreground` contract may not express the pre-interaction overlay surface plus revealed sky cleanly without a small API/runtime adjustment.
- Minimum complete slice: the playground uses the real JPG assets, the mountains stay stable, pointer interaction reveals the sky/background in a dithered mask, Canvas2D fallback still works, and screenshots resemble Browserbase more than the current generated-fixture demo.

## Subtasks

### T1: Implement Real-Asset Browserbase Reveal

**Outcome:** Replace the generated playground fixture with the supplied real images and adjust the renderer/playground behavior so the effect reads as a three-plane Browserbase-style hero.

**Scope:** Includes playground composition, renderer API/runtime tweaks if needed, image masking/compositing fixes, and preserving Canvas2D/WebGL2 parity. Excludes broad package redesign, GIF animation, workers, custom filter plugins, or unrelated docs/release changes.

**Context packet:**

- Read `README.md`, `docs/api.md`, and `docs/performance.md` for current public API promises.
- Read `playground/src/examples/TwoLayerHero.tsx` and `playground/src/styles.css`.
- Read renderer paths if needed:
  - `packages/react/src/types.ts`
  - `packages/react/src/internal/renderer/react-renderer.ts`
  - `packages/react/src/internal/backends/webgl2/WebGL2Backend.ts`
  - `packages/react/src/internal/backends/canvas2d/Canvas2DBackend.ts`
  - `packages/react/src/internal/interaction/reveal-mask.ts`
- Use the supplied assets:
  - `playground/public/dithereffecttest_fg.jpg`
  - `playground/public/dithereffecttest_bg.jpg`
- Current known issue: the foreground JPG contains white/sky around the mountains, so a naive opaque foreground layer will hide the reveal and fail the intended effect.

**Agent instructions:** Implement the smallest coherent change that makes the real assets work. Treat the mountains as the stable foreground. Treat the sky image as the revealed interactive background. Add or configure an idle/base overlay surface so the pre-interaction state is not already the final revealed sky. If the current component API cannot express this clearly, propose and implement one minimal addition with type docs and tests. Keep pointer reveal as a mask/composite problem, not displacement.

**Expansion path:** First try to solve via playground layer config and built-in filters/masking. If that fails, add a precise image-mask capability, such as chroma/luminance matte handling for foreground white/sky regions, or an explicit idle/base layer/internal overlay. If a public prop is introduced, update docs examples and type tests.

**Acceptance criteria:**

- Playground no longer uses generated `ImageData` fixtures for the default hero path.
- Default playground loads `dithereffecttest_fg.jpg` and `dithereffecttest_bg.jpg`.
- Pre-interaction view shows a polished idle/base surface with stable mountains, not a blank white rectangle or already-fully-revealed sky.
- Pointer movement reveals the blue sky/background layer through a dithered broken-edge mask.
- Mountains remain visually stable during pointer movement.
- WebGL2 remains primary; Canvas2D fallback renders the same visual stack closely enough for QA.
- Reduced motion still disables reveal animation.
- No console errors on load.
- Existing public package constraints remain intact unless a deliberate small API addition is documented.

**Validation:**

- Run `npm run typecheck`.
- Run `npm run lint`.
- Run `npm test -- --run`.
- Run `npm run build`.
- Run `npm run test:e2e` if possible; if localhost binding is sandbox-blocked, report that exact failure.
- Manually open the playground and capture before/after screenshots for desktop and mobile.

**Dependencies:** None.

**Downstream consumers:** T2.

**Handoff:** Return files changed, any API/runtime decision made, screenshots or screenshot paths, commands run, and any known visual tuning concerns.

### T2: QA And Regression-Test Browserbase Similarity

**Outcome:** Verify the T1 implementation against the real images and update tests so regressions catch the Browserbase-like behavior.

**Scope:** Includes browser QA, Playwright E2E updates, screenshot/pixel heuristics, Canvas2D fallback checks, mobile checks, and QA report artifacts. Excludes broad implementation rewrites except tiny testability hooks agreed with the parent.

**Context packet:**

- Read T1 handoff before starting.
- Read current E2E files:
  - `playground/e2e/two-layer-hero.spec.ts`
  - `playground/e2e/failure-states.spec.ts`
- Read playground source after T1:
  - `playground/src/examples/TwoLayerHero.tsx`
  - `playground/src/styles.css`
- Test against real assets in `playground/public/`.
- Success is visual similarity to Browserbase: pale/quiet idle state, stable mountains, blue sky reveal through a dithered pointer mask, and no headline/UI collision.

**Agent instructions:** Test like a user first, then update automated coverage. Use real browser screenshots and pixel checks. Replace brittle generated-fixture assumptions with checks that assert stable mountains, changed reveal region, dithered reveal edge, clean console, mobile legibility, Canvas2D fallback, reduced motion, idle RAF stop, and no processed texture rebuilds on pointer-only frames.

**Expansion path:** If exact screenshot matching is too brittle, use region-based pixel checks and screenshot artifacts. If Browserbase similarity is still weak but technically functional, file a clear visual finding with screenshot evidence rather than silently accepting it.

**Acceptance criteria:**

- Desktop screenshot shows a Browserbase-like composition using the real assets.
- Mobile screenshot has readable headline/nav and no incoherent overlap.
- Pointer interaction reveals the background sky layer.
- The mountains/foreground region remains stable during reveal.
- Reveal edge has dithered breakup, not a smooth plain spotlight.
- Canvas2D fallback shows the same real-asset composition.
- Reduced motion keeps a static hero and does not run reveal animation.
- Console has zero errors on normal load.
- E2E suite uses the included images, not generated image fixtures, for the default hero checks.
- If bugs are found, report exact repro and preferred fix scope back to the parent or implement only if explicitly assigned.

**Validation:**

- Run `npm run test:e2e`.
- Run `npm run typecheck`, `npm run lint`, `npm test -- --run`, and `npm run build` after test changes.
- Save screenshot artifacts under `.gstack/qa-reports/screenshots/` or Playwright test-results.
- Produce a QA summary with pass/fail findings and before/after health score.

**Dependencies:** T1.

**Downstream consumers:** Parent integrator and final ship decision.

**Handoff:** Return test files changed, screenshots, commands run, pass/fail summary, and any remaining visual mismatch from Browserbase.

## Coordination Notes

- Do not run T1 and T2 concurrently. T2 depends on T1's implementation and should verify the actual integrated result.
- T1 owns implementation files and may update tests only for changed behavior. T2 owns E2E/QA coverage and should avoid broad renderer edits.
- If T1 introduces a public API addition for the third visual plane, T1 must update public types and docs enough for T2 to test it.
- The parent integrator should review any API addition before accepting it. The desired outcome is still a focused V1 Browserbase-like hero, not a broad multi-layer engine.
- Keep the supplied JPGs as the default playground inputs and test fixtures.

## Suggested Next Dispatch

Start with T1.

```text
Implement T1 from agents/browserbase-real-assets-subtasks.md. Use the supplied playground images `dithereffecttest_fg.jpg` as the stable mountain foreground and `dithereffecttest_bg.jpg` as the interactive reveal background. Make the playground/component render a Browserbase-like three-plane visual stack: idle/base surface, stable foreground mountains, and dithered pointer reveal of the background. Keep the change tightly scoped, preserve WebGL2/Canvas2D behavior, run validation, and return files changed plus screenshot evidence.
```

