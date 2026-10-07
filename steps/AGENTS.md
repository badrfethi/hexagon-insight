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
after a target moves its code.

**Steps read the analysis, never a second parse.** They go through the shared `AnalysisContext` in
`world.ts`, built once per run, and reuse what the map uses (`laneOf`, `featuresRunning`,
`scenarioDoors`), so a rule and the page cannot disagree about the same code.
