import { describe, expect, it } from "vitest";
import { Formatter, readOptions, checkOptions, diffOptions } from "../../src/services/formatter.js";
import type { PackageVersionInfo } from "../../src/models/packageVersionInfo.js";
import type { CheckResult } from "../../src/models/checkResult.js";
import type { DiffResult } from "../../src/models/diffResult.js";

function makeInfo(overrides: Partial<PackageVersionInfo> = {}): PackageVersionInfo {
  return {
    name: "my-lib",
    filePath: "/a/package.json",
    version: "2.1.0-rc.1",
    resolvedVersion: "2.1.0-rc.1",
    major: 2,
    minor: 1,
    patch: 0,
    suffix: "rc.1",
    ...overrides,
  };
}

describe("Formatter — read (PackageVersionInfo)", () => {
  const formatter = new Formatter();

  it("formats JSON with camelCase keys", () => {
    const json = formatter.format([makeInfo()], "json", readOptions);
    const parsed = JSON.parse(json);

    expect(parsed).toEqual([
      { name: "my-lib", version: "2.1.0-rc.1", major: 2, minor: 1, patch: 0, suffix: "rc.1" },
    ]);
  });

  it("formats an empty array as JSON", () => {
    expect(JSON.parse(formatter.format([], "json", readOptions))).toEqual([]);
  });

  it("formats a markdown table", () => {
    const table = formatter.format([makeInfo()], "table", readOptions);
    expect(table).toContain("my-lib");
    expect(table).toContain("2.1.0-rc.1");
    expect(table).toContain("|");
  });

  it("formats an empty table as an empty string", () => {
    expect(formatter.format([], "table", readOptions)).toBe("");
  });

  it("formats a list of 'name version' lines", () => {
    const list = formatter.format(
      [makeInfo({ name: "a", resolvedVersion: "1.0.0" }), makeInfo({ name: "b", resolvedVersion: "2.0.0" })],
      "list",
      readOptions,
    );

    expect(list.split("\n")).toEqual(["a 1.0.0", "b 2.0.0"]);
  });

  it("formats the bare version for a single result", () => {
    expect(formatter.format([makeInfo()], "version", readOptions)).toBe("2.1.0-rc.1");
  });

  it("returns an empty string for version format with zero results", () => {
    expect(formatter.format([], "version", readOptions)).toBe("");
  });

  it("throws when version format is used with more than one result", () => {
    expect(() =>
      formatter.format([makeInfo({ name: "a" }), makeInfo({ name: "b" })], "version", readOptions),
    ).toThrow(/exactly one/i);
  });
});

describe("Formatter — check (CheckResult)", () => {
  const formatter = new Formatter();

  function makeCheck(overrides: Partial<CheckResult> = {}): CheckResult {
    return {
      name: "my-lib",
      filePath: "/a/package.json",
      headVersion: "2.0.0",
      baseVersion: "1.0.0",
      status: "Ok",
      ...overrides,
    };
  }

  it("formats JSON", () => {
    const json = JSON.parse(formatter.format([makeCheck()], "json", checkOptions));
    expect(json).toEqual([
      { name: "my-lib", filePath: "/a/package.json", headVersion: "2.0.0", baseVersion: "1.0.0", status: "Ok" },
    ]);
  });

  it("throws when the version format is requested for a BumpRequired result", () => {
    expect(() =>
      formatter.format([makeCheck({ status: "BumpRequired" })], "version", checkOptions),
    ).toThrow(/requires a version bump/i);
  });

  it("does not throw for Ok status with version format", () => {
    expect(formatter.format([makeCheck({ status: "Ok" })], "version", checkOptions)).toBe("2.0.0");
  });

  it("renders null baseVersion as '(new)' in table output", () => {
    const table = formatter.format([makeCheck({ baseVersion: null, status: "NewProject" })], "table", checkOptions);
    expect(table).toContain("(new)");
  });
});

describe("Formatter — diff (DiffResult)", () => {
  const formatter = new Formatter();

  function makeDiff(overrides: Partial<DiffResult> = {}): DiffResult {
    return {
      name: "my-lib",
      filePath: "/a/package.json",
      headVersion: "2.0.0",
      baseVersion: "1.0.0",
      status: "Bumped",
      ...overrides,
    };
  }

  it("formats JSON", () => {
    const json = JSON.parse(formatter.format([makeDiff()], "json", diffOptions));
    expect(json[0].status).toBe("Bumped");
  });

  it("formats a list of 'name version' lines using head version", () => {
    const list = formatter.format([makeDiff()], "list", diffOptions);
    expect(list).toBe("my-lib 2.0.0");
  });
});
