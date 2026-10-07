import ts from "typescript";
import type { Block } from "./blocks.js";
import type { AnalysisContext } from "./context.js";
import { contractFeaturesOf } from "./contracts.js";
import { blockDeclaring, blockExporting, declarationOf, descendants, isClass } from "./symbols.js";

/**
 * An arrow on the map (#74, decision 3).
 *
 * - `depends-on` — a constructor in `from` takes a parameter typed by something `to` exports: a
 *   group's interface or port, or a type an adapter exports, such as `RunProcess`.
 * - `implements` — a class in `from`, constructed in `src/index.ts`, implements a port `to` owns.
 *   Constructed anywhere in that file counts, so an adapter handed to another adapter there still
 *   has its arrow.
 * - `references` — an adapter imports an interface from `to`'s `incoming_ports/`. An incoming
 *   adapter drives the hexagon through such a port rather than implementing it, and may reference
 *   several, in staff or in suppliers. It replaces a `depends-on` arrow between the same two blocks.
 * - `checked-by` — an adapter is stood in front of its real supplier by a feature in `contracts/`
 *   (ADR-0019), which is a block in the rightmost column. The feature belongs to the adapter its
 *   steps file constructs (`contracts.ts`), so `contracts/anthropic.feature` draws two of these, one
 *   to each Claude adapter. It is the only arrow that ends outside `src/`.
 *
 * Raw imports are otherwise not arrows.
 */
export interface Arrow {
  readonly from: string;
  readonly to: string;
  readonly kind: "depends-on" | "implements" | "references" | "checked-by";
}

const COMPOSITION_ROOT = "src/index.ts";

export function arrowsOf(context: AnalysisContext): Arrow[] {
  const references = context.blocks
    .filter((block) => block.column === "adapters")
    .flatMap((block) =>
      incomingPortGroupsOf(context, block).map((target) => ({
        from: block.id,
        to: target.id,
        kind: "references" as const,
      })),
    );
  const referenced = new Set(references.map((arrow) => `${arrow.from} ${arrow.to}`));
  const dependencies = dependenciesOf(context).filter(
    (arrow) => !referenced.has(`${arrow.from} ${arrow.to}`),
  );

  return unique([...references, ...dependencies, ...implementations(context), ...checks(context)]);
}

/** Each block to the contract features that check it — the unmanaged adapters, in practice. */
function checks(context: AnalysisContext): Arrow[] {
  return context.blocks.flatMap((block) =>
    contractFeaturesOf(context, block).map((feature) => ({
      from: block.id,
      to: feature.path,
      kind: "checked-by" as const,
    })),
  );
}

/**
 * The other blocks whose `incoming_ports/` a block imports an interface from, which is what makes
 * an adapter incoming on the map.
 */
export function incomingPortGroupsOf(context: AnalysisContext, block: Block): Block[] {
  const targets = context
    .filesOf(block)
    .flatMap((file) => descendants(file).filter(ts.isImportSpecifier))
    .map((specifier) => declarationOf(context, specifier.name))
    .filter((declaration) => isIncomingPort(declaration))
    .flatMap((declaration) => context.blockOf(declaration.getSourceFile().fileName) ?? [])
    .filter((target) => target !== block);

  return [...new Set(targets)];
}

function isIncomingPort(declaration: ts.Declaration | undefined): declaration is ts.Declaration {
  return (
    declaration !== undefined &&
    ts.isInterfaceDeclaration(declaration) &&
    declaration.getSourceFile().fileName.includes("/incoming_ports/")
  );
}

function dependenciesOf(context: AnalysisContext): Arrow[] {
  return context.blocks.flatMap((block) =>
    context
      .filesOf(block)
      .flatMap((file) => descendants(file).filter(ts.isConstructorDeclaration))
      .flatMap((constructor) => constructor.parameters.flatMap((parameter) => typeNames(parameter)))
      .map((name) => blockExporting(context, name))
      .filter((target) => isOther(target, block))
      .map((target) => ({ from: block.id, to: target.id, kind: "depends-on" as const })),
  );
}

/** Every named type in a parameter's annotation, including inside unions, arrays and generics. */
function typeNames(parameter: ts.ParameterDeclaration): ts.EntityName[] {
  return parameter.type === undefined
    ? []
    : descendants(parameter.type)
        .filter(ts.isTypeReferenceNode)
        .map((reference) => reference.typeName);
}

function implementations(context: AnalysisContext): Arrow[] {
  const root = context.fileAt(COMPOSITION_ROOT);

  return root === undefined
    ? []
    : descendants(root)
        .filter(ts.isNewExpression)
        .map((construction) => declarationOf(context, construction.expression))
        .filter(isClass)
        .flatMap((declaration) => portsOf(context, declaration));
}

function portsOf(context: AnalysisContext, declaration: ts.ClassDeclaration): Arrow[] {
  const block = context.blockOf(declaration.getSourceFile().fileName);

  return block === undefined ? [] : implemented(context, declaration, block);
}

function implemented(
  context: AnalysisContext,
  declaration: ts.ClassDeclaration,
  block: Block,
): Arrow[] {
  return (declaration.heritageClauses ?? [])
    .filter((clause) => clause.token === ts.SyntaxKind.ImplementsKeyword)
    .flatMap((clause) => clause.types)
    .map((type) => blockDeclaring(context, type.expression))
    .filter((target) => isOther(target, block))
    .map((target) => ({ from: block.id, to: target.id, kind: "implements" as const }));
}

function isOther(target: Block | undefined, block: Block): target is Block {
  return target !== undefined && target !== block;
}

function unique(arrows: Arrow[]): Arrow[] {
  const seen = new Map(arrows.map((arrow) => [`${arrow.kind} ${arrow.from} ${arrow.to}`, arrow]));

  return [...seen.values()];
}
