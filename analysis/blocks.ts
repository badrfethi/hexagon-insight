import { posix } from "node:path";
import type { GroupFolder } from "./model.js";

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
