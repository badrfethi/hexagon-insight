import type { Block } from "./blocks.js";

/**
 * A block in the row under the columns: code that belongs to no group (#74, decision 20).
 *
 * The operator must be able to see everything, and every other block on the map is a group, an
 * adapter, so without this row `src/index.ts`, `src/config.ts` and the tools themselves would
 * appear nowhere. The row is a **catch-all, gathered by construction**: every file git lists, code
 * or not (`Layout.tracked`), is either inside a block, a file of the core, drawn on Tests — in a
 * suite's folder, or a file only the suites import (`tests.ts`, `shared-tests.ts`) — or inside one
 * of these, so something unfamiliar showing up here is a finding about the design rather than a
 * gap in the map.
 *
 * So there is no list of the blocks to keep up to date. The files are what git tracks and does not
 * ignore, which leaves out `node_modules/`, `dist/` and a run's media, and each is gathered under
 * the folder it sits in (`outsideId`). A file that fits no grouping becomes a block of its own
 * under its own path; nothing is dropped.
 */
export interface OutsideBlock extends Block {
  /** Its files, relative to the root, in path order. It owns no directory. */
  readonly files: readonly string[];
}

/**
 * `listed` is every file git lists but the core's, in path order. `onTests` is what Tests draws,
 * relative to the root: each suite's folder with its trailing slash, and each file the suites
 * share. It is left off the map rather than drawn twice.
 */
export function outsideBlocks(
  listed: readonly string[],
  blocks: readonly Block[],
  onTests: readonly string[],
): readonly OutsideBlock[] {
  const loose = listed.filter(
    (path) => !drawnOnTests(onTests, path) && blockHolding(blocks, path) === undefined,
  );
  const gathered = new Map<string, string[]>();

  for (const path of loose) {
    const id = outsideId(path);
    gathered.set(id, [...(gathered.get(id) ?? []), path]);
  }

  return [...gathered.entries()]
    .sort(([one], [other]) => one.localeCompare(other))
    .map(([id, files]) => blockOf(id, files));
}

function blockOf(id: string, files: readonly string[]): OutsideBlock {
  return { id, name: id, column: "outside", directory: id, files };
}

function drawnOnTests(onTests: readonly string[], path: string): boolean {
  return onTests.some((drawn) => (drawn.endsWith("/") ? path.startsWith(drawn) : path === drawn));
}

function blockHolding(blocks: readonly Block[], path: string): Block | undefined {
  return blocks.find((block) => path.startsWith(`${block.directory}/`));
}

/**
 * Where a file outside every group is gathered: the folder that means something to a reader.
 *
 * A file is gathered under its top folder, one folder deep, except under `src/` and `tools/`, which
 * go two deep: each tool is its own program, and `src/adapters` is not `src/infrastructure`. A file
 * shallower than that depth stands alone under its own path, which is what makes the composition
 * root, `src/config.ts` and each tool's configuration a block of its own.
 */
const DEPTH: Readonly<Record<string, number>> = { src: 2, tools: 2 };

function outsideId(path: string): string {
  const segments = path.split("/");
  const depth = DEPTH[segments[0] ?? ""] ?? 1;

  return segments.length <= depth ? path : segments.slice(0, depth).join("/");
}
