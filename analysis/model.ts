/**
 * What a target is, as a language reader tells it: everything the hexagon part reads (#4).
 *
 * The hexagon part — the map, the Tests view, the rule steps and the page — knows no language. A
 * reader knows one: it reads how the code is composed — what each file declares, imports and
 * constructs, what each class implements, how long each file is — and writes that down here. Every
 * meaning the tool gives those facts, a lane, an arrow, a Test Double, a broken rule, is computed
 * from them once, in the hexagon part, for every language. So a reader reports what the code says
 * and decides nothing, and two languages cannot disagree about what an incoming adapter is.
 *
 * Everything but `doors` is plain JSON data, so a reader in another language can write it to a file.
 * Paths are relative to the target's root, with forward slashes. A list's order carries nothing
 * unless its field says so: the hexagon part sorts what it draws itself.
 */
export interface Model extends Layout, Code {
  /**
   * Measures the door each scenario of the features directly under `folder` came in, by running
   * them. Absent when the reader cannot measure doors, and then the rule that needs them breaks
   * saying so. It is a function because measuring runs every feature: only the rule that reads the
   * doors calls it, never the map's own load or the Tests view.
   */
  readonly doors?: (folder: string) => Promise<readonly ScenarioDoor[]>;
}

/** What is read from the folders, the same way for every language (`readers/layout.ts`). */
export interface Layout {
  /** Every folder directly in a column's folder (`blocks.ts`): each group and each adapter. */
  readonly groups: readonly GroupFolder[];
  /** The names directly in the target's root, files and folders: which test folders it has. */
  readonly rootEntries: readonly string[];
  /** Every `.feature` file directly in a kind of test's folder (`test-kinds.ts`), with its text. */
  readonly features: readonly FeatureText[];
  /**
   * The folders directly in `src` and in `src/infrastructure`, which the layout rule holds to the
   * hexagon's own names (`rules.feature`, Rule 5), and directly in `tests`, which says which of the
   * code-first kinds of test a target has (`test-kinds.ts`). A path that is not there lists no
   * folders.
   */
  readonly folders: readonly FolderListing[];
}

export interface FolderListing {
  /** `src`, `src/infrastructure` or `tests`. */
  readonly path: string;
  /** The names of the folders directly in it, sorted; files are not listed. */
  readonly folders: readonly string[];
}

export interface GroupFolder {
  /** Such as `src/infrastructure/staff/clip-production`. */
  readonly path: string;
  /** The names directly in it, files and folders: what a rule asks is, or is not, there. */
  readonly entries: readonly string[];
}

export interface FeatureText {
  /** Such as `tests/contracts/crayo.feature`. */
  readonly path: string;
  /** The Gherkin, which the hexagon part parses itself. */
  readonly text: string;
}

/** What a language reader reads from the code. */
export interface Code {
  /**
   * Every file a view counts or a rule reads: those git lists as code, those the reader compiles,
   * and those a compiled file imports. Each path once.
   */
  readonly files: readonly CodeFile[];
  /**
   * Every class and interface a compiled file declares at its top level, and every other
   * declaration in the target's own files that a file or a declaration here points at. Nothing
   * from a dependency: what is not the target's own has no block, and nothing is drawn for it.
   */
  readonly declarations: readonly Declaration[];
  /**
   * The files that wire the application together. What they construct draws the `implements`
   * arrows (`arrows.ts`). The TypeScript reader names `src/index.ts`.
   */
  readonly compositionRoots: readonly string[];
  /**
   * Each steps file, and the feature it is the steps of, whether or not that feature exists. The
   * TypeScript reader pairs `<folder>/support/<name>.steps.ts` with `<folder>/<name>.feature`; the
   * C# reader pairs a `[Binding]` class `<Name>Steps` under `<folder>/support/` with
   * `<folder>/<Name>.feature`.
   */
  readonly steps: readonly StepsPair[];
  /**
   * The folders directly in `src` or `src/infrastructure` that the reader claims as its language's
   * own, beside the hexagon's folders: the layout rule lets them be. The C# reader claims the
   * project that wires the application. The TypeScript reader claims none: its composition root is
   * loose files in `src/`, and the layout rule reads only folders.
   */
  readonly claimed: readonly string[];
}

export interface CodeFile {
  readonly path: string;
  /** Git lists it as code, tracked or untracked and not ignored: it is on the strip or on Tests. */
  readonly listed: boolean;
  /** The reader compiles it: its declarations, imports and constructions below are read. */
  readonly compiled: boolean;
  /**
   * It is test code, by its language's measure: the TypeScript reader takes a file that imports a
   * test runner. Test code that uses the application's code lives in a test folder (Rule 5).
   */
  readonly test: boolean;
  /** Its non-blank, non-comment lines, which is what a block's size is drawn from. */
  readonly linesOfCode: number;
  /**
   * What it imports from outside the target, such as an npm package or a `node:` module, each once.
   * The hexagon part unions and sorts them per block.
   */
  readonly externals: readonly string[];
  /** Ids of the classes and interfaces it declares at its top level, in the order written. */
  readonly declares: readonly string[];
  /** Ids of the declarations its named imports resolve to, in the order written. */
  readonly imports: readonly string[];
  /** Ids of the types named in its constructors' parameter types, in the order written. */
  readonly constructorParameterTypes: readonly string[];
  /** Ids of the classes it constructs, each once, in the order first constructed. */
  readonly constructs: readonly string[];
  /** The target's files it imports, by path, in the order written. */
  readonly importedFiles: readonly string[];
}

export interface Declaration {
  /** Unique within the model, and otherwise opaque. */
  readonly id: string;
  /** As declared; empty for an anonymous class. */
  readonly name: string;
  /** `other` is everything that is neither, such as a type alias. */
  readonly kind: "interface" | "class" | "other";
  /** The file it is declared in. */
  readonly file: string;
  /** The 1-based line it starts on, after its doc comment: where a break points. */
  readonly line: number;
  /** It is exported where it is declared, so another block may use it. */
  readonly exported: boolean;
  /** Each name a class says it implements, as written, and the id it resolves to when that is the target's own. */
  readonly implements: readonly ImplementedName[];
  /**
   * Ids of the classes a test suite's world builds for every scenario, when this class is that
   * world; empty for every other class. The TypeScript reader reads the fields of a class that
   * extends cucumber's `World`; the C# reader, what Reqnroll builds per scenario (`Worlds.cs`).
   */
  readonly buildsPerScenario: readonly string[];
  /** The text of its doc comment, empty when it has none: a Test Double names its kinds in it. */
  readonly doc: string;
  /** A class's own lines of code, not its file's; 0 for anything else, which nothing sizes. */
  readonly linesOfCode: number;
}

export interface ImplementedName {
  /** Such as `IBriefParser`. */
  readonly written: string;
  /** Absent when it is not the target's own, such as an interface from a package. */
  readonly target?: string;
}

export interface StepsPair {
  readonly steps: string;
  readonly feature: string;
}

/**
 * The door a behaviour comes in, measured from what its scenario ran (#144, decision 6; #148).
 *
 * - `incoming-port`: straight at an incoming port — the real service behind it ran.
 * - `none`: it did not — a scenario that drives something else directly, such as the configuration
 *   loader, or one adapter or vendor fake asked a question on its own.
 */
export type Door = "incoming-port" | "none";

/** One scenario of a feature: the file it is in, its line, and the door it came in. */
export interface ScenarioDoor {
  readonly path: string;
  readonly line: number;
  readonly door: Door;
}
