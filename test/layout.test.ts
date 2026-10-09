import assert from "node:assert/strict";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";
import { breaksOf } from "../analysis/breaks.js";
import { contextOf } from "../analysis/context.js";
import type { CodeFile, Model } from "../analysis/model.js";
import { readModel } from "../readers/read.js";

/*
 * Rule 5 of `rules.feature`, that a target is laid out in the hexagon's folders, over variants of
 * `fixture/model.json`: the folders it needs missing, one it does not have, a core with no contract
 * tests, and test code outside the four test folders. Each variant is a target of its own under
 * `.runs/layout/`, inside this repo so the child cucumber finds its `node_modules`, with its model in
 * `model.json` (`INSIGHT_MODEL` resolves against the target's root).
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const RUNS = join(HERE, ".runs", "layout");
const LAYOUT_RULE = "A target is laid out in the hexagon's folders";

type Written = Omit<Model, "doors">;

process.env.INSIGHT_MODEL = "model.json";

const fixture = JSON.parse(readFileSync(join(HERE, "fixture", "model.json"), "utf8")) as Written;

after(() => {
  rmSync(RUNS, { recursive: true, force: true });
});

const [base, noStaff, stranger, coreWithoutContracts, testsOutside] = await Promise.all([
  layoutBreaks("base", fixture),
  layoutBreaks("no-staff", {
    ...fixture,
    groups: fixture.groups.filter(({ path }) => !path.startsWith("src/infrastructure/staff/")),
    folders: listing(fixture, "src/infrastructure", ["suppliers"]),
  }),
  layoutBreaks("stranger", {
    ...fixture,
    folders: listing(fixture, "src", ["adapters", "foo", "infrastructure"]),
  }),
  layoutBreaks("core-without-contracts", withoutContracts(fixture)),
  layoutBreaks("tests-outside", {
    ...fixture,
    files: [
      ...fixture.files,
      testFile("tests/acceptance/steps.ts", ["src/infrastructure/staff/orders/services/OrderPlacer.ts"]),
      testFile("tests/acceptance/world.ts", ["src/adapters/web-api/web-api.ts"]),
      testFile("tests/unit/clock.test.ts", []),
    ],
  }),
]);

test("the fixture is laid out in the hexagon's folders", () => {
  assert.deepEqual(base, []);
});

test("a folder the hexagon needs that is not there is a break", () => {
  assert.deepEqual(noStaff, [
    "src/infrastructure/staff/: the hexagon's folders are there: is not there, and the hexagon needs it",
  ]);
});

test("a folder in src that the hexagon does not have, and no reader claims, is a break", () => {
  assert.deepEqual(stranger, [
    "src/foo/: nothing else sits in \"src\": is not one of the hexagon's folders here, and the " +
      "target's reader does not claim it",
  ]);
});

test("a core with no contract tests is laid out in the hexagon's folders", () => {
  assert.deepEqual(coreWithoutContracts, []);
});

test("test code that uses src outside the test folders is a break per folder", () => {
  assert.deepEqual(testsOutside, [
    "tests/acceptance/: test code that uses the application lives in a test folder: holds test " +
      "code that uses the application, in 2 files, outside entry-points/, features/, core-tests/, " +
      "contracts/",
  ]);
});

/** The Rule 5 breaks of the rules run over `model`, as `file: message`. */
async function layoutBreaks(name: string, model: Written): Promise<readonly string[]> {
  const root = join(RUNS, name);

  mkdirSync(root, { recursive: true });
  writeFileSync(join(root, "model.json"), JSON.stringify(model));

  const breaks = await breaksOf(contextOf(await readModel(root)), root);

  return breaks
    .filter(({ rule }) => rule === LAYOUT_RULE)
    .map(({ file, message }) => `${file}: ${message}`);
}

function listing(model: Written, path: string, folders: readonly string[]): Written["folders"] {
  return model.folders.map((listed) => (listed.path === path ? { path, folders } : listed));
}

/** A core in `src/core`, and no `contracts/` folder or anything in it. */
function withoutContracts(model: Written): Written {
  const inContracts = (path: string): boolean => path.startsWith("contracts/");

  return {
    ...model,
    rootEntries: model.rootEntries.filter((entry) => entry !== "contracts"),
    features: model.features.filter(({ path }) => !inContracts(path)),
    folders: listing(model, "src", ["adapters", "core", "infrastructure"]),
    files: model.files.filter(({ path }) => !inContracts(path)),
    declarations: model.declarations.filter(({ file }) => !inContracts(file)),
    steps: model.steps.filter(({ steps }) => !inContracts(steps)),
  };
}

function testFile(path: string, importedFiles: readonly string[]): CodeFile {
  return {
    path,
    listed: true,
    compiled: true,
    test: true,
    linesOfCode: 3,
    externals: ["node:test"],
    declares: [],
    imports: [],
    constructorParameterTypes: [],
    constructs: [],
    importedFiles,
  };
}
