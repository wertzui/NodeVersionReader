import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";

/** Directory names excluded when enumerating the files "owned" by a package. */
const EXCLUDED_OWNED_DIRECTORIES = new Set(["node_modules", ".git", "dist", "build", "out", "coverage"]);

/** A single node in the package dependency graph. */
export interface PackageNode {
  /** Absolute path to the `package.json` file. */
  readonly packageJsonPath: string;

  /** The directory that contains the `package.json` file. */
  readonly packageDirectory: string;

  /** Absolute paths of all files that "belong" to this package. */
  readonly ownedFiles: readonly string[];

  /**
   * Absolute paths of the `package.json` files of other located packages that this package
   * depends on (matched by the `"name"` field appearing as a key under `dependencies`,
   * `devDependencies`, `peerDependencies`, or `optionalDependencies`).
   */
  readonly directDependencyReferences: readonly string[];
}

/** A fully-resolved dependency graph for a set of packages. */
export interface DependencyGraph {
  /** All nodes keyed by their absolute `package.json` path (normalized). */
  readonly nodes: ReadonlyMap<string, PackageNode>;

  /** Reverse dependency map: for each `package.json` path, the packages that depend on it. */
  readonly reverseDependencies: ReadonlyMap<string, readonly string[]>;
}

const DEPENDENCY_FIELDS = ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"] as const;

/** Normalizes a path for consistent, case-insensitive comparisons across the graph. */
export function normalizePath(path: string): string {
  return resolve(path);
}

/**
 * Builds an in-memory dependency graph from a set of `package.json` files and uses it to
 * determine which packages are "affected" by a set of changed file paths.
 *
 * Mirrors the .NET `DependencyGraphService`, with `<ProjectReference>` elements replaced by
 * `dependencies`/`devDependencies`/`peerDependencies`/`optionalDependencies` entries whose key
 * matches another located package's name.
 */
export class DependencyGraphService {
  /** Builds a {@link DependencyGraph} from the given collection of `package.json` paths. */
  public build(packageJsonPaths: readonly string[]): DependencyGraph {
    const normalized = [...new Set(packageJsonPaths.map(normalizePath))];

    const nameToPath = new Map<string, string>();
    const docs = new Map<string, Record<string, unknown>>();

    for (const path of normalized) {
      const doc = this.readJson(path);
      if (doc === null) continue;
      docs.set(path, doc);
      const name = typeof doc["name"] === "string" ? (doc["name"] as string) : null;
      if (name) nameToPath.set(name, path);
    }

    const nodes = new Map<string, PackageNode>();
    for (const path of normalized) {
      const doc = docs.get(path);
      const packageDirectory = dirname(path);
      const directDependencyReferences = doc ? this.resolveDependencyReferences(doc, path, nameToPath) : [];
      const ownedFiles = this.enumerateOwnedFiles(path, packageDirectory);

      nodes.set(path, {
        packageJsonPath: path,
        packageDirectory,
        ownedFiles,
        directDependencyReferences,
      });
    }

    const reverse = new Map<string, string[]>();
    for (const node of nodes.values()) {
      for (const refPath of node.directDependencyReferences) {
        const list = reverse.get(refPath) ?? [];
        list.push(node.packageJsonPath);
        reverse.set(refPath, list);
      }
    }

    return { nodes, reverseDependencies: reverse };
  }

  /**
   * Returns the subset of `graph` nodes that are transitively affected by the given
   * `changedFiles`:
   * - a package whose own `package.json` (or an owned file) is in `changedFiles`, or
   * - a package that (transitively) depends on an affected package.
   */
  public getAffectedProjects(changedFiles: readonly string[], graph: DependencyGraph): PackageNode[] {
    const changedSet = new Set(changedFiles.map(normalizePath));

    const affected = new Set<string>();
    const queue: string[] = [];

    for (const node of graph.nodes.values()) {
      if (this.isTouched(node, changedSet)) {
        affected.add(node.packageJsonPath);
        queue.push(node.packageJsonPath);
      }
    }

    while (queue.length > 0) {
      const current = queue.shift();
      if (current === undefined) break;
      const dependents = graph.reverseDependencies.get(current);
      if (!dependents) continue;
      for (const dependent of dependents) {
        if (!affected.has(dependent)) {
          affected.add(dependent);
          queue.push(dependent);
        }
      }
    }

    return [...affected]
      .map((p) => graph.nodes.get(p))
      .filter((n): n is PackageNode => n !== undefined)
      .sort((a, b) => a.packageJsonPath.localeCompare(b.packageJsonPath));
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  private resolveDependencyReferences(
    doc: Record<string, unknown>,
    ownPath: string,
    nameToPath: ReadonlyMap<string, string>,
  ): string[] {
    const refs = new Set<string>();

    for (const field of DEPENDENCY_FIELDS) {
      const deps = doc[field];
      if (!deps || typeof deps !== "object") continue;

      for (const depName of Object.keys(deps as Record<string, unknown>)) {
        const refPath = nameToPath.get(depName);
        if (refPath && refPath !== ownPath) refs.add(refPath);
      }
    }

    return [...refs];
  }

  private enumerateOwnedFiles(packageJsonPath: string, packageDirectory: string): string[] {
    try {
      if (!statSync(packageDirectory).isDirectory()) return [packageJsonPath];
    } catch {
      return [packageJsonPath];
    }

    const results: string[] = [];
    this.enumerateFilesInto(packageDirectory, results);
    return results.length > 0 ? results : [packageJsonPath];
  }

  private enumerateFilesInto(dir: string, results: string[]): void {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }

    for (const entry of entries) {
      if (EXCLUDED_OWNED_DIRECTORIES.has(entry)) continue;
      const fullPath = join(dir, entry);
      let stat;
      try {
        stat = statSync(fullPath);
      } catch {
        continue;
      }

      if (stat.isDirectory()) {
        this.enumerateFilesInto(fullPath, results);
      } else if (stat.isFile()) {
        results.push(normalizePath(fullPath));
      }
    }
  }

  private isTouched(node: PackageNode, changedSet: ReadonlySet<string>): boolean {
    if (changedSet.has(node.packageJsonPath)) return true;

    for (const file of changedSet) {
      if (this.isUnderDirectory(file, node.packageDirectory) && !this.isInExcludedDirectory(file, node.packageDirectory)) {
        return true;
      }
    }

    return false;
  }

  private isUnderDirectory(filePath: string, directory: string): boolean {
    const dir = directory.endsWith(sep) ? directory : directory + sep;
    return filePath.startsWith(dir);
  }

  private isInExcludedDirectory(filePath: string, packageDir: string): boolean {
    const rel = relative(packageDir, filePath);
    const firstSegment = rel.split(sep)[0] ?? "";
    return EXCLUDED_OWNED_DIRECTORIES.has(firstSegment);
  }

  private readJson(path: string): Record<string, unknown> | null {
    try {
      const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
      if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
      return null;
    } catch {
      return null;
    }
  }
}
