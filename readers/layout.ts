import { existsSync, readdirSync, readFileSync } from "node:fs";
import { posix } from "node:path";
import { COLUMNS } from "../analysis/blocks.js";
import type { FeatureText, GroupFolder, Layout } from "../analysis/model.js";
import { KINDS } from "../analysis/test-kinds.js";

/**
 * What is read from a target's folders, which is the same for every language (`analysis/model.ts`):
 * the folders a group or an adapter is, the names at the root, and the features of each kind of
 * test. The folders are the tool's, not a language's (`blocks.ts`, `test-kinds.ts`), so no reader
 * reads them its own way.
 */
export function layoutOf(root: string): Layout {
  return {
    groups: COLUMNS.flatMap(({ path }) => groupsIn(root, path)),
    rootEntries: readdirSync(root),
    features: KINDS.filter(({ folder }) => existsSync(posix.join(root, folder))).flatMap(
      ({ folder }) => featuresIn(root, folder),
    ),
  };
}

/** Every folder directly in a column's folder, by name. A column's folder is required of a target. */
function groupsIn(root: string, column: string): readonly GroupFolder[] {
  return readdirSync(posix.join(root, column), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
    .map((name) => ({
      path: `${column}/${name}`,
      entries: readdirSync(posix.join(root, column, name)),
    }));
}

function featuresIn(root: string, folder: string): readonly FeatureText[] {
  return readdirSync(posix.join(root, folder), { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".feature"))
    .map((entry) => `${folder}/${entry.name}`)
    .sort()
    .map((path) => ({ path, text: readFileSync(posix.join(root, path), "utf8") }));
}
