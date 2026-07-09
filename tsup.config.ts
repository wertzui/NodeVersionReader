import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    cli: "src/cli.ts",
    index: "src/index.ts",
  },
  format: ["esm"],
  target: "es2022",
  platform: "node",
  dts: {
    entry: {
      cli: "src/cli.ts",
      index: "src/index.ts",
    },
  },
  tsconfig: "tsconfig.build.json",
  sourcemap: true,
  clean: true,
  splitting: false,
  banner: ({ entry }) => (entry?.name === "cli" ? { js: "#!/usr/bin/env node" } : {}),
});
