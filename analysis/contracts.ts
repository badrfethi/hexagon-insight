import { posix } from "node:path";
import { AstBuilder, GherkinClassicTokenMatcher, Parser } from "@cucumber/gherkin";
import type { Block } from "./blocks.js";
import type { AnalysisContext } from "./context.js";
import type { CodeFile, Declaration } from "./model.js";
import { CONTRACTS } from "./test-kinds.js";

export type GherkinDocument = ReturnType<Parser<unknown>["parse"]>;

/** The contract tests that belong to a block: those under `tests/contracts/` (`testsRunning`). */
export function contractTestsOf(context: AnalysisContext, block: Block): readonly string[] {
  return testsRunning(context, block, CONTRACTS);
}

/**
 * The tests of the suite in `folder` that belong to a block, by path — `tests/contracts` for
 * contract tests, `tests/entry-points` for entry point tests.
 *
 * Either kind is a feature or a plain test (`rules.feature`, Rule 3), and a test belongs to the
 * adapter it **constructs** — `new` on a class the block declares — not to every adapter it imports
 * (#74, decision 18). So `anthropic.feature` belongs to both Claude adapters, and not to
 * `crayo-clip-provider`, whose constant it only imports.
 *
 * - **A feature** directly in `folder` constructs what its steps file does. The reader pairs the two
 *   (`Code.steps`): in a TypeScript target, `<folder>/support/crayo.steps.ts` with
 *   `<folder>/crayo.feature`, as cucumber's suite is laid out.
 * - **A plain test** is a file of test code (`CodeFile.test`) anywhere in `folder` but its
 *   `support/`, which is not a feature's steps: what it constructs, it tests. What a suite keeps in
 *   `support/` serves its tests, and is no test itself.
 */
export function testsRunning(
  context: AnalysisContext,
  block: Block,
  folder: string,
): readonly string[] {
  return context.memo(`tests:${folder}`, () => testsIn(context, folder)).get(block.id) ?? [];
}

function testsIn(context: AnalysisContext, folder: string): Map<string, string[]> {
  const featureOf = new Map(context.model.steps.map((pair) => [pair.steps, pair.feature] as const));
  const owned = new Map<string, string[]>();
  const pairs = context.compiled.flatMap((file) =>
    ownersOf(context, file, testOf(context, file, featureOf.get(file.path), folder)),
  );

  pairs.forEach(({ id, test }) => owned.set(id, [...(owned.get(id) ?? []), test]));

  return owned;
}

/** The test a file stands for in `folder`: the feature it is the steps of, or itself as a plain test. */
function testOf(
  context: AnalysisContext,
  file: CodeFile,
  paired: string | undefined,
  folder: string,
): string | undefined {
  if (paired !== undefined) {
    return posix.dirname(paired) === folder && context.featureAt(paired) !== undefined
      ? paired
      : undefined;
  }

  return file.test && file.path.startsWith(`${folder}/`) && !file.path.startsWith(`${folder}/support/`)
    ? file.path
    : undefined;
}

function ownersOf(
  context: AnalysisContext,
  file: CodeFile,
  test: string | undefined,
): { readonly id: string; readonly test: string }[] {
  return test === undefined
    ? []
    : [...constructedBlocks(context, file)].map((id) => ({ id, test }));
}

function constructedBlocks(context: AnalysisContext, file: CodeFile): Set<string> {
  return new Set(constructedAdapters(context, file).map((adapter) => adapter.block));
}

/** A class a test constructs, in the block that declares it, and what it implements. */
export interface ConstructedAdapter {
  /** The class, such as `ClaudeBriefParser`. */
  readonly name: string;
  /** The id of the block that declares it, such as `adapters/claude-brief-parser`. */
  readonly block: string;
  /** The interfaces it `implements`, such as `IBriefParser`. */
  readonly ports: readonly string[];
}

/**
 * Every class a steps file or a plain test constructs that a block declares, once each, in the
 * order first built.
 *
 * It is what ties a contract or entry point test to its adapter, so it is shared by the rule that
 * pairs each adapter with its kind of test and by the Tests view, which names the adapter on the
 * test rather than drawing it again: the adapter lives on the Map.
 */
export function constructedAdapters(
  context: AnalysisContext,
  file: CodeFile,
): readonly ConstructedAdapter[] {
  return file.constructs
    .map((id) => context.declaration(id))
    .flatMap((declaration) => adapterOf(context, declaration));
}

function adapterOf(context: AnalysisContext, declaration: Declaration): ConstructedAdapter[] {
  const block = context.blockOf(declaration.file);

  return block === undefined
    ? []
    : [
        {
          name: declaration.name,
          block: block.id,
          ports: declaration.implements.map(({ written }) => written),
        },
      ];
}

export function parseFeature(text: string): GherkinDocument {
  let next = 0;
  const parser = new Parser(new AstBuilder(() => String(next++)), new GherkinClassicTokenMatcher());

  return parser.parse(text);
}
