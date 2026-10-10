# readers

A reader reads a target in its own language and emits the `Model` in `../analysis/model.ts`; the
hexagon part (`../analysis/`, `../steps/`) draws and checks that model and nothing else
(`../AGENTS.md`, _Two parts, one model_).

## The front door

`read.ts` is the only file here the hexagon part imports. `readModel(root)` picks the reader from
the names at the target's root (`readerFor`: `tsconfig.check.json` is TypeScript, a `*.sln` or
`*.slnx` is C#, both or neither is refused, naming what was found) and reaches it by a dynamic
`import()`, so a target in one language never loads another's compiler. Neither `read.ts` nor
`layout.ts` imports a reader statically (`../test/boundary.test.ts`).

`layout.ts` is what every reader shares, because the folders are the tool's and not a language's:
the group and adapter folders and their entries, the names at the root, the folders directly in
`src` and `src/infrastructure`, the `.feature` texts in the test folders, and every file git lists
with its non-blank lines (`Layout.tracked`), so a file no reader reads as code still has a home on
the map. A folder that is not there reads as empty: what is missing is a break for the rules to
name, not a reason to stop. A target git cannot list throws `ReadFailure`. A reader adds the code facts (`Code` in the model) and, when it can measure them, the doors.

**A reader fails only when there is no model to give**: it throws `ReadFailure` (`read.ts`) for a
target it cannot read at all, such as a project that will not load, and the run stops with that
message (`../README.md`, _Breaks and read failures_). Anything less — a missing folder, code that
does not compile, a file it cannot resolve — it reports as far as it can and leaves to the rules.

## A reader emits facts, not conclusions

What a reader reports is what the code says: what a file declares, imports, constructs and passes
to a constructor, what a class implements as written and which declaration that resolves to, line
counts and externals. Whether that makes an arrow, a lane, a Test Double or a break is the hexagon
part's to decide, once for every language. A reader that starts deciding is computing a rule the
other readers will compute differently.

Its conventions are its language's, and stay in it: the TypeScript reader takes `src/index.ts` as
the composition root, pairs `<folder>/support/<name>.steps.ts` with `<folder>/<name>.feature`,
takes a suite's world to be the class extending cucumber's `World`, lists files with git
(`typescript/files.ts`), and marks a file as test code when it imports a test runner
(`TEST_RUNNERS` in `typescript/read.ts`).

Two facts let a language keep what it needs beside the hexagon's folders without the hexagon part
knowing the language: `claimed` names the folders directly in `src` or `src/infrastructure` the
reader's language needs there (the TypeScript reader claims none; the C# reader claims the
folder of each `Exe` project there), and `test` on a file says it is
test code, however the language tells. The layout rule reads both.

Paths are relative to the target's root, with `/`. Ids of declarations are `<file>#<name>`, with
`@<line>` added when a file declares a name twice.

## The TypeScript reader

`typescript/read.ts` builds one program over `tsconfig.check.json` and reads every model fact from
it. `typescript/doors/` measures the doors by running each feature under V8 coverage; its scripts
are found by URL relative to their own files, so they move together.

## The C# reader

`csharp/` is a .NET console program (`HexagonInsight.CSharp.csproj`, Roslyn's `MSBuildWorkspace`)
and `csharp/read.ts`, which builds it and runs it. It ships as source, like the rest of the tool:

- `read.ts` runs `dotnet build` with `--artifacts-path` in the system's temp folder, one per copy
  of the tool, so neither the package nor the target gets a `bin/` or `obj/`, and a second run
  builds nothing. It then runs the program, `HexagonInsight.CSharp <root> <solution>`, which writes
  the `Code` facts as JSON to standard output.
- The program exits 3 with the reason on standard error for a `ReadFailure` (a solution that will
  not restore or load, git that will not list files), and `read.ts` passes that reason on as its
  own `ReadFailure`. No `dotnet` on the `PATH`, and a reader that will not build, are read failures
  too.
- The empty `Directory.Build.props`, `Directory.Build.targets` and `Directory.Packages.props` stop
  MSBuild from walking up into the target's own: installed, this folder is inside the target, and
  the target's analyzers, warnings-as-errors and central package versions are not the reader's.
  `Directory.Build.props` also turns off `DiscoverEditorConfigFiles` and
  `DiscoverGlobalAnalyzerConfigFiles`, so the target's `.editorconfig` and `.globalconfig`, which
  the compiler otherwise collects from every folder above a source file, set none of the reader's
  analyzer severities (#18). A check of the reader on a target installs it there (`pnpm add`): run
  from this repo's own checkout, it is built outside the target and sees none of the target's
  configuration.
- `Reader.cs` says what each fact is in C#; `Registry.cs` gives each type its id; `Facts.cs` reads a
  file's facts through the semantic model; `Listing.cs` lists files with git, as
  `typescript/files.ts` does; `Lines.cs` counts lines of code; `Model.cs` mirrors
  `../analysis/model.ts`, and changes with it.
- It restores the solution before it opens it: without the restore, MSBuild resolves no package and
  no project reference a project only reaches through another, and Roslyn binds too few names
  without saying so.
- `Worlds.cs` reads what a Reqnroll suite builds for every scenario — a class a `[Binding]` takes in
  its constructor, or a `[Binding]` with a `[BeforeScenario]` hook — and pairs a `[Binding]` class
  `<Name>Steps` under `<folder>/support/` with `<folder>/<Name>.feature`.
- It measures no doors yet (#16): one scenario under coverage takes about 43 s on crypto-trader, so
  Rule 4 breaks on a C# target saying no doors were measured.

`pnpm test` does not run it: it needs the .NET SDK and takes about a minute on a real target. A
change to it is checked on a C# target by hand, with `hexagon-insight rules` and `serve`.

## Output stays byte for byte

The map and the Tests view are diffed against the last release on clipper (`../AGENTS.md`,
_Verifying_), and a reader's facts are where most of their content comes from: a change to what a
reader counts or resolves is a change the PR names.
