import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GitService } from "../../src/services/gitService.js";
import { PackageJsonParser } from "../../src/services/packageJsonParser.js";
import { normalizePath } from "../../src/services/dependencyGraphService.js";

function runGit(args: readonly string[], cwd: string): string {
  return execFileSync("git", args, { cwd, encoding: "utf8" });
}

function createInitializedRepo(files: ReadonlyArray<readonly [string, string]>): string {
  const dir = mkdtempSync(join(tmpdir(), "node-version-reader-git-"));
  runGit(["init", "-b", "main"], dir);
  runGit(["config", "user.email", "test@example.com"], dir);
  runGit(["config", "user.name", "Test"], dir);

  for (const [name, content] of files) {
    const filePath = join(dir, name);
    mkdirSync(join(filePath, ".."), { recursive: true });
    writeFileSync(filePath, content, "utf8");
  }

  if (files.length > 0) {
    runGit(["add", "."], dir);
    runGit(["commit", "-m", "initial"], dir);
  }

  return dir;
}

describe("GitService", () => {
  const svc = new GitService(new PackageJsonParser());
  const reposToDelete: string[] = [];

  beforeEach(() => {
    reposToDelete.length = 0;
  });

  afterEach(() => {
    for (const repo of reposToDelete) {
      try {
        rmSync(repo, { recursive: true, force: true });
      } catch {
        // best-effort cleanup
      }
    }
  });

  it("getRepositoryRoot returns the correct root from a subdirectory", () => {
    const repo = createInitializedRepo([["README.md", "initial"]]);
    reposToDelete.push(repo);
    const subDir = join(repo, "src", "lib");
    mkdirSync(subDir, { recursive: true });

    const root = svc.getRepositoryRoot(subDir);

    expect(normalizePath(root)).toBe(normalizePath(repo));
  });

  it("getChangedFiles returns modified files between two refs", () => {
    const repo = createInitializedRepo([["README.md", "initial"]]);
    reposToDelete.push(repo);

    runGit(["checkout", "-b", "feature"], repo);
    writeFileSync(join(repo, "README.md"), "updated", "utf8");
    runGit(["add", "."], repo);
    runGit(["commit", "-m", "update readme"], repo);

    const changed = svc.getChangedFiles("main", "HEAD", repo);

    expect(changed).toHaveLength(1);
    expect(changed[0]?.toLowerCase()).toContain("readme.md");
  });

  it("getChangedFiles includes untracked new files", () => {
    const repo = createInitializedRepo([["README.md", "initial"]]);
    reposToDelete.push(repo);

    writeFileSync(join(repo, "new-file.txt"), "new", "utf8");

    const changed = svc.getChangedFiles("main", "HEAD", repo);

    expect(changed.some((f) => f.includes("new-file.txt"))).toBe(true);
  });

  it("getVersionAtRef returns the resolved version from a ref", () => {
    const repo = createInitializedRepo([["package.json", JSON.stringify({ name: "lib", version: "1.0.0" })]]);
    reposToDelete.push(repo);
    const pkgPath = join(repo, "package.json");

    runGit(["checkout", "-b", "feature"], repo);
    writeFileSync(pkgPath, JSON.stringify({ name: "lib", version: "2.0.0" }), "utf8");
    runGit(["add", "."], repo);
    runGit(["commit", "-m", "bump"], repo);

    const version = svc.getVersionAtRef("main", pkgPath, repo);

    expect(version).toBe("1.0.0");
  });

  it("getVersionAtRef returns null when the file does not exist at that ref", () => {
    const repo = createInitializedRepo([["README.md", "initial"]]);
    reposToDelete.push(repo);
    const pkgPath = join(repo, "new-lib", "package.json");
    mkdirSync(join(repo, "new-lib"), { recursive: true });
    writeFileSync(pkgPath, JSON.stringify({ name: "new-lib", version: "1.0.0" }), "utf8");
    runGit(["add", "."], repo);
    runGit(["commit", "-m", "add new-lib"], repo);

    const version = svc.getVersionAtRef("HEAD~1", pkgPath, repo);

    expect(version).toBeNull();
  });
});
