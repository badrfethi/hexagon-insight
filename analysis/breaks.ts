import type { AnalysisContext } from "./context.js";
import { contractTestsOf } from "./contracts.js";
import { ADAPTER_RULE, RULES } from "./rules.js";
import { type Envelope, runRules, type RulesRun } from "./rules-run.js";
import { testKinds } from "./test-kinds.js";

/**
 * A failing scenario of the rules (`rules.ts`) (#74, decisions 7 and 12): the rule it breaks,
 * the file and message it names, and the blocks the page marks red for it.
 */
export interface Break {
  readonly rule: string;
  readonly file: string;
  readonly message: string;
  /** Ids of the blocks it names; clicking the break selects the first. */
  readonly blocks: readonly string[];
  /**
   * The view it shows on (#165, decision 11). A break is about the tests when the file it names is
   * in a folder tests live in (`test-kinds.ts`) or is one the suites share
   * (`shared-tests.ts`), when it names an adapter a contract
   * steps file builds, or when it breaks the rule that pairs each adapter with its kind of test, whose
   * breaks name the adapters it finds wanting. Everything else is about the hexagon, and on the Map.
   */
  readonly view: "map" | "tests";
}


/** Step results that break nothing: passed, skipped after an earlier failure, or not yet written. */
const NOT_BROKEN: readonly string[] = ["PASSED", "SKIPPED", "UNDEFINED", "PENDING"];

/**
 * Runs the rules in the target at `root` and turns what failed into breaks.
 *
 * A step in `steps/` fails with one offence per line, each opening with the file it
 * names (`refuseAny` in `steps/world.ts`), so one failing scenario becomes a break **per offence**:
 * a scenario that finds three unimplemented ports shows three, each with its own file and its own
 * red mark, rather than one break naming a single file for all three. The blocks a break marks are
 * every group whose directory its line mentions — the file that offends first, so clicking selects
 * it, and whatever it reaches after.
 *
 * A failure not in that shape — a step that threw — is still a break, against the rules file itself.
 * So is a run that never finished: an empty list must mean the rules held, not that they did not
 * run. A step that is **undefined** or pending is not a break: it is a rule whose steps an agent has
 * not written yet (#74, decision 15), not code that broke one, and `hexagon-insight rules` names it.
 */
export async function breaksOf(
  context: AnalysisContext,
  root: string,
): Promise<readonly Break[]> {
  const found = breaksIn(context, await runRules(root));

  return found.map((broken) => ({ ...broken, view: viewOf(context, broken) }));
}

type Unplaced = Omit<Break, "view">;

function breaksIn(context: AnalysisContext, run: RulesRun): readonly Unplaced[] {
  return run.envelopes.some((envelope) => envelope.testRunFinished !== undefined)
    ? failures(run.envelopes).flatMap((failure) => breaksFor(context, failure))
    : [{ rule: "Insight's rules", file: RULES, message: notRun(run.stderr), blocks: [] }];
}

function viewOf(context: AnalysisContext, broken: Unplaced): Break["view"] {
  const checked = checkedAdapters(context);
  const aboutTests =
    broken.rule === ADAPTER_RULE ||
    onTests(context).some((drawn) => broken.file.startsWith(drawn)) ||
    broken.blocks.some((id) => checked.has(id));

  return aboutTests ? "tests" : "map";
}

/** What Tests draws: each suite's folder, and each file the suites share (`shared-tests.ts`). */
function onTests(context: AnalysisContext): readonly string[] {
  return context.memo("on-tests", () => [
    ...testKinds(context.model).map((kind) => `${kind.folder}/`),
    ...context.sharedTests.map(({ path }) => path),
  ]);
}

/** The adapters some contract steps file builds, by block id. */
function checkedAdapters(context: AnalysisContext): ReadonlySet<string> {
  return context.memo(
    "checked-adapters",
    () =>
      new Set(
        context.blocks
          .filter((block) => contractTestsOf(context, block).length > 0)
          .map((block) => block.id),
      ),
  );
}

