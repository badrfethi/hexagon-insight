import { readdirSync } from "node:fs";
import { posix } from "node:path";

/**
 * Where a block's code is. The map splits `adapters` into two columns by direction (`map.ts`), so
 * the three group columns become four; and `outside` is the catch-all row under them, which owns
 * no directory (`outside.ts`). The tests are not on the map: they are drawn on Tests (`tests.ts`).
 */
export type Column = "staff" | "suppliers" | "adapters" | "outside";

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
  /** Absolute, with forward slashes, and no trailing slash. */
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

/** Reads the blocks from the directories, so a new group or adapter appears without a change here. */
export function discoverBlocks(root: string): readonly Block[] {
  return COLUMNS.flatMap(({ column, path }) =>
    directoriesIn(posix.join(root, path)).map((name) => ({
      id: posix.join(path.replace(/^src\//, ""), name),
      name,
      column,
      directory: posix.join(root, path, name),
    })),
  );
}

function directoriesIn(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}
