import type { CodeFile } from "./model.js";

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

/**
 * `files` is the files the reader compiled, in path order, whose imports are read
 * (`CodeFile.importedFiles`). `tests` is the folders a kind of test lives in (`test-kinds.ts`).
 */
export function sharedTestFiles(
  files: readonly CodeFile[],
  tests: readonly string[],
): readonly SharedTestFile[] {
  const importers = importersOf(files);

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
function importersOf(files: readonly CodeFile[]): ReadonlyMap<string, readonly string[]> {
  const importers = new Map<string, string[]>();

  for (const file of files) {
    for (const path of file.importedFiles) {
      importers.set(path, [...(importers.get(path) ?? []), file.path]);
    }
  }

  return importers;
}
