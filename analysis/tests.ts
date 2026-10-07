import { posix } from "node:path";
import type ts from "typescript";
import type { AnalysisContext } from "./context.js";
import { type ConstructedAdapter, constructedAdapters, parseFeature } from "./contracts.js";
import { doublesIn, realFilesIn, type TestDouble } from "./doubles.js";
import { codeLinesIn } from "./lines.js";
import { codeFiles } from "./outside.js";
import { readScenarios } from "./scenarios.js";
import { testKinds } from "./test-kinds.js";
import { readFileSync } from "node:fs";

/**
 * The Tests view (#166): one lane per kind of test, and what stands behind each test in it.
 *
 * Everything is read from the files — the ADR for the lanes, the suites' folders for what is in
 * them, the program for the doubles and what each steps file builds — and nothing is run, so it
 * answers without waiting on the rules or on a feature. Every code file in a lane's folder is drawn
 * exactly once: a `.feature` as a feature, a steps file beside its feature, a file of Test Doubles
 * as its doubles, and everything else in the box of what runs in every test of the kind. What the
 * suites share and nothing else imports is drawn once, under the lanes (`shared-tests.ts`).
 */
export interface TestsView {
  /** In the order the view reads (`test-kinds.ts`), each kind once, empty ones included. */
  readonly lanes: readonly TestLane[];
  /** What the suites share and nothing else imports, drawn under the lanes (`shared-tests.ts`). */
  readonly shared: readonly SharedFile[];
}

/** A file the suites share, and the kinds of test whose folders import it. */
export interface SharedFile {
  readonly id: string;
  readonly name: string;
  readonly linesOfCode: number;
  /** As ADR-0031 names each kind, such as `Acceptance test`. */
  readonly usedBy: readonly string[];
}

export interface TestLane {
  /** As ADR-0031 names it, such as `Contract test`. */
  readonly kind: string;
  /** Where its tests live, or `null` for a kind the ADR gives no folder. */
  readonly folder: string | null;
  /** Why it has no tests, as the ADR says; the page shows it only for a lane with nothing in it. */
  readonly reason: string | null;
  readonly features: readonly TestFeature[];
  readonly doubles: readonly TestDouble[];
  readonly support: readonly SupportFile[];
}

/** A `.feature` file, sized and counted as the Map sizes and counts one. */
export interface TestFeature {
  /** Relative to the root, such as `contracts/crayo.feature`. */
  readonly id: string;
  /** Its `Feature:` title. */
  readonly name: string;
  readonly linesOfCode: number;
  /** As cucumber counts them: an outline once per Examples row. */
  readonly scenarios: number;
  /** In file order, an outline once with its runs appended (`scenarios.ts`). */
  readonly scenarioNames: readonly string[];
  /** The steps file drawn beside it, named after it; `null` when it has none of its own. */
  readonly steps: StepsFile | null;
}

/** A steps file paired with its feature by name, and the adapters it builds, which it checks. */
export interface StepsFile {
  readonly id: string;
  readonly name: string;
  readonly linesOfCode: number;
  readonly adapters: readonly ConstructedAdapter[];
}

/** A support file that is not a feature's own steps and holds no Test Double. */
export interface SupportFile {
  readonly id: string;
  /** Relative to the lane's folder, such as `support/world.ts`. */
  readonly name: string;
  readonly linesOfCode: number;
  /** Real rather than faked: something the world builds that stands at no port (`doubles.ts`). */
  readonly real: boolean;
}

export function testsView(context: AnalysisContext): TestsView {
  const files = codeFiles(context.root);
  const kinds = testKinds(context.root);

  return {
    lanes: kinds.map((kind) => ({
      ...kind,
      ...laneContents(context, kind.folder, files),
    })),
    shared: context.sharedTests.map(({ path, usedBy }) => ({
      id: path,
      name: path,
      linesOfCode: codeLinesIn(posix.join(context.root, path)),
      usedBy: kinds.filter((kind) => usedBy.includes(kind.folder ?? "")).map((kind) => kind.kind),
    })),
  };
}

type Contents = Pick<TestLane, "features" | "doubles" | "support">;

const NOTHING: Contents = { features: [], doubles: [], support: [] };

function laneContents(
  context: AnalysisContext,
  folder: string | null,
  files: readonly string[],
): Contents {
  return folder === null ? NOTHING : contentsOf(context, folder, files);
}

function contentsOf(context: AnalysisContext, folder: string, files: readonly string[]): Contents {
  const own = files.filter((path) => path.startsWith(`${folder}/`));
  const featurePaths = own.filter(
    (path) => posix.dirname(path) === folder && path.endsWith(".feature"),
  );
  const steps = new Map(featurePaths.map((path) => [path, stepsPathOf(path, own)] as const));
  const paired = new Set(steps.values());
  const scripts = own.flatMap((path) => context.fileAt(path) ?? []);
  const doubles = doublesIn(context, scripts);
  const held = new Set([...featurePaths, ...paired, ...doubles.map((double) => double.file)]);

  return {
    features: featurePaths.map((path) => featureOf(context, path, steps.get(path) ?? null)),
    doubles,
    support: supportOf(
      context,
      folder,
      own.filter((path) => !held.has(path)),
      scripts,
    ),
  };
}

/** `contracts/crayo.feature` is paired with `contracts/support/crayo.steps.ts`, if there is one. */
function stepsPathOf(feature: string, files: readonly string[]): string | null {
  const name = posix.basename(feature, ".feature");
  const path = posix.join(posix.dirname(feature), "support", `${name}.steps.ts`);

  return files.includes(path) ? path : null;
}

function featureOf(context: AnalysisContext, path: string, steps: string | null): TestFeature {
  const file = posix.join(context.root, path);
  const document = parseFeature(readFileSync(file, "utf8"));
  const scenarios = readScenarios(document);

  return {
    id: path,
    name: document.feature?.name ?? posix.basename(path),
    linesOfCode: codeLinesIn(file),
    scenarios: scenarios.count,
    scenarioNames: scenarios.names,
    steps: steps === null ? null : stepsOf(context, steps),
  };
}

function stepsOf(context: AnalysisContext, path: string): StepsFile {
  const file = context.fileAt(path);

  return {
    id: path,
    name: posix.basename(path),
    linesOfCode: codeLinesIn(posix.join(context.root, path)),
    adapters: file === undefined ? [] : constructedAdapters(context, file),
  };
}

function supportOf(
  context: AnalysisContext,
  folder: string,
  paths: readonly string[],
  scripts: readonly ts.SourceFile[],
): readonly SupportFile[] {
  const real = realFilesIn(context, scripts);

  return paths.map((path) => ({
    id: path,
    name: posix.relative(folder, path),
    linesOfCode: codeLinesIn(posix.join(context.root, path)),
    real: real.has(path),
  }));
}
