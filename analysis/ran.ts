import ts from "typescript";
import type { AnalysisContext } from "./context.js";

/**
 * Whether a file ran a function other than those importing it or constructing its classes runs.
 *
 * What merely importing or building code runs is not running it: `features/support/world.ts`
 * imports and constructs nearly everything for every scenario, and counting that would say what
 * reading the step files says. So tsx's `__name` calls, and a class's static initialisers,
 * constructors and field initialisers do not count; any other function that ran does. A module's own
 * body is never in what is handed here (`scenario-coverage.ts`).
 *
 * The door of a scenario (`doors.ts`) is read this way.
 */
export function ranBeyondBuilding(
  context: AnalysisContext,
  file: string,
  names: ReadonlySet<string>,
): boolean {
  const classes = context.memo(`classes:${file}`, () => new Set(classNamesIn(file)));

  return [...names].some((name) => !ON_IMPORT.has(name) && !classes.has(name));
}

/**
 * The names V8 gives the functions that run because a file was imported or one of its classes was
 * constructed: `__name`, which tsx's transform calls for every function and class it names, and a
 * class's static and instance field initialisers. A constructor goes by its class's name, which
 * `classNamesIn` reads from the file itself.
 */
const ON_IMPORT: ReadonlySet<string> = new Set([
  "__name",
  "<static_initializer>",
  "<instance_members_initializer>",
]);

function classNamesIn(file: string): readonly string[] {
  const source = ts.createSourceFile(file, ts.sys.readFile(file) ?? "", ts.ScriptTarget.Latest);

  return source.statements.flatMap((statement) =>
    ts.isClassDeclaration(statement) && statement.name !== undefined ? [statement.name.text] : [],
  );
}
