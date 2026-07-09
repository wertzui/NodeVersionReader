import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { basename, dirname, extname, join, resolve } from "node:path";

/**
 * Directory names that are always skipped while recursively scanning a folder for
 * `package.json` files. These commonly contain nested `package.json` files that do not
 * represent packages the user wants to inspect (dependencies, build output, VCS metadata).
 */
const EXCLUDED_DIRECTORIES = new Set(["node_modules", ".git", "dist", "build", "out", "coverage"]);

/** Shape of the `"workspaces"` field, which npm/yarn allow as either an array or an object. */
type WorkspacesField = string[] | { packages?: string[] } | undefined;

/**
 * Resolves a list of `package.json` file paths from a given input: a single `package.json`
 * file (optionally a workspace root, in which case its member packages are resolved via the
 * `"workspaces"` field), a directory, or nothing (the current directory).
 *
 * Mirrors the .NET `CsprojLocator`, with `.sln`/`.slnx` solution-file resolution replaced by
 * npm/yarn workspace glob resolution.
 */
export class PackageJsonLocator {
  /**
   * Returns all `package.json` paths that match the given `input`.
   *
   * @param input Path to a `package.json` file, a directory, or `undefined`/`null` to use the
   * current working directory.
   */
  public locate(input: string | null | undefined): string[] {
    const resolved = !input || input.trim().length === 0 ? process.cwd() : resolve(input.trim());

    if (existsSync(resolved) && statSync(resolved).isFile()) {
      return this.locateFromFile(resolved);
    }

    if (existsSync(resolved) && statSync(resolved).isDirectory()) {
      return this.scanDirectory(resolved);
    }

    throw new Error(`Input not found: ${resolved}`);
  }

  // -------------------------------------------------------------------------
  // Single-file input
  // -------------------------------------------------------------------------

  private locateFromFile(filePath: string): string[] {
    if (extname(filePath).toLowerCase() !== ".json" || basename(filePath) !== "package.json") {
      throw new Error(`Unsupported file type: ${extname(filePath) || "(no extension)"}`);
    }

    const doc = this.readJson(filePath);
    const workspaces = this.normalizeWorkspaces(doc?.["workspaces"] as WorkspacesField | unknown);

    if (workspaces.length === 0) {
      return [filePath];
    }

    const rootDir = dirname(filePath);
    const memberDirs = new Set<string>();
    for (const glob of workspaces) {
      for (const dir of this.expandGlob(rootDir, glob)) {
        memberDirs.add(dir);
      }
    }

    const members: string[] = [];
    for (const dir of memberDirs) {
      const candidate = join(dir, "package.json");
      if (existsSync(candidate) && resolve(candidate) !== resolve(filePath)) {
        members.push(candidate);
      }
    }

    return members;
  }

  private normalizeWorkspaces(value: unknown): string[] {
    if (Array.isArray(value)) {
      return value.filter((v): v is string => typeof v === "string");
    }
    if (value && typeof value === "object" && Array.isArray((value as { packages?: unknown }).packages)) {
      return ((value as { packages: unknown[] }).packages).filter((v): v is string => typeof v === "string");
    }
    return [];
  }

  // -------------------------------------------------------------------------
  // Directory input — recursive scan
  // -------------------------------------------------------------------------

  private scanDirectory(dir: string): string[] {
    const results: string[] = [];
    this.scanDirectoryInto(dir, results);
    return results;
  }

  private scanDirectoryInto(dir: string, results: string[]): void {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }

    for (const entry of entries) {
      if (EXCLUDED_DIRECTORIES.has(entry)) continue;

      const fullPath = join(dir, entry);
      let stat;
      try {
        stat = statSync(fullPath);
      } catch {
        continue;
      }

      if (stat.isDirectory()) {
        this.scanDirectoryInto(fullPath, results);
      } else if (stat.isFile() && entry === "package.json") {
        results.push(fullPath);
      }
    }
  }

  // -------------------------------------------------------------------------
  // Glob resolution for the "workspaces" field
  // -------------------------------------------------------------------------

  /** Expands a single glob pattern (e.g. `"packages/*"`) into matching absolute directories. */
  private expandGlob(baseDir: string, pattern: string): string[] {
    if (pattern.startsWith("!")) return []; // negation patterns are not supported for expansion
    const segments = pattern.split("/").filter((s) => s.length > 0);
    return this.matchSegments(resolve(baseDir), segments);
  }

  private matchSegments(currentDir: string, segments: readonly string[]): string[] {
    if (segments.length === 0) {
      return existsSync(currentDir) && statSync(currentDir).isDirectory() ? [currentDir] : [];
    }

    const [first, ...rest] = segments as [string, ...string[]];

    if (first === "..") {
      return this.matchSegments(dirname(currentDir), rest);
    }

    if (first === "**") {
      const results = new Set<string>(this.matchSegments(currentDir, rest));
      if (existsSync(currentDir) && statSync(currentDir).isDirectory()) {
        for (const child of this.listSubdirectories(currentDir)) {
          for (const match of this.matchSegments(child, segments)) {
            results.add(match);
          }
        }
      }
      return [...results];
    }

    if (!existsSync(currentDir) || !statSync(currentDir).isDirectory()) return [];

    if (!first.includes("*") && !first.includes("?")) {
      return this.matchSegments(join(currentDir, first), rest);
    }

    const regex = this.wildcardToRegExp(first);
    const results: string[] = [];
    for (const child of this.listSubdirectories(currentDir)) {
      if (regex.test(basename(child))) {
        results.push(...this.matchSegments(child, rest));
      }
    }
    return results;
  }

  private listSubdirectories(dir: string): string[] {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return [];
    }
    return entries
      .filter((e) => !EXCLUDED_DIRECTORIES.has(e))
      .map((e) => join(dir, e))
      .filter((p) => {
        try {
          return statSync(p).isDirectory();
        } catch {
          return false;
        }
      });
  }

  private wildcardToRegExp(segment: string): RegExp {
    const escaped = segment
      .replace(/[.+^${}()|[\]\\]/g, "\\$&")
      .replace(/\*/g, ".*")
      .replace(/\?/g, ".");
    return new RegExp(`^${escaped}$`);
  }

  private readJson(filePath: string): Record<string, unknown> | null {
    try {
      const parsed: unknown = JSON.parse(readFileSync(filePath, "utf8"));
      if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
      return null;
    } catch {
      return null;
    }
  }
}
