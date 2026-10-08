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
the group and adapter folders and their entries, the names at the root, and the `.feature` texts in
the test folders. A reader adds the code facts (`Code` in the model) and, when it can measure them,
the doors.

## A reader emits facts, not conclusions

What a reader reports is what the code says: what a file declares, imports, constructs and passes
to a constructor, what a class implements as written and which declaration that resolves to, line
counts and externals. Whether that makes an arrow, a lane, a Test Double or a break is the hexagon
part's to decide, once for every language. A reader that starts deciding is computing a rule the
other readers will compute differently.

Its conventions are its language's, and stay in it: the TypeScript reader takes `src/index.ts` as
the composition root, pairs `<folder>/support/<name>.steps.ts` with `<folder>/<name>.feature`,
takes a suite's world to be the class extending cucumber's `World`, and lists files with git
(`typescript/files.ts`).

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