function notRun(stderr: string): string {
  return `The rules did not run. ${stderr.trim().split("\n").slice(-5).join("\n")}`;
}

interface Failure {
  readonly rule: string;
  readonly scenario: string;
  readonly status: string;
  readonly message: string;
}

function failures(envelopes: readonly Envelope[]): readonly Failure[] {
  const rules = ruleOfScenario(envelopes);
  const pickles = new Map(envelopes.flatMap(({ pickle }) => (pickle ? [[pickle.id, pickle]] : [])));
  const testCases = new Map(
    envelopes.flatMap(({ testCase }) => (testCase ? [[testCase.id, testCase.pickleId]] : [])),
  );
  const started = new Map(
    envelopes.flatMap(({ testCaseStarted: s }) => (s ? [[s.id, testCases.get(s.testCaseId)]] : [])),
  );

  return envelopes
    .flatMap(({ testStepFinished }) => (testStepFinished ? [testStepFinished] : []))
    .filter(({ testStepResult }) => !NOT_BROKEN.includes(testStepResult.status))
    .map(({ testCaseStartedId, testStepResult }) =>
      failureOf(
        rules,
        pickles.get(started.get(testCaseStartedId) ?? "") ?? UNKNOWN,
        testStepResult,
      ),
    );
}

type Pickle = NonNullable<Envelope["pickle"]>;

const UNKNOWN: Pickle = { id: "", uri: RULES, name: "", astNodeIds: [] };

function failureOf(
  rules: ReadonlyMap<string, string>,
  pickle: Pickle,
  result: { readonly status: string; readonly message?: string },
): Failure {
  return {
    rule: rules.get(pickle.astNodeIds[0] ?? "") ?? "Insight's rules",
    scenario: pickle.name,
    status: result.status,
    message: result.message ?? "",
  };
}

/** The name of the Rule each scenario sits under, by the scenario's id. */
function ruleOfScenario(envelopes: readonly Envelope[]): ReadonlyMap<string, string> {
  return new Map(
    envelopes
      .flatMap(({ gherkinDocument }) => gherkinDocument?.feature?.children ?? [])
      .flatMap(({ rule }) =>
        rule ? rule.children.map((child) => [child.scenario?.id, rule.name]) : [],
      )
      .filter((entry): entry is [string, string] => entry[0] !== undefined),
  );
}

const OFFENCE = /^([^\s:]+(?::\d+)?): (.+)$/;

interface Offence {
  readonly file: string;
  readonly detail: string;
}

function offencesIn(line: string): readonly Offence[] {
  const [, file, detail] = OFFENCE.exec(line) ?? [];

  return file === undefined || detail === undefined ? [] : [{ file, detail }];
}

function breaksFor(context: AnalysisContext, failure: Failure): readonly Unplaced[] {
  const offences = errorLines(failure.message).flatMap(offencesIn);

  return offences.length > 0
    ? offences.map(({ file, detail }) => ({
        rule: failure.rule,
        file,
        message: `${failure.scenario}: ${detail}`,
        blocks: blocksNamed(context, `${file} ${detail}`),
      }))
    : [{ rule: failure.rule, file: RULES, message: unshaped(failure), blocks: [] }];
}

/** The error's own lines: without the `Error: ` it opens with, and without its stack. */
function errorLines(message: string): readonly string[] {
  const lines = message.replace(/^\w*Error: /, "").split("\n");
  const stack = lines.findIndex((line) => /^\s+at /.test(line));

  return stack < 0 ? lines : lines.slice(0, stack);
}

function unshaped(failure: Failure): string {
  return `${failure.scenario}: ${failure.status.toLowerCase()}. ${errorLines(failure.message).join(" ")}`.trim();
}

function blocksNamed(context: AnalysisContext, text: string): readonly string[] {
  const ids = (text.match(/src\/[\w./-]+/g) ?? []).flatMap((path) =>
    context.blocks
      .filter((block) => `${path}/`.startsWith(`src/${block.id}/`))
      .map((block) => block.id),
  );

  return [...new Set(ids)];
}
