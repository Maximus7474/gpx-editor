/**
 * Bump the app version across the files that carry it and release via Git.
 *
 * Usage:
 *   bun run bump-version <version>            # e.g. "0.2.0" (a leading "v" is tolerated)
 *   bun run bump-version <patch|minor|major>  # increment relative to the current version
 *
 * The current version is read from `src-tauri/tauri.conf.json` (the source of
 * truth used by the release workflow) and written to:
 *   - src-tauri/tauri.conf.json
 *   - src-tauri/Cargo.toml      ([package] section)
 *   - src-tauri/Cargo.lock      (the gpx-editor entry)
 *   - package.json
 *
 * Tauri requires the tauri.conf.json and Cargo.toml versions to match, so
 * keeping them in sync is exactly what this script is for — run it before
 * pushing a release tag (see README.md → Releasing).
 *
 * Dependency-free on purpose: it runs under Bun (TS without a build step) and
 * uses only node:child_process, node:fs, and node:path.
 */

import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const TAURI_CONF = join(ROOT, "src-tauri", "tauri.conf.json");
const CARGO_TOML = join(ROOT, "src-tauri", "Cargo.toml");
const CARGO_LOCK = join(ROOT, "src-tauri", "Cargo.lock");
const PACKAGE_JSON = join(ROOT, "package.json");

/** Cargo-compatible semver: no `+build` metadata (Cargo doesn't accept it). */
const VERSION_RE = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/;
const BUMP_KINDS = ["patch", "minor", "major"] as const;
type BumpKind = (typeof BUMP_KINDS)[number];

const PKG_NAME = "gpx-editor";

function fail(message: string): never {
  console.error(`bump-version: ${message}`);
  process.exit(1);
}

function runGit(command: string): void {
  console.log(`> ${command}`);
  try {
    execSync(command, { stdio: "inherit", cwd: ROOT });
  } catch {
    fail(`git command failed: "${command}"`);
  }
}

function readText(path: string): string {
  return readFileSync(path, "utf8");
}

/** Keep each file's current line ending so the diff stays minimal. */
function eolOf(text: string): "\r\n" | "\n" {
  return text.includes("\r\n") ? "\r\n" : "\n";
}

function readJson(path: string, what: string): Record<string, unknown> {
  try {
    return JSON.parse(readText(path)) as Record<string, unknown>;
  } catch {
    fail(`could not parse ${what} (${path})`);
  }
}

function writeJson(path: string, obj: Record<string, unknown>): void {
  const eol = eolOf(readText(path));
  writeFileSync(path, JSON.stringify(obj, null, 2).replace(/\n/g, eol) + eol);
}

/**
 * Rewrite the first `version = "…"` line found at the top level of the
 * `[package]` section (or of the `[[package]]` block matching `name`) — never
 * dependency versions deeper in the file.
 */
function replacePackageVersion(path: string, what: string, next: string, matchName?: string): void {
  const text = readText(path);
  const eol = eolOf(text);
  const lines = text.split(/\r?\n/);

  let inSection = false;
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trimStart();
    if (trimmed.startsWith("[")) {
      inSection = trimmed === (matchName ? `[[package]]` : "[package]");
      continue;
    }
    if (!inSection) continue;

    // Inside a [[package]] block: match the block whose name we want.
    if (matchName) {
      const nameMatch = trimmed.match(/^name\s*=\s*"([^"]+)"$/);
      if (!nameMatch) continue;
      if (nameMatch[1] !== matchName) {
        inSection = false;
        continue;
      }
      // The version line follows the name within the same block.
      for (let j = i + 1; j < lines.length; j++) {
        const nextLine = lines[j].trimStart();
        if (nextLine.startsWith("[[")) {
          fail(`no "version = …" line found for ${matchName} in ${what}`);
        }
        if (/^version\s*=\s*"/.test(nextLine)) {
          lines[j] = lines[j].replace(/version\s*=\s*"[^"]*"/, `version = "${next}"`);
          writeFileSync(path, lines.join(eol));
          return;
        }
      }
      fail(`no "version = …" line found for ${matchName} in ${what}`);
    }

    if (/^version\s*=\s*"/.test(trimmed)) {
      lines[i] = lines[i].replace(/version\s*=\s*"[^"]*"/, `version = "${next}"`);
      writeFileSync(path, lines.join(eol));
      return;
    }
  }

  fail(`no [package] "version = …" line found in ${what}`);
}

function bump(current: string, kind: BumpKind): string {
  const [major, minor, patch] = current
    .split("-")[0]
    .split(".")
    .map((part) => Number(part));
  switch (kind) {
    case "major":
      return `${major + 1}.0.0`;
    case "minor":
      return `${major}.${minor + 1}.0`;
    case "patch":
      return `${major}.${minor}.${patch + 1}`;
  }
}

function main(): void {
  const arg = process.argv[2];
  if (!arg) {
    console.error(
      "Usage: bun run bump-version <version | patch | minor | major>\n" +
        "   e.g. bun run bump-version 0.2.0   or   bun run bump-version minor",
    );
    process.exit(1);
  }

  const conf = readJson(TAURI_CONF, "tauri.conf.json");
  const current = typeof conf.version === "string" ? conf.version : undefined;
  if (!current) fail('tauri.conf.json has no string "version" field');

  const requested = arg.startsWith("v") ? arg.slice(1) : arg;
  const next = BUMP_KINDS.includes(requested as BumpKind)
    ? bump(current, requested as BumpKind)
    : requested;
  if (!VERSION_RE.test(next)) {
    fail(`"${next}" is not a valid version (expected e.g. 0.2.0 or 0.2.0-rc.1)`);
  }
  if (next === current) {
    fail(`version is already ${current} — nothing to do`);
  }

  // Update file contents
  conf.version = next;
  writeJson(TAURI_CONF, conf);
  replacePackageVersion(CARGO_TOML, "Cargo.toml", next);
  replacePackageVersion(CARGO_LOCK, "Cargo.lock", next, PKG_NAME);

  const pkg = readJson(PACKAGE_JSON, "package.json");
  pkg.version = next;
  writeJson(PACKAGE_JSON, pkg);

  console.log(`bump-version: ${current} -> ${next}`);

  // Git operations
  runGit("git add src-tauri/tauri.conf.json src-tauri/Cargo.toml src-tauri/Cargo.lock package.json");
  runGit(`git commit -m "v${next}"`);
  runGit(`git tag v${next}`);
  runGit("git push origin HEAD");
  runGit(`git push origin v${next}`);

  console.log(`\nSuccessfully bumped to v${next}`);
}

main();
