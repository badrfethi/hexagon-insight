import { posix } from "node:path";
import ts from "typescript";
import { type Block, discoverBlocks } from "./blocks.js";
import { type OutsideBlock, outsideBlocks } from "./outside.js";
import { type SharedTestFile, sharedTestFiles } from "./shared-tests.js";
import { testKinds } from "./test-kinds.js";

/**
 * Everything one load of the page has read, shared by every part of the analysis so that nothing
 * parses the working tree twice.
 *
 * It is built fresh for each load and thrown away after it: insight shows the working tree now, and
 * stores nothing (#74, decision 4). `memo` is the place for anything expensive a second caller
 * would otherwise compute again — the parsed contract features, a coverage run — and it lives only
 * as long as the load does.
 */
export interface AnalysisContext {
  /** The repository root, absolute, with forward slashes. */
  readonly root: string;
  /** One program over `tsconfig.check.json`: `src`, `features`, `contracts` and `tools`. */
  readonly program: ts.Program;
  readonly checker: ts.TypeChecker;
  readonly blocks: readonly Block[];
  /**
   * The catch-all blocks under the columns: every code file that belongs to no group and is not a
   * test, gathered by folder (`outside.ts`). They are kept apart from `blocks` because they are not
   * groups: the rules are not asked of them and no arrow starts or ends at one.
   */
  readonly outside: readonly OutsideBlock[];
  /** What the suites share and nothing else imports, drawn on Tests rather than the strip. */
  readonly sharedTests: readonly SharedTestFile[];
  /** The repository's own TypeScript files — no declaration files, nothing from `node_modules`. */
  readonly sourceFiles: readonly ts.SourceFile[];
  /** The block a file belongs to, or `undefined` for code outside every group. */
  blockOf(fileName: string): Block | undefined;
  /** The same, falling back to the catch-all block that holds the file, so nothing resolves to none. */
  anyBlockOf(fileName: string): Block | undefined;
  /** The block's own files, in path order. */
  filesOf(block: Block): readonly ts.SourceFile[];
  /** A file by its path relative to the root, if the program holds it. */
  fileAt(relativePath: string): ts.SourceFile | undefined;
  /** A file's path relative to the root, for display. */
  relative(fileName: string): string;
  /** Computes a value once per load under `key`, and hands back the same value after that. */
  memo<T>(key: string, compute: () => T): T;
}

export function createContext(root: string): AnalysisContext {
  const normalRoot = normal(root);
  const program = programFor(normalRoot);
  const blocks = discoverBlocks(normalRoot);
  const sourceFiles = program
    .getSourceFiles()
    .filter((file) => !file.isDeclarationFile && !file.fileName.includes("/node_modules/"))
    .sort((one, other) => one.fileName.localeCompare(other.fileName));
  const cache = new Map<string, unknown>();
  const relative = (fileName: string): string => posix.relative(normalRoot, normal(fileName));
  const blockOf = (fileName: string): Block | undefined =>
    blocks.find((block) => normal(fileName).startsWith(`${block.directory}/`));
  const tests = testKinds(normalRoot).flatMap(({ folder }) => folder ?? []);
  const sharedTests = sharedTestFiles(normalRoot, program, sourceFiles, tests);
  const outside = outsideBlocks(normalRoot, blocks, [
    ...tests.map((folder) => `${folder}/`),
    ...sharedTests.map(({ path }) => path),
  ]);
  const catchAll = new Map(outside.flatMap((block) => block.files.map((file) => [file, block])));

  return {
    root: normalRoot,
    program,
    checker: program.getTypeChecker(),
    blocks,
    outside,
    sharedTests,
    sourceFiles,
    blockOf,
    anyBlockOf: (fileName) => blockOf(fileName) ?? catchAll.get(normal(fileName)),
    filesOf: (block) => sourceFiles.filter((file) => blockOf(file.fileName) === block),
    fileAt: (path) => sourceFiles.find((file) => relative(file.fileName) === path),
    relative,
    memo: <T>(key: string, compute: () => T): T => remembered(cache, key, compute),
  };
}

function remembered<T>(cache: Map<string, unknown>, key: string, compute: () => T): T {
  if (!cache.has(key)) {
    cache.set(key, compute());
  }

  return cache.get(key) as T;
}

function programFor(root: string): ts.Program {
  const parsed = ts.getParsedCommandLineOfConfigFile(
    posix.join(root, "tsconfig.check.json"),
    {},
    { ...ts.sys, onUnRecoverableConfigFileDiagnostic: failOn },
  );

  if (parsed === undefined) {
    throw new Error("tsconfig.check.json could not be read");
  }

  return ts.createProgram(parsed.fileNames, parsed.options);
}

function failOn(diagnostic: ts.Diagnostic): never {
  throw new Error(ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"));
}

function normal(path: string): string {
  return path.replaceAll("\\", "/").replace(/\/$/, "");
}
