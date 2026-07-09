/**
 * In-memory `package.json` content strings used by the unit tests.
 * Mirrors the .NET `CsprojFixtures` test fixtures.
 */
export const packageJsonFixtures = {
  withVersionOnly: (name = "my-app"): string =>
    JSON.stringify({ name, version: "3.2.1" }, null, 2),

  withNoVersion: (name = "no-version-app"): string =>
    JSON.stringify({ name }, null, 2),

  withPrereleaseVersion: (name = "core", version = "1.2.3-rc.2"): string =>
    JSON.stringify({ name, version }, null, 2),

  withPrivateTrue: (name = "packable", version = "1.0.0"): string =>
    JSON.stringify({ name, version, private: true }, null, 2),

  withPrivateFalse: (name = "not-packable", version = "2.0.0"): string =>
    JSON.stringify({ name, version, private: false }, null, 2),

  withNestedField: (name = "nested", version = "5.0.0"): string =>
    JSON.stringify(
      {
        name,
        version,
        publishConfig: {
          access: "public",
        },
      },
      null,
      2,
    ),

  withEngineNode18: (name = "node18-app", version = "4.0.0"): string =>
    JSON.stringify({ name, version, engines: { node: ">=18" } }, null, 2),

  library: (name: string, version = "1.0.0"): string => JSON.stringify({ name, version }, null, 2),

  withDependency: (name: string, dependencyName: string, dependencyVersion = "1.0.0", version = "1.0.0"): string =>
    JSON.stringify(
      {
        name,
        version,
        dependencies: {
          [dependencyName]: dependencyVersion,
        },
      },
      null,
      2,
    ),

  malformedJson: "{ this is not valid JSON ",
};
