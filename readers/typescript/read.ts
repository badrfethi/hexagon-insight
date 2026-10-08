import { existsSync } from "node:fs";
import { posix } from "node:path";
import ts from "typescript";
import type {
  Code,
  CodeFile,
  Declaration,
  ImplementedName,
  Model,
  StepsPair,
} from "../../analysis/model.js";
import type { DoorLoad } from "./doors/doors.js";
import { scenarioDoors } from "./doors/feature-runs.js";
import { externalsIn, externalsOf } from "./externals.js";
import { codeFiles } from "./files.js";
import { importedBy } from "./imports.js";
import { codeLinesIn, codeLinesOf, countLines } from "./lines.js";
import { ownSourceFiles, programFor } from "./program.js";
import { declarationOf, descendants, isClass, isExported, lineAt } from "./symbols.js";

/**
 * What the TypeScript reader reads from a target's code (`analysis/model.ts`): one program over
 * `tsconfig.check.json`, and the code files git lists.
 *
 * Everything TypeScript-shaped about the target is decided here and nowhere in the hexagon part:
 * that `src/index.ts` wires the application, that `<folder>/support/<name>.steps.ts` is the steps
 * of `<folder>/<name>.feature`, that a suite's world is the class extending cucumber's `World`, and
 * that a door is measured by running each feature under V8 coverage (`doors/`).
 */
export function readTypeScript(root: string): Code & Pick<Model, "doors"> {
  const program = programFor(root);
  const checker = program.getTypeChecker();
  const listed = new Set(codeFiles(root));
  const registry = registryFor(root, checker);
  const files = new Map<string, CodeFile>();

  for (const file of ownSourceFiles(program)) {
    const read = compiledFile(root, program, checker, registry, listed, file);
    files.set(read.path, read);
  }

  const imported = [...files.values()].flatMap((file) => file.importedFiles);

  for (const path of [...listed, ...imported].filter((path) => !files.has(path))) {
    files.set(path, plainFile(root, path, listed.has(path)));
  }

  const compiled = (path: string): boolean => files.get(path)?.compiled ?? false;

  return {
    files: [...files.values()],
    declarations: registry.all(),
    compositionRoots: compiled(COMPOSITION_ROOT) ? [COMPOSITION_ROOT] : [],
    steps: [...files.keys()].flatMap(stepsPairOf),
    doors: doorsOf(root),
  };
}

/** The file that wires the application together: what it constructs draws `implements` arrows. */
const COMPOSITION_ROOT = "src/index.ts";

/** `contracts/support/crayo.steps.ts` is the steps of `contracts/crayo.feature`, as cucumber lays a suite out. */
const STEPS = /^(.+)\/support\/([^/]+)\.steps\.ts$/;

function stepsPairOf(path: string): readonly StepsPair[] {
  const [, folder, name] = STEPS.exec(path) ?? [];

  return folder === undefined || name === undefined
    ? []
    : [{ steps: path, feature: `${folder}/${name}.feature` }];
}

function compiledFile(
  root: string,
  program: ts.Program,
  checker: ts.TypeChecker,
  registry: Registry,
  listed: ReadonlySet<string>,
  file: ts.SourceFile,
): CodeFile {
  const path = posix.relative(root, file.fileName);
  const nodes = descendants(file);
  const idsOf = (names: readonly ts.Node[]): readonly string[] =>
    names.flatMap((name) => registry.idOf(declarationOf(checker, name)) ?? []);
  const constructed = nodes
    .filter(ts.isNewExpression)
    .map((construction) => declarationOf(checker, construction.expression))
    .filter(isClass)
    .flatMap((declaration) => registry.idOf(declaration) ?? []);

  return {
    path,
    listed: listed.has(path),
    compiled: true,
    linesOfCode: countLines(file).code,
    externals: externalsOf([file]),
    declares: file.statements
      .filter((statement) => ts.isClassDeclaration(statement) || ts.isInterfaceDeclaration(statement))
      .flatMap((statement) => registry.idOf(statement) ?? []),
    imports: idsOf(nodes.filter(ts.isImportSpecifier).map((specifier) => specifier.name)),
    constructorParameterTypes: idsOf(
      nodes
        .filter(ts.isConstructorDeclaration)
        .flatMap((constructor) => constructor.parameters)
        .flatMap(typeNames),
    ),
    constructs: [...new Set(constructed)],
    importedFiles: importedBy(root, program, file),
  };
}

/** Every named type in a parameter's annotation, including inside unions, arrays and generics. */
function typeNames(parameter: ts.ParameterDeclaration): ts.EntityName[] {
  return parameter.type === undefined
    ? []
    : descendants(parameter.type)
        .filter(ts.isTypeReferenceNode)
        .map((reference) => reference.typeName);
}

/**
 * A file the program does not hold, such as a feature, the page or a configuration script, read
 * from disk. A file git still lists but that was deleted counts nothing.
 */
function plainFile(root: string, path: string, listed: boolean): CodeFile {
  const absolute = posix.join(root, path);
  const there = existsSync(absolute);

  return {
    path,
    listed,
    compiled: false,
    linesOfCode: there ? codeLinesIn(absolute) : 0,
    externals: there ? externalsIn([absolute]) : [],
    declares: [],
    imports: [],
    constructorParameterTypes: [],
    constructs: [],
    importedFiles: [],
  };
}

