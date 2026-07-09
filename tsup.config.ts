import { defineConfig } from "tsup";

// Two separate build steps (rather than a single multi-entry build) so the `#!/usr/bin/env node`
// shebang banner can be applied ONLY to cli.js. tsup/esbuild apply `banner` to every output file
// produced by a single build call, so a shared entry/banner config would also (incorrectly)
// prepend the shebang to index.js, the importable library entry point.
export default defineConfig([
  {
    entry: { cli: "src/cli.ts" },
    format: ["esm"],
    target: "es2022",
    platform: "node",
    dts: { entry: { cli: "src/cli.ts" } },
    tsconfig: "tsconfig.build.json",
    sourcemap: true,
    clean: true,
    splitting: false,
    banner: { js: "#!/usr/bin/env node" },
  },
  {
    entry: { index: "src/index.ts" },
    format: ["esm"],
    target: "es2022",
    platform: "node",
    dts: { entry: { index: "src/index.ts" } },
    tsconfig: "tsconfig.build.json",
    sourcemap: true,
    clean: false,
    splitting: false,
  },
]);
