import { join, sep } from "node:path";
import { setDefaultTimeout, setWorldConstructor, World } from "@cucumber/cucumber";
import type { Block } from "../analysis/blocks.js";
import { type AnalysisContext, contextOf } from "../analysis/context.js";
import type { CodeFile, ScenarioDoor } from "../analysis/model.js";
import { readOnce } from "../readers/read.js";

/**
 * What a `Given` of the rules (`analysis/rules.ts`) hands to its `Then`: the groups, adapters,
 * scenarios, folders or files a rule is about, and which way those adapters face.
 *
 * The rules read the same model the map draws (#86: "no second parser"; `analysis/model.ts`).
 * Reading it compiles the whole repository, so it is read once for the run and shared by every
 * scenario: each `Given` awaits `read()` before it asks for the context, and the step timeout is
 * raised to allow for that first read.
 */
export class RulesWorld extends World {
  groups: readonly Block[] = [];
  /** `incoming` or `outgoing`, when `groups` is the adapters of one lane (`adapters.steps.ts`). */
  direction = "";
  /** The scenarios a rule is about, each with the door it was measured to come in (`Model.doors`). */
  scenarios: readonly ScenarioDoor[] = [];
  /** The folders a layout rule is about, relative to the root (`layout.steps.ts`). */
  folders: readonly string[] = [];
  /** The files a layout rule is about (`layout.steps.ts`). */
  files: readonly CodeFile[] = [];

  /** Reads the target, or waits for the read another scenario started. */
  async read(): Promise<void> {
    reading ??= readOnce(ROOT).then(contextOf);
    shared = await reading;
  }

  get context(): AnalysisContext {
    if (shared === undefined) {
      throw new Error("The rules asked for the target before a Given read it");
    }

    return shared;
  }
}

/** The repository the rules are run in, which is the one they read. */
const ROOT = join(process.cwd(), sep);
let reading: Promise<AnalysisContext> | undefined;
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
