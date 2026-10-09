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
  prints `progress` and `summary`, and exits 1 when a rule breaks, and 2 when the target cannot be
  read at all (_Breaks and read failures_). A break is something to look at, not a gate: keep it
  out of CI.

## The rules

`rules.feature` in this package states them, and a target's own `rules.feature`, if it has one, is
not read:

1. A staff group has a contract (`interfaces/` or `incoming_ports/`), and a class in its `services/`
   implements it.
2. A supplier group has outgoing ports and no incoming ones, and each outgoing port is implemented by
   a class under `src/adapters`.
3. Every outgoing adapter has a contract test, and every incoming adapter has an entry point test;
   an adapter on one side has no test of the other kind. The lane decides: an adapter is incoming
   when it references an incoming port, and outgoing when it implements an outgoing port or
   references no incoming one. An adapter that is both, such as a queue the hexagon writes to and
   a consumer reads from, is drawn in both lanes and has both kinds.
4. Every acceptance scenario under `features/` comes in through an incoming port, measured by
   running it.
5. A target is laid out in the hexagon's folders: `src/infrastructure/staff`,
   `src/infrastructure/suppliers`, `src/adapters` and `features/` are there; nothing sits directly
   in `src` but `infrastructure`, `adapters` and `core`, nor in `src/infrastructure` but `staff`
   and `suppliers`, unless the target's reader claims it for its language; and test code that uses
   code under `src` lives in one of the four test folders.

## Breaks and read failures

The tool is for repositories still finding the hexagon's shape, so a target that gets the shape
wrong is still drawn and checked, and what is wrong is a **break**: a design flaw, named by a rule,
shown on the page, and the reason `rules` exits 1. A missing folder, a folder the hexagon does not
have, test code in the wrong place, code that does not compile: each is drawn as far as it can be,
and the rules say what is wrong with it. Insight shows design; making the code work is the target's.

A **read failure** is the other kind, and the only one that stops a run: the target cannot be read
into a model at all, so there is nothing to draw or check. A root with no marker file or with both
(_What the target provides_), or code the language's reader cannot load, is one. `rules` prints
`insight: ` and why, and exits 2; the page shows the same message in place of the map.

## Kinds of test

A test goes to its kind by what it fakes, and lives in that kind's folder: `features/` at the
target's root, and the other three under `tests/`. The Tests view draws one lane per kind, in this
order:

| Kind             | Drives                                         | Fakes                               | Lives in              |
| ---------------- | ---------------------------------------------- | ----------------------------------- | --------------------- |
| Entry point test | an incoming adapter's outer surface            | the incoming port and all behind it | `tests/entry-points/` |
| Acceptance test  | an incoming port, and the hexagon              | a Test Double at each outgoing port | `features/`           |
| Core test        | one piece of core logic                        | nothing                             | `tests/core/`         |
| Contract test    | an outgoing adapter, against the real supplier | nothing                             | `tests/contracts/`    |

`features/` is required. The other three are optional: a missing folder means that kind has no
tests, and its lane says so ("No `tests/entry-points/` folder.").

A test is a feature or a plain test, and it is tied to each adapter it constructs:

- A **feature** directly in the folder, by the steps file its reader pairs it with
  (`tests/contracts/support/crayo.steps.ts` with `tests/contracts/crayo.feature` in a TypeScript
  target): the feature belongs to each adapter class that steps file constructs.
- A **plain test** is a file of test code in the folder, outside its `support/`, that is no
  feature's steps and holds no Test Double, such as a C# test class or a `node:test` file: it
  belongs to each adapter class it constructs.

## Test Doubles

A **Test Double** is a class in a suite's support code (`features/support/`,
`tests/contracts/support/`, `tests/entry-points/support/`, `tests/core/support/`) that implements a
port, incoming or outgoing. It
stands in for whatever is on the other side of that port: an acceptance test's doubles stand at the
outgoing ports, an entry point test's double at the incoming port behind the adapter. So the tool
finds a double by the port it implements, not by its name or its file. For now it finds only the
doubles at outgoing ports.

Its **kind** is one or more of Meszaros's Dummy, Stub, Spy, Mock and Fake, and the double names it
itself in the first sentence of its doc comment: "The Clip provider: a Fake, and a Spy." Its class
name cannot carry it, because one double is often two kinds.

A class a suite's world builds that implements no port is not a double: it is a
dependency run for real, and the Tests view draws it as real.

## What the target provides

Insight tells the target's language by its root: `tsconfig.check.json` is TypeScript, and one
`*.sln` or `*.slnx` is C#. A root with both, with neither, or with two solutions is refused with a
message naming what it found.

Every target provides:

- `src/infrastructure/staff`, `src/infrastructure/suppliers` and `src/adapters`, one block per
  folder under each. A core, if it has one, is `src/core`: the map draws it as one block, however
  it is split inside, in a column of its own between staff and suppliers, with no arrows to it,
  since nearly everything uses it. Nothing else sits directly in `src` or
  `src/infrastructure` (rule 5) but what its language claims, below.
- Its tests in the four folders above: `features/` always, and `tests/entry-points/`,
  `tests/core/` and `tests/contracts/` when it has tests of those kinds. Test code that uses code
  under `src` anywhere else is a break (rule 5). Test code is drawn on Tests, never on the map's
  strip of code outside the groups.
- `git`, to list the files outside the hexagon, and Node with the package installed as above.

A **TypeScript** target also provides:

- `tsconfig.check.json` at its root: one TypeScript program over everything insight should read
  (`src` and the test folders).
- `src/index.ts` as the composition root.
- A file is test code when it imports a test runner (`@cucumber/cucumber`, `node:test`, `vitest`,
  `jest`, `@jest/globals` or `mocha`).
- A cucumber `default` profile running `features/**/*.feature`; insight runs each feature under it
  to measure doors.

A **C#** target also provides:

- One solution at its root, `*.sln` or `*.slnx`. Insight reads every project it loads, and every
  project those reference, through Roslyn, and restores the solution first (`dotnet restore`,
  which writes each project's `obj/`, as a build does), so its packages must be restorable.
- The .NET SDK 10 or later on the `PATH`. Insight builds its reader with it on first use, into the
  system's temp folder.
- The composition root is the project with `<OutputType>Exe</OutputType>` directly in `src`, such
  as `src/App.Main`: its files are the composition roots, and its folder may sit beside the
  hexagon's (rule 5).
- A file is test code when its project is a test project: it says `<IsTestProject>`, or it
  references the test SDK, Reqnroll, xUnit, NUnit or MSTest.
- `node_modules` in its `.gitignore`, since it is a C# repository that now has one.
- Insight does not measure the doors of a C# target yet, which the rules report as a break.
