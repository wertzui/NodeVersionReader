# NodeVersionReader

A Node.js CLI tool for reading version information from `package.json` files,
for enforcing version bumps in pull requests, and for showing which packages had their version changed.

[![Build, Test, Pack, Publish](https://github.com/wertzui/NodeVersionReader/actions/workflows/build-test-pack-publish.yml/badge.svg)](https://github.com/wertzui/NodeVersionReader/actions/workflows/build-test-pack-publish.yml)
[![npm](https://img.shields.io/npm/v/node-version-reader)](https://www.npmjs.com/package/node-version-reader)

## Installation

```bash
npm install --global node-version-reader
```

Or from a local build:

```bash
npm run build
npm install --global .
```

---

## Commands

```bash
node-version [command] [options]

Commands:
  read    Reads and displays version information from package.json files. (default)
  check   Checks that every package whose source files have changed has had its version bumped.
  diff    Shows packages whose version has changed (or that are new) relative to a base branch.
```

---

### `node-version read` — read versions (default)

Reads and displays version information. This is the **default command**: running
`node-version` with no subcommand is equivalent to `node-version read`.

```bash
# Both forms are equivalent:
node-version          [--input <path>] [options]
node-version read     [--input <path>] [options]
```

#### Options

| Option | Short | Description |
| -------- | ------- | ------------- |
| `--input` | `-i` | Path to a `package.json` file **or** a folder. Defaults to the current directory. |
| `--output` | `-o` | Output format: `json` (default), `table`, `list`, or `version` (single package only). |
| `--filter` | `-f` | Filter in the form `key=Value`. Value can be a regex. Repeatable. |
| `--schema` | | Print the JSON schema for `--output json` and exit. Defaults to `false`. |

#### Locating package.json files

`--input` accepts:

1. A path to a single `package.json` file.
2. A path to a **workspace root** `package.json` (one that has a `"workspaces"` field) — all
   member packages resolved from the workspace globs are read instead of the root itself.
3. A path to a folder — every `package.json` found recursively underneath is read.
   `node_modules`, `.git`, `dist`, `build`, `out`, and `coverage` directories are always skipped.
4. Nothing — the current directory is used.

#### Version resolution

Unlike `.csproj` files, `package.json` has a single `"version"` field (there is no
prefix/suffix split):

1. If `"version"` is set, it is used as-is.
2. Otherwise the version defaults to `0.0.0`.

#### Examples

```bash
# Current directory – JSON output (default, both forms are equivalent)
node-version
node-version read

# Specific package.json file – table output
node-version read --input package.json --output table
node-version read -i package.json -o table

# A monorepo root – every workspace member is read
node-version read --input package.json

# Only packages that are publishable (not marked private)
node-version read --filter "private=^(?!true$)"

# Combine multiple filters (all must match)
node-version read -i . -f "engines.node=>=18" -f "private=^(?!true$)"
```

#### Sample JSON output

```json
[
  {
    "name": "my-library",
    "version": "2.1.0-rc.1",
    "major": 2,
    "minor": 1,
    "patch": 0,
    "suffix": "rc.1"
  },
  {
    "name": "my-app",
    "version": "1.0.0",
    "major": 1,
    "minor": 0,
    "patch": 0,
    "suffix": null
  }
]
```

#### Sample table output

```text
| Name        | Version    | Major | Minor | Patch | Suffix |
| ----------- | ---------- | ----- | ----- | ----- | ------ |
| my-library  | 2.1.0-rc.1 | 2     | 1     | 0     | rc.1   |
| my-app      | 1.0.0      | 1     | 0     | 0     |        |
```

#### Sample list output

```text
my-library 2.1.0-rc.1
my-app 1.0.0
```

#### Sample version output

```text
2.1.0-rc.1
```

---

### `node-version check` — enforce version bumps in PRs

Checks that every package whose source files have changed (compared to a base branch)
has had its version bumped. Designed to run as a CI gate on pull requests.

```bash
node-version check [--base <ref>] [--input <path>] [--head <ref>] [--output <format>] [--filter <key=Value>]...

# Short aliases (--base defaults to origin/main):
node-version check [-b <ref>] [-i <path>] [--head <ref>] [-o <format>] [-f <key=Value>]...
```

#### Options

| Option | Short | Required | Description |
| -------- | ------- | ---------- | ------------- |
| `--input` | `-i` | | Path to a `package.json` file **or** a folder. Defaults to the current directory. |
| `--base` | `-b` | | The git ref to compare against. Defaults to `origin/main`. |
| `--head` | | | The git ref for the current state. Defaults to `HEAD`. |
| `--output` | `-o` | | Output format: `json` (default), `table`, or `version` (single package only). |
| `--filter` | `-f` | | Filter in the form `key=Value`. Only matching packages are checked. Value can be a regex. Repeatable. |

#### Exit codes

| Code | Meaning |
| ------ | --------- |
| `0` | All affected packages have been version-bumped (or no relevant files changed). |
| `1` | At least one affected package has **not** been bumped — the check failed. |
| `2` | Usage or argument error (bad input path, git not found, etc.). |

#### How it works

1. Locates all `package.json` files from `<input>`.
2. Builds a **dependency graph**: for each package, which files it owns and which other
   local packages it references via `dependencies`, `devDependencies`, `peerDependencies`,
   or `optionalDependencies` (matched by name against other located packages).
3. Collects changed files by unioning: committed diff (`<base>...<head>`), staged changes,
   unstaged tracked changes, and untracked new files — so it works both in a PR context and
   with local uncommitted modifications.
4. Determines **affected packages** transitively: if a library changes, every package that
   depends on it (directly or indirectly) is also considered affected.
5. For each affected package, reads the version on `<base>` (via `git show`) and compares it
   to the version in the working tree.
6. Reports the result and exits with code `1` if any version was not bumped.

#### Examples

```bash
# Check current directory against origin/main (default, both are equivalent)
node-version check
node-version check --base origin/main

# Scope to a specific package.json (workspace root or single package)
node-version check --input package.json --base origin/main
node-version check -i package.json -b origin/main

# Table output
node-version check --input package.json --base origin/main --output table

# Single package, bare version output (useful for scripts)
node-version check --input packages/my-lib/package.json --base origin/main --output version

# Only check packages that are publishable (not marked private)
node-version check --input package.json --base origin/main --filter "private=^(?!true$)"
```

#### Sample JSON output

```json
[
  {
    "name": "my-lib",
    "filePath": "packages/my-lib/package.json",
    "headVersion": "2.0.0",
    "baseVersion": "1.0.0",
    "status": "Ok"
  },
  {
    "name": "my-app",
    "filePath": "packages/my-app/package.json",
    "headVersion": "3.1.0",
    "baseVersion": "3.1.0",
    "status": "BumpRequired"
  }
]
```

Possible `status` values:

| Value | Meaning |
| ------- | --------- |
| `Ok` | No relevant files changed, or the version was bumped. |
| `BumpRequired` | Files changed but the version is the same as on the base branch. |
| `NewProject` | The package did not exist on the base branch — no bump required. |

#### Sample table output

```
| Name  | HeadVersion | BaseVersion | Status       |
|-------|-------------|-------------|--------------|
| my-lib| 2.0.0       | 1.0.0       | Ok           |
| my-app| 3.1.0       | 3.1.0       | BumpRequired |
```

#### GitHub Actions integration

```yaml
name: Check version bumps

on:
  pull_request:
    branches: [main]

jobs:
  check-versions:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0          # full history is required for git diff

      - uses: actions/setup-node@v4
        with:
          node-version: 20.x

      - name: Install node-version-reader
        run: npm install --global node-version-reader

      - name: Check version bumps
        run: node-version check --input package.json --base origin/main
```

> **Important:** `fetch-depth: 0` (or at least enough history to reach the base branch) is required; a shallow clone will cause `git diff` to fail.

---

### `node-version diff` — show version changes relative to a base branch

Shows all packages whose version has changed (or that are brand-new) compared to a base branch.
Unlike `check`, this command **never exits with a non-zero code based on results** — it is a
pure informational diff, useful for release notes, changelogs, or scripting.

```bash
node-version diff [--base <ref>] [--input <path>] [--head <ref>] [--output <format>] [--filter <key=Value>]...

# Short aliases (--base defaults to origin/main):
node-version diff [-b <ref>] [-i <path>] [--head <ref>] [-o <format>] [-f <key=Value>]...
```

#### Options

| Option | Short | Description |
| -------- | ------- | ------------- |
| `--input` | `-i` | Path to a `package.json` file **or** a folder. Defaults to the current directory. |
| `--base` | `-b` | The git ref to compare against. Defaults to `origin/main`. |
| `--head` | | The git ref for the current state. Defaults to `HEAD`. |
| `--output` | `-o` | Output format: `json` (default), `table`, `list`, or `version` (single package only). |
| `--filter` | `-f` | Filter in the form `key=Value`. Only matching packages are considered. Value can be a regex. Repeatable. |

#### Exit codes

| Code | Meaning |
| ------ | --------- |
| `0` | Command completed successfully (regardless of how many packages changed). |
| `2` | Usage or argument error (bad input path, git not found, etc.). |

#### How it works

Uses the same git/dependency-graph pipeline as `check` (steps 1–4 are identical), but at step 5
only keeps packages whose version on `<head>` **differs** from the version on `<base>` (or
packages that are brand-new). Packages whose version is unchanged are silently omitted.

#### Examples

```bash
# Show changed versions against origin/main (default)
node-version diff
node-version diff --base origin/main

# Scope to a specific package.json
node-version diff --input package.json --base origin/main
node-version diff -i package.json -b origin/main

# Table output
node-version diff --input package.json --base origin/main --output table

# Simple list output – handy for release notes
node-version diff --input package.json --base origin/main --output list

# Only packages that are publishable (not marked private)
node-version diff --input package.json --base origin/main --filter "private=^(?!true$)"
```

#### Sample JSON output

```json
[
  {
    "name": "my-lib",
    "filePath": "packages/my-lib/package.json",
    "headVersion": "2.0.0",
    "baseVersion": "1.0.0",
    "status": "Bumped"
  },
  {
    "name": "my-new-lib",
    "filePath": "packages/my-new-lib/package.json",
    "headVersion": "1.0.0",
    "baseVersion": null,
    "status": "NewProject"
  }
]
```

Possible `status` values:

| Value | Meaning |
| ------- | --------- |
| `Bumped` | The version was bumped relative to the base branch. |
| `NewProject` | The package did not exist on the base branch. |

#### Sample table output

```
| Name        | HeadVersion | BaseVersion | Status     |
|-------------|-------------|-------------|------------|
| my-lib      | 2.0.0       | 1.0.0       | Bumped     |
| my-new-lib  | 1.0.0       |             | NewProject |
```

#### Sample list output

```text
my-lib 2.0.0
my-new-lib 1.0.0
```

---

## Filtering

Filters take the form `key=Value`, where `key` is a JSON property name (matched
case-insensitively, at any depth in the `package.json` document — including nested objects such
as `engines.node` or `publishConfig.access`, and array elements) and `Value` is a regular
expression that must match the stringified value.

```bash
# Only packages marked as private
node-version read --filter "private=^true$"

# Only packages targeting Node.js >= 18 (nested under "engines")
node-version read --filter "node=>=18"

# Combine filters – ALL must match
node-version read -f "private=^(?!true$)" -f "version=^[2-9]"
```

---

## Development

```bash
# Install dependencies
npm install

# Type-check
npm run typecheck

# Lint
npm run lint

# Run tests
npm test

# Build
npm run build

# Run the CLI without building (via tsx)
npm run dev -- read --input package.json
```

### Project layout

```text
src/
  models/     # Plain TypeScript types: PackageVersionInfo, CheckResult, DiffResult, OutputFormat
  services/   # PackageJsonLocator, PackageJsonParser, FilterParser, DependencyGraphService,
              # GitService, DiffService, Formatter, JsonSchemaProvider
  cli.ts      # Commander-based CLI wiring (read/check/diff commands)
  index.ts    # Public library entry point (re-exports models + services)
tests/
  models/       # Unit tests for model helpers
  services/     # Unit tests for each service
  integration/  # End-to-end pipeline tests
  fixtures/     # In-memory package.json fixtures
  helpers/      # Temp-file/dir test helpers
```

## CI / CD

The repository uses two GitHub Actions workflows.

### `check-version-bump.yml` — PR gate

Runs on every pull request targeting `main`. Builds the tool from source and
runs `node-version check` to ensure every publishable package that changed has
had its version bumped.

```bash
node-version check --input package.json --filter "private=^(?!true$)"
```

The PR **must pass** this check before merging.

### `build-test-pack-publish.yml` — publish on push to `main`

Runs automatically on every push to `main` and can also be triggered manually.

| Step | Details |
| ------ | --------- |
| **Install** | `npm ci` |
| **Typecheck** | `npm run typecheck` |
| **Lint** | `npm run lint` |
| **Test** | `npm test` |
| **Build** | `npm run build` |
| **Check version bump** | Runs `node-version check` on pull requests against the PR base branch — blocks the build if the package version was not bumped |
| **Tag & Publish** | Tags the commit `v<version>` and publishes to npm with provenance |
| **GitHub Release** | Creates a GitHub release on the new tag with auto-generated notes |

### Required repository secret

| Secret | Description |
| -------- | ------------- |
| `NPM_TOKEN` | Automation token from [npmjs.com](https://www.npmjs.com/) with publish permission for the package |

Add it under **Settings → Secrets and variables → Actions → New repository secret**.

### Manual dispatch

The workflow can be triggered manually from the **Actions** tab.