---
name: aqg-release
description: Prepare aqg release
disable-model-invocation: true
---

# AQG release PR

## Hard rules

1. A release PR must already carry the release version. Do not open or push a release PR that still says `1.0.0` (or any older version) with a “bump later” note. CodeRabbit and humans review what is on the branch.
2. Branch name is `release/vX.Y.Z` (example: `release/v1.0.1`).
3. Release commits live on that branch, not left ahead on `main`. After the branch exists, point local `main` back at `origin/main` without discarding the release commits.
4. When asked for a release branch/PR, create the PR with Summary + Test plan in the same pass as the push. Do not stop at “branch pushed, open it yourself.”
5. Tagging `vX.Y.Z` requires a real GitHub Release description of what changed. Never create an empty or placeholder tag/release body. Write the notes when creating the tag/release, not “later.”

## Version surfaces

Bump every user-facing pin to `X.Y.Z` before the PR is reviewable:

- `package.json` → `"version": "X.Y.Z"`
- `README.md` install example → `./install.sh --version X.Y.Z`
- `scripts/install-local/parse-install-args.ts` help example → `--version <ver> … (e.g. X.Y.Z)`

Preset `package.json` versions that stay at `0.0.0` are unrelated; leave them.

## Workflow

1. Land the release changes on a clean tree (deps, features, fixes).
2. Ensure version surfaces already match `X.Y.Z`.
3. Create `release/vX.Y.Z` from the commit that should ship.
4. Move `main` back to `origin/main` (prefer `git branch -f main origin/main` while checked out on the release branch; avoid `git reset --hard` unless the user explicitly allows it and hooks permit it).
5. Push: `git push -u origin HEAD`.
6. Open the PR against `main` with `gh pr create`:
   - Title: `Release X.Y.Z`
   - Body: Summary bullets for every commit on the branch; Test plan with verify/test and version already set
7. Run `bun run verify` and `bun run test` before calling the PR ready. If either fails, fix on the release branch and push.
8. If version was forgotten, fix immediately on the same branch, commit, push, and update the PR body so no checklist item says “bump version later.”
9. After merge, when creating tag `vX.Y.Z` / the GitHub Release, write the change description in the same step (see below). Pushing the tag triggers `.github/workflows/release.yml`.

## PR body shape

```markdown
## Summary

- <change 1>
- <change 2>
- Set package version to **X.Y.Z** (`package.json`, install docs).

## Test plan

- [x] `bun run verify`
- [x] `bun run test`
- [x] Version is `X.Y.Z` in `package.json`
```

## Tag / GitHub Release notes

When the user asks to tag or publish `vX.Y.Z`:

1. Diff against the previous release tag (example: `v1.0.0...HEAD` or `v1.0.0...v1.0.1`).
2. Write a concrete release body: what changed and why it matters for installers/users. Cover features, fixes, dependency bumps, and breaking changes. Do not paste only commit subjects if a short prose summary is clearer.
3. Create the GitHub Release with that body in the same pass, e.g. `gh release create vX.Y.Z --title vX.Y.Z --notes-file …` or `--notes "$(cat <<'EOF' … EOF)"`.
4. Never ship a tag with an empty body, “TBD”, or “see commits.”
