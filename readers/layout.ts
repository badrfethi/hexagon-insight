import { existsSync, readdirSync, readFileSync } from "node:fs";
import { posix } from "node:path";
import { COLUMNS } from "../analysis/blocks.js";
import type { FeatureText, FolderListing, GroupFolder, Layout } from "../analysis/model.js";
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
    folders: LISTED.map((path) => ({ path, folders: foldersIn(root, path) })),
  };
}

/** The folders whose own folders the layout rule reads (`FolderListing`). */
const LISTED: readonly FolderListing["path"][] = ["src", "src/infrastructure"];

/**
 * Every folder directly in a column's folder, by name. A column's folder is required of a target,
 * and one that is missing is a break of the layout rule, not a failure to read: it holds no groups.
 */
function groupsIn(root: string, column: string): readonly GroupFolder[] {
  return foldersIn(root, column).map((name) => ({
      path: `${column}/${name}`,
      entries: readdirSync(posix.join(root, column, name)),
    }));
}

/** The names of the folders directly in `path`, sorted; none when it is not there. */
function foldersIn(root: string, path: string): readonly string[] {
  const absolute = posix.join(root, path);

  return existsSync(absolute)
    ? readdirSync(absolute, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .sort()
    : [];
}

function featuresIn(root: string, folder: string): readonly FeatureText[] {
  return readdirSync(posix.join(root, folder), { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".feature"))
    .map((entry) => `${folder}/${entry.name}`)
    .sort()
    .map((path) => ({ path, text: readFileSync(posix.join(root, path), "utf8") }));
}
