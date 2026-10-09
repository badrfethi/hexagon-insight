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
`src` and `src/infrastructure`, and the `.feature` texts in the test folders. A folder that is not
there reads as empty: what is missing is a break for the rules to name, not a reason to stop. A
reader adds the code facts (`Code` in the model) and, when it can measure them, the doors.

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
reader's language needs there (the TypeScript reader claims none), and `test` on a file says it is
test code, however the language tells. The layout rule reads both.

Paths are relative to the target's root, with `/`. Ids of declarations are `<file>#<name>`, with
`@<line>` added when a file declares a name twice.

## The TypeScript reader

`typescript/read.ts` builds one program over `tsconfig.check.json` and reads every model fact from
it. `typescript/doors/` measures the doors by running each feature under V8 coverage; its scripts
are found by URL relative to their own files, so they move together.

## Output stays byte for byte

The map and the Tests view are diffed against the last release on clipper (`../AGENTS.md`,
_Verifying_), and a reader's facts are where most of their content comes from: a change to what a
reader counts or resolves is a change the PR names.
