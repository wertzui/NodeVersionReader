import type { DiffResult } from "../models/diffResult.js";

/** An affected package identified by name and its `package.json` file path. */
export interface AffectedProjectRef {
  readonly name: string;
  readonly filePath: string;
}

/**
 * Builds a list of {@link DiffResult} from a set of affected packages by comparing head
 * versions to base versions, keeping only packages whose version actually changed.
 */
export class DiffService {
  /**
   * Compares the head and base version for each entry in `affectedProjects` and returns only
   * those whose version changed (bumped or brand-new).
   *
   * @param affectedProjects Sequence of `{ name, filePath }` pairs to compare.
   * @param getHeadVersion Returns the resolved version at HEAD, or `null` if the package cannot
   * be parsed (it will be skipped).
   * @param getBaseVersion Returns the resolved version on the base ref, or `null` if the
   * package did not exist there (it is a new package).
   */
  public buildResults(
    affectedProjects: Iterable<AffectedProjectRef>,
    getHeadVersion: (name: string) => string | null,
    getBaseVersion: (name: string) => string | null,
  ): DiffResult[] {
    const results: DiffResult[] = [];

    for (const { name, filePath } of affectedProjects) {
      const headVersion = getHeadVersion(name);
      if (headVersion === null) continue;

      const baseVersion = getBaseVersion(name);

      if (baseVersion !== null && headVersion.toLowerCase() === baseVersion.toLowerCase()) {
        continue;
      }

      results.push({
        name,
        filePath,
        headVersion,
        baseVersion,
        status: baseVersion === null ? "NewProject" : "Bumped",
      });
    }

    return results;
  }
}
