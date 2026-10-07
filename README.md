# hexagon-insight

A map of a hexagon repository and the rules its code is held to, for repositories laid out in
staff, suppliers and adapters. It reads the repository it is run from: the blocks under
`src/infrastructure/staff`, `src/infrastructure/suppliers` and `src/adapters`, the arrows between
them, which tests reach which block, and the door each feature comes in by (measured by running
each feature under V8 coverage). It draws them on a local page, and it runs the repository's rules
and shows each break on the map.

It started as clipper's `tools/insight`, copied from clipper commit `ad70e77`.

## Install

In the repository to look at:

```sh
pnpm add -D github:badrfethi/hexagon-insight
```

There is no build step: the package is TypeScript source run under the target's `tsx`.
`@cucumber/cucumber`, `@cucumber/gherkin`, `tsx` and `typescript` are peer dependencies, so it uses
the target's copies (one cucumber, so the steps register with the runner that runs them).

Then add the two commands to the target's `package.json`:

```json
{
  "scripts": {
    "insight": "hexagon-insight serve",
    "insight:rules": "hexagon-insight rules"
  }
}
```

## Commands

- `hexagon-insight serve` serves the page at `http://127.0.0.1:4174/` (`INSIGHT_PORT` to change it),
  with `/map.json` and `/tests.json` behind it. Nothing is cached: every load reads the working
  tree as it is, runs the features and the rules again.
- `hexagon-insight rules` runs the target's `rules.feature` with this package's steps, prints
  `progress` and `summary`, and exits non-zero when a rule breaks. A break is something to look at,
  not a gate: keep it out of CI.

## What the target provides

- `tsconfig.check.json` at its root: one TypeScript program over everything insight should read
  (`src`, `features`, `contracts`, `tools`).
- `rules.feature` at its root: the rules, the operator's per repository. `INSIGHT_RULES` names
  another path relative to the root.
- `src/infrastructure/staff`, `src/infrastructure/suppliers` and `src/adapters`, one block per
  folder under each, and `src/index.ts` as the composition root.
- A cucumber `default` profile running `features/**/*.feature`; insight runs each feature under it
  to measure doors.
- `git`, to list the files outside the hexagon.
