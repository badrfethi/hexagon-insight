# hexagon-insight

A map of a hexagon repository and the rules its code is held to, installed into each target repo
as a git dependency and run from there. `README.md` has the install, the two commands, and what a
target must provide.

`analysis/`, `readers/` and `steps/` carry their own `AGENTS.md` for what only matters once you
work in them.

## Two parts, one model

- **A reader** (`readers/`) reads a target in its own language and reports the facts the hexagon
  rests on: which files and declarations there are, what each imports, takes, constructs and
  implements, line counts, externals, and the door each scenario comes in by. Only the TypeScript
  reader exists; the C# one is #6.
- **The hexagon part** (`analysis/`, `steps/`, `server.ts`, `page.html`) makes the map, the Tests
  view and the rules out of those facts, the same way for every language.
- **`analysis/model.ts` is the line between them**, and the only thing a reader emits. The hexagon
  part imports no compiler and reaches a reader only through `readers/read.ts`, which picks the
  reader from the target's root (`test/boundary.test.ts` holds both).

## Where the code came from

**This is clipper's `tools/insight`, copied whole from clipper commit `ad70e77` and changed only so
it runs from a target's `node_modules`.** That copy is tagged `v0.1.0` and is the **baseline**: every
change to what the tool outputs is a deliberate one, named in its PR. The three column folders in
`analysis/blocks.ts` started as clipper's and are now the tool's, held by the layout rule (#5,
`rules.feature` Rule 5). The TypeScript-only conventions — `src/index.ts` as the composition root in
`readers/typescript/read.ts`, the production service folder in `readers/typescript/doors/doors.ts`
— stay in the TypeScript reader; the C# reader (#6) brings its own.

**Issue and ADR numbers in the JSDoc (`#74`, `ADR-0023`) are clipper's**: badrfethi/clipper and its
`docs/adr/`. Most of the reasoning lives in that JSDoc; read it before changing a function, and
change it with the function.

## The hexagon's concepts are the tool's

Repos conform to the tool, with no per-repo config (operator decisions, 2026-10-07, #3, #8, #9).
So the concepts the analysis rests on are stated here, not borrowed from a target's docs:

- **The rules** are this repo's root `rules.feature`, run by `hexagon-insight rules` and by the page.
  A target's own `rules.feature` is not read.
- **The four kinds of test and their folders** (`entry-points/`, `features/`, `core-tests/`,
  `contracts/`) are stated in `analysis/test-kinds.ts` and `README.md`. Nothing reads a target's
  ADRs.
- **A Test Double** is a class in a suite's support code that implements a port, incoming or
  outgoing; its kinds are Meszaros's (Dummy, Stub, Spy, Mock, Fake), named in the first sentence of
  its own doc comment. Which code a target's coverage and mutation gates measure is the target's
  own policy, not the tool's. `README.md` (_Test Doubles_) is the statement, and
  `analysis/doubles.ts` cites it; the finder sees only doubles at outgoing ports so far.

A JSDoc comment that explains one of these cites `README.md` or `rules.feature`, never a target's
ADR or glossary. If a target's docs disagree with this repo, this repo is right for the tool, and the
difference is the target's to fix.

**`rules.feature` is the operator's.** Rules are written with agents, but always with the operator
present, so `.claude/settings.json` makes an agent's `Edit` or `Write` to it ask first. Its step
definitions in `steps/` are open (`steps/AGENTS.md`).

## How it runs in a target

- **The target is `process.cwd()`.** Nothing resolves a path relative to this package's own files
  except its own scripts and data (`rules.feature`, `analysis/run-rules.ts`, `steps/`,
  and `run-feature.ts` and `scenario-coverage.ts` in `readers/typescript/doors/`).
- **No build.** The TypeScript source runs under the target's `tsx` with `--conditions=development`
  (`bin/hexagon-insight.js`), the way the target runs its own features.
- **One cucumber.** `@cucumber/cucumber`, `@cucumber/gherkin`, `tsx` and `typescript` are peer
  dependencies so the steps here and the target's features register with the target's cucumber; a
  second copy finds no steps and measures no doors.
- **What ships is `files` in `package.json`.** A new top-level file the tool reads at run time, like
  `rules.feature`, goes in that list, or a target installs without it.

## Verifying

`pnpm typecheck` and `pnpm test` are the gate, and both take seconds. `pnpm test` runs
`test/*.test.ts` under `node --test`:

- `hexagon.test.ts` runs the map, the Tests view and the rules over `test/fixture/model.json`, a
  model written by hand, with no reader. `INSIGHT_MODEL=<file>` makes `readers/read.ts` return that
  JSON file instead of reading the target; such a model measures no doors. It is a test seam, not
  a setting for targets.
- `layout.test.ts` runs the layout rule over variants of that model, each a target of its own under
  `test/.runs/` (gitignored, removed after the run).
- `boundary.test.ts` holds the line between the two parts, how the reader is picked, and that
  `rules` exits 2 on a target it cannot read.

A change to behaviour is also checked against clipper, read-only, at one fixed commit:

1. In hexagon-insight, move `node_modules` aside and link it to clipper's
   (`node -e "require('fs').symlinkSync('D:/Projects/clipper/node_modules','node_modules','junction')"`),
   so the peers resolve to clipper's copies as they would when installed.
2. From clipper, start the last release (a checkout of its tag) with
   `node <release>/bin/hexagon-insight.js serve` on one port and this branch's on another
   (`INSIGHT_PORT`), and fetch `/map.json` and `/tests.json` from both. Releases before `v1.0.0`
   read the target's rules: run them with `INSIGHT_RULES=tools/insight/rules.feature` until
   badrfethi/clipper#232 moves clipper's rules to its root.
3. Diff byte for byte. Any difference is a change the PR names. `/map.json` runs every feature under
   coverage and takes about a minute.
4. Stop both servers, drop the link (`rmdirSync`, which removes the link only) and restore the
   real `node_modules`. Clipper's `git status` stays clean throughout.

Files are LF everywhere (`.gitattributes`).

## Releasing

Targets pin a release, `github:badrfethi/hexagon-insight#semver:^X.Y.Z`, so each release is a
`vX.Y.Z` tag on `master` with a GitHub Release.

1. **The PR bumps `version` in `package.json`**, by semver as a target sees it: major when a target
   must change something to adopt it (what it provides, a command, a rule that now breaks on
   correct code), minor for something new a target can ignore, patch for a fix.
2. **After it merges**, tag the merge commit and push the tag:
   `git tag -a vX.Y.Z <merge commit> -m vX.Y.Z && git push origin vX.Y.Z`.
3. `.github/workflows/release.yml` runs on the tag: it fails unless the tag is `v` plus the
   `package.json` version at that commit, runs `pnpm typecheck` and `pnpm test`, and creates the
   GitHub Release with generated notes.

A tag is never moved or reused; a bad release is followed by a new one. Adopting a release is the
target's own issue, in its own repo.

## Issue tracker

GitHub Issues in `badrfethi/hexagon-insight`, via `gh`. An issue is ready to implement when it
carries the `ready-for-agent` label. One milestone per target repo: v0.1 clipper (done), v0.2
crypto-trader.
