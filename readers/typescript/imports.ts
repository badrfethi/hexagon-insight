import { posix } from "node:path";
import ts from "typescript";

/**
 * The repository files one file imports or re-exports from, relative to the root: what tells a
 * file only the suites import, which Tests draws (`analysis/shared-tests.ts`).
 */
export function importedBy(
  root: string,
  program: ts.Program,
  file: ts.SourceFile,
): readonly string[] {
  return file.statements
    .flatMap((statement) => specifierOf(statement) ?? [])
    .flatMap((specifier) => resolved(program, specifier, file.fileName) ?? [])
    .filter((fileName) => !fileName.includes("/node_modules/"))
    .map((fileName) => posix.relative(root, fileName));
}

function specifierOf(statement: ts.Statement): string | undefined {
  return ts.isImportDeclaration(statement) || ts.isExportDeclaration(statement)
    ? textOf(statement.moduleSpecifier)
    : undefined;
}

function textOf(specifier: ts.Expression | undefined): string | undefined {
  return specifier !== undefined && ts.isStringLiteral(specifier) ? specifier.text : undefined;
}

function resolved(program: ts.Program, specifier: string, from: string): string | undefined {
  return ts.resolveModuleName(specifier, from, program.getCompilerOptions(), ts.sys).resolvedModule
    ?.resolvedFileName;
}
