# analysis

Everything the page and the rule steps read about a target: blocks, arrows, tests, doubles, doors
and breaks. `server.ts` serves two views of it, `/map.json` (`map.ts`) and `/tests.json`
(`tests.ts`); the steps in `../steps/` read the same analysis, so the rules and the page never
disagree (#86: "no second parser").

## One load, one context

`context.ts` builds the TypeScript program and everything derived from it once per page load, and
`context.memo` is where anything expensive a second caller would recompute goes. Nothing is stored
between loads: the page always shows the working tree as it is. A function that takes an
`AnalysisContext` reads through it, never from disk or a second program of its own.

## Two kinds of file, which #4 splits

- **Bound to the TypeScript compiler**: `arrows`, `context`, `contracts`, `doubles`, `externals`,
  `lines`, `ran`, `shared-tests`, `symbols`, `tests`. These become the TypeScript reader.
- **Bound to the Node runtime**, measuring doors by running features under V8 coverage:
  `feature-runs`, `run-feature`, `scenario-coverage`, `rules-run`, `outside`.

Until #4 lands, keep new compiler-bound code out of the files that are not, so the split stays a
move rather than a rewrite.

## What is stated here, not read from a target

`test-kinds.ts` is the list of the four kinds of test, their folders and their order, and
`rules.ts` names the tool's `rules.feature`. Neither reads a target's docs or config; a target that
does not fit is told so by the page or the rules, never accommodated by a setting
(`../AGENTS.md`, _The hexagon's concepts are the tool's_).

## Output is compared byte for byte

`/map.json` and `/tests.json` are diffed against the last release on clipper (`../AGENTS.md`,
_Verifying_). A change to their shape or order is a change a PR names, so keep fields and
ordering stable unless changing them is the point.
