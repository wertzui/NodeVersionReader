import type { OutputFormat } from "../models/outputFormat.js";
import type { PackageVersionInfo } from "../models/packageVersionInfo.js";
import type { CheckResult } from "../models/checkResult.js";
import type { DiffResult } from "../models/diffResult.js";

/** Describes how to format a list of `T` items for every supported {@link OutputFormat}. */
export interface FormatterOptions<T> {
  /** Projects one item to a plain, JSON-serializable object. */
  readonly toJsonRow: (item: T) => unknown;
  /** Column headers for the table output. */
  readonly tableColumns: readonly string[];
  /** Projects one item to a row of cell values matching `tableColumns`. */
  readonly toTableRow: (item: T) => readonly unknown[];
  /** Returns the version string for a single item (used by the `version` format). */
  readonly getVersion: (item: T) => string;
  /** Returns the display name for a single item. */
  readonly getName: (item: T) => string;
  /**
   * Optional extra validation called before returning the version string.
   * Throw to signal an error (e.g. a bump is required).
   */
  readonly validateVersionItem?: (item: T) => void;
}

// ---------------------------------------------------------------------------
// Pre-built options for the three known result types
// ---------------------------------------------------------------------------

/** Options for formatting {@link PackageVersionInfo} results (the `read` command). */
export const readOptions: FormatterOptions<PackageVersionInfo> = {
  toJsonRow: (r) => ({
    name: r.name,
    version: r.resolvedVersion,
    major: r.major,
    minor: r.minor,
    patch: r.patch,
    suffix: r.suffix,
  }),
  tableColumns: ["Name", "Version", "Major", "Minor", "Patch", "Suffix"],
  toTableRow: (r) => [r.name, r.resolvedVersion, r.major, r.minor, r.patch, r.suffix],
  getVersion: (r) => r.resolvedVersion,
  getName: (r) => r.name,
};

/** Options for formatting {@link CheckResult} results (the `check` command). */
export const checkOptions: FormatterOptions<CheckResult> = {
  toJsonRow: (r) => ({
    name: r.name,
    filePath: r.filePath,
    headVersion: r.headVersion,
    baseVersion: r.baseVersion,
    status: r.status,
  }),
  tableColumns: ["Name", "HeadVersion", "BaseVersion", "Status"],
  toTableRow: (r) => [r.name, r.headVersion, r.baseVersion ?? "(new)", r.status],
  getVersion: (r) => r.headVersion,
  getName: (r) => r.name,
  validateVersionItem: (r) => {
    if (r.status === "BumpRequired") {
      throw new Error(
        `Package '${r.name}' requires a version bump. Current version '${r.headVersion}' is the same as on the base branch.`,
      );
    }
  },
};

/** Options for formatting {@link DiffResult} results (the `diff` command). */
export const diffOptions: FormatterOptions<DiffResult> = {
  toJsonRow: (r) => ({
    name: r.name,
    filePath: r.filePath,
    headVersion: r.headVersion,
    baseVersion: r.baseVersion,
    status: r.status,
  }),
  tableColumns: ["Name", "HeadVersion", "BaseVersion", "Status"],
  toTableRow: (r) => [r.name, r.headVersion, r.baseVersion ?? "(new)", r.status],
  getVersion: (r) => r.headVersion,
  getName: (r) => r.name,
};

// ---------------------------------------------------------------------------
// Formatter
// ---------------------------------------------------------------------------

/**
 * Formats output for the `read`, `check`, and `diff` commands.
 * Mirrors the .NET `Formatter`, with PascalCase JSON keys replaced by camelCase and the
 * `ConsoleTables` markdown table replaced by a small hand-rolled markdown table renderer.
 */
export class Formatter {
  /** Formats `results` using the supplied `options` and `format`. */
  public format<T>(results: readonly T[], format: OutputFormat, options: FormatterOptions<T>): string {
    switch (format) {
      case "json":
        return this.formatJson(results, options);
      case "table":
        return this.formatTable(results, options);
      case "version":
        return this.formatVersion(results, options);
      case "list":
        return this.formatList(results, options);
      default:
        throw new Error(`Unsupported output format: ${String(format)}`);
    }
  }

  private formatJson<T>(results: readonly T[], options: FormatterOptions<T>): string {
    return JSON.stringify(results.map((r) => options.toJsonRow(r)), null, 2);
  }

  private formatTable<T>(results: readonly T[], options: FormatterOptions<T>): string {
    if (results.length === 0) return "";

    const rows = results.map((r) => options.toTableRow(r).map((cell) => this.cellToString(cell)));
    const columns = options.tableColumns;
    const widths = columns.map((col, i) =>
      Math.max(col.length, ...rows.map((row) => (row[i] ?? "").length)),
    );

    const renderRow = (cells: readonly string[]): string =>
      `| ${cells.map((cell, i) => cell.padEnd(widths[i] ?? cell.length)).join(" | ")} |`;

    const header = renderRow(columns);
    const separator = `| ${widths.map((w) => "-".repeat(w)).join(" | ")} |`;
    const body = rows.map((row) => renderRow(row));

    return [header, separator, ...body].join("\n");
  }

  private formatList<T>(results: readonly T[], options: FormatterOptions<T>): string {
    if (results.length === 0) return "";
    return results.map((r) => `${options.getName(r)} ${options.getVersion(r)}`).join("\n");
  }

  private formatVersion<T>(results: readonly T[], options: FormatterOptions<T>): string {
    if (results.length > 1) {
      const names = results.map((r) => options.getName(r)).join(", ");
      throw new Error(
        `Output format 'version' requires exactly one project, but ${results.length} were found: ${names}`,
      );
    }

    if (results.length === 0) return "";

    const single = results[0] as T;
    options.validateVersionItem?.(single);
    return options.getVersion(single);
  }

  private cellToString(cell: unknown): string {
    if (cell === null || cell === undefined) return "";
    return String(cell);
  }
}
