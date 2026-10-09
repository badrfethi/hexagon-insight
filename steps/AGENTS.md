# steps

The step definitions for the tool's `../rules.feature`, one file per Rule or family of rules, run
by `hexagon-insight rules` (`../analysis/run-rules.ts`) and by the page (`../analysis/breaks.ts`).

**The steps are open; the rules are not.** An agent may write, fix or refactor a step unattended,
and fix the code a broken rule points at. `rules.feature` is the operator's, and an edit to it asks
first (`../.claude/settings.json`). Review of the pull request is what guards against a step that
quietly weakens a rule: a step that passes more than its sentence says is the defect to look for.

**A failing step names every offence, one per line**, through `refuseAny` in `world.ts`: a path
relative to the target's root, an optional `:line`, then `: ` and what is wrong there. The page
turns each line into a break and marks the blocks it names, so that shape is load-bearing.

**A `Given` over a folder refuses a folder with nothing in it**, so a rule cannot pass vacuously
after a target moves its code. The layout rule's `Given`s (`layout.steps.ts`) are the exception:
that a folder is not there is their own first scenario's break, and the others would only repeat it.

**A wrong target is a break, never a thrown error** (`../README.md`, _Breaks and read failures_). A
step reads the model it is given and names what is wrong with the design; a target that cannot be
read at all is a `ReadFailure` from `../readers/read.ts`, which `run-rules.ts` reports before any
step runs.

**Steps read the analysis, never a second parse.** Each `Given` awaits `this.read()` in `world.ts`,
which reads the target's model once per run (`../readers/read.ts`) and builds the shared
`AnalysisContext` over it; steps then reuse what the map uses (`lanesOf`, `testsRunning`, the
model's `doors`), so a rule and the page cannot disagree about the same code. Like `../analysis/`,
they import no compiler and no reader but `read.ts`.

**A fact the target's reader does not measure breaks the rule that needs it**, saying so: with no
`doors` in the model, the doors rule refuses `features/` because no scenario can be shown to come in
through an incoming port. It never passes for want of evidence.
