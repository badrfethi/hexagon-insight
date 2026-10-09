import { posix } from "node:path";
import type { AnalysisContext } from "./context.js";
import { type ConstructedAdapter, constructedAdapters, parseFeature } from "./contracts.js";
import { doublesIn, realFilesIn, type TestDouble } from "./doubles.js";
import type { CodeFile } from "./model.js";
import { readScenarios } from "./scenarios.js";
import { testKinds } from "./test-kinds.js";

/**
 * The Tests view (#166): one lane per kind of test, and what stands behind each test in it.
 *
 * Everything is read from the model (`model.ts`) — the suites' folders (`test-kinds.ts`) for what
 * is in them, the code for the doubles and what each steps file builds — and nothing is run, so it
 * answers without waiting on the rules or on a feature. Every code file in a lane's folder is drawn
 * exactly once: a `.feature` as a feature, a steps file beside its feature, a file of Test Doubles
 * as its doubles, a plain test as a test, and everything else in the box of what runs in every test
 * of the kind. What the
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
  /** As `test-kinds.ts` names each kind, such as `Acceptance test`. */
  readonly usedBy: readonly string[];
}

export interface TestLane {
  /** As `test-kinds.ts` names it, such as `Contract test`. */
  readonly kind: string;
  /** Where its tests live, relative to the root. */
  readonly folder: string;
  /** Why it has no tests (`test-kinds.ts`); the page shows it only for a lane with nothing in it. */
  readonly reason: string | null;
  readonly features: readonly TestFeature[];
  /** The plain tests, in path order (`PlainTest`). */
  readonly tests: readonly PlainTest[];
  readonly doubles: readonly TestDouble[];
  readonly support: readonly SupportFile[];
}

/** A `.feature` file, sized and counted as the Map sizes and counts one. */
export interface TestFeature {
  /** Relative to the root, such as `tests/contracts/crayo.feature`. */
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

/**
 * A file of test code in a lane's folder, outside its `support/`, that is no feature's steps and
 * holds no Test Double: a test written as code rather than Gherkin (`rules.feature`, Rule 3), such
 * as a C# test class. What it constructs, it tests (`contracts.ts`).
 */
export interface PlainTest {
  readonly id: string;
  /** Relative to the lane's folder, such as `Binance/BinanceContractTests.cs`. */
  readonly name: string;
  readonly linesOfCode: number;
  /** The adapters it builds, which it checks; empty for a test of no adapter, such as a core test. */
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
  const kinds = testKinds(context.model);

  return {
    lanes: kinds.map((kind) => ({
      ...kind,
      ...contentsOf(context, kind.folder, context.listed),
    })),
    shared: context.sharedTests.map(({ path, usedBy }) => ({
      id: path,
      name: path,
      linesOfCode: context.file(path).linesOfCode,
      usedBy: kinds.filter((kind) => usedBy.includes(kind.folder)).map((kind) => kind.kind),
    })),
  };
}

type Contents = Pick<TestLane, "features" | "tests" | "doubles" | "support">;

function contentsOf(context: AnalysisContext, folder: string, files: readonly string[]): Contents {
  const own = files.filter((path) => path.startsWith(`${folder}/`));
  const featurePaths = own.filter(
    (path) => posix.dirname(path) === folder && path.endsWith(".feature"),
  );
  const steps = new Map(
    featurePaths.map((path) => [path, stepsPathOf(context, path, own)] as const),
  );
  const paired = new Set(steps.values());
  const scripts = own.flatMap((path) => context.fileAt(path) ?? []);
  const doubles = doublesIn(context, scripts);
  const doubled = new Set(doubles.map((double) => double.file));
  const stepsFiles = new Set(context.model.steps.map((pair) => pair.steps));
  const plain = scripts.filter(
    (file) =>
      file.test &&
      !file.path.startsWith(`${folder}/support/`) &&
      !stepsFiles.has(file.path) &&
      !doubled.has(file.path),
  );
  const held = new Set([...featurePaths, ...paired, ...doubled, ...plain.map((file) => file.path)]);

  return {
    features: featurePaths.map((path) => featureOf(context, path, steps.get(path) ?? null)),
    tests: plain.map((file) => plainTestOf(context, folder, file)),
    doubles,
    support: supportOf(
      context,
      folder,
      own.filter((path) => !held.has(path)),
      scripts,
    ),
  };
}

/**
 * The steps file the reader pairs a feature with (`Code.steps`), if it is in the lane's folder: in
 * a TypeScript target, `tests/contracts/crayo.feature` with `tests/contracts/support/crayo.steps.ts`.
 */
function stepsPathOf(
  context: AnalysisContext,
  feature: string,
  files: readonly string[],
): string | null {
  const pair = context.model.steps.find(
    ({ steps, feature: paired }) => paired === feature && files.includes(steps),
  );

  return pair?.steps ?? null;
}

function featureOf(context: AnalysisContext, path: string, steps: string | null): TestFeature {
  const text = context.featureAt(path)?.text;

  if (text === undefined) {
    throw new Error(`${path} is listed as code, but the model holds no text for it`);
  }

  const document = parseFeature(text);
  const scenarios = readScenarios(document);

  return {
    id: path,
    name: document.feature?.name ?? posix.basename(path),
    linesOfCode: context.file(path).linesOfCode,
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
    linesOfCode: context.file(path).linesOfCode,
    adapters: file === undefined ? [] : constructedAdapters(context, file),
  };
}

function plainTestOf(context: AnalysisContext, folder: string, file: CodeFile): PlainTest {
  return {
    id: file.path,
    name: posix.relative(folder, file.path),
    linesOfCode: file.linesOfCode,
    adapters: constructedAdapters(context, file),
  };
}

function supportOf(
  context: AnalysisContext,
  folder: string,
  paths: readonly string[],
  scripts: readonly CodeFile[],
): readonly SupportFile[] {
  const real = realFilesIn(context, scripts);

  return paths.map((path) => ({
    id: path,
    name: posix.relative(folder, path),
    linesOfCode: context.file(path).linesOfCode,
    real: real.has(path),
  }));
}
