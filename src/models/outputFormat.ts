/**
 * Supported output formats for all commands.
 */
export type OutputFormat = "json" | "table" | "list" | "version";

/**
 * All valid {@link OutputFormat} values, useful for CLI validation / help text.
 */
export const OUTPUT_FORMATS: readonly OutputFormat[] = ["json", "table", "list", "version"];

export function isOutputFormat(value: string): value is OutputFormat {
  return (OUTPUT_FORMATS as readonly string[]).includes(value);
}
