import { readFileSync } from "node:fs";
import { basename, dirname } from "node:path";
import type { ParsedFilter } from "./filterParser.js";
import { deriveVersionComponents, resolveVersion, type PackageVersionInfo } from "../models/packageVersionInfo.js";

/** Minimal shape of a parsed `package.json` document, allowing arbitrary extra fields. */
export type PackageJsonDocument = Record<string, unknown>;

/**
 * Parses `package.json` files into {@link PackageVersionInfo} and evaluates filters against
 * arbitrary (possibly nested) JSON keys.
 */
export class PackageJsonParser {
  /**
   * Parses the given `package.json` file and returns its version information, or `null` when
   * the file cannot be read or parsed.
   */
  public parse(packageJsonPath: string): PackageVersionInfo | null {
    const doc = this.readJson(packageJsonPath);
    if (doc === null) return null;

    return this.toInfo(doc, packageJsonPath);
  }

  /**
   * Parses JSON content directly from a string (e.g. content retrieved via `git show`) without
   * touching disk. The `packageJsonPath` is used only to populate {@link PackageVersionInfo.filePath}
   * and to derive a fallback name. Returns `null` when the content cannot be parsed.
   */
  public parseFromString(content: string, packageJsonPath: string): PackageVersionInfo | null {
    const doc = this.parseJsonSafe(content);
    if (doc === null) return null;

    return this.toInfo(doc, packageJsonPath);
  }

  /**
   * Loads the document for the given path and applies all filters (AND semantics).
   * Returns `null` if the file cannot be loaded/parsed, or any filter does not match.
   */
  public parseWithFilters(packageJsonPath: string, filters: readonly ParsedFilter[]): PackageVersionInfo | null {
    const doc = this.readJson(packageJsonPath);
    if (doc === null) return null;

    for (const filter of filters) {
      if (!this.matchesFilter(doc, filter.key, filter.pattern)) return null;
    }

    return this.toInfo(doc, packageJsonPath);
  }

  /**
   * Returns `true` when `doc` contains at least one key named `key` (at any depth, matched
   * case-insensitively) whose stringified value matches `pattern`.
   */
  public matchesFilter(doc: unknown, key: string, pattern: RegExp): boolean {
    return this.findMatchingValues(doc, key).some((value) => pattern.test(value));
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  private toInfo(doc: PackageJsonDocument, packageJsonPath: string): PackageVersionInfo {
    const name = this.readName(doc, packageJsonPath);
    const version = this.readVersion(doc);
    const resolvedVersion = resolveVersion(version);

    return {
      name,
      filePath: packageJsonPath,
      version,
      resolvedVersion,
      ...deriveVersionComponents(resolvedVersion),
    };
  }

  private readName(doc: PackageJsonDocument, packageJsonPath: string): string {
    const name = doc["name"];
    if (typeof name === "string" && name.trim().length > 0) return name.trim();
    return basename(dirname(packageJsonPath));
  }

  private readVersion(doc: PackageJsonDocument): string | null {
    const version = doc["version"];
    if (typeof version === "string" && version.trim().length > 0) return version.trim();
    return null;
  }

  private readJson(packageJsonPath: string): PackageJsonDocument | null {
    let raw: string;
    try {
      raw = readFileSync(packageJsonPath, "utf8");
    } catch {
      return null;
    }
    return this.parseJsonSafe(raw);
  }

  private parseJsonSafe(content: string): PackageJsonDocument | null {
    try {
      const parsed: unknown = JSON.parse(content);
      if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
        return parsed as PackageJsonDocument;
      }
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Recursively walks `doc` collecting the stringified value of every key matching `key`
   * (case-insensitive), at any depth.
   */
  private findMatchingValues(doc: unknown, key: string): string[] {
    const found: string[] = [];
    const lowerKey = key.toLowerCase();

    const visit = (node: unknown): void => {
      if (Array.isArray(node)) {
        for (const item of node) visit(item);
        return;
      }
      if (node !== null && typeof node === "object") {
        for (const [k, v] of Object.entries(node)) {
          if (k.toLowerCase() === lowerKey) {
            found.push(this.stringifyValue(v));
          }
          visit(v);
        }
      }
    };

    visit(doc);
    return found;
  }

  private stringifyValue(value: unknown): string {
    if (value === null || value === undefined) return "";
    if (typeof value === "object") return JSON.stringify(value);
    return String(value);
  }
}
