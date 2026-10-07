import { execFileSync } from "node:child_process";
import { posix } from "node:path";
import type { Block } from "./blocks.js";

/**
 * A block in the row under the columns: code that belongs to no group (#74, decision 20).
 *
 * The operator must be able to see everything, and every other block on the map is a group, an
 * adapter, so without this row `src/index.ts`, `src/config.ts` and the tools themselves would
 * appear nowhere. The row is a **catch-all, gathered by construction**: every code file the
 * repository tracks is either inside a block, drawn on Tests — in a suite's folder, or a file only
 * the suites import (`tests.ts`, `shared-tests.ts`) — or inside one of these, so something unfamiliar showing up here is a finding about
 * the design rather than a gap in the map.
 *
 * So there is no list of the blocks to keep up to date. The files are read from git — tracked files
 * and untracked ones git does not ignore, which leaves out `node_modules/`, `dist/` and a run's
 * media — and each is gathered under the folder it sits in (`outsideId`). A file that fits no
 * grouping becomes a block of its own under its own path; nothing is dropped.
 */
export interface OutsideBlock extends Block {
  /** Its files, absolute with forward slashes, in path order. It owns no directory. */
  readonly files: readonly string[];
}

/**
 * What counts as code, and so as something the map must account for: the languages this repository
 * is written in. Markdown, workflows, JSON and lockfiles are documentation and configuration data,
 * not code with a shape worth drawing.
 */
const CODE = /\.(?:ts|mts|cts|js|mjs|cjs|html|feature)$/;

/**
 * `onTests` is what Tests draws, relative to the root: each suite's folder with its trailing slash,
 * and each file the suites share. It is left off the map rather than drawn twice.
 */
export function outsideBlocks(
  root: string,
  blocks: readonly Block[],
  onTests: readonly string[],
): readonly OutsideBlock[] {
  const loose = codeFiles(root).filter(
    (path) => !drawnOnTests(onTests, path) && blockHolding(blocks, root, path) === undefined,
  );
  const gathered = new Map<string, string[]>();

  for (const path of loose) {
    const id = outsideId(path);
    gathered.set(id, [...(gathered.get(id) ?? []), posix.join(root, path)]);
  }

  return [...gathered.entries()]
    .sort(([one], [other]) => one.localeCompare(other))
    .map(([id, files]) => blockOf(root, id, files));
}

function blockOf(root: string, id: string, files: readonly string[]): OutsideBlock {
  return { id, name: id, column: "outside", directory: posix.join(root, id), files };
}

function drawnOnTests(onTests: readonly string[], path: string): boolean {
  return onTests.some((drawn) => (drawn.endsWith("/") ? path.startsWith(drawn) : path === drawn));
}

function blockHolding(blocks: readonly Block[], root: string, path: string): Block | undefined {
  const absolute = posix.join(root, path);

  return blocks.find((block) => absolute.startsWith(`${block.directory}/`));
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

/**
 * Every code file git knows about, relative to the root. `--others --exclude-standard` adds files
 * that are not committed yet, so a file written a minute ago is on the map, while everything git
 * ignores stays off it.
 */
export function codeFiles(root: string): readonly string[] {
  const listed = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });

  return [...new Set(listed.split("\n").map((line) => line.trim()))]
    .filter((path) => CODE.test(path))
    .sort();
}
