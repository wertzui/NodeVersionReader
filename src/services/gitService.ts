import { execFileSync } from "node:child_process";
import { dirname, relative, resolve } from "node:path";
import type { PackageJsonParser } from "./packageJsonParser.js";

/** Thrown when a git command fails or git itself cannot be found. */
export class GitError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "GitError";
  }
}

/**
 * Provides git-based operations needed by the `check` and `diff` commands: listing changed
 * files between two refs and reading a `package.json` version at a specific ref.
 */
export class GitService {
  public constructor(private readonly parser: PackageJsonParser) {}

  /**
   * Returns the set of files that differ between `baseRef` and the current state of the
   * repository (committed, staged, unstaged, and untracked), as absolute paths.
   *
   * Unions four sources so this works both in a PR context (committed changes on a feature
   * branch) and in a local workflow (modifications not yet committed):
   * 1. Committed diff: `git diff --name-only <base>...<head>`
   * 2. Staged changes: `git diff --name-only --cached <base>`
   * 3. Unstaged tracked changes: `git diff --name-only <base>`
   * 4. Untracked new files: `git ls-files --others --exclude-standard`
   */
  public getChangedFiles(baseRef: string, headRef: string, repositoryRoot?: string): string[] {
    const workingDir = repositoryRoot ?? process.cwd();
    const repoRoot = this.getRepositoryRoot(workingDir);

    const relativeFiles = new Set<string>();

    this.collectGitOutput(["diff", "--name-only", `${baseRef}...${headRef}`], repoRoot, relativeFiles);
    this.collectGitOutput(["diff", "--name-only", "--cached", baseRef], repoRoot, relativeFiles);
    this.collectGitOutput(["diff", "--name-only", baseRef], repoRoot, relativeFiles);
    this.collectGitOutput(["ls-files", "--others", "--exclude-standard"], repoRoot, relativeFiles);

    return [...relativeFiles]
      .filter((r) => r.trim().length > 0)
      .map((r) => resolve(repoRoot, r));
  }

  /**
   * Reads the resolved version of the package at `packageJsonPath` as it exists at `gitRef`.
   * Returns `null` when the file does not exist at that ref.
   */
  public getVersionAtRef(gitRef: string, packageJsonPath: string, repositoryRoot?: string): string | null {
    const workingDir = repositoryRoot ?? dirname(packageJsonPath);
    const repoRoot = this.getRepositoryRoot(workingDir);

    const rel = relative(repoRoot, packageJsonPath).split("\\").join("/");

    let content: string;
    try {
      content = this.runGit(["show", `${gitRef}:${rel}`], repoRoot);
    } catch {
      return null;
    }

    const info = this.parser.parseFromString(content, packageJsonPath);
    return info?.resolvedVersion ?? null;
  }

  /** Returns the absolute path to the root of the git repository containing `workingDir`. */
  public getRepositoryRoot(workingDir: string): string {
    const root = this.runGit(["rev-parse", "--show-toplevel"], workingDir).trim();
    return resolve(root);
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  private collectGitOutput(args: readonly string[], cwd: string, target: Set<string>): void {
    let output: string;
    try {
      output = this.runGit(args, cwd);
    } catch {
      return; // non-fatal: ref may not exist, flag unsupported, etc.
    }

    for (const line of output.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (trimmed.length > 0) target.add(trimmed);
    }
  }

  /** Runs a git command with the given `args` in `cwd` and returns standard output. */
  private runGit(args: readonly string[], cwd: string): string {
    try {
      return execFileSync("git", args, { cwd, encoding: "utf8", windowsHide: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new GitError(`git ${args.join(" ")} failed: ${message}`);
    }
  }
}
