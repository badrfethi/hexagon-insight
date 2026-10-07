import { existsSync, readFileSync } from "node:fs";
import { posix } from "node:path";
import { AstBuilder, GherkinClassicTokenMatcher, Parser } from "@cucumber/gherkin";
import ts from "typescript";
import type { Block } from "./blocks.js";
import type { AnalysisContext } from "./context.js";
import { declarationOf, descendants, isClass } from "./symbols.js";

export type GherkinDocument = ReturnType<Parser<unknown>["parse"]>;

/** A contract feature, parsed, under its path relative to the root. */
export interface ContractFeature {
  readonly path: string;
  readonly document: GherkinDocument;
}

const STEPS_FILE = /^contracts\/support\/(?<name>[^/]+)\.steps\.ts$/;

/**
 * The contract features that belong to a block.
 *
 * A contract feature belongs to the adapter its steps file **constructs** — `new` on a class the
 * block declares — not to every adapter the steps file imports (#74, decision 18). So
 * `contracts/anthropic.feature` belongs to both Claude adapters, and not to `crayo-clip-provider`,
 * whose constant it only imports. A steps file is paired with its feature by name, as cucumber's
 * suite is laid out: `contracts/support/crayo.steps.ts` with `contracts/crayo.feature`.
 */
export function contractFeaturesOf(context: AnalysisContext, block: Block): ContractFeature[] {
  return context.memo("contracts", () => contractFeatures(context)).get(block.id) ?? [];
}

function contractFeatures(context: AnalysisContext): Map<string, ContractFeature[]> {
  const owned = new Map<string, ContractFeature[]>();
  const pairs = context.sourceFiles.flatMap((steps) => ownersOf(context, steps));

  pairs.forEach(({ id, feature }) => owned.set(id, [...(owned.get(id) ?? []), feature]));

  return owned;
}

function ownersOf(
  context: AnalysisContext,
  steps: ts.SourceFile,
): { readonly id: string; readonly feature: ContractFeature }[] {
  const feature = featureFor(context, steps);

  return feature === undefined
    ? []
    : [...constructedBlocks(context, steps)].map((id) => ({ id, feature }));
}

function featureFor(context: AnalysisContext, steps: ts.SourceFile): ContractFeature | undefined {
  const name = STEPS_FILE.exec(context.relative(steps.fileName))?.groups?.name;

  return name === undefined ? undefined : featureNamed(context, `contracts/${name}.feature`);
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
 * It is what ties a contract feature to its adapter, so it is shared by the rule that holds an
 * unmanaged adapter to a contract feature and by the Tests view, which names the adapter on the
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
