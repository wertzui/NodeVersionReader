import { describe, expect, it } from "vitest";
import { JsonSchemaProvider } from "../../src/services/jsonSchemaProvider.js";

describe("JsonSchemaProvider", () => {
  it("returns valid, parseable JSON", () => {
    const schema = new JsonSchemaProvider().getSchema();
    expect(() => JSON.parse(schema)).not.toThrow();
  });

  it("describes an array of objects with the expected properties", () => {
    const schema = JSON.parse(new JsonSchemaProvider().getSchema());

    expect(schema.type).toBe("array");
    expect(schema.items.type).toBe("object");
    expect(schema.items.properties).toHaveProperty("name");
    expect(schema.items.properties).toHaveProperty("version");
    expect(schema.items.properties).toHaveProperty("major");
    expect(schema.items.properties).toHaveProperty("minor");
    expect(schema.items.properties).toHaveProperty("patch");
    expect(schema.items.properties).toHaveProperty("suffix");
  });
});
