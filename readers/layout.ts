import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { posix } from "node:path";
import { COLUMNS } from "../analysis/blocks.js";
import type {
  FeatureText,
  FolderListing,
  GroupFolder,
  Layout,
  TrackedFile,
} from "../analysis/model.js";
import { KINDS } from "../analysis/test-kinds.js";
import { ReadFailure } from "./read.js";

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
    tracked: trackedIn(root),
  };
}

/**
 * Every file git lists, as the readers list their code (`typescript/files.ts`, `csharp/Listing.cs`):
 * `--others --exclude-standard` adds files not committed yet and leaves out what git ignores. A
 * target git cannot list has no files to account for, and so no model.
 */
function trackedIn(root: string): readonly TrackedFile[] {
  let listed: string;

  try {
    listed = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], {
      cwd: root,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    throw new ReadFailure(`git could not list the files of ${root}: ${(error as Error).message}`);
  }

  return [...new Set(listed.split("\0").filter((path) => path.length > 0))]
    .sort()
    .filter((path) => existsSync(posix.join(root, path)))
    .map((path) => ({ path, lines: linesIn(readFileSync(posix.join(root, path))) }));
}

/** The non-blank lines of a file's bytes, the way code is counted less its comments; none in a binary. */
function linesIn(bytes: Buffer): number {
  return bytes.includes(0)
    ? 0
    : bytes
        .toString("utf8")
        .split(/\r?\n/)
        .filter((line) => line.trim().length > 0).length;
}

/**
 * The folders whose own folders are read (`FolderListing`): `src` and `src/infrastructure` for the
 * layout rule, and `tests` for which of the code-first kinds of test a target has (`test-kinds.ts`).
 */
const LISTED: readonly FolderListing["path"][] = ["src", "src/infrastructure", "tests"];

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
