import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { contextOf } from "../analysis/context.js";
import { mapOf } from "../analysis/map.js";
import { ADAPTER_RULE } from "../analysis/rules.js";
import { testsView } from "../analysis/tests.js";
import { readModel } from "../readers/read.js";

/*
 * The hexagon part over a model written by hand (`fixture/model.json`), with no reader and no
 * language: a staff group with an incoming port and the service behind it, a supplier group with an
 * outgoing port, an outgoing adapter with its contract test, an incoming adapter with no entry point
 * test, an adapter on both sides with a plain test of each kind,
 * an acceptance suite with a Test Double and a real support class, and a file only that suite
 * imports. What a reader must report is in `analysis/model.ts`; this is what the map, Tests and the
 * rules make of it.
 */

const FIXTURE = join(dirname(fileURLToPath(import.meta.url)), "fixture");

// The rules run in a child process, in the fixture's folder, which reads the same model this way.
process.env.INSIGHT_MODEL = join(FIXTURE, "model.json");

const context = contextOf(await readModel(FIXTURE));
const map = await mapOf(context, FIXTURE);

test("the map draws each block in its lane, sized and with its externals", () => {
  assert.deepEqual(map.columns, [
    {
      lane: "incoming-adapters",
      title: "Incoming adapters",
      blocks: [
        block("adapters/order-queue", "adapters", 18, []),
        block("adapters/web-api", "adapters", 30, ["node:http", "zod"]),
      ],
    },
    {
      lane: "staff",
      title: "Staff",
      blocks: [block("infrastructure/staff/orders", "staff", 15, [])],
    },
    {
      lane: "suppliers",
      title: "Suppliers",
      blocks: [block("infrastructure/suppliers/exchange", "suppliers", 4, [])],
    },
    {
      lane: "outgoing-adapters",
      title: "Outgoing adapters",
      blocks: [
        block("adapters/simulated-exchange", "adapters", 20, ["node:crypto"]),
        block("adapters/order-queue", "adapters", 18, []),
      ],
    },
  ]);
});

test("the strip holds every file that is in no group's folder and on no test, code or not", () => {
  // `src/adapters/order-queue/schema.sql` is not code, and is shown by its adapter.
  assert.deepEqual(map.strip, [
    { id: "docs", name: "docs", column: "outside", linesOfCode: 4, externals: [] },
    { id: "README.md", name: "README.md", column: "outside", linesOfCode: 5, externals: [] },
    { id: "src/index.ts", name: "src/index.ts", column: "outside", linesOfCode: 8, externals: [] },
    {
      id: "tools/report.ts",
      name: "tools/report.ts",
      column: "outside",
      linesOfCode: 6,
      externals: ["node:fs"],
    },
  ]);
});

test("each file of a src/core is a block in a column between staff and suppliers, out of the strip and in no arrow", async () => {
  assert.equal(
    map.columns.some(({ lane }) => lane === "core"),
    false,
  );

  const model = await readModel(FIXTURE);
  const withCore = await mapOf(
    contextOf({
      ...model,
      folders: model.folders.map((folder) =>
        folder.path === "src" ? { ...folder, folders: [...folder.folders, "core"] } : folder,
      ),
      files: [
        ...model.files,
        {
          path: "src/core/Money.ts",
          listed: true,
          compiled: true,
          test: false,
          linesOfCode: 12,
          externals: ["decimal.js"],
          declares: [],
          imports: [],
          constructorParameterTypes: [],
          constructs: [],
          importedFiles: [],
        },
        {
          path: "src/core/enums/Side.ts",
          listed: true,
          compiled: true,
          test: false,
          linesOfCode: 3,
          externals: [],
          declares: [],
          imports: [],
          constructorParameterTypes: [],
          constructs: [],
          importedFiles: [],
        },
      ],
    }),
    FIXTURE,
  );

  assert.deepEqual(
    withCore.columns.map(({ lane }) => lane),
    ["incoming-adapters", "staff", "core", "suppliers", "outgoing-adapters"],
  );
  assert.deepEqual(withCore.columns[2], {
    lane: "core",
    title: "Core",
    blocks: [
      { id: "core/Money.ts", name: "Money.ts", column: "core", linesOfCode: 12, externals: ["decimal.js"] },
      { id: "core/enums/Side.ts", name: "enums/Side.ts", column: "core", linesOfCode: 3, externals: [] },
    ],
  });
  assert.deepEqual(withCore.strip, map.strip);
  assert.deepEqual(withCore.arrows, map.arrows);
});

