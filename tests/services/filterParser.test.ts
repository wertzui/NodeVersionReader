import { describe, expect, it } from "vitest";
import { FilterError, FilterParser } from "../../src/services/filterParser.js";

describe("FilterParser", () => {
  const parser = new FilterParser();

  it("parses a single simple filter", () => {
    const result = parser.parse(["private=true"]);
    expect(result).toHaveLength(1);
    expect(result[0]?.key).toBe("private");
    expect(result[0]?.pattern.test("true")).toBe(true);
  });

  it("parses multiple filters", () => {
    const result = parser.parse(["engines.node=>=18", "private=true"]);
    expect(result).toHaveLength(2);
  });

  it("compiles the value as a regex", () => {
    const result = parser.parse(["version=^1\\.[0-9]+\\.0$"]);
    expect(result[0]?.pattern.test("1.2.0")).toBe(true);
    expect(result[0]?.pattern.test("2.2.0")).toBe(false);
  });

  it("returns an empty list for an empty input", () => {
    expect(parser.parse([])).toHaveLength(0);
  });

  it("splits on the first equals sign only", () => {
    const result = parser.parse(["myProp=a=b"]);
    expect(result[0]?.key).toBe("myProp");
    expect(result[0]?.pattern.test("a=b")).toBe(true);
  });

  it("matches case-insensitively", () => {
    const result = parser.parse(["private=TRUE"]);
    expect(result[0]?.pattern.test("true")).toBe(true);
    expect(result[0]?.pattern.test("True")).toBe(true);
    expect(result[0]?.pattern.test("TRUE")).toBe(true);
  });

  it("throws a FilterError when there is no equals sign", () => {
    expect(() => parser.parse(["noequalshere"])).toThrow(FilterError);
  });

  it("throws a FilterError when the key is empty", () => {
    expect(() => parser.parse(["=value"])).toThrow(FilterError);
  });

  it("throws a FilterError for an invalid regex", () => {
    expect(() => parser.parse(["key=("])).toThrow(FilterError);
  });
});
