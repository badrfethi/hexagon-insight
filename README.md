# hexagon-insight

A map of a hexagon repository and the rules its code is held to, for repositories laid out in
staff, suppliers and adapters. It reads the repository it is run from: the blocks under
`src/infrastructure/staff`, `src/infrastructure/suppliers` and `src/adapters`, the arrows between
them, which tests reach which block, and the door each feature comes in by (measured by running
each feature under V8 coverage). It draws them on a local page, and it runs the hexagon's rules
and shows each break on the map.

The rules, the kinds of test and the Test Doubles are the tool's, the same for every target: a
target provides code and tests in the fixed layout, and nothing else.

It started as clipper's `tools/insight`, copied from clipper commit `ad70e77`.

## Install

In the repository to look at, pin a released version:

```sh
pnpm add -D "github:badrfethi/hexagon-insight#semver:^1.0.0"
```

`#semver:` resolves against this repository's `vX.Y.Z` tags, so `pnpm update hexagon-insight` moves
to the newest release in the range; `#v1.0.0` pins one release exactly. The releases and what each
changed are on the repository's Releases page.

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
- `hexagon-insight rules` runs the hexagon's rules (this package's `rules.feature`) over the target,
  prints `progress` and `summary`, and exits non-zero when a rule breaks. A break is something to
  look at, not a gate: keep it out of CI.

## The rules

`rules.feature` in this package states them, and a target's own `rules.feature`, if it has one, is
not read:

1. A staff group has a contract (`interfaces/` or `incoming_ports/`), and a class in its `services/`
   implements it.
2. A supplier group has outgoing ports and no incoming ones, and each outgoing port is implemented by
   a class under `src/adapters`.
3. Every outgoing adapter has a contract test, and every incoming adapter has an entry point test;
   neither has the other kind. The lane decides: an adapter is incoming when it references an
   incoming port, and outgoing otherwise.
4. Every acceptance scenario under `features/` comes in through an incoming port, measured by
   running it.

## Kinds of test

A test goes to its kind by what it fakes, and lives in that kind's folder at the target's root. The
Tests view draws one lane per kind, in this order:

| Kind             | Drives                                         | Fakes                               | Lives in        |
| ---------------- | ---------------------------------------------- | ----------------------------------- | --------------- |
| Entry point test | an incoming adapter's outer surface            | the incoming port and all behind it | `entry-points/` |
| Acceptance test  | an incoming port, and the hexagon              | a Test Double at each outgoing port | `features/`     |
| Core test        | one piece of core logic                        | nothing                             | `core-tests/`   |
| Contract test    | an outgoing adapter, against the real supplier | nothing                             | `contracts/`    |

`features/` is required. The other three are optional: a missing folder means that kind has no
tests, and its lane says so ("No `entry-points/` folder.").

A feature is tied to the adapter it tests by its steps file, paired with it by name
(`contracts/support/crayo.steps.ts` with `contracts/crayo.feature`, and the same in
`entry-points/`): the feature belongs to each adapter class that steps file constructs with `new`.

## Test Doubles

A **Test Double** is a class in a suite's support code (`features/support/`, `contracts/support/`,
`entry-points/support/`, `core-tests/support/`) that implements an outgoing port. It stands in for
whatever is on the other side of that port, so the tool finds it by the port it implements, not by
its name or its file.

Its **kind** is one or more of Meszaros's Dummy, Stub, Spy, Mock and Fake, and the double names it
itself in the first sentence of its doc comment: "The Clip provider: a Fake, and a Spy." Its class
name cannot carry it, because one double is often two kinds.

Test Doubles are test code. They sit outside a target's coverage and mutation gates, with the rest
of its suites. A class a suite's world builds that implements no port is not a double: it is a
dependency run for real, and the Tests view draws it as real.

## What the target provides

- `tsconfig.check.json` at its root: one TypeScript program over everything insight should read
  (`src` and the test folders).
- `src/infrastructure/staff`, `src/infrastructure/suppliers` and `src/adapters`, one block per
  folder under each, and `src/index.ts` as the composition root.
- Its tests in the four folders above: `features/` always, and `entry-points/`, `core-tests/` and
  `contracts/` when it has tests of those kinds.
- A cucumber `default` profile running `features/**/*.feature`; insight runs each feature under it
  to measure doors.
- `git`, to list the files outside the hexagon.
