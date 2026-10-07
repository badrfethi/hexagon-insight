import ts from "typescript";
import type { AnalysisContext } from "./context.js";
import { implementedBy } from "./contracts.js";
import { codeLinesOf } from "./lines.js";
import { declarationOf, descendants, isClass } from "./symbols.js";
import { firstSentence } from "./test-kinds.js";

/**
 * A Test Double at an outgoing port, drawn on the Tests view as a block of its own (#166).
 *
 * What a Test Double is belongs to this tool, and is stated in `README.md` (_Test Doubles_): a
 * class in a suite's support code that implements a port, incoming or outgoing. That is what it
 * stands in for, so it is found by what it does rather than by the file it is in. Only the doubles
 * at outgoing ports are found so far, the acceptance suite's; an entry point test's double at an
 * incoming port is not drawn yet (#11). Its kind is one or more of
 * Meszaros's Dummy, Stub, Spy, Mock and Fake, named by the double itself in the first sentence of
 * its doc comment — "The Clip provider: a Fake, and a Spy." — because its name cannot say it:
 * `FakeClipProvider` is a Spy too. So there is no list here of which double is which.
 */
export interface TestDouble {
  /** Its file and class, such as `features/support/doubles.ts#FakeClipProvider`, unique on the view. */
  readonly id: string;
  readonly name: string;
  /** Relative to the root. */
  readonly file: string;
  /** The kinds its doc comment names, in the order it names them; empty when it names none. */
  readonly kinds: readonly string[];
  /** The ports it implements, such as `IClipProvider`. */
  readonly ports: readonly string[];
  /** Its own lines of code, not its file's. */
  readonly linesOfCode: number;
}

const KIND = /\b(?:Dummy|Stub|Spy|Mock|Fake)\b/g;

export function doublesIn(
  context: AnalysisContext,
  files: readonly ts.SourceFile[],
): readonly TestDouble[] {
  return files
    .flatMap(classesIn)
    .filter((declaration) => implementsOutgoingPort(context, declaration))
    .map((declaration) => doubleOf(context, declaration));
}

function classesIn(file: ts.SourceFile): readonly ts.ClassDeclaration[] {
  return file.statements.filter(ts.isClassDeclaration);
}

function implementsOutgoingPort(
  context: AnalysisContext,
  declaration: ts.ClassDeclaration,
): boolean {
  return implementedTypes(declaration).some((type) =>
    declaredUnder(context, type.expression, "/outgoing_ports/"),
  );
}

function implementedTypes(
  declaration: ts.ClassDeclaration,
): readonly ts.ExpressionWithTypeArguments[] {
  return (declaration.heritageClauses ?? [])
    .filter((clause) => clause.token === ts.SyntaxKind.ImplementsKeyword)
    .flatMap((clause) => clause.types);
}

function declaredUnder(context: AnalysisContext, name: ts.Node, folder: string): boolean {
  const declaration = declarationOf(context, name);

  return declaration?.getSourceFile().fileName.includes(folder) ?? false;
}

function doubleOf(context: AnalysisContext, declaration: ts.ClassDeclaration): TestDouble {
  const file = context.relative(declaration.getSourceFile().fileName);
  const name = declaration.name?.text ?? "";

  return {
    id: `${file}#${name}`,
    name,
    file,
    kinds: kindsIn(summaryOf(declaration)),
    ports: implementedBy(declaration),
    linesOfCode: codeLinesOf(declaration),
  };
}

/** The first sentence of a declaration's doc comment, or nothing if it has none. */
function summaryOf(declaration: ts.Declaration): string {
  const doc = ts.getJSDocCommentsAndTags(declaration).find(ts.isJSDoc);

  return firstSentence(ts.getTextOfJSDocComment(doc?.comment) ?? "");
}

function kindsIn(summary: string): readonly string[] {
  return [...new Set(summary.match(KIND) ?? [])];
}

/**
 * The support files that hold something real a scenario runs over rather than a Test Double: a
 * class the suite's world builds for every scenario, which implements no port (#166).
 *
 * A double is found by the port it stands at, so what the world builds and stands at no port is
 * the real thing — a dependency run for real in the suite, such as the media host serving Source
 * Videos over real HTTP. It is found by what the world does, not listed.
 */
export function realFilesIn(
  context: AnalysisContext,
  files: readonly ts.SourceFile[],
): ReadonlySet<string> {
  const own = new Set(files);
  const built = files
    .flatMap(classesIn)
    .filter(isWorld)
    .flatMap((world) => builtBy(context, world))
    .filter((declaration) => own.has(declaration.getSourceFile()))
    .filter((declaration) => implementedTypes(declaration).length === 0);

  return new Set(
    built.map((declaration) => context.relative(declaration.getSourceFile().fileName)),
  );
}

/** A suite's world: the class that extends cucumber's `World`. */
function isWorld(declaration: ts.ClassDeclaration): boolean {
  return (declaration.heritageClauses ?? []).some(
    (clause) =>
      clause.token === ts.SyntaxKind.ExtendsKeyword &&
      clause.types.some((type) => type.expression.getText() === "World"),
  );
}

/** The classes a world builds as its own fields, which is what every scenario gets. */
function builtBy(
  context: AnalysisContext,
  world: ts.ClassDeclaration,
): readonly ts.ClassDeclaration[] {
  return world.members
    .filter(ts.isPropertyDeclaration)
    .flatMap((property) => (property.initializer ? descendants(property.initializer) : []))
    .filter(ts.isNewExpression)
    .map((construction) => declarationOf(context, construction.expression))
    .filter(isClass);
}