test("the arrows come from what each block imports, takes, constructs and is checked by", () => {
  assert.deepEqual(map.arrows, [
    { from: "adapters/order-queue", to: "infrastructure/staff/orders", kind: "references" },
    { from: "adapters/web-api", to: "infrastructure/staff/orders", kind: "references" },
    {
      from: "infrastructure/staff/orders",
      to: "infrastructure/suppliers/exchange",
      kind: "depends-on",
    },
    {
      from: "adapters/simulated-exchange",
      to: "infrastructure/suppliers/exchange",
      kind: "implements",
    },
    {
      from: "adapters/order-queue",
      to: "infrastructure/suppliers/exchange",
      kind: "implements",
    },
    {
      from: "adapters/simulated-exchange",
      to: "tests/contracts/exchange.feature",
      kind: "checked-by",
    },
    {
      from: "adapters/order-queue",
      to: "tests/contracts/OrderQueueTests.ts",
      kind: "checked-by",
    },
  ]);
});

test("the rules break for the missing entry point test, and for doors no reader measured", () => {
  assert.deepEqual(map.breaks, [
    {
      rule: ADAPTER_RULE,
      file: "src/adapters/web-api",
      message:
        "every incoming adapter has an entry point test: is an incoming adapter, and no test " +
        "under tests/entry-points runs it",
      blocks: ["adapters/web-api"],
      view: "tests",
    },
    {
      rule: "Every acceptance scenario comes in through an incoming port",
      file: "features/",
      message:
        'every scenario under "features" comes in through an incoming port: this target\'s ' +
        "reader measures no doors, so no scenario here can be shown to come in through an " +
        "incoming port",
      blocks: [],
      view: "tests",
    },
  ]);
});

test("Tests draws a lane per kind, with its features, doubles and support", () => {
  const view = testsView(context);
  const [entryPoints, acceptance, core, contracts] = view.lanes;

  assert.deepEqual(
    view.lanes.map(({ kind, reason }) => ({ kind, reason })),
    [
      { kind: "Entry point test", reason: null },
      { kind: "Acceptance test", reason: null },
      { kind: "Core test", reason: "No `tests/core/` folder." },
      { kind: "Contract test", reason: null },
    ],
  );
  assert.deepEqual([entryPoints?.features, core?.features, core?.tests], [[], [], []]);
  assert.deepEqual(entryPoints?.tests, [
    {
      id: "tests/entry-points/OrderQueueEntryTests.ts",
      name: "OrderQueueEntryTests.ts",
      linesOfCode: 8,
      adapters: [{ name: "OrderQueue", block: "adapters/order-queue", ports: ["IExchange"] }],
    },
  ]);
  assert.deepEqual(acceptance?.tests, []);

  assert.deepEqual(
    acceptance?.features.map(({ id, name, linesOfCode, scenarios, steps }) => ({
      id,
      name,
      linesOfCode,
      scenarios,
      steps,
    })),
    [
      {
        id: "features/place-order.feature",
        name: "Placing an order",
        linesOfCode: 11,
        scenarios: 3,
        steps: null,
      },
    ],
  );
  assert.deepEqual(acceptance?.doubles, [
    {
      id: "features/support/doubles.ts#FakeExchange",
      name: "FakeExchange",
      file: "features/support/doubles.ts",
      kinds: ["Fake", "Spy"],
      ports: ["IExchange", "Disposable"],
      linesOfCode: 11,
    },
  ]);
  assert.deepEqual(acceptance?.support, [
    { id: "features/support/clock.ts", name: "support/clock.ts", linesOfCode: 5, real: true },
    { id: "features/support/steps.ts", name: "support/steps.ts", linesOfCode: 9, real: false },
    { id: "features/support/world.ts", name: "support/world.ts", linesOfCode: 14, real: false },
  ]);

  assert.deepEqual(contracts?.features, [
    {
      id: "tests/contracts/exchange.feature",
      name: "The exchange",
      linesOfCode: 4,
      scenarios: 1,
      scenarioNames: ["An order is filled"],
      steps: {
        id: "tests/contracts/support/exchange.steps.ts",
        name: "exchange.steps.ts",
        linesOfCode: 10,
        adapters: [
          {
            name: "SimulatedExchange",
            block: "adapters/simulated-exchange",
            ports: ["IExchange"],
          },
        ],
      },
    },
  ]);
  assert.deepEqual(contracts?.tests, [
    {
      id: "tests/contracts/OrderQueueTests.ts",
      name: "OrderQueueTests.ts",
      linesOfCode: 9,
      adapters: [{ name: "OrderQueue", block: "adapters/order-queue", ports: ["IExchange"] }],
    },
  ]);
  assert.deepEqual(contracts?.support, []);

  assert.deepEqual(view.shared, [
    {
      id: "fixtures/prices.ts",
      name: "fixtures/prices.ts",
      linesOfCode: 7,
      usedBy: ["Acceptance test"],
    },
  ]);
});

function block(
  id: string,
  column: string,
  linesOfCode: number,
  externals: readonly string[],
): unknown {
  return { id, name: id.split("/").at(-1), column, linesOfCode, externals };
}
