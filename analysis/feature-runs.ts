import { spawn } from "node:child_process";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { AnalysisContext } from "./context.js";
import { type Door, doorOf, doorOfRows, type Ran } from "./doors.js";
import type { ScenarioRecord } from "./scenario-coverage.js";

/** One scenario of a feature: the file it is in, relative to the root, its line, and its door. */
export interface ScenarioDoor {
  readonly path: string;
  readonly line: number;
  readonly door: Door;
}

/**
 * Every scenario of every feature directly under `folder`, and the door it came in, measured by
 * running it (#148, #169).
 *
 * Reading the step files cannot answer it: `features/support/world.ts` builds the whole hexagon for
 * every scenario, and step definitions are global, so every scenario would appear to come in every
 * door. So each feature file is run on its own, all of them at once, recording what each scenario
 * ran (`scenario-coverage.ts`), and each scenario's door is read from that (`doors.ts`). An outline
 * is one scenario here, with one door for all of its rows. The runs are memoised for the load.
 */
export async function scenarioDoors(
  context: AnalysisContext,
  folder: string,
): Promise<readonly ScenarioDoor[]> {
  return await context.memo(`doors:${folder}`, () => measureFeatures(context, folder));
}

async function measureFeatures(
  context: AnalysisContext,
  folder: string,
): Promise<readonly ScenarioDoor[]> {
  const features = await featureFiles(context.root, folder);
  const measured = await Promise.all(features.map(async (path) => await measure(context, path)));

  return measured.flat();
}

async function featureFiles(root: string, folder: string): Promise<readonly string[]> {
  const names = await readdir(join(root, folder));

  return names
    .filter((name) => name.endsWith(".feature"))
    .sort()
    .map((name) => `${folder}/${name}`);
}

/** One scenario's run: the line it is written on, and what ran in it. */
interface ScenarioRun {
  readonly line: number;
  readonly ran: Ran;
}

/**
 * One cucumber run of a feature file, under the `default` profile. A scenario that fails still
 * counts for what it ran, so a red scenario still has a door.
 */
async function measure(context: AnalysisContext, path: string): Promise<readonly ScenarioDoor[]> {
  const runs = await scenariosRunBy(context.root, path);

  return [...doorsOf(context, runs)].map(([line, door]) => ({ path, line, door }));
}

/** Each scenario's door, with the rows of an outline — which share its line — read as one. */
function doorsOf(
  context: AnalysisContext,
  runs: readonly ScenarioRun[],
): ReadonlyMap<number, Door> {
  const byLine = new Map<number, Door[]>();

  runs.forEach(({ line, ran }) =>
    byLine.set(line, [...(byLine.get(line) ?? []), doorOf(context, ran)]),
  );

  return new Map([...byLine].map(([line, doors]) => [line, doorOfRows(doors)] as const));
}

/** What each scenario of one feature file ran, in the order cucumber ran them. */
async function scenariosRunBy(root: string, path: string): Promise<readonly ScenarioRun[]> {
  const directory = await mkdtemp(join(tmpdir(), "insight-scenarios-"));
  const output = join(directory, "scenarios.ndjson");

  try {
    await runRecorded(root, path, output);

    return await scenariosIn(output);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

function runRecorded(root: string, path: string, output: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ["--conditions=development", "--import", "tsx", RUNNER_SCRIPT, path],
      { cwd: root, env: { ...process.env, INSIGHT_SCENARIOS: output }, stdio: "ignore" },
    );

    child.once("error", reject);
    child.once("exit", () => {
      resolve();
    });
  });
}

const RUNNER_SCRIPT = fileURLToPath(new URL("./run-feature.ts", import.meta.url));

/** A run that failed before its first scenario wrote nothing, and ran nothing worth counting. */
async function scenariosIn(output: string): Promise<readonly ScenarioRun[]> {
  const text = await readFile(output, "utf8").catch(() => "");

  return text
    .split("\n")
    .filter((line) => line !== "")
    .map((line) => runOf(JSON.parse(line) as ScenarioRecord));
}

function runOf(record: ScenarioRecord): ScenarioRun {
  const files = Object.entries(record.ran).map(
    ([url, names]) => [fileURLToPath(url), new Set(names)] as const,
  );

  return { line: record.line, ran: new Map(files) };
}
