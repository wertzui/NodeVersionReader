import { describe, expect, it } from "vitest";
import { DEFAULT_VERSION, deriveVersionComponents, resolveVersion } from "../../src/models/packageVersionInfo.js";

describe("resolveVersion", () => {
  it("returns the trimmed version when set", () => {
    expect(resolveVersion(" 1.2.3 ")).toBe("1.2.3");
  });

  it("returns the default version when null", () => {
    expect(resolveVersion(null)).toBe(DEFAULT_VERSION);
  });

  it("returns the default version when undefined", () => {
    expect(resolveVersion(undefined)).toBe(DEFAULT_VERSION);
  });

  it("returns the default version when empty/whitespace", () => {
    expect(resolveVersion("   ")).toBe(DEFAULT_VERSION);
    expect(resolveVersion("")).toBe(DEFAULT_VERSION);
  });
});

describe("deriveVersionComponents", () => {
  it("parses a simple major.minor.patch version", () => {
    const result = deriveVersionComponents("2.1.0");
    expect(result).toEqual({ major: 2, minor: 1, patch: 0, suffix: null });
  });

  it("parses a version with a pre-release suffix", () => {
    const result = deriveVersionComponents("2.1.0-rc.1");
    expect(result).toEqual({ major: 2, minor: 1, patch: 0, suffix: "rc.1" });
  });

  it("returns null components for a non-numeric version", () => {
    const result = deriveVersionComponents("not-a-version");
    expect(result.major).toBeNull();
  });

  it("returns null for missing minor/patch components", () => {
    const result = deriveVersionComponents("5");
    expect(result).toEqual({ major: 5, minor: null, patch: null, suffix: null });
  });

  it("handles a suffix with multiple dashes", () => {
    const result = deriveVersionComponents("1.0.0-beta-2");
    expect(result.suffix).toBe("beta-2");
  });
});
