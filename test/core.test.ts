import assert from "node:assert/strict";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";
import { arrowsOf } from "../analysis/arrows.js";
import { breaksOf } from "../analysis/breaks.js";
import { contextOf } from "../analysis/context.js";
import type { CodeFile, Model } from "../analysis/model.js";
import { readModel } from "../readers/read.js";

/*
 * The core's `uses` arrows and Rule 6 of `rules.feature`, that the core stands on nothing, over
 * `fixture/model.json` with a core added: the staff's service uses `src/core/Money.ts`, which uses
 * `src/core/enums/Side.ts`, which uses the supplier's outgoing port. The last is the break. Like
 * `layout.test.ts`, the variant is a target of its own under `.runs/core/`, so the child cucumber
 * reads it.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const RUNS = join(HERE, ".runs", "core");
const CORE_RULE = "The core stands on nothing";
const SERVICE = "src/infrastructure/staff/orders/services/OrderPlacer.ts";
const PORT = "src/infrastructure/suppliers/exchange/outgoing_ports/IExchange.ts";

type Written = Omit<Model, "doors">;

process.env.INSIGHT_MODEL = "model.json";

const fixture = JSON.parse(readFileSync(join(HERE, "fixture", "model.json"), "utf8")) as Written;

after(() => {
  rmSync(RUNS, { recursive: true, force: true });
});

const withCore: Written = {
  ...fixture,
  folders: fixture.folders.map((listed) =>
    listed.path === "src" ? { ...listed, folders: ["adapters", "core", "infrastructure"] } : listed,
  ),
  files: [
    ...fixture.files.map((file) =>
      file.path === SERVICE
        ? { ...file, importedFiles: [...file.importedFiles, "src/core/Money.ts"] }
        : file,
    ),
    coreFile("src/core/Money.ts", ["src/core/enums/Side.ts"]),
    coreFile("src/core/enums/Side.ts", [PORT]),
  ],
};

const root = join(RUNS, "with-core");

mkdirSync(root, { recursive: true });
writeFileSync(join(root, "model.json"), JSON.stringify(withCore));

const context = contextOf(await readModel(root));
const breaks = await breaksOf(context, root);

test("a block and a file of the core use the core, and a file of the core uses a group", () => {
  assert.deepEqual(
    arrowsOf(context).filter(({ kind }) => kind === "uses"),
    [
      { from: "infrastructure/staff/orders", to: "core/Money.ts", kind: "uses" },
      { from: "core/Money.ts", to: "core/enums/Side.ts", kind: "uses" },
      { from: "core/enums/Side.ts", to: "infrastructure/suppliers/exchange", kind: "uses" },
    ],
  );
});

test("a file of the core that uses the target's code outside src/core is a break", () => {
  assert.deepEqual(
    breaks.filter(({ rule }) => rule === CORE_RULE),
    [
      {
        rule: CORE_RULE,
        file: "src/core/enums/Side.ts",
        message: `no file in "src/core" uses the target's code outside it: uses ${PORT}, outside src/core/`,
        blocks: ["core/enums/Side.ts", "infrastructure/suppliers/exchange"],
        view: "map",
      },
    ],
  );
});

function coreFile(path: string, importedFiles: readonly string[]): CodeFile {
  return {
    path,
    listed: true,
    compiled: true,
    test: false,
    linesOfCode: 3,
    externals: [],
    declares: [],
    imports: [],
    constructorParameterTypes: [],
    constructs: [],
    importedFiles,
  };
}
