/**
 * The kind of version change detected for a package by the `diff` command.
 */
export type DiffResultStatus = "Bumped" | "NewProject";

/**
 * Holds the version-change information for a single `package.json` file as reported by the
 * `diff` command. Only packages whose version actually changed (or that are brand-new) are
 * represented here.
 */
export interface DiffResult {
  /** The package name. */
  readonly name: string;

  /** Absolute path to the `package.json` file. */
  readonly filePath: string;

  /** The resolved version as it exists in the current branch (HEAD or the specified head ref). */
  readonly headVersion: string;

  /**
   * The resolved version on the base branch, or `null` when the package did not exist on the
   * base ref (i.e. it is brand-new).
   */
  readonly baseVersion: string | null;

  /** Whether the package is brand-new or had its version bumped. */
  readonly status: DiffResultStatus;
}
