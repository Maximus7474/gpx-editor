# Tauri + React + Typescript

This template should help get you started developing with Tauri, React and Typescript in Vite.

## Recommended IDE Setup

- [VS Code](https://code.visualstudio.com/) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)

## Releasing

Releases are automated with two GitHub Actions workflows:

- **Release Drafter** ([`.github/workflows/release-drafter.yml`](.github/workflows/release-drafter.yml))
  keeps a draft release updated with notes from every PR/commit merged to
  `main`. PRs are categorized from labels (auto-applied from
  conventional-commit titles like `feat:`/`fix:`/`docs:`/`chore:` and from
  changed files) and the draft suggests the next version number. See
  [`.github/release-drafter.yml`](.github/release-drafter.yml).
- **Release** ([`.github/workflows/release.yml`](.github/workflows/release.yml))
  builds the app on Windows (x64), macOS (Apple Silicon + Intel) and Linux
  (x64) via `tauri-apps/tauri-action` and uploads the installers to the
  GitHub Release for the tag `v<version>`.

### To publish a new version

1. Merge the PRs you want in the release; the draft release notes accumulate
   automatically.
2. Bump the version to the one the draft suggests, e.g. `0.2.0`, with
   [`scripts/bump-version.ts`](scripts/bump-version.ts) — it keeps
   `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`,
   `src-tauri/Cargo.lock` and `package.json` in sync (Tauri fails the build
   if the config and Cargo versions differ):

   ```bash
   bun run bump-version 0.2.0      # or: bun run bump-version minor
   ```
3. Push a tag matching that version:

   ```bash
   git tag v0.2.0
   git push origin v0.2.0
   ```

   The workflow builds all platforms and uploads the binaries. If the tag
   matches the Release Drafter draft, the binaries land in that same draft
   and the drafted notes are preserved.
4. Review the installers and notes on the Releases page, then publish the
   draft.

Once a release is published, the app's **Settings → Updates** card shows it:
users on older builds see an update prompt with a link to the release page.
The check runs on the Rust side (first visit to Settings hits the GitHub API,
results are cached for the session) and compares the running build's version
against the latest release tag.

You can also run the Release workflow manually from the Actions tab (it
builds whatever the current app version is, so bump the version first).

Note: macOS builds are unsigned by default, so Gatekeeper may warn on first
launch. Ad-hoc signing (`signingIdentity: "-"` in `tauri.conf.json`) or a
real Apple certificate removes the warning; code-signing setup is documented
in the [Tauri GitHub guide](https://v2.tauri.app/distribute/pipelines/github/).
