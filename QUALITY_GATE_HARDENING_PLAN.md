# Quality Gate Hardening Plan

## Goal

Make the packaged quality gate reliably enforce its embedded generic policy without trusting mutable cache files, misapplying exclusions, or inheriting Beglarian-specific behavior.

## Changes

1. In `src/verify/embedded-default-configs.ts`, stop accepting cached files based only on existence and atomically replace every extracted configuration and plugin with its bundled content before creating the verification steps.
2. In `src/verify/default-steps.ts`, pass every target-relative Oxlint exclusion from `.oxlintrc.jsonc` through `--ignore-pattern` so extraction under `.tmp` cannot change which target files are ignored; keep the root configuration exclusions valid for direct repository use.
3. Remove policy that belongs only to the reference application: delete the `pg` and DAO overrides from `.oxlintrc.jsonc`, remove DAO-specific handling from `oxlint-quality-plugin.mjs`, and stop excluding `migrations/**` in `.fallowrc.json`.
4. In `src/verify/lint-directives.ts`, exclude the repository's generated `build`, `dist`, and `tmp` directories while preserving directive detection in source files.
5. Extend `specs/verify.test.ts` and `specs/release-binary.e2e.test.ts` with functional scenarios proving that bundled files are restored before execution, configured generated paths are ignored by every applicable stage, generic source and migration layouts receive the intended policy, forbidden source directives still fail, and the installed release package still detects Oxlint and Fallow failures.

## Verification

1. Run `bun run --silent verify` and confirm all locked stages succeed against the repository.
2. Run `bun test` and confirm the unit and installed-release scenarios cover successful projects, embedded-policy restoration, ignored generated output, source directive rejection, type errors, and unused files.
3. Run `bun run build:release`, inspect the tarball manifest and executable launcher, install it into a clean temporary project, and confirm both a valid project and the expected failure paths execute through the packaged `verify` command.
