# hexagon-insight

A map of a hexagon repository and the rules its code is held to, installed into each target repo
as a git dependency and run from there. `README.md` has the install, the two commands, and what a
target must provide.

## Where the code came from

**This is clipper's `tools/insight`, copied whole from clipper commit `ad70e77` and changed only so
it runs from a target's `node_modules`.** The copy is the **baseline**: the reworks in milestone
v0.2 (#4 shared model, #5 layout check, #6 C# reader) are each reviewed against it, so every change
to what the tool outputs is a deliberate one, named in its PR. Clipper's specifics still in the code
— the three column folders in `analysis/blocks.ts`, `src/index.ts` as the composition root in
`analysis/arrows.ts`, the production service folder in `analysis/doors.ts` — are what those issues
take apart; leave them in place until the issue that owns them.

**Issue and ADR numbers in the JSDoc (`#74`, `ADR-0023`) are clipper's**: badrfethi/clipper and its
`docs/adr/`. Most of the reasoning lives in that JSDoc; read it before changing a function, and
change it with the function.

## How it runs in a target

- **The target is `process.cwd()`.** Nothing resolves a path relative to this package's own files
  except its own scripts (`run-feature.ts`, `run-rules.ts`, `scenario-coverage.ts`, `steps/`).
- **No build.** The TypeScript source runs under the target's `tsx` with `--conditions=development`
  (`bin/hexagon-insight.js`), the way the target runs its own features.
- **One cucumber.** `@cucumber/cucumber`, `@cucumber/gherkin`, `tsx` and `typescript` are peer
  dependencies so the steps here and the target's features register with the target's cucumber; a
  second copy finds no steps and measures no doors.
- **`rules.feature` is the operator's and lives in the target**, at its root (`INSIGHT_RULES` names
  another path). This repo brings only the step definitions in `steps/`, which are open: an agent
  may implement them unattended. Review of the PR guards against a step that quietly weakens a rule.

## Verifying

`pnpm typecheck` is the only gate; there is no test suite. A change to behaviour is checked against
clipper, read-only, at one fixed commit:

1. In hexagon-insight, move `node_modules` aside and link it to clipper's
   (`node -e "require('fs').symlinkSync('D:/Projects/clipper/node_modules','node_modules','junction')"`),
   so the peers resolve to clipper's copies as they would when installed.
2. From clipper, start clipper's own `pnpm insight` on one port and
   `node <hexagon-insight>/bin/hexagon-insight.js serve` on another (`INSIGHT_PORT`), and fetch
   `/map.json` and `/tests.json` from both. Until badrfethi/clipper#232 moves clipper's rules to its
   root, run the tool with `INSIGHT_RULES=tools/insight/rules.feature`.
3. Diff byte for byte. At the baseline they are identical; any difference is the change the PR
   names. `/map.json` runs every feature under coverage and takes about a minute.
4. Stop both servers, drop the link (`rmdirSync`, which removes the link only) and restore the
   real `node_modules`. Clipper's `git status` stays clean throughout.

Files are LF everywhere (`.gitattributes`).

## Issue tracker

GitHub Issues in `badrfethi/hexagon-insight`, via `gh`. An issue is ready to implement when it
carries the `ready` label. One milestone per target repo: v0.1 clipper (done), v0.2 crypto-trader.
A change a target must make to adopt a release is that target's own issue, in its own repo.
