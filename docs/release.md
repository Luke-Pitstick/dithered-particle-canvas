# Release

V1 publishes one package: `@dithered-particle-canvas/react`.

## Local Verification

Run the release check before requesting a publish:

```bash
npm run release:check
```

The check builds the React package, typechecks the README-style docs example, dry-runs `npm pack`, installs the packed tarball into a tiny temporary Vite consumer, imports the public package root, and builds the consumer.

## Manual Publish

Publishing is intentionally manual and gated through GitHub Actions:

1. Open the `Publish Package` workflow.
2. Run it with `dry_run` set to `true` first.
3. Review the package contents in the workflow log.
4. Run it again with `dry_run` set to `false` only after the version and changelog are final.

Required external setup:

- npm package ownership for `@dithered-particle-canvas/react`.
- `NPM_TOKEN` configured in the GitHub repository secrets.
- The workflow environment approval, if the repository uses protected environments.
