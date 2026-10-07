import type { AnalysisContext } from "./context.js";
import { ranBeyondBuilding } from "./ran.js";

/**
 * The door a behaviour comes in, measured from what its scenario ran (#144, decision 6; #148).
 *
 * - `incoming-port`: straight at `IClipProduction` — the real service ran.
 * - `none`: it did not — a scenario that drives something else directly, such as the configuration
 *   loader, or one adapter or vendor fake asked a question on its own.
 *
 * The Terminal is no door: it is a Client, and no scenario drives it (ADR-0031). When an incoming
 * adapter stands between a Client and the hexagon, its entry point tests are not scenarios either.
 *
 * It is measured rather than read from the steps because step definitions are global: the step file
 * a scenario uses cannot be told from the text, and a declared door would go stale after an edit.
 */
export type Door = "incoming-port" | "none";

/** What ran in one scenario: for every file, by absolute path, the names of its functions that ran. */
export type Ran = ReadonlyMap<string, ReadonlySet<string>>;

/**
 * The service behind `IClipProduction`, as a folder relative to the root. It is what a door is told
 * by, so it is named here rather than discovered: a door is the operator's word for it being driven,
 * and a new door would be a new decision.
 */
const PRODUCTION = "src/infrastructure/staff/clip-production/services/";

/**
 * The door one run of a scenario came in. Importing or constructing the service is not running it
 * (`ranBeyondBuilding`): the suite's world builds the whole hexagon for every scenario, whichever
 * door it then uses.
 */
export function doorOf(context: AnalysisContext, ran: Ran): Door {
  return ranUnder(context, ran, PRODUCTION) ? "incoming-port" : "none";
}

function ranUnder(context: AnalysisContext, ran: Ran, folder: string): boolean {
  return [...ran].some(
    ([file, names]) =>
      context.relative(file).startsWith(folder) && ranBeyondBuilding(context, file, names),
  );
}

/**
 * One door for a behaviour that ran more than once, which is an outline, once per Examples row.
 *
 * An outline is one behaviour in the view, so it carries one mark: the door most of its rows came
 * in, and on a tie the door of the earliest row. Rows of one outline share their steps, so they
 * differ only when a row's values send it somewhere else, and the majority is what the outline is.
 */
export function doorOfRows(doors: readonly Door[]): Door {
  const counts = new Map<Door, number>();

  doors.forEach((door) => counts.set(door, (counts.get(door) ?? 0) + 1));

  return [...counts].reduce((best, next) => (next[1] > best[1] ? next : best), ["none", 0])[0];
}
