import { posix } from "node:path";
import type { GroupFolder } from "./model.js";

/**
 * Where a block's code is. The map splits `adapters` into two columns by direction (`map.ts`), so
 * the three group columns become four; and `outside` is the catch-all row under them, which owns
 * no directory (`outside.ts`). `core` is a block per file of `src/core`, drawn in a column of its own
 * between staff and suppliers (`coreOf`). The tests are not on the map: they are drawn on Tests (`tests.ts`).
 */
export type Column = "staff" | "suppliers" | "adapters" | "core" | "outside";

/**
 * A block on the map: one group under `src/infrastructure/staff/` or `src/infrastructure/suppliers/`,
 * or one adapter under `src/adapters/` (#74, decision 2).
 *
 * `id` is the block's directory relative to `src/`, which is unique across columns and stable
 * across loads, so the page can keep a block selected when it reloads.
 */
export interface Block {
  readonly id: string;
  readonly name: string;
  readonly column: Column;
  /** Relative to the root, such as `src/adapters/terminal`, and with no trailing slash. */
  readonly directory: string;
}

export interface ColumnPlace {
  readonly column: Column;
  readonly path: string;
}

export const COLUMNS: readonly ColumnPlace[] = [
  { column: "staff", path: "src/infrastructure/staff" },
  { column: "suppliers", path: "src/infrastructure/suppliers" },
  { column: "adapters", path: "src/adapters" },
];

/** Where the core is, when the target has one (`README.md`, _What the target provides_). */
export const CORE = "src/core";

/**
 * The core's blocks, one per file under `src/core` (`listed` is every file the reader lists, in
 * path order). The core is the one folder drawn file by file: it is what every
 * staff group stands on, so each of its files matters on its own, where a group or an adapter is
 * drawn as one block however many files it has. A block's `id` is `core/` and its name the file's
 * path under `src/core`, and its `directory` is the file itself.
 *
 * They are kept out of the blocks the arrows and the rules are asked of: nearly everything uses the
 * core, so an arrow to it says nothing its place on the map does not.
 */
export function coreOf(srcFolders: readonly string[], listed: readonly string[]): readonly Block[] {
  if (!srcFolders.includes("core")) {
    return [];
  }

  return listed
    .filter((path) => path.startsWith(`${CORE}/`))
    .map((path) => {
      const name = path.slice(CORE.length + 1);

      return { id: `core/${name}`, name, column: "core", directory: path };
    });
}

/**
 * The blocks, one per folder in a column's folder (`readers/layout.ts`), so a new group or adapter
 * appears without a change here.
 */
export function blocksOf(groups: readonly GroupFolder[]): readonly Block[] {
  return groups.flatMap(({ path }) => {
    const place = COLUMNS.find((column) => column.path === posix.dirname(path));

    return place === undefined
      ? []
      : [
          {
            id: path.replace(/^src\//, ""),
            name: posix.basename(path),
            column: place.column,
            directory: path,
          },
        ];
  });
}
