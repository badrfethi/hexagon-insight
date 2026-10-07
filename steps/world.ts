import { join, sep } from "node:path";
import { setDefaultTimeout, setWorldConstructor, World } from "@cucumber/cucumber";
import type { Block } from "../analysis/blocks.js";
import { type AnalysisContext, createContext } from "../analysis/context.js";
import type { ScenarioDoor } from "../analysis/feature-runs.js";

/**
 * What a `Given` of the target's rules (`analysis/rules-file.ts`) hands to its `Then`: the groups or adapters a rule
 * is about, and which adapters the operator calls managed.
 *
 * The rules read the same analysis the map draws (#86: "no second parser"). Building it compiles the
 * whole repository, so it is built once for the run and shared by every scenario, and the step
 * timeout is raised to allow for that first build.
 */
export class RulesWorld extends World {
  groups: readonly Block[] = [];
  /** The folder names under `src/adapters` the Background lists as managed (ADR-0023). */
  managed: ReadonlySet<string> = new Set();
  /** The scenarios a rule is about, each with the door it was measured to come in (`feature-runs.ts`). */
  scenarios: readonly ScenarioDoor[] = [];

  get context(): AnalysisContext {
    shared ??= createContext(ROOT);

    return shared;
  }
}

/** The repository the rules are run in, which is the one they read. */
const ROOT = join(process.cwd(), sep);
let shared: AnalysisContext | undefined;

setDefaultTimeout(120_000);
setWorldConstructor(RulesWorld);

/**
 * Fails a step with every offence it found, one per line, each starting with the file it names.
 *
 * The page turns each line into a break (`analysis/breaks.ts`), so the shape is load-bearing: a
 * repository-relative path, an optional `:line`, then `: ` and what is wrong there.
 */
export function refuseAny(offences: readonly string[]): void {
  if (offences.length > 0) {
    throw new Error(offences.join("\n"));
  }
}
