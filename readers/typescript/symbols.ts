import ts from "typescript";

/** What a name in the code refers to, followed through imports to where it is declared. */
export function declarationOf(checker: ts.TypeChecker, name: ts.Node): ts.Declaration | undefined {
  const symbol = checker.getSymbolAtLocation(name);

  return symbol === undefined ? undefined : unaliased(checker, symbol).declarations?.[0];
}

function unaliased(checker: ts.TypeChecker, symbol: ts.Symbol): ts.Symbol {
  return symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;
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
