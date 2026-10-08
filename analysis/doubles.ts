import { type AnalysisContext, inFolder } from "./context.js";
import type { CodeFile, Declaration } from "./model.js";
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
  files: readonly CodeFile[],
): readonly TestDouble[] {
  return files
    .flatMap((file) => classesIn(context, file))
    .filter((declaration) => implementsOutgoingPort(context, declaration))
    .map(doubleOf);
}

/** The classes a file declares at its top level, in the order written. */
function classesIn(context: AnalysisContext, file: CodeFile): readonly Declaration[] {
  return file.declares
    .map((id) => context.declaration(id))
    .filter((declaration) => declaration.kind === "class");
}

function implementsOutgoingPort(context: AnalysisContext, declaration: Declaration): boolean {
  return declaration.implements.some(
    ({ target }) =>
      target !== undefined && inFolder(context.declaration(target).file, "outgoing_ports"),
  );
}

function doubleOf(declaration: Declaration): TestDouble {
  return {
    id: `${declaration.file}#${declaration.name}`,
    name: declaration.name,
    file: declaration.file,
    kinds: kindsIn(firstSentence(declaration.doc)),
    ports: declaration.implements.map(({ written }) => written),
    linesOfCode: declaration.linesOfCode,
  };
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
 * Videos over real HTTP. It is found by what the world does (`Declaration.buildsPerScenario`), not
 * listed.
 */
export function realFilesIn(
  context: AnalysisContext,
  files: readonly CodeFile[],
): ReadonlySet<string> {
  const own = new Set(files.map((file) => file.path));
  const built = files
    .flatMap((file) => classesIn(context, file))
    .flatMap((world) => world.buildsPerScenario)
    .map((id) => context.declaration(id))
    .filter((declaration) => own.has(declaration.file))
    .filter((declaration) => declaration.implements.length === 0);

  return new Set(built.map((declaration) => declaration.file));
}
