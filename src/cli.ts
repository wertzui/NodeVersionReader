import { dirname } from "node:path";
import { Command, Option } from "commander";
import { isOutputFormat, OUTPUT_FORMATS, type OutputFormat } from "./models/outputFormat.js";
import type { PackageVersionInfo } from "./models/packageVersionInfo.js";
import type { CheckResult, CheckResultStatus } from "./models/checkResult.js";
import { FilterError, FilterParser, type ParsedFilter } from "./services/filterParser.js";
import { PackageJsonLocator } from "./services/packageJsonLocator.js";
import { PackageJsonParser } from "./services/packageJsonParser.js";
import { DependencyGraphService } from "./services/dependencyGraphService.js";
import { DiffService } from "./services/diffService.js";
import { GitService } from "./services/gitService.js";
import { Formatter, checkOptions, diffOptions, readOptions } from "./services/formatter.js";
import { JsonSchemaProvider } from "./services/jsonSchemaProvider.js";

// ---------------------------------------------------------------------------
// Shared option factories
// ---------------------------------------------------------------------------

function addInputOption(command: Command): Command {
  return command.option("-i, --input <path>", "Path to a package.json file or a folder. Defaults to the current directory.");
}

function addOutputOption(command: Command): Command {
  return command
    .addOption(
      new Option("-o, --output <format>", "Output format: json (default), table, list, or version (single package only).")
        .choices(OUTPUT_FORMATS)
        .default("json"),
    );
}

function addFilterOption(command: Command): Command {
  return command.option(
    "-f, --filter <keyValue>",
    "Filter in the form 'key=value' (value may be a regex). Can be specified multiple times.",
    (value: string, previous: string[] | undefined) => [...(previous ?? []), value],
  );
}

function addBaseRefOption(command: Command): Command {
  return command.option("-b, --base <ref>", "The git ref to compare against.", "origin/main");
}

function addHeadRefOption(command: Command): Command {
  return command.option("--head <ref>", "The git ref representing the current state.", "HEAD");
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function fail(message: string, exitCode: number): never {
  console.error(`Error: ${message}`);
  process.exit(exitCode);
}

function parseFilters(filters: string[] | undefined): ParsedFilter[] {
  try {
    return new FilterParser().parse(filters ?? []);
  } catch (error) {
    if (error instanceof FilterError) fail(error.message, 2);
    throw error;
  }
}

function validateOutputFormat(output: string): OutputFormat {
  if (!isOutputFormat(output)) {
    fail(`Invalid output format: ${output}. Expected one of: ${OUTPUT_FORMATS.join(", ")}`, 2);
  }
  return output;
}

/**
 * Locates package.json files from `input` and applies `parsedFilters`.
 * Returns the matching file list, or exits with code 2 if none were found and `requireNonEmpty`.
 */
function locateAndFilter(
  input: string | undefined,
  parsedFilters: readonly ParsedFilter[],
  requireNonEmpty: boolean,
): string[] {
  let files: string[];
  try {
    files = new PackageJsonLocator().locate(input ?? null);
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error), 2);
  }

  if (parsedFilters.length > 0) {
    const parser = new PackageJsonParser();
    files = files.filter((f) => parser.parseWithFilters(f, parsedFilters) !== null);
  }

  if (requireNonEmpty && files.length === 0) {
    fail("No package.json files found matching the specified filters.", 2);
  }

  return files;
}

// ---------------------------------------------------------------------------
// `read` command (default: read / display versions)
// ---------------------------------------------------------------------------

interface ReadCliOptions {
  input?: string;
  output: string;
  filter?: string[];
  schema?: boolean;
}

function runRead(options: ReadCliOptions): void {
  if (options.schema) {
    console.log(new JsonSchemaProvider().getSchema());
    return;
  }

  const output = validateOutputFormat(options.output);
  const parsedFilters = parseFilters(options.filter);
  const files = locateAndFilter(options.input, parsedFilters, false);

  const parser = new PackageJsonParser();
  const formatter = new Formatter();

  const results: PackageVersionInfo[] = [];
  for (const file of files) {
    const info = parsedFilters.length > 0 ? parser.parseWithFilters(file, parsedFilters) : parser.parse(file);
    if (info) results.push(info);
  }

  let formatted: string;
  try {
    formatted = formatter.format(results, output, readOptions);
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error), 2);
  }

  console.log(formatted);
}

// ---------------------------------------------------------------------------
// `check` command (verify version bumps in a PR / branch diff)
// ---------------------------------------------------------------------------

interface CheckCliOptions {
  input?: string;
  base: string;
  head: string;
  output: string;
  filter?: string[];
}

