import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Creates and tracks temporary files/directories for a single test, and removes them all
 * on {@link TempFileHelper.dispose}. Mirrors the .NET `TempFileHelper` test helper.
 */
export class TempFileHelper {
  private readonly root: string;

  public constructor() {
    this.root = mkdtempSync(join(tmpdir(), "node-version-reader-"));
  }

  /** The root temp directory for this test instance. */
  public get rootDir(): string {
    return this.root;
  }

  /**
   * Writes a `package.json` file with the given raw JSON `content` under `subDir` (relative to
   * the temp root) and returns its absolute path.
   */
  public createPackageJson(content: string, subDir = "pkg"): string {
    const dir = join(this.root, subDir);
    mkdirSync(dir, { recursive: true });
    const filePath = join(dir, "package.json");
    writeFileSync(filePath, content, "utf8");
    return filePath;
  }

  /**
   * Creates a directory containing multiple named packages, each with the given content.
   * Returns the directory path and the list of created `package.json` absolute paths.
   */
  public createDirectory(
    packages: ReadonlyArray<readonly [name: string, content: string]>,
  ): { dir: string; files: string[] } {
    const dir = join(this.root, "workspace");
    mkdirSync(dir, { recursive: true });
    const files = packages.map(([name, content]) => this.createPackageJson(content, join("workspace", name)));
    return { dir, files };
  }

  /** Creates a root `package.json` with a `"workspaces"` field pointing at the given globs. */
  public createWorkspaceRoot(globs: readonly string[], subDir = ""): { dir: string; file: string } {
    const dir = subDir ? join(this.root, subDir) : this.root;
    mkdirSync(dir, { recursive: true });
    const file = join(dir, "package.json");
    writeFileSync(file, JSON.stringify({ name: "root", private: true, workspaces: globs }, null, 2), "utf8");
    return { dir, file };
  }

  /** Removes the entire temp directory tree. Safe to call multiple times. */
  public dispose(): void {
    rmSync(this.root, { recursive: true, force: true });
  }
}
