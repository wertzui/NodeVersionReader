/**
 * The outcome of a version-bump check for a single package.
 */
export type CheckResultStatus = "Ok" | "BumpRequired" | "NewProject";

/**
 * Holds the version-bump check result for a single `package.json` file.
 */
export interface CheckResult {
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

  /** Whether the version bump requirement is satisfied for this package. */
  readonly status: CheckResultStatus;
}
