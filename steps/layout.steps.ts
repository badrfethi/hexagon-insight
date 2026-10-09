import { posix } from "node:path";
import { Given, Then } from "@cucumber/cucumber";
import type { AnalysisContext } from "../analysis/context.js";
import type { CodeFile } from "../analysis/model.js";
import { refuseAny, type RulesWorld } from "./world.js";

/**
 * The rule that a target is laid out in the hexagon's folders (`rules.feature`, Rule 5): the
 * folders the hexagon needs are there, nothing else sits beside them unless the target's reader
 * claims it for its language, and test code that uses the application lives in a test folder.
 *
 * A wrong layout is a break, not a failure to read (`README.md`, _Breaks and read failures_): the
 * map still draws what is there, and this rule names what is wrong with it. So the `Given`s over
 * folders do not refuse an empty list, as the others do: a folder that is not there is the first
 * scenario's break, and the second and third would only say it again.
 */

Given("the target's root", async function (this: RulesWorld) {
  await this.read();
});

Then(
  "it has {string}, {string}, {string} and {string}",
  function (this: RulesWorld, first: string, second: string, third: string, fourth: string) {
    refuseAny(
      [first, second, third, fourth]
        .filter((path) => !isThere(this.context, path))
        .map((path) => `${path}/: is not there, and the hexagon needs it`),
    );
  },
);

Given("the folders directly under {string}", async function (this: RulesWorld, path: string) {
  await this.read();
  this.folders = listingOf(this.context, path).map((name) => `${path}/${name}`);
});

Then(
  "each of them is {string}, {string} or {string}, or is claimed by the target's reader",
  function (this: RulesWorld, first: string, second: string, third: string) {
    refuseAny(strangers(this, [first, second, third]));
  },
);

Then(
  "each of them is {string} or {string}, or is claimed by the target's reader",
  function (this: RulesWorld, first: string, second: string) {
    refuseAny(strangers(this, [first, second]));
  },
);

Given(
  "the test code that uses code under {string}",
  async function (this: RulesWorld, path: string) {
    await this.read();
    this.files = this.context.model.files.filter(
      (file) => file.test && usesCodeUnder(this.context, file, path),
    );
  },
);

Then(
  "each of it is under {string}, {string}, {string} or {string}",
  function (this: RulesWorld, first: string, second: string, third: string, fourth: string) {
    const folders = [first, second, third, fourth];
    const outside = this.files.filter(
      (file) => !folders.some((folder) => file.path.startsWith(`${folder}/`)),
    );

    refuseAny(
      [...countsByFolder(outside)].map(
        ([folder, count]) =>
          `${folder}/: holds test code that uses the application, in ${filesCount(count)}, ` +
          `outside ${folders.map((name) => `${name}/`).join(", ")}`,
      ),
    );
  },
);

/** A path is there when the listing of its parent names it: the root's entries, or a `FolderListing`. */
function isThere(context: AnalysisContext, path: string): boolean {
  const parent = posix.dirname(path);

  return parent === "."
    ? context.model.rootEntries.includes(path)
    : listingOf(context, parent).includes(posix.basename(path));
}

function listingOf(context: AnalysisContext, path: string): readonly string[] {
  const listing = context.model.folders.find((folders) => folders.path === path);

  if (listing === undefined) {
    throw new Error(`The model lists no folders for ${path}: a reader reads only src and src/infrastructure`);
  }

  return listing.folders;
}

/** The folders the `Given` found that are neither one of `names` nor claimed by the reader. */
function strangers(world: RulesWorld, names: readonly string[]): readonly string[] {
  const claimed = world.context.model.claimed;

  return world.folders
    .filter((folder) => !names.includes(posix.basename(folder)) && !claimed.includes(folder))
    .map(
      (folder) =>
        `${folder}/: is not one of the hexagon's folders here, and the target's reader does not claim it`,
    );
}

/** It imports a file under `path`, or names a declaration in one. */
function usesCodeUnder(context: AnalysisContext, file: CodeFile, path: string): boolean {
  const prefix = `${path}/`;

  return (
    file.importedFiles.some((imported) => imported.startsWith(prefix)) ||
    [...file.imports, ...file.constructorParameterTypes, ...file.constructs].some((id) =>
      context.declaration(id).file.startsWith(prefix),
    )
  );
}

/**
 * How many of the files are in each folder, by the folder they are directly in, in path order: a
 * test project outside the test folders is one break per folder, not one per file.
 */
function countsByFolder(files: readonly CodeFile[]): ReadonlyMap<string, number> {
  const counts = new Map<string, number>();

  for (const path of files.map((file) => posix.dirname(file.path)).sort()) {
    counts.set(path, (counts.get(path) ?? 0) + 1);
  }

  return counts;
}

function filesCount(count: number): string {
  return count === 1 ? "1 file" : `${String(count)} files`;
}
