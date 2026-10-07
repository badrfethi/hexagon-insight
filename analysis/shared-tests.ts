import { posix } from "node:path";
import ts from "typescript";

/**
 * A code file outside `src/` and outside every suite's folder that only the suites import: what
 * they share, such as the real Briefs in `fixtures/` that both hold a supplier to.
 *
 * Found by who imports it rather than by where it is, so there is no list of shared folders to keep:
 * a file only tests use is drawn on Tests, and one the product also imports is not test code. A file
 * nothing imports stays on the Map's strip, where something unexplained is meant to show.
 */
export interface SharedTestFile {
  /** Relative to the root, such as `fixtures/brief-documents.ts`. */
  readonly path: string;
  /** The suites' folders that import it, in the order `tests` gave them. */
  readonly usedBy: readonly string[];
}

/** `tests` is the folders a kind of test lives in (`test-kinds.ts`). */
export function sharedTestFiles(
  root: string,
  program: ts.Program,
  files: readonly ts.SourceFile[],
  tests: readonly string[],
): readonly SharedTestFile[] {
  const importers = importersOf(root, program, files);

  return [...importers]
    .filter(([path]) => !path.startsWith("src/") && folderOf(tests, path) === undefined)
    .flatMap(([path, by]) => sharedOf(tests, path, by))
    .sort((one, other) => one.path.localeCompare(other.path));
}

function sharedOf(
  tests: readonly string[],
  path: string,
  importers: readonly string[],
): readonly SharedTestFile[] {
  const folders = importers.map((importer) => folderOf(tests, importer));

  return folders.includes(undefined)
    ? []
    : [{ path, usedBy: tests.filter((folder) => folders.includes(folder)) }];
}

function folderOf(tests: readonly string[], path: string): string | undefined {
  return tests.find((folder) => path.startsWith(`${folder}/`));
}

/** Each of the repository's files that another imports, to the files importing it. */
function importersOf(
  root: string,
  program: ts.Program,
  files: readonly ts.SourceFile[],
): ReadonlyMap<string, readonly string[]> {
  const importers = new Map<string, string[]>();

  for (const file of files) {
    const from = posix.relative(root, file.fileName);

    for (const path of importedBy(root, program, file)) {
      importers.set(path, [...(importers.get(path) ?? []), from]);
    }
  }

  return importers;
}

/** The repository files one file imports or re-exports from, relative to the root. */
function importedBy(root: string, program: ts.Program, file: ts.SourceFile): readonly string[] {
  return file.statements
    .flatMap((statement) => specifierOf(statement) ?? [])
    .flatMap((specifier) => resolved(program, specifier, file.fileName) ?? [])
    .filter((fileName) => !fileName.includes("/node_modules/"))
    .map((fileName) => posix.relative(root, fileName));
}

function specifierOf(statement: ts.Statement): string | undefined {
  return ts.isImportDeclaration(statement) || ts.isExportDeclaration(statement)
    ? textOf(statement.moduleSpecifier)
    : undefined;
}

function textOf(specifier: ts.Expression | undefined): string | undefined {
  return specifier !== undefined && ts.isStringLiteral(specifier) ? specifier.text : undefined;
}

function resolved(program: ts.Program, specifier: string, from: string): string | undefined {
  return ts.resolveModuleName(specifier, from, program.getCompilerOptions(), ts.sys).resolvedModule
    ?.resolvedFileName;
}