function runCheck(options: CheckCliOptions): void {
  const output = validateOutputFormat(options.output);
  const parser = new PackageJsonParser();
  const graphSvc = new DependencyGraphService();
  const gitSvc = new GitService(parser);
  const formatter = new Formatter();

  const parsedFilters = parseFilters(options.filter);
  const files = locateAndFilter(options.input, parsedFilters, true);

  let repoRoot: string;
  try {
    const anyProjectDir = dirname(files[0] as string) || process.cwd();
    repoRoot = gitSvc.getRepositoryRoot(anyProjectDir);
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error), 2);
  }

  let changedFiles: string[];
  try {
    changedFiles = gitSvc.getChangedFiles(options.base, options.head, repoRoot);
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error), 2);
  }

  const graph = graphSvc.build(files);
  const affectedProjects = graphSvc.getAffectedProjects(changedFiles, graph);

  const results: CheckResult[] = [];
  for (const node of affectedProjects) {
    const headInfo = parser.parse(node.packageJsonPath);
    if (!headInfo) continue;

    const headVersion = headInfo.resolvedVersion;
    const baseVersion = gitSvc.getVersionAtRef(options.base, node.packageJsonPath, repoRoot);

    let status: CheckResultStatus;
    if (baseVersion === null) {
      status = "NewProject";
    } else if (headVersion.toLowerCase() === baseVersion.toLowerCase()) {
      status = "BumpRequired";
    } else {
      status = "Ok";
    }

    results.push({ name: headInfo.name, filePath: node.packageJsonPath, headVersion, baseVersion, status });
  }

  let formatted: string;
  try {
    formatted = formatter.format(results, output, checkOptions);
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error), 1);
  }

  console.log(formatted);

  if (results.some((r) => r.status === "BumpRequired")) {
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// `diff` command (show version changes relative to a base branch)
// ---------------------------------------------------------------------------

interface DiffCliOptions {
  input?: string;
  base: string;
  head: string;
  output: string;
  filter?: string[];
}

function runDiff(options: DiffCliOptions): void {
  const output = validateOutputFormat(options.output);
  const parser = new PackageJsonParser();
  const graphSvc = new DependencyGraphService();
  const gitSvc = new GitService(parser);
  const diffSvc = new DiffService();
  const formatter = new Formatter();

  const parsedFilters = parseFilters(options.filter);
  const files = locateAndFilter(options.input, parsedFilters, true);

  let repoRoot: string;
  try {
    const anyProjectDir = dirname(files[0] as string) || process.cwd();
    repoRoot = gitSvc.getRepositoryRoot(anyProjectDir);
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error), 2);
  }

  let changedFiles: string[];
  try {
    changedFiles = gitSvc.getChangedFiles(options.base, options.head, repoRoot);
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error), 2);
  }

  const graph = graphSvc.build(files);
  const affectedProjects = graphSvc.getAffectedProjects(changedFiles, graph);

  const headInfoByName = new Map<string, { filePath: string; headVersion: string }>();
  for (const node of affectedProjects) {
    const headInfo = parser.parse(node.packageJsonPath);
    if (!headInfo) continue;
    headInfoByName.set(headInfo.name, { filePath: node.packageJsonPath, headVersion: headInfo.resolvedVersion });
  }

  const results = diffSvc.buildResults(
    [...headInfoByName.entries()].map(([name, v]) => ({ name, filePath: v.filePath })),
    (name) => headInfoByName.get(name)?.headVersion ?? null,
    (name) => {
      const entry = headInfoByName.get(name);
      return entry ? gitSvc.getVersionAtRef(options.base, entry.filePath, repoRoot) : null;
    },
  );

  let formatted: string;
  try {
    formatted = formatter.format(results, output, diffOptions);
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error), 2);
  }

  console.log(formatted);
}

// ---------------------------------------------------------------------------
// Program assembly
// ---------------------------------------------------------------------------

const program = new Command();

program
  .name("node-version")
  .description("Reads and checks version information from package.json files.");

const readCommand = program
  .command("read", { isDefault: true })
  .description("Reads and displays version information from package.json files. This is the default command.")
  .option("--schema", "Print the JSON schema for the --output json format and exit.", false)
  .action((options: ReadCliOptions) => runRead(options));
addInputOption(readCommand);
addOutputOption(readCommand);
addFilterOption(readCommand);

const checkCommand = program
  .command("check")
  .description(
    "Checks that every package whose source files have changed (relative to --base) has had its version bumped. Exits with code 1 if any package requires a bump, code 2 on usage errors.",
  )
  .action((options: CheckCliOptions) => runCheck(options));
addInputOption(checkCommand);
addBaseRefOption(checkCommand);
addHeadRefOption(checkCommand);
addOutputOption(checkCommand);
addFilterOption(checkCommand);

const diffCommand = program
  .command("diff")
  .description(
    "Shows packages whose version has changed (or that are new) relative to --base. Does not exit with a non-zero code based on results.",
  )
  .action((options: DiffCliOptions) => runDiff(options));
addInputOption(diffCommand);
addBaseRefOption(diffCommand);
addHeadRefOption(diffCommand);
addOutputOption(diffCommand);
addFilterOption(diffCommand);

program.parseAsync(process.argv).catch((error: unknown) => {
  console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(2);
});
