import { readFileSync } from "node:fs";
import ts from "typescript";

/**
 * What a block depends on that this repository does not write: npm packages and Node's own modules
 * (#74).
 *
 * The map draws arrows between our own blocks, so weight that leans outward is invisible on it: a
 * block with one arrow to a supplier and ten packages behind it reads as simple as one with no
 * packages at all. This is that weight, as a list per block, so the operator can see it beside the
 * arrows rather than guess at it.
 *
 * A **type-only** import counts. `import type { Message } from "@anthropic-ai/sdk"` compiles away,
 * but it is still this code shaped around a vendor's shape, and it is exactly the kind of coupling
 * that would otherwise go unseen here because nothing at runtime shows it.
 *
 * A `node:` specifier is kept **whole** — `node:fs/promises`, not `node:fs`. Which part of Node a
 * block reaches for is the interesting fact: reading a file is not spawning a process is not
 * opening a socket. A package is kept as its **name** only — `zod/v4` is `zod` — because a deep
 * import is the same dependency, and counting it twice would exaggerate the weight this exists to
 * measure.
 *
 * Read from the syntax tree, so only the specifiers that are written in the source are seen: static
 * `import`, `import type`, and `export … from`. A dynamic `import()`, a `require()` or an
 * `import x = require()` is not counted; none is used in this repository, and one appearing would
 * be worth noticing rather than quietly folding in here.
 */
export function externalsOf(files: readonly ts.SourceFile[]): readonly string[] {
  return sorted(files.flatMap(specifiersIn).flatMap((specifier) => externalOf(specifier) ?? []));
}

/**
 * The same, for a block whose files the TypeScript program does not hold: the catch-all blocks
 * outside the groups (`outside.ts`) own root-level configuration and feature files as well as code.
 * Each script among them is parsed here, and everything else — a `.feature` file, the page — has no
 * imports to read.
 */
export function externalsIn(paths: readonly string[]): readonly string[] {
  return externalsOf(paths.filter((path) => SCRIPT.test(path)).map(parsed));
}

const SCRIPT = /\.[cm]?[jt]s$/;

function parsed(path: string): ts.SourceFile {
  return ts.createSourceFile(path, readFileSync(path, "utf8"), ts.ScriptTarget.Latest, true);
}

function sorted(names: readonly string[]): readonly string[] {
  return [...new Set(names)].sort((one, other) => one.localeCompare(other));
}

function specifiersIn(file: ts.SourceFile): string[] {
  return file.statements.flatMap(specifierOf);
}

function specifierOf(statement: ts.Statement): string[] {
  const clause = moduleClauseOf(statement);

  return clause !== undefined && ts.isStringLiteral(clause) ? [clause.text] : [];
}

function moduleClauseOf(statement: ts.Statement): ts.Expression | undefined {
  if (ts.isImportDeclaration(statement)) {
    return statement.moduleSpecifier;
  }

  return ts.isExportDeclaration(statement) ? statement.moduleSpecifier : undefined;
}

/** Our own code: a relative path, an absolute one, or a `#` subpath specifier (`#staff/…`). */
const OURS = /^[./#]/;

/** A package name: a scope and its package, or everything before the first slash. */
const PACKAGE = /^@[^/]+\/[^/]+|^[^/]+/;

function externalOf(specifier: string): string | undefined {
  if (OURS.test(specifier)) {
    return undefined;
  }

  return specifier.startsWith("node:") ? specifier : PACKAGE.exec(specifier)?.[0];
}
