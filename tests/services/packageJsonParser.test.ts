import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PackageJsonParser } from "../../src/services/packageJsonParser.js";
import { FilterParser } from "../../src/services/filterParser.js";
import { packageJsonFixtures } from "../fixtures/packageJsonFixtures.js";
import { TempFileHelper } from "../helpers/tempFileHelper.js";

describe("PackageJsonParser", () => {
  let tmp: TempFileHelper;
  const parser = new PackageJsonParser();

  beforeEach(() => {
    tmp = new TempFileHelper();
  });

  afterEach(() => {
    tmp.dispose();
  });

  describe("parse", () => {
    it("parses name and version", () => {
      const file = tmp.createPackageJson(packageJsonFixtures.withVersionOnly("my-app"));
      const info = parser.parse(file);

      expect(info?.name).toBe("my-app");
      expect(info?.version).toBe("3.2.1");
      expect(info?.resolvedVersion).toBe("3.2.1");
      expect(info?.major).toBe(3);
      expect(info?.minor).toBe(2);
      expect(info?.patch).toBe(1);
    });

    it("defaults to 0.0.0 when there is no version field", () => {
      const file = tmp.createPackageJson(packageJsonFixtures.withNoVersion("no-version-app"));
      const info = parser.parse(file);

      expect(info?.version).toBeNull();
      expect(info?.resolvedVersion).toBe("0.0.0");
    });

    it("parses a pre-release suffix", () => {
      const file = tmp.createPackageJson(packageJsonFixtures.withPrereleaseVersion("core", "1.2.3-rc.2"));
      const info = parser.parse(file);

      expect(info?.resolvedVersion).toBe("1.2.3-rc.2");
      expect(info?.suffix).toBe("rc.2");
    });

    it("falls back to the directory name when there is no name field", () => {
      const dirPath = tmp.createPackageJson(JSON.stringify({ version: "1.0.0" }), "unnamed-pkg");
      const info = parser.parse(dirPath);

      expect(info?.name).toBe("unnamed-pkg");
    });

    it("returns null for malformed JSON", () => {
      const file = tmp.createPackageJson(packageJsonFixtures.malformedJson);
      expect(parser.parse(file)).toBeNull();
    });

    it("returns null for a non-existent file", () => {
      expect(parser.parse("/does/not/exist/package.json")).toBeNull();
    });
  });

  describe("parseFromString", () => {
    it("parses JSON content directly without touching disk", () => {
      const info = parser.parseFromString(packageJsonFixtures.withVersionOnly("in-memory"), "/virtual/package.json");
      expect(info?.name).toBe("in-memory");
      expect(info?.resolvedVersion).toBe("3.2.1");
    });

    it("returns null for malformed content", () => {
      expect(parser.parseFromString(packageJsonFixtures.malformedJson, "/virtual/package.json")).toBeNull();
    });
  });

  describe("matchesFilter", () => {
    it("matches a top-level primitive field", () => {
      const json = JSON.parse(packageJsonFixtures.withPrivateTrue());
      expect(parser.matchesFilter(json, "private", /true/i)).toBe(true);
      expect(parser.matchesFilter(json, "private", /false/i)).toBe(false);
    });

    it("matches a nested field at any depth", () => {
      const json = JSON.parse(packageJsonFixtures.withEngineNode18());
      expect(parser.matchesFilter(json, "node", />=18/)).toBe(true);
    });

    it("is case-insensitive on the key name", () => {
      const json = JSON.parse(packageJsonFixtures.withPrivateTrue());
      expect(parser.matchesFilter(json, "PRIVATE", /true/i)).toBe(true);
    });

    it("returns false when the key does not exist and the pattern requires non-empty content", () => {
      const json = JSON.parse(packageJsonFixtures.withVersionOnly());
      expect(parser.matchesFilter(json, "nonExistentKey", /^true$/i)).toBe(false);
    });

    it("tests the pattern against an empty string when the key does not exist (absent = falsy)", () => {
      const json = JSON.parse(packageJsonFixtures.withVersionOnly());
      // A negative-lookahead filter for "not private" should match packages that have no
      // "private" field at all, since absence is equivalent to the falsy default.
      expect(parser.matchesFilter(json, "private", /^(?!true$)/i)).toBe(true);
    });

    it("does not exclude an absent key when using an anchored negation filter", () => {
      const json = JSON.parse(packageJsonFixtures.withVersionOnly("no-private-field"));
      expect(parser.matchesFilter(json, "private", /^(?!true$)/i)).toBe(true);
    });

    it("excludes a package explicitly marked private when using an anchored negation filter", () => {
      const json = JSON.parse(packageJsonFixtures.withPrivateTrue());
      expect(parser.matchesFilter(json, "private", /^(?!true$)/i)).toBe(false);
    });

    it("demonstrates that an UNANCHORED negative lookahead never excludes anything (regex pitfall)", () => {
      // (?!true) with no start anchor can match at a later position in the string (e.g. after
      // consuming "t", the remaining "rue" doesn't start with "true", so the lookahead succeeds).
      // This is why filters MUST anchor with ^...$ around a negative lookahead, e.g. ^(?!true$).
      const json = JSON.parse(packageJsonFixtures.withPrivateTrue());
      expect(parser.matchesFilter(json, "private", /(?!true)/i)).toBe(true);
    });
  });

  describe("parseWithFilters", () => {
    it("returns the info when all filters match", () => {
      const file = tmp.createPackageJson(packageJsonFixtures.withPrivateTrue("packable"));
      const filters = new FilterParser().parse(["private=^true$"]);
      const info = parser.parseWithFilters(file, filters);

      expect(info?.name).toBe("packable");
    });

    it("returns null when any filter does not match", () => {
      const file = tmp.createPackageJson(packageJsonFixtures.withPrivateFalse("not-packable"));
      const filters = new FilterParser().parse(["private=^true$"]);

      expect(parser.parseWithFilters(file, filters)).toBeNull();
    });

    it("requires all filters to match (AND semantics)", () => {
      const file = tmp.createPackageJson(packageJsonFixtures.withEngineNode18("multi", "4.0.0"));
      const filters = new FilterParser().parse(["node=>=18", "version=4\\.0\\.0"]);

      expect(parser.parseWithFilters(file, filters)?.name).toBe("multi");

      const failingFilters = new FilterParser().parse(["node=>=18", "version=9\\.9\\.9"]);
      expect(parser.parseWithFilters(file, failingFilters)).toBeNull();
    });

    it("returns null for malformed JSON regardless of filters", () => {
      const file = tmp.createPackageJson(packageJsonFixtures.malformedJson);
      const filters = new FilterParser().parse(["private=true"]);
      expect(parser.parseWithFilters(file, filters)).toBeNull();
    });
  });
});
