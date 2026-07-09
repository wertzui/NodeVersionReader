/**
 * The version used when a `package.json` file has no `"version"` field.
 * Mirrors the `VersionPrefix` default (`1.0.0`) used by DotnetVersionReader,
 * adapted to the npm convention of defaulting unset versions to `0.0.0`.
 */
export const DEFAULT_VERSION = "0.0.0";

/**
 * Holds the parsed version information for a single `package.json` file.
 */
export interface PackageVersionInfo {
  /** The package name, taken from the `"name"` field, falling back to the directory name. */
  readonly name: string;

  /** Absolute path to the `package.json` file. */
  readonly filePath: string;

  /** Raw value of the `"version"` field, if present. */
  readonly version: string | null;

  /**
   * The final resolved version:
   * - the `"version"` field, if set, otherwise
   * - {@link DEFAULT_VERSION} (`"0.0.0"`).
   */
  readonly resolvedVersion: string;

  /** Major version component, or `null` if it cannot be parsed. */
  readonly major: number | null;

  /** Minor version component, or `null` if it cannot be parsed. */
  readonly minor: number | null;

  /** Patch version component, or `null` if it cannot be parsed. */
  readonly patch: number | null;

  /** Pre-release / build suffix (everything after the first `-`), or `null` if there is none. */
  readonly suffix: string | null;
}

/**
 * Parses the numeric `major.minor.patch` prefix of a resolved version string and returns the
 * component at `index` (0 = major, 1 = minor, 2 = patch), or `null` if it cannot be parsed.
 */
function parseComponent(version: string, index: number): number | null {
  const dash = version.indexOf("-");
  const numericPart = dash >= 0 ? version.slice(0, dash) : version;
  const parts = numericPart.split(".");
  const part = parts[index];
  if (part === undefined) return null;
  const n = Number.parseInt(part, 10);
  return Number.isNaN(n) ? null : n;
}

/**
 * Builds the derived (major/minor/patch/suffix) fields of a {@link PackageVersionInfo} from
 * its `resolvedVersion`.
 */
export function deriveVersionComponents(
  resolvedVersion: string,
): Pick<PackageVersionInfo, "major" | "minor" | "patch" | "suffix"> {
  const dash = resolvedVersion.indexOf("-");
  return {
    major: parseComponent(resolvedVersion, 0),
    minor: parseComponent(resolvedVersion, 1),
    patch: parseComponent(resolvedVersion, 2),
    suffix: dash >= 0 ? resolvedVersion.slice(dash + 1) : null,
  };
}

/**
 * Resolves the effective version string for a package, following the same fallback semantics
 * documented on {@link PackageVersionInfo.resolvedVersion}.
 */
export function resolveVersion(version: string | null | undefined): string {
  const trimmed = version?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : DEFAULT_VERSION;
}
