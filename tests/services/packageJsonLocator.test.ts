import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PackageJsonLocator } from "../../src/services/packageJsonLocator.js";
import { packageJsonFixtures } from "../fixtures/packageJsonFixtures.js";
import { TempFileHelper } from "../helpers/tempFileHelper.js";

describe("PackageJsonLocator", () => {
  let tmp: TempFileHelper;
  const locator = new PackageJsonLocator();

  beforeEach(() => {
    tmp = new TempFileHelper();
  });

  afterEach(() => {
    tmp.dispose();
  });

  it("locates a single package.json file", () => {
    const file = tmp.createPackageJson(packageJsonFixtures.withVersionOnly());
    const result = locator.locate(file);

    expect(result).toEqual([file]);
  });

  it("locates all package.json files in a directory recursively", () => {
    const { dir } = tmp.createDirectory([
      ["alpha", packageJsonFixtures.withVersionOnly("alpha")],
      ["beta", packageJsonFixtures.withVersionOnly("beta")],
    ]);

    const result = locator.locate(dir);

    expect(result).toHaveLength(2);
  });

  it("excludes node_modules, .git, dist, build and coverage directories", () => {
    const { dir } = tmp.createDirectory([["real-pkg", packageJsonFixtures.withVersionOnly("real-pkg")]]);

    for (const excludedDir of ["node_modules", ".git", "dist", "build", "coverage", "out"]) {
      const nestedDir = join(dir, excludedDir, "nested-pkg");
      mkdirSync(nestedDir, { recursive: true });
      writeFileSync(join(nestedDir, "package.json"), packageJsonFixtures.withVersionOnly("nested-pkg"), "utf8");
    }

    const result = locator.locate(dir);

    expect(result).toHaveLength(1);
    expect(result[0]).toContain("real-pkg");
  });

  it("resolves workspace globs from a root package.json", () => {
    const pkgA = tmp.createPackageJson(packageJsonFixtures.withVersionOnly("pkg-a"), "packages/pkg-a");
    const pkgB = tmp.createPackageJson(packageJsonFixtures.withVersionOnly("pkg-b"), "packages/pkg-b");
    const { file: rootFile } = tmp.createWorkspaceRoot(["packages/*"]);

    const result = locator.locate(rootFile);

    expect(result).toContain(pkgA);
    expect(result).toContain(pkgB);
    expect(result).not.toContain(rootFile);
  });

  it("resolves workspace globs given as an object with a packages array", () => {
    tmp.createPackageJson(packageJsonFixtures.withVersionOnly("pkg-a"), "packages/pkg-a");
    const rootDir = join(tmp.rootDir, "root2");
    mkdirSync(rootDir, { recursive: true });
    const rootFile = join(rootDir, "package.json");
    writeFileSync(
      rootFile,
      JSON.stringify({ name: "root2", workspaces: { packages: ["../packages/*"] } }),
      "utf8",
    );

    const result = locator.locate(rootFile);
    expect(result.some((f) => f.includes("pkg-a"))).toBe(true);
  });

  it("uses the current directory when input is null/undefined", () => {
    const originalCwd = process.cwd();
    try {
      const { dir } = tmp.createDirectory([["only", packageJsonFixtures.withVersionOnly("only")]]);
      process.chdir(dir);

      const result = locator.locate(undefined);
      expect(result).toHaveLength(1);
    } finally {
      process.chdir(originalCwd);
    }
  });

  it("throws for an unsupported file type", () => {
    const file = join(tmp.rootDir, "notes.txt");
    writeFileSync(file, "hello", "utf8");

    expect(() => locator.locate(file)).toThrow(/unsupported/i);
  });

  it("throws when the input path does not exist", () => {
    expect(() => locator.locate(join(tmp.rootDir, "does-not-exist"))).toThrow(/not found/i);
  });
});
