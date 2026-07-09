import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DependencyGraphService, normalizePath } from "../../src/services/dependencyGraphService.js";
import { packageJsonFixtures } from "../fixtures/packageJsonFixtures.js";
import { TempFileHelper } from "../helpers/tempFileHelper.js";

describe("DependencyGraphService", () => {
  let tmp: TempFileHelper;
  const svc = new DependencyGraphService();

  beforeEach(() => {
    tmp = new TempFileHelper();
  });

  afterEach(() => {
    tmp.dispose();
  });

  describe("build", () => {
    it("creates a node for every input package.json", () => {
      const a = tmp.createPackageJson(packageJsonFixtures.library("pkg-a"), "pkg-a");
      const b = tmp.createPackageJson(packageJsonFixtures.library("pkg-b"), "pkg-b");

      const graph = svc.build([a, b]);

      expect(graph.nodes.size).toBe(2);
    });

    it("resolves a dependency reference between two local packages by name", () => {
      const lib = tmp.createPackageJson(packageJsonFixtures.library("my-lib"), "my-lib");
      const app = tmp.createPackageJson(
        packageJsonFixtures.withDependency("my-app", "my-lib", "1.0.0"),
        "my-app",
      );

      const graph = svc.build([lib, app]);
      const appNode = graph.nodes.get(normalizePath(app));

      expect(appNode?.directDependencyReferences).toContain(normalizePath(lib));
    });

    it("builds reverse dependency map", () => {
      const lib = tmp.createPackageJson(packageJsonFixtures.library("my-lib"), "my-lib");
      const app = tmp.createPackageJson(
        packageJsonFixtures.withDependency("my-app", "my-lib", "1.0.0"),
        "my-app",
      );

      const graph = svc.build([lib, app]);
      const dependents = graph.reverseDependencies.get(normalizePath(lib));

      expect(dependents).toContain(normalizePath(app));
    });
  });

  describe("getAffectedProjects", () => {
    it("includes a package whose own package.json changed", () => {
      const a = tmp.createPackageJson(packageJsonFixtures.library("pkg-a"), "pkg-a");
      const graph = svc.build([a]);

      const affected = svc.getAffectedProjects([a], graph);

      expect(affected.map((n) => n.packageJsonPath)).toContain(normalizePath(a));
    });

    it("includes a package when a file it owns changed", () => {
      const a = tmp.createPackageJson(packageJsonFixtures.library("pkg-a"), "pkg-a");
      const srcFile = a.replace("package.json", "index.js");
      const graph = svc.build([a]);

      const affected = svc.getAffectedProjects([srcFile], graph);

      expect(affected).toHaveLength(1);
    });

    it("transitively marks dependents as affected", () => {
      const lib = tmp.createPackageJson(packageJsonFixtures.library("my-lib"), "my-lib");
      const app = tmp.createPackageJson(
        packageJsonFixtures.withDependency("my-app", "my-lib", "1.0.0"),
        "my-app",
      );
      const graph = svc.build([lib, app]);

      const affected = svc.getAffectedProjects([lib], graph);
      const paths = affected.map((n) => n.packageJsonPath);

      expect(paths).toContain(normalizePath(lib));
      expect(paths).toContain(normalizePath(app));
    });

    it("does not mark unrelated packages as affected", () => {
      const a = tmp.createPackageJson(packageJsonFixtures.library("pkg-a"), "pkg-a");
      const b = tmp.createPackageJson(packageJsonFixtures.library("pkg-b"), "pkg-b");
      const graph = svc.build([a, b]);

      const affected = svc.getAffectedProjects([a], graph);

      expect(affected.map((n) => n.packageJsonPath)).not.toContain(normalizePath(b));
    });

    it("excludes changes under node_modules from ownership", () => {
      const a = tmp.createPackageJson(packageJsonFixtures.library("pkg-a"), "pkg-a");
      const graph = svc.build([a]);
      const nodeModulesFile = a.replace("package.json", "node_modules/dep/index.js");

      const affected = svc.getAffectedProjects([nodeModulesFile], graph);

      expect(affected).toHaveLength(0);
    });
  });
});
