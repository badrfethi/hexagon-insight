import type { GherkinDocument } from "./contracts.js";

type Feature = NonNullable<GherkinDocument["feature"]>;
type FeatureChild = Feature["children"][number];
type Scenario = NonNullable<FeatureChild["scenario"]>;

/**
 * What a feature file runs: how many scenarios, and which ones.
 *
 * The two are read from one parse of the document because they are one traversal of it — the count
 * is the names added up. Splitting them would mean walking the same tree twice and, worse, leaving
 * two places where "what cucumber counts as a scenario" is decided.
 */
export interface FeatureScenarios {
  /** As cucumber counts them: an outline counts once per Examples row. */
  readonly count: number;
  /** One entry per `Scenario:` or `Scenario Outline:` in the file, in file order. */
  readonly names: readonly string[];
  /** The same entries, each with the line its keyword is on, which is how cucumber finds it. */
  readonly behaviours: readonly Behaviour[];
}

/**
 * One scenario as the operator reads it: its name as `names` gives it, and its line in the file.
 *
 * The line is what ties a behaviour to anything measured about it later: a cucumber pickle points
 * back at the scenario it came from, and an outline's rows all point back at the same line.
 */
export interface Behaviour {
  readonly line: number;
  readonly name: string;
}

/**
 * What a feature file runs, which is what the map reports on its block and what the page lists when
 * the operator clicks it.
 *
 * Counted as cucumber counts them, not as `Scenario:` lines: a Scenario Outline runs once per row
 * of each of its Examples tables, so it counts once per row and not at all if a table has only its
 * header. A Background is setup rather than a scenario and counts for nothing, and a Rule counts
 * whatever is under it.
 *
 * A name, though, is the operator reading the file rather than the run: an outline is **one** entry,
 * written as it is written in the file with its number of runs appended — `refuses a link (× 6)`.
 * Listing its rows instead would print the same sentence six times and say nothing the count does
 * not already say.
 */
export function readScenarios(document: GherkinDocument): FeatureScenarios {
  const runs = scenariosIn(document.feature?.children ?? []);

  return {
    count: runs.reduce((sum, run) => sum + run.runs, 0),
    names: runs.map(nameOf),
    behaviours: runs.map((run) => ({ line: run.line, name: nameOf(run) })),
  };
}

/** One scenario, and how many times it runs: an outline runs once per Examples row, others once. */
interface ScenarioRuns {
  readonly name: string;
  readonly line: number;
  readonly runs: number;
  readonly outline: boolean;
}

function scenariosIn(children: readonly FeatureChild[]): ScenarioRuns[] {
  return children.flatMap(inChild);
}

function inChild(child: FeatureChild): ScenarioRuns[] {
  if (child.rule !== undefined) {
    return scenariosIn(child.rule.children);
  }

  return child.scenario === undefined ? [] : [runsOf(child.scenario)];
}

function runsOf(scenario: Scenario): ScenarioRuns {
  const rows = scenario.examples.reduce((sum, examples) => sum + examples.tableBody.length, 0);
  const { name, location } = scenario;

  return scenario.examples.length === 0
    ? { name, line: location.line, runs: 1, outline: false }
    : { name, line: location.line, runs: rows, outline: true };
}

function nameOf(run: ScenarioRuns): string {
  return run.outline ? `${run.name} (× ${String(run.runs)})` : run.name;
}
