/**
 * Returns the JSON Schema that describes the `--output json` output of the `read` command.
 */
export class JsonSchemaProvider {
  /** Returns the schema as an indented JSON string. */
  public getSchema(): string {
    const schema = {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      title: "NodeVersionReader output",
      description: "Array of package version entries produced by node-version --output json.",
      type: "array",
      items: {
        type: "object",
        required: ["name", "version"],
        additionalProperties: false,
        properties: {
          name: {
            type: "string",
            description: "The package name.",
          },
          version: {
            type: "string",
            description: "The resolved version string.",
          },
          major: {
            type: ["integer", "null"],
            description: "Major version component.",
          },
          minor: {
            type: ["integer", "null"],
            description: "Minor version component.",
          },
          patch: {
            type: ["integer", "null"],
            description: "Patch version component.",
          },
          suffix: {
            type: ["string", "null"],
            description: "Pre-release suffix (everything after the first '-'), or null.",
          },
        },
      },
    };

    return JSON.stringify(schema, null, 2);
  }
}
