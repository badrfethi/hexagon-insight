import ts from "typescript";
import type { Block } from "./blocks.js";
import type { AnalysisContext } from "./context.js";

/** What a name in the code refers to, followed through imports to where it is declared. */
export function declarationOf(context: AnalysisContext, name: ts.Node): ts.Declaration | undefined {
  const symbol = context.checker.getSymbolAtLocation(name);

  return symbol === undefined ? undefined : unaliased(context, symbol).declarations?.[0];
}

function unaliased(context: AnalysisContext, symbol: ts.Symbol): ts.Symbol {
  return symbol.flags & ts.SymbolFlags.Alias ? context.checker.getAliasedSymbol(symbol) : symbol;
}

/** The block that declares what `name` refers to, if a block does. */
export function blockDeclaring(context: AnalysisContext, name: ts.Node): Block | undefined {
  const declaration = declarationOf(context, name);

  return declaration === undefined
    ? undefined
    : context.blockOf(declaration.getSourceFile().fileName);
}

/** The block that exports what `name` refers to: declared in the block, with `export` on it. */
export function blockExporting(context: AnalysisContext, name: ts.Node): Block | undefined {
  const declaration = declarationOf(context, name);

  return declaration !== undefined && isExported(declaration)
    ? context.blockOf(declaration.getSourceFile().fileName)
    : undefined;
}

export function isClass(
  declaration: ts.Declaration | undefined,
): declaration is ts.ClassDeclaration {
  return declaration !== undefined && ts.isClassDeclaration(declaration);
}

export function isExported(declaration: ts.Declaration): boolean {
  return (ts.getCombinedModifierFlags(declaration) & ts.ModifierFlags.Export) !== 0;
}

/** Every node under `node`, depth first, including `node`. */
export function descendants(node: ts.Node): ts.Node[] {
  const found: ts.Node[] = [node];
  ts.forEachChild(node, (child) => {
    found.push(...descendants(child));
  });

  return found;
}

/** Lines, 1-based, from a position. */
export function lineAt(file: ts.SourceFile, position: number): number {
  return file.getLineAndCharacterOfPosition(position).line + 1;
}
