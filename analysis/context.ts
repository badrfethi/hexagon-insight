import { type Block, blocksOf, CORE, coreOf } from "./blocks.js";
import type { CodeFile, Declaration, FeatureText, Model } from "./model.js";
import { type OutsideBlock, outsideBlocks } from "./outside.js";
import { type SharedTestFile, sharedTestFiles } from "./shared-tests.js";
import { testKinds } from "./test-kinds.js";

/**
 * Everything one load of the page has read, shared by every part of the analysis so that nothing
 * reads the target twice.
 *
 * It is built from one model (`model.ts`), fresh for each load, and thrown away after it: insight
 * shows the working tree now, and stores nothing (#74, decision 4). `memo` is the place for anything
 * expensive a second caller would otherwise compute again — the parsed contract features — and it
 * lives only as long as the load does.
 */
export interface AnalysisContext {
  readonly model: Model;
  readonly blocks: readonly Block[];
  /** A block per file of `src/core`, when there is one (`coreOf`): not in `blocks`, and not outside. */
  readonly core: readonly Block[];
  /**
   * The catch-all blocks under the columns: every file git lists, code or not, that is in no
   * block's folder, not in the core and not on Tests, test code included, gathered by folder
   * (`outside.ts`). They are kept apart from `blocks` because they are not groups: the rules are not
   * asked of them and no arrow starts or ends at one.
   */
  readonly outside: readonly OutsideBlock[];
  /** What the suites share and nothing else imports, drawn on Tests rather than the strip. */
  readonly sharedTests: readonly SharedTestFile[];
  /** The files the reader compiled, in path order: those whose declarations and imports are read. */
  readonly compiled: readonly CodeFile[];
  /** Every file the reader lists as code, by path, in path order. */
  readonly listed: readonly string[];
  /**
   * A strip file's size and externals: a code file's own (`CodeFile`), and for any other file git
   * lists — docs, configuration, data — its non-blank lines and no externals (`Layout.tracked`).
   */
  measure(path: string): Measure;
  /** A file the model holds, by its path; one it does not hold is a reader's mistake, and throws. */
  file(path: string): CodeFile;
  /** A file the reader compiled, by its path, if it did. */
  fileAt(path: string): CodeFile | undefined;
  /** A declaration by its id; one the model names but does not declare throws. */
  declaration(id: string): Declaration;
  /** A feature's text by its path, if the model holds it (`Layout.features`). */
  featureAt(path: string): FeatureText | undefined;
  /** The block a file belongs to, or `undefined` for code outside every group. */
  blockOf(path: string): Block | undefined;
  /** The block's own compiled files, in path order. */
  filesOf(block: Block): readonly CodeFile[];
  /** The names directly in the block's folder, files and folders. */
  entriesOf(block: Block): readonly string[];
  /** Computes a value once per load under `key`, and hands back the same value after that. */
  memo<T>(key: string, compute: () => T): T;
}

/** What a block's size and externals are summed from (`map.ts`). */
export type Measure = Pick<CodeFile, "linesOfCode" | "externals">;

export function contextOf(model: Model): AnalysisContext {
  const blocks = blocksOf(model.groups);
  const files = new Map(model.files.map((file) => [file.path, file] as const));
  const declarations = new Map(model.declarations.map((found) => [found.id, found] as const));
  const features = new Map(model.features.map((feature) => [feature.path, feature] as const));
  const entries = new Map(model.groups.map((group) => [group.path, group.entries] as const));
  const compiled = model.files
    .filter((file) => file.compiled)
    .sort((one, other) => one.path.localeCompare(other.path));
  const listed = model.files
    .filter((file) => file.listed)
    .map((file) => file.path)
    .sort();
  const cache = new Map<string, unknown>();
  const blockOf = (path: string): Block | undefined =>
    blocks.find((block) => path.startsWith(`${block.directory}/`));
  const tests = testKinds(model).map(({ folder }) => folder);
  const sharedTests = sharedTestFiles(compiled, tests);
  const lines = new Map(model.tracked.map(({ path, lines }) => [path, lines] as const));
  const core = coreOf(model.folders.find(({ path }) => path === "src")?.folders ?? [], listed);
  // Every file has a home: a block's folder, the core, Tests (a test folder, or a file the suites
  // share), or else the strip, code or not (`Layout.tracked`). Test code outside the test folders is
  // on the strip too, where the layout rule names it if it uses the application (Rule 5).
  const outside = outsideBlocks(
    [...new Set([...listed, ...lines.keys()])].sort(),
    blocks,
    [
      ...(core.length > 0 ? [`${CORE}/`] : []),
      ...tests.map((folder) => `${folder}/`),
      ...sharedTests.map(({ path }) => path),
    ],
  );

  return {
    model,
    blocks,
    core,
    outside,
    sharedTests,
    compiled,
    listed,
    measure: (path) =>
      files.get(path) ?? { linesOfCode: lines.get(path) ?? missing(`the file ${path}`), externals: [] },
    file: (path) => files.get(path) ?? missing(`the file ${path}`),
    fileAt: (path) => {
      const file = files.get(path);

      return file?.compiled === true ? file : undefined;
    },
    declaration: (id) => declarations.get(id) ?? missing(`the declaration ${id}`),
    featureAt: (path) => features.get(path),
    blockOf,
    filesOf: (block) => compiled.filter((file) => blockOf(file.path) === block),
    entriesOf: (block) => entries.get(block.directory) ?? [],
    memo: <T>(key: string, compute: () => T): T => remembered(cache, key, compute),
  };
}

function missing(what: string): never {
  throw new Error(`The model names ${what}, but does not hold it`);
}

function remembered<T>(cache: Map<string, unknown>, key: string, compute: () => T): T {
  if (!cache.has(key)) {
    cache.set(key, compute());
  }

  return cache.get(key) as T;
}

/**
 * Whether a path is inside a folder of that name anywhere along it, such as `incoming_ports`: what
 * makes an interface a port. Matched with a slash on each side, so `ports` is not `incoming_ports`.
 */
export function inFolder(path: string, name: string): boolean {
  return `/${path}`.includes(`/${name}/`);
}
