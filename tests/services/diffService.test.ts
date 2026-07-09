import { describe, expect, it } from "vitest";
import { DiffService } from "../../src/services/diffService.js";

describe("DiffService", () => {
  const svc = new DiffService();

  it("marks a package as Bumped when versions differ", () => {
    const results = svc.buildResults(
      [{ name: "my-lib", filePath: "/a/package.json" }],
      () => "2.0.0",
      () => "1.0.0",
    );

    expect(results).toEqual([
      { name: "my-lib", filePath: "/a/package.json", headVersion: "2.0.0", baseVersion: "1.0.0", status: "Bumped" },
    ]);
  });

  it("marks a package as NewProject when there is no base version", () => {
    const results = svc.buildResults(
      [{ name: "new-lib", filePath: "/a/package.json" }],
      () => "1.0.0",
      () => null,
    );

    expect(results[0]?.status).toBe("NewProject");
    expect(results[0]?.baseVersion).toBeNull();
  });

  it("omits packages whose version is unchanged", () => {
    const results = svc.buildResults(
      [{ name: "same-lib", filePath: "/a/package.json" }],
      () => "1.0.0",
      () => "1.0.0",
    );

    expect(results).toHaveLength(0);
  });

  it("skips packages that cannot be parsed at head", () => {
    const results = svc.buildResults(
      [{ name: "broken-lib", filePath: "/a/package.json" }],
      () => null,
      () => "1.0.0",
    );

    expect(results).toHaveLength(0);
  });

  it("compares version equality case-insensitively", () => {
    const results = svc.buildResults(
      [{ name: "case-lib", filePath: "/a/package.json" }],
      () => "1.0.0-RC",
      () => "1.0.0-rc",
    );

    expect(results).toHaveLength(0);
  });
});
