import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PackageJsonLocator } from "../../src/services/packageJsonLocator.js";
import { PackageJsonParser } from "../../src/services/packageJsonParser.js";
import { FilterParser } from "../../src/services/filterParser.js";
import { Formatter, readOptions } from "../../src/services/formatter.js";
import type { OutputFormat } from "../../src/models/outputFormat.js";
import type { PackageVersionInfo } from "../../src/models/packageVersionInfo.js";
import { packageJsonFixtures } from "../fixtures/packageJsonFixtures.js";
import { TempFileHelper } from "../helpers/tempFileHelper.js";

/**
 * Runs the same pipeline as the CLI's `read` command: locate → (filter) → parse → format.
 */
function runReadPipeline(input: string, filters: string[], format: OutputFormat): string {
  const locator = new PackageJsonLocator();
  const parser = new PackageJsonParser();
  const formatter = new Formatter();
  const parsedFilters = new FilterParser().parse(filters);

  const files = locator.locate(input);
  const results: PackageVersionInfo[] = [];

  for (const file of files) {
    const info =
      parsedFilters.length > 0 ? parser.parseWithFilters(file, parsedFilters) : parser.parse(file);
    if (info) results.push(info);
  }

  return formatter.format(results, format, readOptions);
}

describe("End-to-end: read pipeline", () => {
  let tmp: TempFileHelper;

  beforeEach(() => {
    tmp = new TempFileHelper();
  });

  afterEach(() => {
    tmp.dispose();
  });

  it("reads a single package.json with JSON output", () => {
    const file = tmp.createPackageJson(packageJsonFixtures.withVersionOnly("my-app"));
    const result = runReadPipeline(file, [], "json");
    const arr = JSON.parse(result);

    expect(arr).toHaveLength(1);
    expect(arr[0].name).toBe("my-app");
    expect(arr[0].version).toBe("3.2.1");
  });

  it("reads a single package.json with table output", () => {
    const file = tmp.createPackageJson(packageJsonFixtures.withPrereleaseVersion("core", "1.2.3-rc.2"));
    const result = runReadPipeline(file, [], "table");

    expect(result).toContain("core");
    expect(result).toContain("1.2.3-rc.2");
  });

  it("reads all package.json files under a directory", () => {
    const { dir } = tmp.createDirectory([
      ["alpha", packageJsonFixtures.withVersionOnly("alpha")],
      ["beta", packageJsonFixtures.withVersionOnly("beta")],
    ]);

    const result = runReadPipeline(dir, [], "json");
    expect(JSON.parse(result)).toHaveLength(2);
  });

  it("resolves workspaces from a root package.json and filters packages", () => {
    tmp.createPackageJson(packageJsonFixtures.withPrivateTrue("packable"), "packages/packable");
    tmp.createPackageJson(packageJsonFixtures.withPrivateFalse("not-packable"), "packages/not-packable");
    const { file: rootFile } = tmp.createWorkspaceRoot(["packages/*"]);

    const result = runReadPipeline(rootFile, ["private=^true$"], "json");
    const arr = JSON.parse(result);

    expect(arr).toHaveLength(1);
    expect(arr[0].name).toBe("packable");
  });

  it("applies multiple filters with AND semantics", () => {
    const file = tmp.createPackageJson(packageJsonFixtures.withEngineNode18("node18-app", "4.0.0"));

    const result = runReadPipeline(file, ["node=>=18", "version=4\\.0\\.0"], "json");
    const arr = JSON.parse(result);

    expect(arr).toHaveLength(1);
    expect(arr[0].name).toBe("node18-app");
  });

  it("returns an empty array when no package matches the filter", () => {
    const file = tmp.createPackageJson(packageJsonFixtures.withVersionOnly("no-match"));

    const result = runReadPipeline(file, ["private=true"], "json");
    expect(JSON.parse(result)).toHaveLength(0);
  });
});
