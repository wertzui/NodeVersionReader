import { describe, expect, it } from "vitest";
import { isOutputFormat, OUTPUT_FORMATS } from "../../src/models/outputFormat.js";

describe("isOutputFormat", () => {
  it("accepts all known formats", () => {
    for (const format of OUTPUT_FORMATS) {
      expect(isOutputFormat(format)).toBe(true);
    }
  });

  it("rejects unknown values", () => {
    expect(isOutputFormat("yaml")).toBe(false);
    expect(isOutputFormat("")).toBe(false);
  });
});
