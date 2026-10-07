import { existsSync, readFileSync } from "node:fs";
import { posix } from "node:path";
import { AstBuilder, GherkinClassicTokenMatcher, Parser } from "@cucumber/gherkin";
import ts from "typescript";
import type { Block } from "./blocks.js";
import type { AnalysisContext } from "./context.js";
import { declarationOf, descendants, isClass } from "./symbols.js";

export type GherkinDocument = ReturnType<Parser<unknown>["parse"]>;

/** A feature that runs an adapter, parsed, under its path relative to the root. */
export interface ContractFeature {
  readonly path: string;
  readonly document: GherkinDocument;
}

/**
 * The contract features that belong to a block: those under `contracts/` (`featuresRunning`).
 */
export function contractFeaturesOf(context: AnalysisContext, block: Block): ContractFeature[] {
  return featuresRunning(context, block, "contracts");
}

/**
 * The features of the suite in `folder` that belong to a block — `contracts` for contract tests,
 * `entry-points` for entry point tests.
 *
 * A feature belongs to the adapter its steps file **constructs** — `new` on a class the block
 * declares — not to every adapter the steps file imports (#74, decision 18). So
 * `contracts/anthropic.feature` belongs to both Claude adapters, and not to `crayo-clip-provider`,
 * whose constant it only imports. A steps file is paired with its feature by name, as cucumber's
 * suite is laid out: `contracts/support/crayo.steps.ts` with `contracts/crayo.feature`.
 */
export function featuresRunning(
  context: AnalysisContext,
  block: Block,
  folder: string,
): ContractFeature[] {
  return context.memo(`features:${folder}`, () => featuresIn(context, folder)).get(block.id) ?? [];
}

function featuresIn(context: AnalysisContext, folder: string): Map<string, ContractFeature[]> {
  const owned = new Map<string, ContractFeature[]>();
  const pairs = context.sourceFiles.flatMap((steps) => ownersOf(context, steps, folder));

  pairs.forEach(({ id, feature }) => owned.set(id, [...(owned.get(id) ?? []), feature]));

  return owned;
}

function ownersOf(
  context: AnalysisContext,
  steps: ts.SourceFile,
  folder: string,
): { readonly id: string; readonly feature: ContractFeature }[] {
  const feature = featureFor(context, steps, folder);

  return feature === undefined
    ? []
    : [...constructedBlocks(context, steps)].map((id) => ({ id, feature }));
}

function featureFor(
  context: AnalysisContext,
  steps: ts.SourceFile,
  folder: string,
): ContractFeature | undefined {
  const path = context.relative(steps.fileName);
  const name = posix.basename(path, ".steps.ts");
  const paired = path === `${folder}/support/${name}.steps.ts`;

  return paired ? featureNamed(context, `${folder}/${name}.feature`) : undefined;
}

function featureNamed(context: AnalysisContext, path: string): ContractFeature | undefined {
  const file = posix.join(context.root, path);

  return existsSync(file)
    ? { path, document: parseFeature(readFileSync(file, "utf8")) }
    : undefined;
}

function constructedBlocks(context: AnalysisContext, steps: ts.SourceFile): Set<string> {
  return new Set(constructedAdapters(context, steps).map((adapter) => adapter.block));
}

/** A class a contract steps file constructs, in the block that declares it, and what it implements. */
export interface ConstructedAdapter {
  /** The class, such as `ClaudeBriefParser`. */
  readonly name: string;
  /** The id of the block that declares it, such as `adapters/claude-brief-parser`. */
  readonly block: string;
  /** The interfaces it `implements`, such as `IBriefParser`. */
  readonly ports: readonly string[];
}

/**
 * Every class a steps file constructs that a block declares, once each, in the order first built.
 *
 * It is what ties a contract or entry point feature to its adapter, so it is shared by the rule that
 * pairs each adapter with its kind of test and by the Tests view, which names the adapter on the
 * steps file rather than drawing it again: the adapter lives on the Map.
 */
export function constructedAdapters(
  context: AnalysisContext,
  steps: ts.SourceFile,
): readonly ConstructedAdapter[] {
  const classes = descendants(steps)
    .filter(ts.isNewExpression)
    .map((construction) => declarationOf(context, construction.expression))
    .filter(isClass);

  return [...new Set(classes)].flatMap((declaration) => adapterOf(context, declaration));
}

function adapterOf(
  context: AnalysisContext,
  declaration: ts.ClassDeclaration,
): ConstructedAdapter[] {
  const block = context.blockOf(declaration.getSourceFile().fileName);

  return block === undefined
    ? []
    : [{ name: declaration.name?.text ?? "", block: block.id, ports: implementedBy(declaration) }];
}

/** The names a class `implements`, as written. */
export function implementedBy(declaration: ts.ClassDeclaration): readonly string[] {
  return (declaration.heritageClauses ?? [])
    .filter((clause) => clause.token === ts.SyntaxKind.ImplementsKeyword)
    .flatMap((clause) => clause.types.map((type) => type.expression.getText()));
}

export function parseFeature(text: string): GherkinDocument {
  let next = 0;
  const parser = new Parser(new AstBuilder(() => String(next++)), new GherkinClassicTokenMatcher());

  return parser.parse(text);
}
