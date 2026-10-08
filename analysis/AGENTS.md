# analysis

Everything the page and the rule steps read about a target: blocks, arrows, tests, doubles, doors
and breaks. `server.ts` serves two views of it, `/map.json` (`map.ts`) and `/tests.json`
(`tests.ts`); the steps in `../steps/` read the same analysis, so the rules and the page never
disagree (#86: "no second parser").

## It reads the model, and nothing else

The hexagon part knows no language. Everything it knows about a target is the `Model` in
`model.ts`, which a reader in `../readers/` emits: files, declarations and what they import, take,
construct and implement, line counts, externals, folder entries, feature texts and doors. So no file
here imports `typescript`, reads the target's files or runs git, and the only thing it imports from
`../readers/` is `read.ts`, the front door (`../test/boundary.test.ts` fails otherwise). Spawning
cucumber for the rules (`rules-run.ts`, `run-rules.ts`) is the one process it starts.

A fact the hexagon part needs and the model lacks goes into `model.ts`, documented, and into every
reader; it is never read here behind the model's back. A rule of the hexagon (what makes an arrow, a
lane, a double, a break) is computed here from the facts, never in a reader, so every language gets
the same answer.

## One load, one context

`contextOf(model)` in `context.ts` builds everything derived from a model once per page load, and
`context.memo` is where anything expensive a second caller would recompute goes. Nothing is stored
between loads: the page always shows the working tree as it is. A function that takes an
`AnalysisContext` reads through it, never from the model's arrays by a second route.

Paths in the model are relative to the target's root, with `/`. `inFolder` in `context.ts` matches
a folder name the way the code did when paths were absolute, so a match does not change with them.

## What is stated here, not read from a target

`test-kinds.ts` is the list of the four kinds of test, their folders and their order, and
`rules.ts` names the tool's `rules.feature`. Neither reads a target's docs or config; a target that
does not fit is told so by the page or the rules, never accommodated by a setting
(`../AGENTS.md`, _The hexagon's concepts are the tool's_).

## Output is compared byte for byte

`/map.json` and `/tests.json` are diffed against the last release on clipper (`../AGENTS.md`,
_Verifying_). A change to their shape or order is a change a PR names, so keep fields and
ordering stable unless changing them is the point.
