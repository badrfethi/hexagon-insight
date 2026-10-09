import { appendFileSync } from "node:fs";
import type { Profiler } from "node:inspector";
import { Session } from "node:inspector/promises";
import { After, Before, type ITestCaseHookParameter } from "@cucumber/cucumber";

/**
 * What each scenario of one run ran, one scenario at a time (#148).
 *
 * `run-feature.ts` adds this file to the support code of the run it starts, and only there: the
 * `default` profile, and so the suite the gates run, never loads it. It opens an inspector session
 * on its own process and keeps V8's precise coverage on for the whole run, counting calls. `Before`
 * each scenario it takes the coverage and throws it away, which resets every count, and `After` it
 * takes it again and appends what ran in between to the file named by `INSIGHT_SCENARIOS`, as one
 * JSON line. `After` runs whether the scenario passed or not, so a red scenario is still recorded
 * for what it ran.
 *
 * This is one process per feature file, as reach was already measured, rather than one per
 * scenario: every scenario is told apart inside the run, so measuring the doors costs no more runs.
 *
 * Cucumber loads support files in path order, so these hooks are defined after the suite's own:
 * this `Before` runs last and this `After` first, and a scenario's record is its steps. The suite's
 * hooks set up and tear down a directory and a media host, which is not what a scenario reaches.
 */
const OUTPUT = process.env.INSIGHT_SCENARIOS;

if (OUTPUT === undefined) {
  throw new Error("scenario-coverage.ts needs INSIGHT_SCENARIOS, the file to write records to");
}

/** One line of the output: the line the scenario is written on, and per file url what ran in it. */
export interface ScenarioRecord {
  readonly line: number;
  readonly ran: Readonly<Record<string, readonly string[]>>;
}

const session = new Session();

session.connect();
await session.post("Profiler.enable");
await session.post("Profiler.startPreciseCoverage", { callCount: true, detailed: false });

Before(async () => {
  await session.post("Profiler.takePreciseCoverage");
});

After(async (scenario: ITestCaseHookParameter) => {
  const { result } = await session.post("Profiler.takePreciseCoverage");
  const record: ScenarioRecord = { line: lineOf(scenario), ran: ranIn(result) };

  appendFileSync(OUTPUT, `${JSON.stringify(record)}\n`);
});

type Document = ITestCaseHookParameter["gherkinDocument"];
type Child = NonNullable<Document["feature"]>["children"][number];

/**
 * The line of the `Scenario:` or `Scenario Outline:` a pickle came from, which is how a behaviour is
 * known in the view. A pickle's first AST node is that scenario, so every row of an outline answers
 * with the outline's own line.
 */
function lineOf({ pickle, gherkinDocument }: ITestCaseHookParameter): number {
  const [id] = pickle.astNodeIds;
  const scenario = scenariosIn(childrenOf(gherkinDocument)).find((one) => one.id === id);

  return scenario?.location.line ?? 0;
}

function childrenOf(document: Document): readonly Child[] {
  return document.feature?.children ?? [];
}

function scenariosIn(children: readonly Child[]): NonNullable<Child["scenario"]>[] {
  return children.flatMap((child) =>
    child.rule === undefined ? (child.scenario ?? []) : scenariosIn(child.rule.children),
  );
}

/**
 * Per file loaded from disk, outside `node_modules`, the names of the functions that ran.
 *
 * Only a function whose count is above nought is reported after a reset, and a module's own body,
 * which starts at offset 0, is left out: it runs when the module is imported, which is not reach.
 */
function ranIn(scripts: readonly Profiler.ScriptCoverage[]): Record<string, readonly string[]> {
  return Object.fromEntries(
    scripts
      .filter((script) => script.url.startsWith("file:") && !script.url.includes("/node_modules/"))
      .map((script) => [script.url, namesRanIn(script)] as const)
      .filter(([, names]) => names.length > 0),
  );
}

function namesRanIn(script: Profiler.ScriptCoverage): readonly string[] {
  return script.functions.filter(ran).map((fn) => fn.functionName);
}

function ran(fn: Profiler.FunctionCoverage): boolean {
  const [range] = fn.ranges;

  return range !== undefined && range.startOffset > 0 && range.count > 0;
}