/**
 * The declarations the files point at, each under one id. A declaration is told by its node, as the
 * checker resolves a name to it, so two declarations of one name — an interface declared twice —
 * are two ids, and a class implements the one the checker resolves to.
 */
interface Registry {
  /** The id of a declaration in the target's own code, read the first time it is asked for. */
  idOf(declaration: ts.Declaration | undefined): string | undefined;
  all(): readonly Declaration[];
}

function registryFor(root: string, checker: ts.TypeChecker): Registry {
  const ids = new Map<ts.Declaration, string>();
  const taken = new Set<string>();
  const read = new Map<string, Declaration>();

  const idOf = (declaration: ts.Declaration | undefined): string | undefined => {
    if (declaration === undefined || !isOwn(declaration)) {
      return undefined;
    }

    const known = ids.get(declaration);

    if (known !== undefined) {
      return known;
    }

    const id = freshId(root, declaration, taken);
    // Taken before it is read, so a class that builds itself, or two that build each other, end.
    ids.set(declaration, id);
    taken.add(id);
    read.set(id, describe(root, checker, idOf, id, declaration));

    return id;
  };

  return { idOf, all: () => [...read.values()] };
}

/** Nothing from a dependency, or from the language's own library: it has no block. */
function isOwn(declaration: ts.Declaration): boolean {
  return !declaration.getSourceFile().fileName.includes("/node_modules/");
}

function freshId(
  root: string,
  declaration: ts.Declaration,
  taken: ReadonlySet<string>,
): string {
  const file = declaration.getSourceFile();
  const id = `${posix.relative(root, file.fileName)}#${nameOf(declaration)}`;

  return taken.has(id) ? `${id}@${String(lineAt(file, declaration.getStart()))}` : id;
}

function nameOf(declaration: ts.Declaration): string {
  const name = ts.getNameOfDeclaration(declaration);

  if (name === undefined) {
    return "";
  }

  return ts.isIdentifier(name) ? name.text : name.getText();
}

function describe(
  root: string,
  checker: ts.TypeChecker,
  idOf: Registry["idOf"],
  id: string,
  declaration: ts.Declaration,
): Declaration {
  const file = declaration.getSourceFile();
  const isClassDeclaration = ts.isClassDeclaration(declaration);

  return {
    id,
    name: nameOf(declaration),
    kind: kindOf(declaration),
    file: posix.relative(root, file.fileName),
    line: lineAt(file, declaration.getStart()),
    exported: isExported(declaration),
    implements: isClassDeclaration ? implementedNames(checker, idOf, declaration) : [],
    buildsPerScenario: isClassDeclaration && isWorld(declaration) ? builtBy(checker, idOf, declaration) : [],
    doc: docOf(declaration),
    linesOfCode: isClassDeclaration ? codeLinesOf(declaration) : 0,
  };
}

function kindOf(declaration: ts.Declaration): Declaration["kind"] {
  if (ts.isClassDeclaration(declaration)) {
    return "class";
  }

  return ts.isInterfaceDeclaration(declaration) ? "interface" : "other";
}

function implementedNames(
  checker: ts.TypeChecker,
  idOf: Registry["idOf"],
  declaration: ts.ClassDeclaration,
): readonly ImplementedName[] {
  return (declaration.heritageClauses ?? [])
    .filter((clause) => clause.token === ts.SyntaxKind.ImplementsKeyword)
    .flatMap((clause) => clause.types)
    .map((type) => {
      const target = idOf(declarationOf(checker, type.expression));
      const written = type.expression.getText();

      return target === undefined ? { written } : { written, target };
    });
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
  checker: ts.TypeChecker,
  idOf: Registry["idOf"],
  world: ts.ClassDeclaration,
): readonly string[] {
  const built = world.members
    .filter(ts.isPropertyDeclaration)
    .flatMap((property) => (property.initializer ? descendants(property.initializer) : []))
    .filter(ts.isNewExpression)
    .map((construction) => declarationOf(checker, construction.expression))
    .filter(isClass)
    .flatMap((declaration) => idOf(declaration) ?? []);

  return [...new Set(built)];
}

function docOf(declaration: ts.Declaration): string {
  const doc = ts.getJSDocCommentsAndTags(declaration).find(ts.isJSDoc);

  return ts.getTextOfJSDocComment(doc?.comment) ?? "";
}

/**
 * Measures doors by running each feature under V8 coverage (`doors/feature-runs.ts`). What one model
 * has measured is kept for as long as the model is, so a rules run measures each folder once.
 */
function doorsOf(root: string): NonNullable<Model["doors"]> {
  const cache = new Map<string, unknown>();
  const load: DoorLoad = {
    root,
    relative: (fileName) => posix.relative(root, normal(fileName)),
    memo: <T>(key: string, compute: () => T): T => remembered(cache, key, compute),
  };

  return async (folder) => await scenarioDoors(load, folder);
}

function remembered<T>(cache: Map<string, unknown>, key: string, compute: () => T): T {
  if (!cache.has(key)) {
    cache.set(key, compute());
  }

  return cache.get(key) as T;
}

function normal(path: string): string {
  return path.replaceAll("\\", "/").replace(/\/$/, "");
}
