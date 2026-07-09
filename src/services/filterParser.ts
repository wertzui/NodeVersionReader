/**
 * Thrown when a raw filter string cannot be parsed (missing separator, empty key, or an
 * invalid regular expression).
 */
export class FilterError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "FilterError";
  }
}

/** A single parsed filter: a JSON key to look for and a regex the value must match. */
export interface ParsedFilter {
  readonly key: string;
  readonly pattern: RegExp;
}

/**
 * Parses filter strings of the form `Key=Value` where `Value` may be a regex.
 * Mirrors the .NET `FilterParser`, adapted from XML element names to JSON keys.
 */
export class FilterParser {
  /**
   * Parses a collection of raw filter strings and returns typed {@link ParsedFilter} objects.
   *
   * @param rawFilters Each string must be in the form `key=regex`.
   * @throws {FilterError} When a filter string has no `=` separator, an empty key, or an
   * invalid regular expression.
   */
  public parse(rawFilters: readonly string[]): ParsedFilter[] {
    const result: ParsedFilter[] = [];

    for (const raw of rawFilters) {
      const idx = raw.indexOf("=");
      if (idx <= 0) {
        throw new FilterError(`Invalid filter '${raw}'. Expected format: key=value`);
      }

      const key = raw.slice(0, idx).trim();
      const patternStr = raw.slice(idx + 1);

      let pattern: RegExp;
      try {
        pattern = new RegExp(patternStr, "i");
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new FilterError(`Invalid regex in filter '${raw}': ${message}`);
      }

      result.push({ key, pattern });
    }

    return result;
  }
}
